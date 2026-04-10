import { HandTracker, MEDIAPIPE_VERSION } from "./handTracker.js";
import { KeyboardRenderer } from "./keyboardRenderer.js";
import {
  TIP_INDICES,
  FINGER_NAMES,
  applyKeyToText,
  applySuggestion,
  buildLayout,
  computeCalibration,
  createAnchorFromHand,
  createFilterPreset,
  currentLayout,
  detectPressGesture,
  detectThreeFingerSpread,
  detectTwoFingerSwipe,
  formatKeyLabel,
  getActiveAnchor,
  getFingerState,
  getHandConfidence,
  getPoint,
  getTextSuggestions,
  insertVoiceText,
  isPalmOpen,
  keyAtPoint,
  smoothCursor,
  updateDepthState,
} from "./gestureEngine.js";
import { VoiceInputManager } from "./voiceInput.js";
import {
  applyMirrorDock,
  attachInstallPrompt,
  bindUI,
  closeCalibration,
  dismissTour,
  openCalibration,
  openTourIfNeeded,
  persistState,
  populateCameraSelect,
  refreshPhase,
  renderSuggestions,
  setStatus,
  showToast,
  syncMirrorView,
  updateModeText,
  updateOutput,
  updateRotationText,
  updateVoiceUI,
} from "./uiControls.js";
import { averagePoint, clamp, deepClone, loadSettings, profileDevice, supportsWebXR, vibrate } from "./utils.js";

const DEFAULT_STATE = {
  typedText: "",
  phase: "calibration",
  rotationOffsetDeg: 0,
  currentDeviceId: "",
  lastTrigger: "—",
  pinnedAnchor: null,
  previewAnchor: null,
  sculptAnchor: null,
  drawnPoints: [],
  calibration: null,
  shiftOn: false,
  capsLock: false,
  symbolMode: false,
  voiceLastInsert: "",
  ui: {
    placementMode: "sculpt",
    anchorMode: "surface",
    interactionMode: "type",
    selectionMode: "press",
    viewMode: "natural",
    keyboardScale: 1,
    dwellMs: 520,
    accuracyMode: "auto",
    neonStrength: 1,
    soundEnabled: true,
    vibrationEnabled: true,
    bedMode: false,
    lowLightMode: false,
    touchFallbackEnabled: true,
    pointerSource: "index",
    pageZoom: 1,
    mirrorDock: "right",
    mirrorSize: "medium",
    mirrorEnabled: true,
  },
};

const state = loadSettings(DEFAULT_STATE);
const ui = bindUI(state);
const tracker = new HandTracker(ui.video, { onStatus: (text, tone) => setStatus(ui, text, tone) });
const renderer = new KeyboardRenderer(ui.overlay, ui.mirrorOverlay);
const profile = profileDevice();
const smoothingFilters = new Map();
const fingerStates = new Map();
const gestureStates = new Map();
const mirrorState = { layout: currentLayout(state.shiftOn || state.capsLock, state.symbolMode), suggestions: [] };
let latestResult = null;
let running = false;
let audioCtx = null;
let inferenceClock = 0;
let lastGlobalCommitTime = 0;
let lastGlobalKey = "";
let lastHoverBuzzKey = "";
let lastPointerClickAt = 0;
let lastVoiceGestureAt = 0;
let drawActive = false;
let sculptActive = false;
const pointerState = {
  hoverTarget: null,
  pinchStartedAt: 0,
  isDown: false,
  downTarget: null,
  downAt: 0,
  dragMoved: false,
  lastPoint: null,
  lastMoveOrigin: null,
  lastScrollCenter: null,
  zoomDistance: 0,
  lastZoomPersistAt: 0,
};

ui.profileText.textContent = `${profile.label} • ${profile.cores} cores • ${profile.memory} GB`;
ui.calibrationText.textContent = state.calibration ? "Saved" : "Pending";
ui.xrText.textContent = "Checking";
ui.lightText.textContent = "Unknown";
ui.touchFallback.classList.toggle("hidden", !state.ui.touchFallbackEnabled);
refreshPhase(ui, state.phase);
updateRotationText(ui, state.rotationOffsetDeg);
updateModeText(ui, state);
updatePointerLabel();
applyPageZoom(state.ui.pageZoom || 1);
updateVoiceUI(ui, "Voice idle", false);
setStatus(ui, `Ready • MediaPipe ${MEDIAPIPE_VERSION}`, "ok");
attachInstallPrompt(ui);
openTourIfNeeded(ui);
registerServiceWorker();
checkXR();
refreshCameraList();
renderTextSuggestions();
renderer.resize();
syncMirrorPreference();

