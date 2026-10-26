# Knee OA webapp integration

This folder is designed to be placed at `<repository-root>/webapp/`.
It resolves the research repository root from its own location and does not hardcode a Windows user path.

## Run (PowerShell)

From the repository root, activate the same Python environment used by the model scripts (it must already have the project's PyTorch, torchvision, OpenCV, NumPy, and other model dependencies installed):

```powershell
python .\webapp\app.py
```

Then open `http://127.0.0.1:5000`. The backend exposes `GET /api/health` and `POST /api/analyze`.

If Flask is missing from the project environment:

```powershell
python -m pip install -r .\webapp\requirements-webapp.txt
```

Do not create a separate venv that lacks the project's ML dependencies. The app expects `outputs/checkpoints/kl_final_best.pt`; the optional Hybrid 2 selector expects `outputs/checkpoints/kl_hybrid2_best.pt`.

## Model wiring status

- `kl_final`: connected through the repository's `scripts.predict.load_models` and `classify_rgb` inference helpers. This remains the locked reference model.
- `hybrid2`: connected through the existing Hybrid 2 loader and Grad-CAM helper; explicitly experimental.
- KneeNeXt and ensemble: deliberately not selectable yet. `scripts/ensemble_kl.py` is documented as a cached-evaluation/selection script, not by itself a single-image inference API. KneeNeXt needs its exact `scripts/predict_kneenext.py` model loader and input pathway integrated before exposing it in the UI; do not approximate its architecture.

The server listens on localhost only. This prototype does not persist patient data, but uploaded X-rays are transmitted to the local backend during analysis. Do not use real patient data until authentication, consent, privacy controls, secure handling, audit logging and clinical validation are implemented. This is research software, not a medical device.
