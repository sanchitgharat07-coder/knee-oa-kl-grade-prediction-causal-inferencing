
const $ = (id) => document.getElementById(id);

const viewNames = ["analysis", "history", "causal", "xai", "report"];

function openView(name) {
  viewNames.forEach((view) => {
    const element = $("view-" + view);
    if (element) element.classList.toggle("hidden", view !== name);
  });

  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.view));
});

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.open));
});

function toast(message) {
  const element = $("toast");
  if (!element) return;

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 3200);
}

let latestGradCamImage = null;
let latestAssessmentInputs = null;
let selectedImageUrl = null;

function normaliseImageSource(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const source = value.trim();

  // A server may return a complete data URL.
  if (source.startsWith("data:image/")) return source;

  // Support raw base64 returned by the Flask API.
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(source) && source.length > 100) {
    return `data:image/png;base64,${source.replace(/\s/g, "")}`;
  }

  // Relative or absolute HTTP URLs are also supported.
  if (source.startsWith("/") || /^https?:\/\//i.test(source)) {
    return source;
  }

  return null;
}
window.latestModelInputImage = data.model_input_image || null;

function renderGradCam(imageData, originalImageUrl = null, age = null, bmi = null) {
  const normalisedImage = normaliseImageSource(imageData);

  latestGradCamImage = normalisedImage;
  latestAssessmentInputs = normalisedImage ? { age, bmi } : null;

  const xaiView = $("view-xai");
  if (!xaiView) return;

  const cards = xaiView.querySelectorAll(".clinical-grid > .card");
  const xaiStatus = xaiView.querySelector(".welcome .pill");

  const overviewRows = document.querySelectorAll(
    "#view-analysis .lower-grid .explain-row"
  );

  if (overviewRows[0]) {
    const description = overviewRows[0].querySelector("small");
    const status = overviewRows[0].querySelector(".status-pending");

    if (description) {
      description.textContent = normalisedImage
        ? "Grad-CAM generated for the current uploaded X-ray."
        : "Run an assessment to generate an image heatmap.";
    }

    if (status) status.textContent = normalisedImage ? "Generated" : "Pending";
  }

  if (overviewRows[1]) {
    const description = overviewRows[1].querySelector("small");
    const status = overviewRows[1].querySelector(".status-pending");

    if (description) {
      description.textContent =
        "Age and BMI are model inputs; patient-specific SHAP attribution has not been computed.";
    }

    if (status) status.textContent = "Not computed";
  }

  if (xaiStatus) {
    xaiStatus.textContent = normalisedImage
      ? "EXPERIMENTAL OUTPUT"
      : "AWAITING ASSESSMENT";

    xaiStatus.classList.toggle("warn", !normalisedImage);
  }

  if (cards.length < 2) return;

  const imageCard = cards[0];
  const featureCard = cards[1];

  let explanationArea = imageCard.querySelector("#grad-cam-result");

  if (!explanationArea) {
    imageCard.querySelector(".empty-state")?.remove();

    explanationArea = document.createElement("div");
    explanationArea.id = "grad-cam-result";
    imageCard.appendChild(explanationArea);
  }

  explanationArea.replaceChildren();

  if (normalisedImage) {
    const comparison = document.createElement("div");

    comparison.style.display = "grid";
    comparison.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    comparison.style.gap = "16px";

    function createImageFigure(title, src, alt) {
      const figure = document.createElement("figure");
      figure.style.margin = "0";
      figure.style.minWidth = "0";

      const heading = document.createElement("b");
      heading.textContent = title;
      heading.style.display = "block";
      heading.style.marginBottom = "10px";

      const image = document.createElement("img");
      image.src = src;
      image.alt = alt;
      image.style.display = "block";
      image.style.width = "100%";
      image.style.height = "auto";
      image.style.maxHeight = "430px";
      image.style.objectFit = "contain";
      image.style.borderRadius = "8px";
      image.style.background = "#f1f5f9";

      image.addEventListener("error", () => {
        image.alt = `${title} could not be loaded. Check the image URL returned by the backend.`;
        image.removeAttribute("src");
      }, { once: true });

      figure.append(heading, image);
      return figure;
    }

    const modelInputImage = window.latestModelInputImage || null;

if (modelInputImage) {
  comparison.appendChild(
    createImageFigure(
      "Model input (224 × 224)",
      modelInputImage,
      "224 by 224 preprocessed model input"
    )
  );
} else if (originalImageUrl) {
  // Fallback until the backend returns the preprocessed image.
  comparison.appendChild(
    createImageFigure(
      "Uploaded X-ray (preview)",
      originalImageUrl,
      "Original uploaded knee X-ray"
    )
  );
}

    comparison.appendChild(
      createImageFigure(
        "Grad-CAM overlay",
        normalisedImage,
        "Experimental Grad-CAM overlay for the uploaded knee X-ray"
      )
    );

    const caption = document.createElement("p");
    caption.textContent =
      "Exploratory visualization of regions influencing the model output. This is not a diagnosis or proof of clinical reasoning.";
    caption.style.fontSize = "12px";
    caption.style.lineHeight = "1.6";
    caption.style.marginTop = "12px";

    explanationArea.append(comparison, caption);
  } else {
    const message = document.createElement("div");
    message.className = "empty-state";

    const heading = document.createElement("h3");
    heading.textContent = "No attribution map yet";

    const description = document.createElement("p");
    description.textContent =
      "The assessment completed, but the backend did not return a usable Grad-CAM image.";

    message.append(heading, description);
    explanationArea.appendChild(message);
  }

  let featureArea = featureCard.querySelector("#clinical-input-summary");

  if (!featureArea) {
    featureCard.querySelector(".empty-state")?.remove();

    featureArea = document.createElement("div");
    featureArea.id = "clinical-input-summary";
    featureCard.appendChild(featureArea);
  }

  featureArea.replaceChildren();

  const featureHeading = document.createElement("h3");
  featureHeading.textContent = "Model input values";

  const explanation = document.createElement("p");
  explanation.textContent =
    "These are input values supplied to Hybrid 2, not SHAP feature contributions.";

  const inputList = document.createElement("ul");

  [
    ["Age", age == null ? "Not available" : `${age} years`],
    ["BMI", bmi == null ? "Not available" : `${bmi} kg/m²`]
  ].forEach(([label, value]) => {
    const item = document.createElement("li");
    item.textContent = `${label}: ${value}`;
    inputList.appendChild(item);
  });

  const pending = document.createElement("p");
  pending.textContent = "Patient-specific SHAP attribution: not computed.";

  featureArea.append(featureHeading, explanation, inputList, pending);
}