ui.tourDismissBtn.addEventListener("click", () => dismissTour(ui));
ui.calibrationSkipBtn.addEventListener("click", () => closeCalibration(ui));
ui.calibrationCaptureBtn.addEventListener("click", captureCalibration);
ui.recalibrateBtn.addEventListener("click", () => openCalibration(ui, state.ui.bedMode));
ui.installBtn.addEventListener("click", () => {});
ui.startCameraBtn.addEventListener("click", startCamera);
ui.voiceUndoBtn.addEventListener("click", undoVoiceInsert);
ui.voiceCommitBtn.addEventListener("click", () => voice.commitLast());
ui.cameraSelect.addEventListener("change", async () => {
  state.currentDeviceId = ui.cameraSelect.value;
  persist();
  if (running) await startCamera();
});
ui.placementMode.addEventListener("change", () => setUIValue("placementMode", ui.placementMode.value));
ui.anchorMode.addEventListener("change", () => setUIValue("anchorMode", ui.anchorMode.value));
ui.interactionMode.addEventListener("change", () => setUIValue("interactionMode", ui.interactionMode.value));
ui.selectionMode.addEventListener("change", () => setUIValue("selectionMode", ui.selectionMode.value));
ui.mirrorMode.addEventListener("change", () => { setUIValue("viewMode", ui.mirrorMode.value); syncMirrorPreference(); });
ui.scaleMode.addEventListener("change", () => setUIValue("keyboardScale", Number(ui.scaleMode.value)));
ui.accuracyMode.addEventListener("change", () => setUIValue("accuracyMode", ui.accuracyMode.value));
ui.dwellMode.addEventListener("change", () => setUIValue("dwellMs", Number(ui.dwellMode.value)));
ui.neonMode.addEventListener("change", () => setUIValue("neonStrength", Number(ui.neonMode.value)));
ui.soundToggle.addEventListener("change", () => setUIValue("soundEnabled", ui.soundToggle.checked));
ui.vibrationToggle.addEventListener("change", () => setUIValue("vibrationEnabled", ui.vibrationToggle.checked));
ui.lowLightToggle.addEventListener("change", () => { setUIValue("lowLightMode", ui.lowLightToggle.checked); document.body.classList.toggle("low-light", ui.lowLightToggle.checked); });
ui.touchFallbackToggle.addEventListener("change", () => {
  setUIValue("touchFallbackEnabled", ui.touchFallbackToggle.checked);
  ui.touchFallback.classList.toggle("hidden", !ui.touchFallbackToggle.checked);
});
ui.pointerSourceMode.addEventListener("change", () => setUIValue("pointerSource", ui.pointerSourceMode.value));
ui.mirrorDockMode.addEventListener("change", () => {
  setUIValue("mirrorDock", ui.mirrorDockMode.value);
  applyMirrorDock(ui, state.ui.mirrorDock, state.ui.mirrorSize, state.ui.mirrorEnabled !== false);
});
ui.mirrorSizeMode.addEventListener("change", () => {
  setUIValue("mirrorSize", ui.mirrorSizeMode.value);
  applyMirrorDock(ui, state.ui.mirrorDock, state.ui.mirrorSize, state.ui.mirrorEnabled !== false);
  renderer.resize();
});
ui.mirrorEnabledToggle.addEventListener("change", () => {
  setUIValue("mirrorEnabled", ui.mirrorEnabledToggle.checked);
  applyMirrorDock(ui, state.ui.mirrorDock, state.ui.mirrorSize, state.ui.mirrorEnabled !== false);
  renderer.resize();
  showToast(ui, state.ui.mirrorEnabled !== false ? "Mirror overlay on" : "Mirror overlay off", state.ui.mirrorEnabled !== false ? "ok" : "warn", 1800);
});
ui.bedModeToggle.addEventListener("change", async () => {
  setUIValue("bedMode", ui.bedModeToggle.checked);
  if (state.ui.bedMode) {
    state.ui.viewMode = "selfie";
    ui.mirrorMode.value = "selfie";
    if (state.ui.accuracyMode === "auto") {
      ui.accuracyMode.value = "bed";
      state.ui.accuracyMode = "bed";
    }
  }
  persist();
  syncMirrorPreference();
  if (running) await startCamera();
});
ui.drawBtn.addEventListener("click", beginPlacement);
ui.finishBtn.addEventListener("click", finishPlacement);
ui.pinBtn.addEventListener("click", pinKeyboard);
ui.rotateLeftBtn.addEventListener("click", () => rotateKeyboard(-6));
ui.rotateRightBtn.addEventListener("click", () => rotateKeyboard(6));
ui.resetBtn.addEventListener("click", resetAll);
window.addEventListener("resize", () => renderer.resize());
ui.mirrorOverlay.addEventListener("pointerdown", handleMirrorPointer);

const voice = new VoiceInputManager({
  onText: (text) => {
    state.typedText = insertVoiceText(state.typedText, text);
    state.voiceLastInsert = text;
    afterTextMutation(`voice → ${text}`);
  },
  onCommand: (command) => {
    if (command === "UNDO_VOICE") return undoVoiceInsert();
    if (command === "CAPS_ON") state.capsLock = true;
    else if (command === "CAPS_OFF") state.capsLock = false;
    else if (command === "VOICE_OFF") voice.stop();
    else commitKey(command, performance.now(), `voice ${command}`, { bypassCooldown: true });
    refreshLayout();
    persist();
  },
  onStatus: (text) => updateVoiceUI(ui, text, voice.enabled),
});
ui.voiceToggleBtn.addEventListener("click", () => {
  const enabled = voice.toggle();
  updateVoiceUI(ui, voice.enabled ? "Voice listening…" : "Voice idle", enabled);
});

requestAnimationFrame(loop);

async function checkXR() {
  const available = await supportsWebXR();
  ui.xrText.textContent = available ? "immersive-ar available" : "not available";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (_) {}
}

function setUIValue(key, value) {
  state.ui[key] = value;
  if (key === "pointerSource") updatePointerLabel();
  if (key === "pageZoom") applyPageZoom(value);
  persist();
  updateModeText(ui, state);
  refreshLayout();
}

function persist() {
  persistState(state);
}

