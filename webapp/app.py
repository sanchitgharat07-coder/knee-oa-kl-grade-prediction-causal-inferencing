
from pathlib import Path
import sys
import base64
import traceback

import cv2
import numpy as np
import torch
from flask import Flask, render_template, request, jsonify

# ------------------------------------------------------------
# Paths and configuration
# ------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

PROJECT_DIR = (
    Path.home()
    / "Desktop"
    / "knee-oa-kl-grade-prediction-causal-inferencing"
)

CHECKPOINT_DIR = PROJECT_DIR / "outputs" / "checkpoints"

if not PROJECT_DIR.is_dir():
    raise FileNotFoundError(
        f"Project directory not found: {PROJECT_DIR}"
    )

sys.path.insert(0, str(PROJECT_DIR))
sys.path.insert(0, str(PROJECT_DIR / "scripts"))

from scripts.predict import (
    load_models,
    classify_rgb,
    HYBRID2_TAB_MEAN,
    HYBRID2_TAB_STD,
    to_tensor,
    apply_clahe,
)
from scripts.kl_common import IMG_SIZE

# ------------------------------------------------------------
# Flask setup
# ------------------------------------------------------------

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES

# Models are loaded once and reused.
_model_bundles = {}


# ------------------------------------------------------------
# Utility functions
# ------------------------------------------------------------

def allowed_file(filename):
    return (
        bool(filename)
        and "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in ALLOWED_EXTENSIONS
    )


def log_preprocessing(message):
    """Print preprocessing diagnostics to the Flask terminal."""
    print(f"[PREPROCESS] {message}", flush=True)


def get_model(model_name="kl_final"):
    """
    Load a trained model once.

    kl_final:
        Locked reference classifier.

    hybrid2:
        Experimental image + age/BMI classifier.
    """
    global _model_bundles

    if model_name not in {"kl_final", "hybrid2"}:
        raise ValueError("Unsupported model selection.")

    if model_name in _model_bundles:
        return _model_bundles[model_name]

    checkpoint_name = (
        "kl_final_best.pt"
        if model_name == "kl_final"
        else "kl_hybrid2_best.pt"
    )

    checkpoint_path = CHECKPOINT_DIR / checkpoint_name

    if not checkpoint_path.is_file():
        raise FileNotFoundError(
            f"Required checkpoint not found: {checkpoint_path}"
        )

    device = torch.device(
        "cuda" if torch.cuda.is_available() else "cpu"
    )

    log_preprocessing(
        f"Loading {model_name}; device={device}"
    )
    log_preprocessing(
        f"Checkpoint={checkpoint_path.name}"
    )

    if model_name == "kl_final":
        seg_model, classifier = load_models(
            run="final",
            ckpt_dir=str(CHECKPOINT_DIR),
            device=device,
            use_hybrid2=False,
        )
    else:
        seg_model, classifier = load_models(
            run="final",
            ckpt_dir=str(CHECKPOINT_DIR),
            device=device,
            use_hybrid2=True,
        )

    classifier.eval()

    bundle = (seg_model, classifier, device)
    _model_bundles[model_name] = bundle

    return bundle


def encode_gradcam(cam, original_rgb):
    """
    Convert a Grad-CAM array to a base64 PNG overlay.

    Returns None if a usable CAM is not available.
    """
    if cam is None:
        return None

    try:
        cam = np.asarray(cam, dtype=np.float32)

        if cam.ndim != 2 or cam.size == 0:
            return None

        cam = np.nan_to_num(cam, nan=0.0, posinf=0.0, neginf=0.0)
        cam = np.clip(cam, 0.0, 1.0)

        height, width = original_rgb.shape[:2]

        cam_resized = cv2.resize(
            cam,
            (width, height),
            interpolation=cv2.INTER_LINEAR,
        )

        heatmap = cv2.applyColorMap(
            np.uint8(cam_resized * 255),
            cv2.COLORMAP_JET,
        )

        heatmap = cv2.cvtColor(
            heatmap,
            cv2.COLOR_BGR2RGB,
        )

        overlay = cv2.addWeighted(
            original_rgb.astype(np.uint8),
            0.60,
            heatmap,
            0.40,
            0,
        )

        success, encoded = cv2.imencode(".png", cv2.cvtColor(
            overlay, cv2.COLOR_RGB2BGR
        ))

        if not success:
            return None

        return base64.b64encode(encoded.tobytes()).decode("utf-8")

    except Exception:
        app.logger.exception("Could not encode Grad-CAM.")
        return None