function clearAssessmentDisplay() {
  renderGradCam(null);

  const predictionCard = document.querySelector(".prediction-card");
  const predictionPanel = predictionCard?.querySelector(".prediction-empty");

  if (predictionPanel) {
    predictionPanel.replaceChildren();

    const icon = document.createElement("div");
    icon.className = "grade-icon";
    icon.textContent = "KL —";

    const heading = document.createElement("b");
    heading.textContent = "No assessment yet";

    const description = document.createElement("p");
    description.textContent = "Select an X-ray and run the research model.";

    predictionPanel.append(icon, heading, description);
  }

  const tag = predictionCard?.querySelector(".section-head .tag");

  if (tag) {
    tag.textContent = "AWAITING ASSESSMENT";
    tag.classList.add("muted");
  }

  const status = $("analysis-status");
  if (status) status.textContent = "No prediction has been made.";
}

// Patient form.
$("patient-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    patient_id: $("patient_id")?.value.trim() || "",
    age: $("age")?.value || "",
    side: $("side")?.value || ""
  };

  try {
    const response = await fetch("/api/patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if ($("patient-status")) {
      $("patient-status").textContent =
        data.message || data.error || "Request completed.";
    }

    toast(data.ok ? "Patient details validated." : data.error || "Validation failed.");
  } catch {
    if ($("patient-status")) {
      $("patient-status").textContent = "Backend unavailable. Start Flask.";
    }
    toast("Could not reach the backend.");
  }
});