function updatePointerLabel(detail = "") {
  const label = state.ui.pointerSource === "wholehand"
    ? "Whole hand pointer"
    : state.ui.pointerSource === "onefinger"
      ? "Any finger pointer"
      : "Index finger pointer";
  ui.pointerText.textContent = detail ? `${label} • ${detail}` : label;
}

function applyPageZoom(value) {
  const zoom = clamp(Number(value) || 1, 0.85, 1.6);
  state.ui.pageZoom = Number(zoom.toFixed(2));
  document.documentElement.style.zoom = String(state.ui.pageZoom);
}

function syncMirrorPreference() {
  const mirrored = getDisplayMirror();
  syncMirrorView(ui, mirrored);
}

function getDisplayMirror() {
  if (state.ui.viewMode === "selfie") return true;
  if (state.ui.viewMode === "natural") return tracker.currentFacingHint === "front";
  return false;
}

async function refreshCameraList() {
  const devices = await tracker.listCameras();
  populateCameraSelect(ui, devices, state.currentDeviceId);
}

async function startCamera() {
  try {
    await ensureAudio();
    const result = await tracker.startCamera({
      deviceId: state.currentDeviceId,
      preferRear: state.ui.bedMode || tracker.profile.mobile,
      numHands: state.ui.bedMode ? 1 : tracker.profile.lowEnd ? 1 : 2,
      lowEnd: tracker.profile.lowEnd,
    });
    running = true;
    ui.touchFallback.classList.toggle("hidden", true);
    await refreshCameraList();
    syncMirrorPreference();
    setStatus(ui, `Camera running (${result.facingHint})`, "ok");
    ui.trackingText.textContent = `Show ${state.ui.bedMode ? "one hand" : "one or two hands"}`;
    ui.trackingText.className = "warn";
    if (!state.calibration) openCalibration(ui, state.ui.bedMode);
  } catch (error) {
    running = false;
    console.error(error);
    const permission = error?.name === "NotAllowedError" || error?.message?.includes("Permission");
    const message = permission ? "Camera blocked — grant permission and try again" : "Camera unavailable — using touch fallback";
    setStatus(ui, message, permission ? "bad" : "warn");
    showToast(ui, message, permission ? "bad" : "warn");
    ui.trackingText.textContent = "Camera unavailable";
    ui.trackingText.className = "bad";
    ui.touchFallback.classList.toggle("hidden", !state.ui.touchFallbackEnabled);
  }
}

async function ensureAudio() {
  if (!state.ui.soundEnabled) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch (_) {}
  }
}

function playFeedback(type = "commit") {
  if (state.ui.soundEnabled && audioCtx) {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type === "hover" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(type === "hover" ? 620 : 760, now);
    osc.frequency.exponentialRampToValueAtTime(type === "hover" ? 540 : 520, now + 0.05);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "hover" ? 0.008 : 0.026, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }
  if (state.ui.vibrationEnabled) vibrate(type === "hover" ? [4] : [10, 16, 10]);
}

function beginPlacement() {
  if (!running) {
    showToast(ui, "Start the camera first", "warn");
    return;
  }
  state.phase = state.ui.placementMode === "sculpt" ? "sculpting" : "drawing";
  drawActive = state.ui.placementMode === "rectangle";
  sculptActive = state.ui.placementMode === "sculpt";
  state.drawnPoints = [];
  state.previewAnchor = null;
  state.pinnedAnchor = null;
  fingerStates.clear();
  ui.shapeText.textContent = state.ui.placementMode === "sculpt" ? "Pinch to place and size" : "Tracing rectangle";
  setStatus(ui, state.ui.placementMode === "sculpt" ? "Use one hand pinch to place Halo" : "Trace a rectangle with your index finger", "ok");
  refreshPhase(ui, state.phase);
  persist();
}

function finishPlacement() {
  if (state.ui.placementMode === "rectangle") {
    if (state.drawnPoints.length < 20) {
      showToast(ui, "Draw a larger rectangle first", "warn");
      return;
    }
    const anchor = renderer.anchorFromPath(state.drawnPoints, state.ui.anchorMode);
    if (!anchor) {
      showToast(ui, "Could not detect a usable shape", "bad");
      return;
    }
    state.previewAnchor = anchor;
  } else {
    if (!state.sculptAnchor) {
      showToast(ui, "Pinch and place the keyboard first", "warn");
      return;
    }
    state.previewAnchor = deepClone(state.sculptAnchor);
  }
  drawActive = false;
  sculptActive = false;
  state.phase = "preview";
  ui.shapeText.textContent = `${Math.round(state.previewAnchor.baseWidth)}×${Math.round(state.previewAnchor.baseHeight)} preview`;
  setStatus(ui, "Placement captured. Pin it when it looks right.", "ok");
  refreshPhase(ui, state.phase);
  persist();
}

function pinKeyboard() {
  const src = state.previewAnchor || state.sculptAnchor;
  if (!src) {
    showToast(ui, "Create a keyboard placement first", "warn");
    return;
  }
  state.pinnedAnchor = deepClone(src);
  state.phase = "typing";
  drawActive = false;
  sculptActive = false;
  fingerStates.clear();
  setStatus(ui, "Halo pinned. Type with press, pinch, dwell, voice, or touch mirror.", "ok");
  refreshPhase(ui, state.phase);
  persist();
}

function rotateKeyboard(amount) {
  state.rotationOffsetDeg += amount;
  updateRotationText(ui, state.rotationOffsetDeg);
  persist();
}