# ------------------------------------------------------------
# Routes
# ------------------------------------------------------------

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "Knee OA KL-grade research prototype",
        "img_size": int(IMG_SIZE),
        "device_available": (
            "cuda" if torch.cuda.is_available() else "cpu"
        ),
        "models": {
            "kl_final": (CHECKPOINT_DIR / "kl_final_best.pt").is_file(),
            "hybrid2": (CHECKPOINT_DIR / "kl_hybrid2_best.pt").is_file(),
        },
    })


@app.post("/api/patient")
def save_patient():
    """
    Validate patient details for this prototype.
    This endpoint does not save the information to a database.
    """
    data = request.get_json(silent=True) or {}

    required = ["patient_id", "age", "side"]
    missing = [
        key for key in required
        if not str(data.get(key, "")).strip()
    ]

    if missing:
        return jsonify({
            "ok": False,
            "error": "Missing required fields: " + ", ".join(missing),
        }), 400

    try:
        age = float(data["age"])
    except (TypeError, ValueError):
        return jsonify({
            "ok": False,
            "error": "Age must be a valid number.",
        }), 400

    if not 18 <= age <= 120:
        return jsonify({
            "ok": False,
            "error": "Age must be between 18 and 120.",
        }), 400

    side = str(data["side"]).strip().upper()
    if side not in {"L", "R", "LEFT", "RIGHT"}:
        return jsonify({
            "ok": False,
            "error": "Side must be left or right.",
        }), 400

    return jsonify({
        "ok": True,
        "message": "Patient details validated. No data was stored.",
        "patient": {
            "patient_id": str(data["patient_id"]).strip(),
            "age": age,
            "side": side,
        },
    })


@app.post("/api/xray")
def upload_xray():
    # The assessment endpoint handles the actual image upload.
    return jsonify({
        "ok": False,
        "error": "Use the Run assessment button to submit the image.",
    }), 400