// X-ray selection and local preview.
$("xray-input")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!["image/png", "image/jpeg"].includes(file.type)) {
    toast("Choose a PNG or JPEG image.");
    event.target.value = "";
    return;
  }

  if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);

  clearAssessmentDisplay();
  selectedImageUrl = URL.createObjectURL(file);

  if ($("xray-preview")) $("xray-preview").src = selectedImageUrl;
  if ($("image-name")) $("image-name").textContent = file.name;

  $("image-view")?.classList.remove("hidden");
  $("empty-image")?.classList.add("hidden");

  toast("Image preview opened locally. No prediction has been run yet.");
});

$("remove-image")?.addEventListener("click", () => {
  if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);

  selectedImageUrl = null;

  if ($("xray-input")) $("xray-input").value = "";
  $("xray-preview")?.removeAttribute("src");

  $("image-view")?.classList.add("hidden");
  $("empty-image")?.classList.remove("hidden");

  clearAssessmentDisplay();
});

// Image inference uses multipart POST. Never place image data in a URL.
$("analyze-btn")?.addEventListener("click", async () => {
  const file = $("xray-input")?.files?.[0];

  if (!file) {
    toast("Select an X-ray first.");
    return;
  }

  const model = $("model-select")?.value || "kl_final";
  const ageValue = $("age")?.value;
  const bmiValue = $("bmi")?.value;
  const age = ageValue === "" || ageValue == null ? NaN : Number(ageValue);
  const bmi = bmiValue === "" || bmiValue == null ? NaN : Number(bmiValue);

  if (model === "hybrid2") {
    if (!Number.isFinite(age) || age < 18 || age > 120) {
      toast("Hybrid 2 requires a valid age between 18 and 120.");
      return;
    }

    if (!Number.isFinite(bmi) || bmi < 10 || bmi > 80) {
      toast("Hybrid 2 requires a valid BMI between 10 and 80.");
      return;
    }
  }

  const button = $("analyze-btn");
  if (!button) return;

  button.disabled = true;

  if ($("analysis-status")) {
    $("analysis-status").textContent = "Running research model…";
  }

  const formData = new FormData();
  formData.append("xray", file);
  formData.append("model", model);

  if (model === "hybrid2") {
    formData.append("age", String(age));
    formData.append("bmi", String(bmi));
  }

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(
        data.message || data.error ||
        (response.status === 414
          ? "The server rejected an oversized URL. Check frontend links or redirects."
          : `Assessment failed (HTTP ${response.status}).`)
      );
    }

    const labels = [
      "KL 0 — None",
      "KL 1 — Doubtful",
      "KL 2 — Mild",
      "KL 3 — Moderate",
      "KL 4 — Severe"
    ];

    const grade = Number(data.grade);

    if (!Number.isInteger(grade) || grade < 0 || grade > 4) {
      throw new Error("The server returned an invalid KL grade.");
    }

    const probabilities = Array.isArray(data.probabilities)
      ? data.probabilities.map(Number)
      : [];

    if (
      probabilities.length !== 5 ||
      probabilities.some((value) => !Number.isFinite(value) || value < 0)
    ) {
      throw new Error("The server returned invalid grade probabilities.");
    }

    const predictionCard = document.querySelector(".prediction-card");
    const predictionPanel = predictionCard?.querySelector(".prediction-empty");

    if (predictionPanel) {
      predictionPanel.replaceChildren();

      const gradeIcon = document.createElement("div");
      gradeIcon.className = "grade-icon";
      gradeIcon.textContent = `KL ${grade}`;

      const heading = document.createElement("b");
      heading.textContent = labels[grade];

      const note = document.createElement("p");
      note.textContent = "Experimental research-model output. Not a diagnosis.";

      const probabilityContainer = document.createElement("div");
      probabilityContainer.className = "grade-probabilities";

      probabilities.forEach((value, index) => {
        const percentage = Math.max(0, Math.min(100, value));

        const row = document.createElement("div");
        row.style.margin = "8px 0";

        const line = document.createElement("div");
        line.style.display = "flex";
        line.style.justifyContent = "space-between";
        line.style.gap = "12px";

        const label = document.createElement("span");
        label.textContent = labels[index];

        const number = document.createElement("b");
        number.textContent = `${percentage.toFixed(2)}%`;

        line.append(label, number);

        const track = document.createElement("div");
        track.style.cssText =
          "height:6px;background:#e5e7eb;border-radius:5px;overflow:hidden";

        const fill = document.createElement("div");
        fill.style.cssText =
          `height:100%;width:${percentage}%;background:#3976c5`;

        track.appendChild(fill);
        row.append(line, track);
        probabilityContainer.appendChild(row);
      });

      predictionPanel.append(gradeIcon, heading, note, probabilityContainer);
    }

    const tag = predictionCard?.querySelector(".section-head .tag");

    if (tag) {
      tag.textContent = "RESEARCH OUTPUT";
      tag.classList.remove("muted");
    }

    if ($("analysis-status")) {
      $("analysis-status").textContent =
        data.message || "Research-model inference completed.";
    }

    // Support either response field. Backend may return a URL or base64 data.
    const gradcamSource =
      data.gradcam || data.grad_cam_image || data.gradcam_image || null;

    renderGradCam(
      gradcamSource,
      selectedImageUrl,
      model === "hybrid2" ? age : null,
      model === "hybrid2" ? bmi : null
    );

    toast("Research-model inference completed.");
  } catch (error) {
    renderGradCam(null);

    if ($("analysis-status")) {
      $("analysis-status").textContent = error.message || "Assessment failed.";
    }

    toast(error.message || "Assessment failed.");
  } finally {
    button.disabled = false;
  }
});