function resetAll() {
  state.phase = "calibration";
  drawActive = false;
  sculptActive = false;
  state.drawnPoints = [];
  state.sculptAnchor = null;
  state.previewAnchor = null;
  state.pinnedAnchor = null;
  state.rotationOffsetDeg = 0;
  state.typedText = "";
  state.lastTrigger = "—";
  state.shiftOn = false;
  state.capsLock = false;
  state.symbolMode = false;
  smoothingFilters.clear();
  fingerStates.clear();
  ui.shapeText.textContent = "—";
  ui.hoveredText.textContent = "—";
  ui.fingertipsText.textContent = "0";
  ui.triggerText.textContent = "—";
  ui.pinchText.textContent = "—";
  ui.pressText.textContent = "—";
  updateOutput(ui, state.typedText);
  updateRotationText(ui, state.rotationOffsetDeg);
  refreshPhase(ui, state.phase);
  renderTextSuggestions();
  persist();
  setStatus(ui, "Halo reset", "ok");
}

function captureCalibration() {
  const result = latestResult;
  const hands = result?.landmarks || [];
  const worlds = result?.worldLandmarks || [];
  if (!hands.length) {
    showToast(ui, "Show your hand before capturing calibration", "warn");
    return;
  }
  const confidence = getHandConfidence(result, 0);
  if (confidence < 0.7) {
    showToast(ui, "Tracking confidence is too low for calibration", "warn");
    return;
  }
  state.calibration = computeCalibration({
    landmarks: hands[0],
    worldLandmarks: worlds[0],
    rect: ui.overlay.getBoundingClientRect(),
    mirrored: getDisplayMirror(),
    bedMode: state.ui.bedMode,
  });
  if (!state.calibration) {
    showToast(ui, "Calibration failed — try again with your hand more visible", "bad");
    return;
  }
  if (!state.pinnedAnchor) state.ui.keyboardScale = Number(state.calibration.keyboardScale.toFixed(2));
  ui.scaleMode.value = String(state.ui.keyboardScale);
  ui.calibrationText.textContent = `Saved • span ${Math.round(state.calibration.spanPx)}px`;
  closeCalibration(ui);
  persist();
  showToast(ui, state.ui.bedMode ? "Bed mode calibrated" : "Calibration captured", "ok");
}

function refreshLayout() {
  mirrorState.layout = currentLayout(state.shiftOn || state.capsLock, state.symbolMode);
}

function renderTextSuggestions() {
  mirrorState.suggestions = getTextSuggestions(state.typedText);
  renderSuggestions(ui, mirrorState.suggestions, (suggestion) => {
    state.typedText = applySuggestion(state.typedText, suggestion);
    afterTextMutation(`suggestion → ${suggestion}`);
  });
}

function afterTextMutation(triggerLabel) {
  updateOutput(ui, state.typedText);
  ui.triggerText.textContent = triggerLabel;
  state.lastTrigger = triggerLabel;
  renderTextSuggestions();
  refreshLayout();
  persist();
}

function commitKey(label, now, source, { cursorId = "", bypassCooldown = false } = {}) {
  const fingerState = cursorId ? getFingerState(fingerStates, cursorId) : null;
  if (!bypassCooldown && fingerState && now - fingerState.lastCommitTime < 240) return false;
  if (!bypassCooldown && now - lastGlobalCommitTime < 100 && label === lastGlobalKey) return false;
  const result = applyKeyToText(state.typedText, label, { shiftOn: state.shiftOn, capsLock: state.capsLock, symbolMode: state.symbolMode });
  state.typedText = result.text;
  state.shiftOn = result.shiftOn;
  state.capsLock = result.capsLock;
  state.symbolMode = result.symbolMode;
  if (fingerState) {
    fingerState.lastCommitTime = now;
    fingerState.hoverSince = now;
    fingerState.lastHoverKey = label;
    fingerState.pressActive = false;
    fingerState.pressPeak = 0;
  }
  lastGlobalCommitTime = now;
  lastGlobalKey = label;
  playFeedback("commit");
  afterTextMutation(`${source} → ${formatKeyLabel(label)}`);
  setStatus(ui, `Typed ${formatKeyLabel(label)}`, "ok");
  return true;
}

function undoVoiceInsert() {
  const last = voice.undoLast() || state.voiceLastInsert;
  if (!last) return;
  if (state.typedText.endsWith(last)) state.typedText = state.typedText.slice(0, -last.length).trimEnd();
  state.voiceLastInsert = "";
  afterTextMutation("voice undo");
}

function handleMirrorPointer(event) {
  if (!state.ui.touchFallbackEnabled || state.ui.mirrorEnabled === false) return;
  const tester = renderer.makeMirrorHitTester(mirrorState.layout, mirrorState.suggestions);
  const hit = tester(event.clientX, event.clientY);
  if (!hit) return;
  if (hit.type === "suggestion") {
    state.typedText = applySuggestion(state.typedText, hit.value);
    afterTextMutation(`touch suggestion → ${hit.value}`);
    playFeedback("commit");
    return;
  }
  if (hit.type === "key") {
    commitKey(hit.value, performance.now(), "touch mirror", { bypassCooldown: true });
  }
}

function loop(now) {
  renderer.resize();
  if (running && now - inferenceClock >= tracker.profile.inferenceInterval) {
    inferenceClock = now;
    latestResult = tracker.detect(now);
  }
  renderFrame(now, latestResult);
  requestAnimationFrame(loop);
}

