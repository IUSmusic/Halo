import { saveSettings } from "./utils.js";

export function bindUI(state) {
  const ids = [
    "video","overlay","mirrorOverlay","viewport","touchFallback","suggestionBar",
    "startCameraBtn","recalibrateBtn","installBtn","voiceToggleBtn","voiceUndoBtn","voiceCommitBtn",
    "cameraSelect","placementMode","anchorMode","interactionMode","drawBtn","finishBtn","pinBtn",
    "rotateLeftBtn","rotateRightBtn","resetBtn","selectionMode","mirrorMode","scaleMode","accuracyMode",
    "dwellMode","neonMode","soundToggle","vibrationToggle","bedModeToggle","lowLightToggle","touchFallbackToggle",
    "pointerSourceMode","mirrorDockMode","mirrorSizeMode","mirrorEnabledToggle","output","phaseBadge","statusBadge","trackingText","shapeText","modeText",
    "rotationText","hoveredText","fingertipsText","triggerText","pinchText","pressText","calibrationText",
    "profileText","lightText","xrText","pointerText","voiceTranscript","tourModal","tourDismissBtn","calibrationModal",
    "calibrationTitle","calibrationBody","calibrationSkipBtn","calibrationCaptureBtn"
  ];
  const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  ui.toastHost = document.getElementById("toastHost");

  ui.output.textContent = state.typedText || "Place Halo and type with a press gesture.";
  ui.scaleMode.value = String(state.ui.keyboardScale);
  ui.selectionMode.value = state.ui.selectionMode;
  ui.anchorMode.value = state.ui.anchorMode;
  ui.placementMode.value = state.ui.placementMode;
  ui.interactionMode.value = state.ui.interactionMode;
  ui.accuracyMode.value = state.ui.accuracyMode;
  ui.mirrorMode.value = state.ui.viewMode;
  ui.dwellMode.value = String(state.ui.dwellMs);
  ui.neonMode.value = String(state.ui.neonStrength);
  ui.soundToggle.checked = state.ui.soundEnabled;
  ui.vibrationToggle.checked = state.ui.vibrationEnabled;
  ui.bedModeToggle.checked = state.ui.bedMode;
  ui.lowLightToggle.checked = state.ui.lowLightMode;
  ui.touchFallbackToggle.checked = state.ui.touchFallbackEnabled;
  ui.pointerSourceMode.value = state.ui.pointerSource || "index";
  ui.mirrorDockMode.value = state.ui.mirrorDock;
  ui.mirrorSizeMode.value = state.ui.mirrorSize;
  ui.mirrorEnabledToggle.checked = state.ui.mirrorEnabled !== false;

  applyMirrorDock(ui, state.ui.mirrorDock, state.ui.mirrorSize, state.ui.mirrorEnabled !== false);
  document.body.classList.toggle("low-light", state.ui.lowLightMode);
  return ui;
}

export function applyMirrorDock(ui, dock, size, enabled = true) {
  ui.mirrorOverlay.className = `mirror-overlay ${dock} ${size}${enabled ? "" : " is-hidden"}`;
  ui.mirrorOverlay.setAttribute("aria-hidden", enabled ? "false" : "true");
}

export function syncMirrorView(ui, mirrored) {
  ui.video.classList.toggle("mirrored", mirrored);
}

export function setStatus(ui, text, tone = "warn") {
  ui.statusBadge.textContent = text;
  ui.statusBadge.style.color = tone === "ok" ? "#86efac" : tone === "bad" ? "#fda4af" : "#fde68a";
}

export function showToast(ui, text, tone = "warn", timeout = 2600) {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = text;
  ui.toastHost.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeout);
}

export function renderSuggestions(ui, suggestions, onClick) {
  ui.suggestionBar.innerHTML = "";
  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.className = "suggestion-chip";
    button.textContent = suggestion;
    button.addEventListener("click", () => onClick(suggestion));
    ui.suggestionBar.appendChild(button);
  });
}

export function updateVoiceUI(ui, text, enabled) {
  ui.voiceTranscript.textContent = text;
  ui.voiceToggleBtn.textContent = enabled ? "Voice on" : "Voice off";
}

export function updateOutput(ui, text) {
  ui.output.textContent = text || "Place Halo and type with a press gesture.";
}

export function refreshPhase(ui, phase) {
  ui.phaseBadge.textContent = `Phase: ${phase}`;
}

export function updateRotationText(ui, rotationOffsetDeg) {
  const value = ((rotationOffsetDeg % 360) + 360) % 360;
  const signed = value > 180 ? value - 360 : value;
  ui.rotationText.textContent = `${signed}°`;
}

export function updateModeText(ui, state) {
  const extras = [];
  if (state.ui.bedMode) extras.push("bed");
  if (state.ui.interactionMode === "pointer") extras.push("pointer");
  ui.modeText.textContent = `${state.ui.anchorMode} / ${state.ui.placementMode}${extras.length ? ` / ${extras.join(" + ")}` : ""}`;
}

export function openTourIfNeeded(ui) {
  const seen = localStorage.getItem("halo-tour-seen");
  if (!seen) ui.tourModal.classList.remove("hidden");
}

export function dismissTour(ui) {
  localStorage.setItem("halo-tour-seen", "1");
  ui.tourModal.classList.add("hidden");
}

export function openCalibration(ui, bedMode) {
  ui.calibrationTitle.textContent = bedMode ? "Hold your hand relaxed" : "Hold your hand flat";
  ui.calibrationBody.textContent = bedMode
    ? "Relax your hand as if you are lying down, then tap capture. Halo will lower press thresholds for side angles and increase smoothing for single-hand use."
    : "Hold your hand flat above the surface, then tap capture. Halo will measure span, tilt, and depth for stronger press detection.";
  ui.calibrationModal.classList.remove("hidden");
}

export function closeCalibration(ui) {
  ui.calibrationModal.classList.add("hidden");
}

export function persistState(state) {
  saveSettings(state);
}

export function populateCameraSelect(ui, devices, currentDeviceId) {
  ui.cameraSelect.innerHTML = "";
  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = "Default camera";
  ui.cameraSelect.appendChild(fallback);
  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    option.selected = device.deviceId === currentDeviceId;
    ui.cameraSelect.appendChild(option);
  });
}

export function attachInstallPrompt(ui) {
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    ui.installBtn.hidden = false;
  });
  ui.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    ui.installBtn.hidden = true;
  });
}