// Causal analysis.
let causalData = null;

function formatEffect(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(4)}`;
}

function effectCard(title, value, detail) {
  const card = document.createElement("div");
  card.className = "effect-card";

  const label = document.createElement("span");
  label.textContent = title;

  const strong = document.createElement("strong");
  strong.textContent = value;

  const small = document.createElement("small");
  small.textContent = detail;

  card.append(label, strong, small);
  return card;
}

function updateQuestion() {
  const exposureElement = $("causal-exposure");
  const outcomeElement = $("causal-outcome");
  const container = $("causal-results");
  const question = $("causal-question");

  if (!exposureElement || !outcomeElement || !container) return;

  const exposure = exposureElement.value;
  const outcome = outcomeElement.value;

  if (question) {
    question.textContent =
      `Research question: What is the estimated association of ${exposure} with ${outcome}?`;
  }

  container.replaceChildren();

  if (!causalData) {
    container.append(
      effectCard(
        "Research data unavailable",
        "—",
        "Check that the Flask API is running and the source files are present."
      )
    );
    return;
  }

  const rows = causalData.causal_estimates || [];
  const queryRows = causalData.query_results || [];
  const models = causalData.models || {};

  let results = [];

  if (exposure === "Obesity (BMI ≥ 30)") {
    const outcomeKey = outcome === "KL grade (0–4)"
      ? "KL_grade (0-4)"
      : "KL>=2 (binary OA)";

    results = rows
      .filter((row) =>
        row.Analysis === "primary_one_knee" &&
        row.Outcome === outcomeKey
      )
      .map((row) => ({
        title: row.Method === "propensity_score_matching"
          ? "Propensity score matching"
          : "Linear regression",
        value: formatEffect(row.ATE),
        detail: `Estimated effect; n = ${row.N}`
      }));
  } else if (outcome === "KL grade (0–4)") {
    const match = {
      "BMI (per 1 kg/m²)": "BMI (per 1 unit, adj. age+family history)",
      "Age (per 10 years)": "Age - total (per 10y)",
      "Family history": "Family history (adj. age+BMI)"
    }[exposure];

    const row = queryRows.find((item) => item.Effect === match);

    if (row) {
      results.push({
        title: row.Effect,
        value: formatEffect(row.coef),
        detail:
          `95% CI: ${formatEffect(row.ci_low)} to ${formatEffect(row.ci_high)}`
      });
    }

    if (exposure === "Age (per 10 years)" && models.age_effect?.direct_per_10y) {
      const direct = models.age_effect.direct_per_10y;
      const indirect = models.age_effect.indirect_per_10y;

      results.push({
        title: "Direct age effect (controlling for BMI)",
        value: formatEffect(direct.coef),
        detail:
          `95% CI: ${formatEffect(direct.ci_low)} to ${formatEffect(direct.ci_high)}`
      });

      if (indirect) {
        results.push({
          title: "Indirect effect via BMI",
          value: formatEffect(indirect.coef),
          detail:
            `95% CI: ${formatEffect(indirect.ci_low)} to ${formatEffect(indirect.ci_high)}`
        });
      }
    }
  }

  if (results.length === 0) {
    container.append(
      effectCard(
        "Estimate unavailable",
        "—",
        "No matching estimate was found in the source output files."
      )
    );
  } else {
    results.forEach((result) => {
      container.append(effectCard(result.title, result.value, result.detail));
    });
  }

  if (exposure === "Obesity (BMI ≥ 30)") {
    const bothKnees = rows.filter((row) =>
      row.Analysis === "sensitivity_both_knees" &&
      row.Outcome === "KL_grade (0-4)"
    );

    if (bothKnees.length) {
      container.append(
        effectCard(
          "Sensitivity analysis: both knees",
          "Methods disagree",
          bothKnees.map((row) =>
            `${row.Method}: ${formatEffect(row.ATE)}`
          ).join(" | ") +
          ". Do not treat this sensitivity analysis as robust."
        )
      );
    }
  }
}

async function loadCausalData() {
  const container = $("causal-results");
  if (!container) return;

  container.replaceChildren();
  container.append(
    effectCard(
      "Loading research results…",
      "—",
      "Reading the project's causal output files."
    )
  );

  try {
    // Keep this URL small. Do not append image data or large JSON to it.
    const response = await fetch("/api/causal", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
        (response.status === 414
          ? "The causal request URL is too long. Check redirects or URL construction."
          : `Causal API request failed (HTTP ${response.status}).`)
      );
    }

    causalData = data;
    updateQuestion();
  } catch (error) {
    causalData = null;
    container.replaceChildren();

    container.append(
      effectCard(
        "Could not load causal results",
        "—",
        error.message || "Check the Flask server and try refreshing."
      )
    );
  }
}

$("causal-exposure")?.addEventListener("change", updateQuestion);
$("causal-outcome")?.addEventListener("change", updateQuestion);

if ($("causal-results")) {
  loadCausalData();
}

// Report draft.
$("generate-report")?.addEventListener("click", () => {
  const summary = $("report-summary")?.value.trim() || "";
  const causal = $("report-causal")?.value.trim() || "";
  const xai = $("report-xai")?.value.trim() || "";

  const parts = [
    "CLINICAL RESEARCH REPORT DRAFT",
    "",
    "Assessment summary",
    summary || "No verified assessment summary supplied.",
    "",
    "Causal context",
    causal || "No causal findings supplied.",
    "",
    "Explainability",
    xai || "No validated explanation supplied.",
    "",
    "Limitations",
    "This draft contains only user-supplied text. Verify every finding against source outputs. It is not a diagnosis or treatment recommendation."
  ];

  if ($("report-output")) {
    $("report-output").textContent = parts.join("\n");
  }

  toast("Report draft created from supplied text. No LLM was called.");
});

$("copy-report")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("report-output")?.textContent || "");
    toast("Report copied.");
  } catch {
    toast("Clipboard unavailable. Select and copy the report text.");
  }
});

// Release the local preview URL when the page is closed.
window.addEventListener("beforeunload", () => {
  if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
});