function renderFrame(now, result) {
  const rect = ui.overlay.getBoundingClientRect();
  refreshLayout();
  const layout = mirrorState.layout;
  const hoveredLabels = new Set();
  const cursors = [];
  let minPinch = Infinity;
  let maxPressScore = 0;
  let pointer = null;

  const activeAnchor = getActiveAnchor(state.pinnedAnchor || state.previewAnchor || state.sculptAnchor, state.ui.keyboardScale, state.rotationOffsetDeg, state.ui.anchorMode);

  const hands = result?.landmarks || [];
  const worldHands = result?.worldLandmarks || [];
  if (!hands.length) {
    ui.trackingText.textContent = running ? "No hands detected" : "Waiting for camera";
    ui.trackingText.className = running ? "warn" : "warn";
    ui.fingertipsText.textContent = "0";
    ui.hoveredText.textContent = "—";
    renderer.drawFrame({
      anchor: activeAnchor,
      layout,
      hoveredLabels,
      cursors,
      now,
      neonStrength: state.ui.neonStrength,
      phase: state.phase,
      drawPathPoints: state.drawnPoints,
      pointer,
      mirrorTouchEnabled: state.ui.touchFallbackEnabled,
      mirrorEnabled: state.ui.mirrorEnabled !== false,
      lowLightMode: currentLowLightMode(),
      suggestions: mirrorState.suggestions,
    });
    return;
  }

  const profileText = tracker.profile.lowEnd ? "fast profile" : tracker.profile.mobile ? "mobile balanced" : "balanced";
  ui.profileText.textContent = `${profileText} • ${tracker.profile.cores} cores • ${tracker.profile.memory} GB`;

  hands.forEach((hand, handIndex) => {
    const confidence = getHandConfidence(result, handIndex);
    if (confidence < 0.7) return;
    const presetName = state.ui.accuracyMode === "auto" ? (state.ui.bedMode ? "bed" : tracker.profile.lowEnd ? "fast" : "balanced") : state.ui.accuracyMode;
    const preset = createFilterPreset(presetName, confidence, state.ui.bedMode);
    const thumbPoint = smoothCursor(`hand-${handIndex}-4`, getPoint(rect, hand[4], getDisplayMirror()), smoothingFilters, preset);
    TIP_INDICES.forEach((tipIndex) => {
      const point = smoothCursor(`hand-${handIndex}-${tipIndex}`, getPoint(rect, hand[tipIndex], getDisplayMirror()), smoothingFilters, preset);
      const pinchDistance = tipIndex === 4 ? null : Math.hypot(point.x - thumbPoint.x, point.y - thumbPoint.y) / Math.max(rect.width, rect.height);
      if (pinchDistance !== null && pinchDistance < minPinch) minPinch = pinchDistance;
      cursors.push({
        id: `hand-${handIndex}-${tipIndex}`,
        handIndex,
        tipIndex,
        fingerName: FINGER_NAMES[tipIndex],
        point,
        z: hand[tipIndex].z,
        confidence,
        pinchDistance,
        isThumb: tipIndex === 4,
      });
    });

    if (sculptActive && state.ui.placementMode === "sculpt" && handIndex === 0) {
      const anchor = createAnchorFromHand({
        landmarks: hand,
        worldLandmarks: worldHands[handIndex],
        rect,
        mirrored: getDisplayMirror(),
        anchorMode: state.ui.anchorMode,
        calibration: state.calibration,
        bedMode: state.ui.bedMode,
      });
      if (anchor?.isGrab) {
        state.sculptAnchor = anchor;
        ui.shapeText.textContent = `Sculpt ${Math.round(anchor.baseWidth)}×${Math.round(anchor.baseHeight)}`;
      }
    }

    const gestureState = gestureStates.get(handIndex) || {};
    gestureStates.set(handIndex, gestureState);
    if (state.ui.interactionMode === "type") {
      const swipe = detectTwoFingerSwipe(hand, rect, getDisplayMirror(), gestureState);
      if (swipe === "CAPS") {
        state.capsLock = !state.capsLock;
        refreshLayout();
        setStatus(ui, `Caps ${state.capsLock ? "on" : "off"}`, "ok");
      } else if (swipe === "SHIFT") {
        state.shiftOn = !state.shiftOn;
        refreshLayout();
        setStatus(ui, `Shift ${state.shiftOn ? "on" : "off"}`, "ok");
      } else if (swipe === "SCROLL_DOWN") {
        window.scrollBy({ top: 180, behavior: "smooth" });
      } else if (swipe === "SCROLL_UP") {
        window.scrollBy({ top: -180, behavior: "smooth" });
      }
    }

    if (detectThreeFingerSpread(hand, worldHands[handIndex]) && now - lastVoiceGestureAt > 1400) {
      lastVoiceGestureAt = now;
      voice.toggle();
      updateVoiceUI(ui, voice.enabled ? "Voice listening…" : "Voice idle", voice.enabled);
      showToast(ui, voice.enabled ? "Voice activated by gesture" : "Voice stopped by gesture", "ok");
    }
  });

  ui.trackingText.textContent = `${hands.length} hand${hands.length > 1 ? "s" : ""} tracked`;
  ui.trackingText.className = "ok";
  ui.fingertipsText.textContent = String(cursors.length);
  ui.pinchText.textContent = Number.isFinite(minPinch) ? minPinch.toFixed(3) : "—";

  if (activeAnchor) {
    cursors.forEach((cursor) => {
      const fingerState = getFingerState(fingerStates, cursor.id);
      const hit = keyAtPoint(cursor.point, activeAnchor, layout, fingerState.lastHoverKey);
      if (hit) {
        cursor.hoveredKey = hit.key;
        cursor.u = hit.u;
        cursor.v = hit.v;
        cursor.hoverStart = fingerState.hoverSince || now;
        cursor.dwellMs = state.ui.dwellMs;
        hoveredLabels.add(hit.key.label);
      }
    });
  }

  if (!hoveredLabels.size) lastHoverBuzzKey = "";
  hoveredLabels.forEach((label) => {
    if (label !== lastHoverBuzzKey) {
      lastHoverBuzzKey = label;
      if (state.ui.vibrationEnabled) playFeedback("hover");
    }
  });

  if (state.phase === "typing" && activeAnchor && state.ui.interactionMode === "type") {
    let committed = false;
    cursors.forEach((cursor) => {
      const fingerState = getFingerState(fingerStates, cursor.id);
      updateDepthState(fingerState, cursor.z);
      const label = cursor.hoveredKey?.label || null;
      if (!label) {
        fingerState.hoverSince = 0;
        fingerState.lastHoverKey = null;
        fingerState.pressActive = false;
        fingerState.pressPeak = 0;
        return;
      }
      if (fingerState.lastHoverKey !== label) {
        fingerState.hoverSince = now;
        fingerState.lastHoverKey = label;
        fingerState.depthBaseline = cursor.z;
        fingerState.pressActive = false;
        fingerState.pressPeak = 0;
      }
      const presetName = state.ui.accuracyMode === "auto" ? (state.ui.bedMode ? "bed" : tracker.profile.lowEnd ? "fast" : "balanced") : state.ui.accuracyMode;
      const preset = createFilterPreset(presetName, cursor.confidence, state.ui.bedMode);
      if (state.calibration?.pressDepth) preset.pressDepth = state.calibration.pressDepth;
      const press = detectPressGesture(fingerState, cursor.z, now, preset, cursor.confidence);
      maxPressScore = Math.max(maxPressScore, press.score);
      const allowPress = !cursor.isThumb && (state.ui.selectionMode === "press" || state.ui.selectionMode === "hybrid");
      const allowPinch = !cursor.isThumb && (state.ui.selectionMode === "pinch" || state.ui.selectionMode === "hybrid");
      const allowDwell = state.ui.selectionMode === "dwell" || state.ui.selectionMode === "hybrid";

      if (!committed && allowPress && press.pressed) committed = commitKey(label, now, `press ${cursor.fingerName}`, { cursorId: cursor.id });
      if (!committed && allowPinch && cursor.pinchDistance !== null && cursor.pinchDistance < 0.052) committed = commitKey(label, now, `pinch ${cursor.fingerName}`, { cursorId: cursor.id });
      if (!committed && allowDwell && fingerState.hoverSince && now - fingerState.hoverSince >= state.ui.dwellMs) committed = commitKey(label, now, `dwell ${cursor.fingerName}`, { cursorId: cursor.id });
    });
  }

  if (drawActive && state.ui.placementMode === "rectangle") {
    const indexCursor = cursors.find((cursor) => cursor.tipIndex === 8);
    if (indexCursor) maybeAddDrawPoint(indexCursor.point);
  }

  if (state.ui.interactionMode === "pointer") {
    const trackedHands = buildTrackedHands(hands, rect);
    const pointerInfo = trackedHands.length ? resolvePointerInfo(trackedHands, rect) : null;
    if (pointerInfo) {
      pointer = { x: pointerInfo.point.x, y: pointerInfo.point.y, paused: pointerInfo.paused };
      handlePointerNavigation(now, pointerInfo, trackedHands, rect);
    } else {
      releasePointerIfNeeded();
      updatePointerLabel();
    }
  } else {
    releasePointerIfNeeded();
    updatePointerLabel();
  }

  const brightness = tracker.brightness;
  ui.lightText.textContent = brightness == null ? "Unknown" : brightness < 0.18 ? "Low" : brightness < 0.34 ? "Dim" : "Good";
  if (brightness != null) document.body.classList.toggle("low-light", state.ui.lowLightMode || brightness < 0.18);

  ui.hoveredText.textContent = hoveredLabels.size ? Array.from(hoveredLabels).map(formatKeyLabel).join(", ") : "—";
  ui.pressText.textContent = maxPressScore ? maxPressScore.toFixed(2) : "—";
  ui.triggerText.textContent = state.lastTrigger;

  renderer.drawFrame({
    anchor: activeAnchor,
    layout,
    hoveredLabels,
    cursors,
    now,
    neonStrength: state.ui.neonStrength,
    phase: state.phase,
    drawPathPoints: state.drawnPoints,
    pointer,
    mirrorTouchEnabled: state.ui.touchFallbackEnabled,
    mirrorEnabled: state.ui.mirrorEnabled !== false,
    lowLightMode: currentLowLightMode(),
    suggestions: mirrorState.suggestions,
  });
}