@app.post("/api/analyze")
def analyze():
    if "xray" not in request.files:
        return jsonify({
            "ok": False,
            "message": "Select a knee X-ray first.",
        }), 400

    file = request.files["xray"]

    if not file.filename:
        return jsonify({
            "ok": False,
            "message": "Select a knee X-ray first.",
        }), 400

    if not allowed_file(file.filename):
        return jsonify({
            "ok": False,
            "message": "Only PNG, JPG and JPEG images are supported.",
        }), 400

    # Default to the locked classifier. Hybrid 2 must be explicitly selected.
    model_name = (
        request.form.get("model", "kl_final").strip().lower()
    )

    if model_name not in {"kl_final", "hybrid2"}:
        return jsonify({
            "ok": False,
            "message": "Model must be kl_final or hybrid2.",
        }), 400

    age = None
    bmi = None

    if model_name == "hybrid2":
        try:
            age = float(request.form.get("age", ""))
            bmi = float(request.form.get("bmi", ""))
        except (TypeError, ValueError):
            return jsonify({
                "ok": False,
                "message": "Hybrid 2 requires valid age and BMI values.",
            }), 400

        if not np.isfinite([age, bmi]).all():
            return jsonify({
                "ok": False,
                "message": "Age and BMI must be finite numbers.",
            }), 400

        if not 18 <= age <= 120 or not 10 <= bmi <= 80:
            return jsonify({
                "ok": False,
                "message": "Age must be 18–120 and BMI must be 10–80.",
            }), 400

    try:
        # Read and validate the upload without saving it to disk.
        image_bytes = file.read(MAX_IMAGE_BYTES + 1)

        if not image_bytes:
            return jsonify({
                "ok": False,
                "message": "The uploaded image is empty.",
            }), 400

        if len(image_bytes) > MAX_IMAGE_BYTES:
            return jsonify({
                "ok": False,
                "message": "Image exceeds the 12 MB upload limit.",
            }), 400

        image_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8,
        )

        image_bgr = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR,
        )

        if image_bgr is None:
            return jsonify({
                "ok": False,
                "message": "Could not decode the image. Try a PNG or JPEG.",
            }), 400

        # OpenCV decodes BGR; model preprocessing expects RGB.
        image_rgb = cv2.cvtColor(
            image_bgr,
            cv2.COLOR_BGR2RGB,
        )

        original_height, original_width = image_rgb.shape[:2]

        log_preprocessing("=" * 55)
        log_preprocessing(f"Selected model: {model_name}")
        log_preprocessing(
            f"Uploaded image dimensions: "
            f"{original_width} x {original_height}"
        )
        log_preprocessing(f"Decoded image array shape: {image_rgb.shape}")
        log_preprocessing(f"Decoded image dtype: {image_rgb.dtype}")
        log_preprocessing("Image colour conversion: BGR -> RGB")
        log_preprocessing(f"Model target size: {IMG_SIZE} x {IMG_SIZE}")

        # Load the requested checkpoint.
        seg_model, classifier, device = get_model(model_name)

        cam = None

        if model_name == "kl_final":
            # IMPORTANT:
            # classify_rgb performs the model's canonical CLAHE and
            # resize/normalization pipeline. Do not apply CLAHE here.
            grade, probabilities, cam = classify_rgb(
                image_rgb.copy(),
                seg_model,
                classifier,
                run="final",
                device=device,
            )

            model_label = "kl_final — locked reference classifier"

        else:
            # Hybrid 2 uses the same canonical image preprocessing,
            # plus standardized age and BMI.
            log_preprocessing("Applying CLAHE for Hybrid 2")

            clahe_rgb = apply_clahe(image_rgb.copy())

            log_preprocessing(
                f"After CLAHE shape: {clahe_rgb.shape}"
            )

            x = to_tensor(
                clahe_rgb,
                IMG_SIZE,
                device,
            )

            log_preprocessing(
                f"Actual Hybrid 2 tensor shape: {tuple(x.shape)}"
            )
            log_preprocessing(
                f"Tensor dtype: {x.dtype}; device: {x.device}"
            )

            expected_shape = (1, 3, IMG_SIZE, IMG_SIZE)

            if tuple(x.shape) != expected_shape:
                raise ValueError(
                    f"Unexpected model tensor shape: {tuple(x.shape)}; "
                    f"expected {expected_shape}"
                )

            tab = (
                np.array([age, bmi], dtype=np.float32)
                - HYBRID2_TAB_MEAN
            ) / HYBRID2_TAB_STD

            log_preprocessing(
                f"Standardized tabular input shape: {tab.shape}"
            )

            grade, probabilities, cam = classify_rgb(
                image_rgb.copy(),
                seg_model,
                classifier,
                run="final",
                device=device,
                tab=tab,
            )

            model_label = "Hybrid 2 — experimental"

        probabilities = np.asarray(
            probabilities,
            dtype=np.float64,
        ).reshape(-1)

        if len(probabilities) != 5:
            raise ValueError(
                f"Expected 5 grade probabilities, got {len(probabilities)}."
            )

        if not np.isfinite(probabilities).all():
            raise ValueError(
                "Model returned non-finite grade probabilities."
            )

        probabilities = np.clip(probabilities, 0.0, None)

        total = probabilities.sum()
        if total <= 0:
            raise ValueError(
                "Model returned probabilities with an invalid sum."
            )

        probabilities = probabilities / total

        gradcam_base64 = encode_gradcam(cam, image_rgb)

        log_preprocessing(f"Prediction completed: KL grade {int(grade)}")
        log_preprocessing(
            "Grade probabilities (%): "
            + str([round(float(p) * 100, 2) for p in probabilities])
        )
        log_preprocessing("=" * 55)

        return jsonify({
            "ok": True,
            "status": "research_prediction",
            "grade": int(grade),
            "probabilities": [
                round(float(p) * 100, 2)
                for p in probabilities
            ],
            "message": (
                "Research-model output generated. "
                "This result is not a clinical diagnosis."
            ),
            "model": model_label,
            "model_key": model_name,
            "preprocessing": {
                "original_width": int(original_width),
                "original_height": int(original_height),
                "input_color": "RGB",
                "clahe_applied": True,
                "target_width": int(IMG_SIZE),
                "target_height": int(IMG_SIZE),
                "expected_tensor_shape": [
                    1, 3, int(IMG_SIZE), int(IMG_SIZE)
                ],
                "device": str(device),
            },
            "explanation_available": gradcam_base64 is not None,
            "gradcam": gradcam_base64,
        })

    except Exception:
        app.logger.error(
            "Inference failed:\n%s",
            traceback.format_exc(),
        )

        return jsonify({
            "ok": False,
            "message": (
                "Inference failed. Check the Flask terminal for the "
                "technical error; no valid prediction was returned."
            ),
        }), 500


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({
        "ok": False,
        "message": "Image exceeds the 12 MB upload limit.",
    }), 413


if __name__ == "__main__":
    print("=" * 55, flush=True)
    print("Knee OA KL-grade research webapp", flush=True)
    print(f"Project directory: {PROJECT_DIR}", flush=True)
    print(f"Checkpoint directory: {CHECKPOINT_DIR}", flush=True)
    print(f"Configured image size: {IMG_SIZE} x {IMG_SIZE}", flush=True)
    print(
        f"Compute device: {'cuda' if torch.cuda.is_available() else 'cpu'}",
        flush=True,
    )
    print("=" * 55, flush=True)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
    )