function buildTrackedHands(hands, rect) {
  return hands.map((hand, handIndex) => {
    const confidence = getHandConfidence(latestResult, handIndex);
    if (confidence < 0.7) return null;
    const presetName = state.ui.accuracyMode === "auto"
      ? (state.ui.bedMode ? "bed" : tracker.profile.lowEnd ? "fast" : "balanced")
      : state.ui.accuracyMode;
    const preset = createFilterPreset(presetName, confidence, state.ui.bedMode);
    const points = {};
    [4, 8, 12, 16, 20].forEach((tipIndex) => {
      points[tipIndex] = smoothCursor(
        `nav-${handIndex}-${tipIndex}`,
        getPoint(rect, hand[tipIndex], getDisplayMirror()),
        smoothingFilters,
        preset,
      );
    });
    const palmPoint = smoothCursor(
      `nav-${handIndex}-palm`,
      averagePoint([
        getPoint(rect, hand[0], getDisplayMirror()),
        getPoint(rect, hand[5], getDisplayMirror()),
        getPoint(rect, hand[9], getDisplayMirror()),
        getPoint(rect, hand[13], getDisplayMirror()),
        getPoint(rect, hand[17], getDisplayMirror()),
      ]),
      smoothingFilters,
      preset,
    );
    const pinchDistance = Math.hypot(points[8].x - points[4].x, points[8].y - points[4].y) / Math.max(rect.width, rect.height);
    const twoFingerCenter = averagePoint([points[8], points[12]]);
    const twoFingerSpread = Math.hypot(points[8].x - points[12].x, points[8].y - points[12].y) / Math.max(rect.width, rect.height);
    return {
      hand,
      handIndex,
      confidence,
      points,
      palmPoint,
      pinchDistance,
      twoFingerCenter,
      twoFingerSpread,
      paused: isPalmOpen(hand, rect, getDisplayMirror()),
    };
  }).filter(Boolean);
}

function resolvePointerInfo(trackedHands, rect) {
  const primary = trackedHands[0];
  if (!primary) return null;
  let sourceLabel = "index";
  let sourcePoint = primary.points[8];
  let sourceTipIndex = 8;

  if (state.ui.pointerSource === "wholehand") {
    sourceLabel = "whole hand";
    sourcePoint = primary.palmPoint;
    sourceTipIndex = 8;
  } else if (state.ui.pointerSource === "onefinger") {
    const candidates = [8, 12, 16, 20].map((tipIndex) => ({ tipIndex, point: primary.points[tipIndex] }));
    const chosen = candidates.reduce((best, candidate) => {
      if (!pointerState.lastPoint) {
        if (candidate.tipIndex === 8) return candidate;
        return best;
      }
      const bestDist = best ? Math.hypot(best.point.x - pointerState.lastPoint.x, best.point.y - pointerState.lastPoint.y) : Infinity;
      const nextDist = Math.hypot(candidate.point.x - pointerState.lastPoint.x, candidate.point.y - pointerState.lastPoint.y);
      return nextDist < bestDist ? candidate : best;
    }, null) || candidates[0];
    sourceLabel = `${FINGER_NAMES[chosen.tipIndex]} finger`;
    sourcePoint = chosen.point;
    sourceTipIndex = chosen.tipIndex;
  }

  const sourceCursorId = `pointer-${primary.handIndex}-${sourceTipIndex}`;
  const fingerState = getFingerState(fingerStates, sourceCursorId);
  const sourceZ = primary.hand[sourceTipIndex]?.z ?? primary.hand[8]?.z ?? 0;
  updateDepthState(fingerState, sourceZ);
  const presetName = state.ui.accuracyMode === "auto" ? (state.ui.bedMode ? "bed" : tracker.profile.lowEnd ? "fast" : "balanced") : state.ui.accuracyMode;
  const preset = createFilterPreset(presetName, primary.confidence, state.ui.bedMode);
  fingerState.hoverSince ||= performance.now();
  const press = detectPressGesture(fingerState, sourceZ, performance.now(), preset, primary.confidence);

  return {
    primary,
    point: sourcePoint,
    sourceLabel,
    paused: primary.paused,
    pinchClosed: primary.pinchDistance < (state.ui.bedMode ? 0.062 : 0.052),
    pressClicked: press.pressed,
    scrollCenter: primary.twoFingerCenter,
    scrollActive: primary.twoFingerSpread > 0.055 && !primary.paused,
    zoomActive: trackedHands.length >= 2 && trackedHands[0].pinchDistance < 0.072 && trackedHands[1].pinchDistance < 0.072,
    zoomDistance: trackedHands.length >= 2 ? Math.hypot(trackedHands[0].points[8].x - trackedHands[1].points[8].x, trackedHands[0].points[8].y - trackedHands[1].points[8].y) : 0,
    zoomMidpoint: trackedHands.length >= 2 ? averagePoint([trackedHands[0].points[8], trackedHands[1].points[8]]) : sourcePoint,
  };
}

function handlePointerNavigation(now, pointerInfo, trackedHands, rect) {
  pointerState.lastPoint = { ...pointerInfo.point };
  updatePointerLabel(pointerInfo.paused ? `${pointerInfo.sourceLabel} • paused` : pointerInfo.sourceLabel);

  if (pointerInfo.zoomActive) {
    releasePointerIfNeeded();
    handleAirZoom(pointerInfo, now);
    return;
  }
  pointerState.zoomDistance = 0;

  if (pointerInfo.scrollActive && !pointerInfo.pinchClosed) {
    handleAirScroll(pointerInfo);
  } else {
    pointerState.lastScrollCenter = null;
  }

  if (pointerInfo.paused) {
    releasePointerIfNeeded();
    return;
  }

  dispatchHover(pointerInfo.point);

  if (pointerInfo.pressClicked && now - lastPointerClickAt > 420) {
    lastPointerClickAt = now;
    const target = document.elementFromPoint(pointerInfo.point.x, pointerInfo.point.y);
    if (target && typeof target.click === "function") {
      target.click();
      setStatus(ui, "Pointer click", "ok");
    }
  }

  if (pointerInfo.pinchClosed) {
    if (!pointerState.pinchStartedAt) pointerState.pinchStartedAt = now;
    if (!pointerState.isDown && now - pointerState.pinchStartedAt > 90) {
      const target = document.elementFromPoint(pointerInfo.point.x, pointerInfo.point.y) || document.body;
      pointerState.isDown = true;
      pointerState.downTarget = target;
      pointerState.downAt = now;
      pointerState.dragMoved = false;
      dispatchMouseLikeEvent(target, "mousedown", pointerInfo.point, 1);
      setStatus(ui, "Pointer hold", "ok");
    }
  } else {
    if (pointerState.isDown) {
      const target = pointerState.downTarget || document.elementFromPoint(pointerInfo.point.x, pointerInfo.point.y) || document.body;
      dispatchMouseLikeEvent(target, "mouseup", pointerInfo.point, 0);
      if (!pointerState.dragMoved && now - pointerState.downAt < 420) {
        if (typeof target.click === "function") target.click();
      }
      pointerState.isDown = false;
      pointerState.downTarget = null;
      pointerState.dragMoved = false;
      setStatus(ui, "Pointer release", "ok");
    }
    pointerState.pinchStartedAt = 0;
  }

  if (pointerState.isDown && pointerState.lastPoint) {
    const moved = !pointerState.lastMoveOrigin ? 0 : Math.hypot(pointerInfo.point.x - pointerState.lastMoveOrigin.x, pointerInfo.point.y - pointerState.lastMoveOrigin.y);
    if (moved > 6) pointerState.dragMoved = true;
    dispatchMouseLikeEvent(pointerState.downTarget || document.body, "mousemove", pointerInfo.point, 1);
  }
  pointerState.lastMoveOrigin = { ...pointerInfo.point };
}

function dispatchHover(point) {
  const target = document.elementFromPoint(point.x, point.y) || document.body;
  if (pointerState.hoverTarget !== target) pointerState.hoverTarget = target;
  dispatchMouseLikeEvent(target, "mousemove", point, pointerState.isDown ? 1 : 0);
}

function dispatchMouseLikeEvent(target, type, point, buttons = 0) {
  if (!target) return;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    screenX: window.screenX + point.x,
    screenY: window.screenY + point.y,
    button: buttons ? 0 : 0,
    buttons,
    view: window,
  });
  target.dispatchEvent(event);
}

function handleAirScroll(pointerInfo) {
  if (!pointerState.lastScrollCenter) {
    pointerState.lastScrollCenter = { ...pointerInfo.scrollCenter };
    return;
  }
  const dx = pointerInfo.scrollCenter.x - pointerState.lastScrollCenter.x;
  const dy = pointerInfo.scrollCenter.y - pointerState.lastScrollCenter.y;
  pointerState.lastScrollCenter = { ...pointerInfo.scrollCenter };
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
  const target = document.elementFromPoint(pointerInfo.point.x, pointerInfo.point.y) || document.scrollingElement || document.body;
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: pointerInfo.point.x,
    clientY: pointerInfo.point.y,
    deltaX: -dx * 2.2,
    deltaY: -dy * 2.6,
  });
  target.dispatchEvent(wheel);
  window.scrollBy({ left: -dx * 2.2, top: -dy * 2.6, behavior: "auto" });
}

function handleAirZoom(pointerInfo, now) {
  if (!pointerState.zoomDistance) {
    pointerState.zoomDistance = pointerInfo.zoomDistance;
    updatePointerLabel("two-hand pinch zoom");
    return;
  }
  const delta = pointerInfo.zoomDistance - pointerState.zoomDistance;
  pointerState.zoomDistance = pointerInfo.zoomDistance;
  if (Math.abs(delta) < 3) return;
  const nextZoom = clamp((state.ui.pageZoom || 1) + delta * 0.0025, 0.85, 1.6);
  if (Math.abs(nextZoom - (state.ui.pageZoom || 1)) < 0.01) return;
  applyPageZoom(nextZoom);
  updatePointerLabel(`zoom ${Math.round(state.ui.pageZoom * 100)}%`);
  const target = document.elementFromPoint(pointerInfo.zoomMidpoint.x, pointerInfo.zoomMidpoint.y) || document.body;
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: pointerInfo.zoomMidpoint.x,
    clientY: pointerInfo.zoomMidpoint.y,
    deltaY: -delta * 4,
    ctrlKey: true,
  });
  target.dispatchEvent(wheel);
  if (now - pointerState.lastZoomPersistAt > 180) {
    pointerState.lastZoomPersistAt = now;
    persist();
  }
}

function releasePointerIfNeeded() {
  if (pointerState.isDown) {
    const point = pointerState.lastPoint || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    dispatchMouseLikeEvent(pointerState.downTarget || document.body, "mouseup", point, 0);
  }
  pointerState.isDown = false;
  pointerState.pinchStartedAt = 0;
  pointerState.downTarget = null;
  pointerState.dragMoved = false;
  pointerState.lastMoveOrigin = null;
  pointerState.lastScrollCenter = null;
  pointerState.zoomDistance = 0;
}

function currentLowLightMode() {
  return state.ui.lowLightMode || (tracker.brightness ?? 1) < 0.18;
}

function maybeAddDrawPoint(point) {
  const last = state.drawnPoints[state.drawnPoints.length - 1];
  if (!last || Math.hypot(last.x - point.x, last.y - point.y) >= 6) state.drawnPoints.push({ x: point.x, y: point.y });
}
