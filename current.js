
    import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

    const KEY_ROWS = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["Z", "X", "C", "V", "B", "N", "M"],
      ["SPACE", "BACKSPACE", "ENTER"]
    ];

    const TIP_INDICES = [4, 8, 12, 16, 20];
    const SPECIAL_LABELS = { SPACE: "space", BACKSPACE: "⌫", ENTER: "⏎" };
    const FINGER_NAMES = { 4: "thumb", 8: "index", 12: "middle", 16: "ring", 20: "pinky" };
    const KEY_LAYOUT = buildLayout(KEY_ROWS);

    const video = document.getElementById("video");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    const startCameraBtn = document.getElementById("startCameraBtn");
    const cameraSelect = document.getElementById("cameraSelect");
    const placementModeEl = document.getElementById("placementMode");
    const anchorModeEl = document.getElementById("anchorMode");
    const drawBtn = document.getElementById("drawBtn");
    const finishBtn = document.getElementById("finishBtn");
    const pinBtn = document.getElementById("pinBtn");
    const rotateLeftBtn = document.getElementById("rotateLeftBtn");
    const rotateRightBtn = document.getElementById("rotateRightBtn");
    const resetBtn = document.getElementById("resetBtn");

    const selectionModeEl = document.getElementById("selectionMode");
    const mirrorModeEl = document.getElementById("mirrorMode");
    const scaleModeEl = document.getElementById("scaleMode");
    const accuracyModeEl = document.getElementById("accuracyMode");
    const dwellModeEl = document.getElementById("dwellMode");
    const neonModeEl = document.getElementById("neonMode");
    const soundToggleEl = document.getElementById("soundToggle");
    const vibrationToggleEl = document.getElementById("vibrationToggle");

    const outputEl = document.getElementById("output");
    const phaseBadge = document.getElementById("phaseBadge");
    const statusBadge = document.getElementById("statusBadge");
    const trackingText = document.getElementById("trackingText");
    const shapeText = document.getElementById("shapeText");
    const modeText = document.getElementById("modeText");
    const rotationText = document.getElementById("rotationText");
    const hoveredText = document.getElementById("hoveredText");
    const fingertipsText = document.getElementById("fingertipsText");
    const triggerText = document.getElementById("triggerText");
    const pinchText = document.getElementById("pinchText");
    const pressText = document.getElementById("pressText");

    let handLandmarker = null;
    let stream = null;
    let running = false;
    let latestResult = null;
    let lastVideoTime = -1;
    let currentDeviceId = "";

    let phase = "calibration";
    let placementMode = "sculpt";
    let anchorMode = "surface";
    let selectionMode = "press";
    let viewMode = "natural";
    let currentFacingHint = "unknown";
    let keyboardScale = 1;
    let dwellMs = 520;
    let smoothingAlpha = 0.3;
    let cooldownMs = 250;
    let neonStrength = 1;
    let rotationOffsetDeg = 0;
    let soundEnabled = true;
    let vibrationEnabled = true;

    let drawnPoints = [];
    let drawing = false;
    let sculptActive = false;
    let sculptScale = 1;
    let sculptAnchor = null;
    let previewAnchor = null;
    let pinnedAnchor = null;

    let typedText = "";
    let lastGlobalCommitTime = 0;
    let lastGlobalKey = "";
    let lastTrigger = "—";

    const smoothedPoints = new Map();
    const fingerStates = new Map();
    let audioCtx = null;

    const DRAW_POINT_STEP = 6;
    const PINCH_THRESHOLD = 0.055;
    const PRESS_DEPTH_THRESHOLD = 0.010;
    const PRESS_VELOCITY_THRESHOLD = 0.00055;
    const PRESS_RECOVERY_THRESHOLD = 0.0045;
    const MIN_HOVER_BEFORE_PRESS_MS = 45;
    const KEY_SNAP_PADDING = 0.028;
    const KEY_STICKY_PADDING = 0.055;
    const NEAREST_KEY_DISTANCE = 0.9;
    const GLOBAL_REPEAT_GUARD_MS = 90;
    const ROTATION_STEP_DEG = 6;

    updateOutput();
    refreshPhaseBadge();
    updateRotationText();
    updateModeText();
    syncMirror();

    startCameraBtn.addEventListener("click", () => startCamera(currentDeviceId));
    cameraSelect.addEventListener("change", async () => {
      currentDeviceId = cameraSelect.value;
      if (running) await startCamera(currentDeviceId);
    });

    placementModeEl.addEventListener("change", () => {
      placementMode = placementModeEl.value;
      updateModeText();
      drawBtn.textContent = placementMode === "sculpt" ? "Start sculpt" : "Start placement";
    });

    anchorModeEl.addEventListener("change", () => {
      anchorMode = anchorModeEl.value;
      updateModeText();
      setStatus(anchorMode === "surface" ? "3D surface mode enabled" : "Air mode enabled", "ok");
    });

    selectionModeEl.addEventListener("change", () => { selectionMode = selectionModeEl.value; });
    mirrorModeEl.addEventListener("change", () => { viewMode = mirrorModeEl.value; syncMirror(); });
    scaleModeEl.addEventListener("change", () => { keyboardScale = Number(scaleModeEl.value); });
    dwellModeEl.addEventListener("change", () => { dwellMs = Number(dwellModeEl.value); });
    neonModeEl.addEventListener("change", () => { neonStrength = Number(neonModeEl.value); });
    soundToggleEl.addEventListener("change", () => { soundEnabled = soundToggleEl.checked; ensureAudio(); });
    vibrationToggleEl.addEventListener("change", () => { vibrationEnabled = vibrationToggleEl.checked; });
    accuracyModeEl.addEventListener("change", () => {
      const mode = accuracyModeEl.value;
      if (mode === "fast") {
        smoothingAlpha = 0.5;
        cooldownMs = 180;
      } else if (mode === "stable") {
        smoothingAlpha = 0.18;
        cooldownMs = 320;
      } else {
        smoothingAlpha = 0.3;
        cooldownMs = 250;
      }
    });

    drawBtn.addEventListener("click", () => {
      if (!running) {
        setStatus("Start the camera first", "warn");
        return;
      }
      phase = placementMode === "sculpt" ? "sculpting" : "drawing";
      drawing = placementMode === "rectangle";
      sculptActive = placementMode === "sculpt";
      drawnPoints = [];
      previewAnchor = null;
      pinnedAnchor = null;
      fingerStates.clear();
      shapeText.textContent = placementMode === "sculpt" ? "Pinch to place and size" : "Tracing rectangle";
      setStatus(placementMode === "sculpt" ? "Use one hand pinch to place Halo" : "Trace a rectangle with your index finger", "ok");
      refreshPhaseBadge();
    });

    finishBtn.addEventListener("click", () => {
      if (placementMode === "rectangle") {
        if (drawnPoints.length < 20) {
          setStatus("Draw a larger rectangle first", "warn");
          return;
        }
        const anchor = anchorFromPath(drawnPoints);
        if (!anchor) {
          setStatus("Could not detect a usable shape", "bad");
          return;
        }
        previewAnchor = anchor;
      } else {
        if (!sculptAnchor) {
          setStatus("Pinch and place the keyboard first", "warn");
          return;
        }
        previewAnchor = cloneAnchor(sculptAnchor);
      }
      drawing = false;
      sculptActive = false;
      phase = "preview";
      shapeText.textContent = `${Math.round(previewAnchor.baseWidth)}×${Math.round(previewAnchor.baseHeight)} preview`;
      setStatus("Placement captured. Pin it when it looks right.", "ok");
      refreshPhaseBadge();
    });

    pinBtn.addEventListener("click", () => {
      const src = previewAnchor || sculptAnchor;
      if (!src) {
        setStatus("Create a keyboard placement first", "warn");
        return;
      }
      pinnedAnchor = cloneAnchor(src);
      phase = "typing";
      drawing = false;
      sculptActive = false;
      fingerStates.clear();
      setStatus("Halo pinned. Type with press, pinch, dwell, or hybrid.", "ok");
      refreshPhaseBadge();
    });

    rotateLeftBtn.addEventListener("click", () => {
      rotationOffsetDeg -= ROTATION_STEP_DEG;
      updateRotationText();
      setStatus("Keyboard rotated left", "ok");
    });

    rotateRightBtn.addEventListener("click", () => {
      rotationOffsetDeg += ROTATION_STEP_DEG;
      updateRotationText();
      setStatus("Keyboard rotated right", "ok");
    });

    resetBtn.addEventListener("click", () => {
      phase = "calibration";
      drawing = false;
      sculptActive = false;
      drawnPoints = [];
      sculptAnchor = null;
      previewAnchor = null;
      pinnedAnchor = null;
      rotationOffsetDeg = 0;
      typedText = "";
      lastTrigger = "—";
      smoothedPoints.clear();
      fingerStates.clear();
      shapeText.textContent = "—";
      hoveredText.textContent = "—";
      fingertipsText.textContent = "0";
      triggerText.textContent = "—";
      pinchText.textContent = "—";
      pressText.textContent = "—";
      updateOutput();
      updateRotationText();
      refreshPhaseBadge();
      setStatus("Halo reset", "ok");
    });

    window.addEventListener("resize", resizeCanvas);

    async function ensureAudio() {
      if (!soundEnabled) return;
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch (_) {}
      }
    }

    function playFeedback() {
      if (soundEnabled) {
        ensureAudio();
        if (audioCtx) {
          const now = audioCtx.currentTime;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(760, now);
          osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.02, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.065);
        }
      }
      if (vibrationEnabled && navigator.vibrate) {
        navigator.vibrate(8);
      }
    }

    async function createHandLandmarker() {
      if (handLandmarker) return handLandmarker;
      setStatus("Loading hand tracking model…", "warn");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      });
      return handLandmarker;
    }

    async function startCamera(deviceId = "") {
      try {
        await createHandLandmarker();
        await ensureAudio();
        stopCamera();
        const constraints = deviceId
          ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
          : { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" }, audio: false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        running = true;
        resizeCanvas();
        await refreshCameraList();
        currentFacingHint = inferFacingHint(stream, currentDeviceId);
        syncMirror();
        setStatus(`Camera running (${currentFacingHint})`, "ok");
        trackingText.textContent = "Show one or two hands";
        trackingText.className = "warn";
        requestAnimationFrame(loop);
      } catch (error) {
        console.error(error);
        setStatus("Camera failed. Use HTTPS and grant permission.", "bad");
        trackingText.textContent = "Camera unavailable";
        trackingText.className = "bad";
      }
    }

    function stopCamera() {
      running = false;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    async function refreshCameraList() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === "videoinput");
        cameraSelect.innerHTML = "";
        const fallback = document.createElement("option");
        fallback.value = "";
        fallback.textContent = "Default camera";
        cameraSelect.appendChild(fallback);
        videos.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.textContent = device.label || `Camera ${index + 1}`;
          if (device.deviceId === currentDeviceId) option.selected = true;
          cameraSelect.appendChild(option);
        });
      } catch (error) {
        console.error(error);
      }
    }

    function inferFacingHint(activeStream, deviceId) {
      try {
        const track = activeStream?.getVideoTracks?.()[0];
        const settings = track?.getSettings?.() || {};
        const facingMode = String(settings.facingMode || "").toLowerCase();
        if (facingMode.includes("front") || facingMode.includes("user")) return "front";
        if (facingMode.includes("back") || facingMode.includes("rear") || facingMode.includes("environment")) return "rear";

        const option = Array.from(cameraSelect.options).find((item) => item.value === deviceId);
        const label = String(option?.textContent || "").toLowerCase();
        if (/(front|user|face|facetime|selfie)/.test(label)) return "front";
        if (/(back|rear|environment|world)/.test(label)) return "rear";
        if (/(external|usb)/.test(label)) return "external";
      } catch (error) {
        console.error(error);
      }
      return "unknown";
    }

    function loop(now) {
      if (!running) return;
      resizeCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (video.currentTime !== lastVideoTime && handLandmarker) {
        lastVideoTime = video.currentTime;
        latestResult = handLandmarker.detectForVideo(video, now);
      }
      renderFrame(now, latestResult);
      requestAnimationFrame(loop);
    }

    function renderFrame(now, result) {
      const hands = result?.landmarks || [];
      if (!hands.length) {
        trackingText.textContent = "No hands detected";
        trackingText.className = "warn";
        fingertipsText.textContent = "0";
        hoveredText.textContent = "—";
        pressText.textContent = "—";
        drawGhostBoards();
        drawOverlayHints();
        return;
      }

      trackingText.textContent = `${hands.length} hand${hands.length > 1 ? "s" : ""} tracked`;
      trackingText.className = "ok";

      const cursors = [];
      let minPinch = Infinity;
      let maxPressDelta = -Infinity;
      const hoveredLabels = new Set();

      hands.forEach((hand, handIndex) => {
        const thumbPoint = smoothPoint(`hand-${handIndex}-4`, landmarkToPoint(hand[4]));
        drawHand(hand, thumbPoint);
        TIP_INDICES.forEach((tipIndex) => {
          const id = `hand-${handIndex}-${tipIndex}`;
          const point = smoothPoint(id, landmarkToPoint(hand[tipIndex]));
          const landmark = hand[tipIndex];
          const pinchDistance = tipIndex === 4 ? null : distance(point, thumbPoint) / Math.max(canvas.width, canvas.height);
          if (pinchDistance !== null && pinchDistance < minPinch) minPinch = pinchDistance;
          const cursor = {
            id,
            handIndex,
            tipIndex,
            fingerName: FINGER_NAMES[tipIndex],
            point,
            z: landmark.z,
            pinchDistance,
            isThumb: tipIndex === 4
          };
          cursors.push(cursor);
        });
      });

      fingertipsText.textContent = String(cursors.length);
      pinchText.textContent = Number.isFinite(minPinch) ? minPinch.toFixed(3) : "—";

      updateSculptPlacement(hands);
      drawGhostBoards();

      const activeAnchor = getActiveDisplayAnchor();
      if (activeAnchor) {
        cursors.forEach((cursor) => {
          const state = getFingerState(cursor.id);
          const hit = keyAtPoint(cursor.point, activeAnchor, state.lastHoverKey);
          if (hit) {
            cursor.hoveredKey = hit.key;
            hoveredLabels.add(hit.key.label);
          }
        });

        if (pinnedAnchor) {
          drawKeyboard(activeAnchor, hoveredLabels, cursors, now);
          maxPressDelta = handleTyping(cursors, now, activeAnchor);
        }
      }

      hoveredText.textContent = hoveredLabels.size ? Array.from(hoveredLabels).map(formatKeyLabel).join(", ") : "—";
      pressText.textContent = Number.isFinite(maxPressDelta) && maxPressDelta > -Infinity ? maxPressDelta.toFixed(3) : "—";

      cursors.forEach(drawCursor);

      if (drawing && placementMode === "rectangle") {
        const indexCursor = cursors.find((cursor) => cursor.tipIndex === 8);
        if (indexCursor) {
          maybeAddDrawPoint(indexCursor.point);
          drawPath();
        }
      }

      if (!getAnyAnchor()) drawOverlayHints();
    }

    function updateSculptPlacement(hands) {
      if (!sculptActive || placementMode !== "sculpt" || !hands.length) return;
      const hand = hands[0];
      const wrist = landmarkToPoint(hand[0]);
      const indexTip = landmarkToPoint(hand[8]);
      const thumbTip = landmarkToPoint(hand[4]);
      const middleMcp = landmarkToPoint(hand[9]);
      const pinkyMcp = landmarkToPoint(hand[17]);
      const indexMcp = landmarkToPoint(hand[5]);
      const palmCenter = averagePoint([wrist, middleMcp, pinkyMcp, indexMcp]);
      const pinchDistance = distance(indexTip, thumbTip) / Math.max(canvas.width, canvas.height);
      const isGrab = pinchDistance < 0.11;

      if (!isGrab && sculptAnchor) {
        shapeText.textContent = "Sculpt preview ready";
        return;
      }

      const xAxisRaw = normalize({ x: indexMcp.x - pinkyMcp.x, y: indexMcp.y - pinkyMcp.y });
      const xAxis = xAxisRaw.x < 0 ? { x: -xAxisRaw.x, y: -xAxisRaw.y } : xAxisRaw;
      let yAxis = anchorMode === "surface"
        ? normalize({ x: middleMcp.x - wrist.x, y: middleMcp.y - wrist.y })
        : perpendicularDown(xAxis);
      if (!Number.isFinite(yAxis.x) || !Number.isFinite(yAxis.y) || Math.abs(dot(xAxis, yAxis)) > 0.8) {
        yAxis = perpendicularDown(xAxis);
      }
      if (anchorMode === "surface" && yAxis.y < 0) yAxis = { x: -yAxis.x, y: -yAxis.y };
      if (anchorMode === "air") yAxis = perpendicularDown(xAxis);

      const handSpan = distance(indexMcp, pinkyMcp);
      sculptScale = clamp(mapRange(pinchDistance, 0.025, 0.15, 0.75, 1.8), 0.6, 2.1);
      const width = handSpan * 3.0 * sculptScale;
      const height = width * 0.45;
      const center = anchorMode === "surface"
        ? { x: palmCenter.x, y: palmCenter.y + height * 0.08 }
        : { x: palmCenter.x, y: palmCenter.y - height * 0.15 };

      sculptAnchor = {
        center,
        xAxis,
        yAxis,
        baseWidth: width,
        baseHeight: height,
        anchorMode
      };
      shapeText.textContent = `Sculpt ${Math.round(width)}×${Math.round(height)}`;
    }

    function handleTyping(cursors, now, anchor) {
      let committed = false;
      let maxPressDelta = -Infinity;

      cursors.forEach((cursor) => {
        const state = getFingerState(cursor.id);
        const keyLabel = cursor.hoveredKey?.label || null;
        updateDepthState(state, cursor.z);

        if (!keyLabel) {
          resetFingerHover(state);
          return;
        }

        if (state.lastHoverKey !== keyLabel) {
          state.hoverSince = now;
          state.lastHoverKey = keyLabel;
          state.depthBaseline = cursor.z;
          state.pressActive = false;
          state.pressPeak = 0;
        }

        const pressDelta = Math.abs(cursor.z - state.depthBaseline);
        if (pressDelta > maxPressDelta) maxPressDelta = pressDelta;

        const canPress = !cursor.isThumb && (selectionMode === "press" || selectionMode === "hybrid");
        const canPinch = !cursor.isThumb && (selectionMode === "pinch" || selectionMode === "hybrid");
        const canDwell = selectionMode === "dwell" || selectionMode === "hybrid";

        if (!committed && canPress && detectPressGesture(state, cursor.z, now)) {
          committed = tryCommitKey(keyLabel, now, cursor.id, `press ${cursor.fingerName}`);
        }

        if (!committed && canPinch && cursor.pinchDistance !== null && cursor.pinchDistance < PINCH_THRESHOLD) {
          committed = tryCommitKey(keyLabel, now, cursor.id, `pinch ${cursor.fingerName}`);
        }

        if (!committed && canDwell && state.hoverSince && now - state.hoverSince >= dwellMs) {
          committed = tryCommitKey(keyLabel, now, cursor.id, `dwell ${cursor.fingerName}`);
        }
      });

      if (!committed) triggerText.textContent = lastTrigger;
      return maxPressDelta;
    }

    function resetFingerHover(state) {
      state.hoverSince = 0;
      state.lastHoverKey = null;
      state.pressActive = false;
      state.pressPeak = 0;
    }

    function updateDepthState(state, z) {
      if (state.lastZ === null) {
        state.lastZ = z;
        state.depthVelocity = 0;
        state.depthBaseline = z;
        return;
      }
      state.depthVelocity = z - state.lastZ;
      state.lastZ = z;
      const baselineAlpha = state.pressActive ? 0.015 : 0.06;
      state.depthBaseline = state.depthBaseline + (z - state.depthBaseline) * baselineAlpha;
    }

    function detectPressGesture(state, z, now) {
      const depthDelta = Math.abs(z - state.depthBaseline);
      const velocity = Math.abs(state.depthVelocity);

      if (!state.pressActive) {
        if (!state.hoverSince || now - state.hoverSince < MIN_HOVER_BEFORE_PRESS_MS) return false;
        if (depthDelta > PRESS_DEPTH_THRESHOLD && velocity > PRESS_VELOCITY_THRESHOLD) {
          state.pressActive = true;
          state.pressPeak = depthDelta;
        }
        return false;
      }

      state.pressPeak = Math.max(state.pressPeak || 0, depthDelta);
      if (depthDelta < PRESS_RECOVERY_THRESHOLD) {
        const peak = state.pressPeak || 0;
        state.pressActive = false;
        state.pressPeak = 0;
        state.depthBaseline = z;
        return peak > PRESS_DEPTH_THRESHOLD * 1.15;
      }
      return false;
    }

    function tryCommitKey(label, now, cursorId, source) {
      const state = getFingerState(cursorId);
      if (now - state.lastCommitTime < cooldownMs) return false;
      if (now - lastGlobalCommitTime < GLOBAL_REPEAT_GUARD_MS && label === lastGlobalKey) return false;
      applyKey(label);
      state.lastCommitTime = now;
      state.hoverSince = now;
      state.lastHoverKey = label;
      state.depthBaseline = state.lastZ ?? state.depthBaseline;
      state.pressActive = false;
      state.pressPeak = 0;
      lastGlobalCommitTime = now;
      lastGlobalKey = label;
      lastTrigger = `${source} → ${formatKeyLabel(label)}`;
      triggerText.textContent = lastTrigger;
      setStatus(`Typed ${formatKeyLabel(label)}`, "ok");
      playFeedback();
      return true;
    }

    function applyKey(label) {
      if (label === "SPACE") typedText += " ";
      else if (label === "BACKSPACE") typedText = typedText.slice(0, -1);
      else if (label === "ENTER") typedText += "\n";
      else typedText += label;
      updateOutput();
    }

    function maybeAddDrawPoint(point) {
      const last = drawnPoints[drawnPoints.length - 1];
      if (!last || distance(last, point) >= DRAW_POINT_STEP) drawnPoints.push({ x: point.x, y: point.y });
    }

    function drawPath() {
      if (drawnPoints.length < 2) return;
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(34, 211, 238, ${0.8 * neonStrength})`;
      ctx.shadowBlur = 18 * neonStrength;
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.95 * neonStrength})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(drawnPoints[0].x, drawnPoints[0].y);
      for (let i = 1; i < drawnPoints.length; i += 1) ctx.lineTo(drawnPoints[i].x, drawnPoints[i].y);
      ctx.stroke();
      ctx.restore();
    }

    function drawGhostBoards() {
      const anchor = getActiveDisplayAnchor();
      if (anchor) {
        drawNeonBoard(anchor, !pinnedAnchor);
      }
    }

    function drawNeonBoard(anchor, preview = false) {
      const corners = [project(anchor, 0, 0), project(anchor, 1, 0), project(anchor, 1, 1), project(anchor, 0, 1)];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = preview ? "rgba(8, 26, 48, 0.12)" : "rgba(8, 26, 48, 0.18)";
      ctx.shadowColor = `rgba(34, 211, 238, ${0.85 * neonStrength})`;
      ctx.shadowBlur = 24 * neonStrength;
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.95 * neonStrength})`;
      ctx.lineWidth = preview ? 3 : 3.6;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      corners.forEach((corner) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(249, 168, 212, ${0.95 * neonStrength})`;
        ctx.shadowColor = `rgba(249, 168, 212, ${0.9 * neonStrength})`;
        ctx.shadowBlur = 18 * neonStrength;
        ctx.fill();
        ctx.restore();
      });
    }

    function drawKeyboard(anchor, hoveredLabels, cursors, now) {
      const pulse = 0.56 + 0.44 * Math.sin(now / 260);
      KEY_LAYOUT.forEach((key) => {
        const corners = [project(anchor, key.x, key.y), project(anchor, key.x + key.w, key.y), project(anchor, key.x + key.w, key.y + key.h), project(anchor, key.x, key.y + key.h)];
        const isHover = hoveredLabels.has(key.label);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = isHover ? `rgba(96, 165, 250, ${0.18 + pulse * 0.16})` : "rgba(255, 255, 255, 0.05)";
        ctx.strokeStyle = isHover ? `rgba(96, 165, 250, ${0.96 * neonStrength})` : `rgba(34, 211, 238, ${0.24 * neonStrength})`;
        ctx.shadowColor = isHover ? `rgba(96, 165, 250, ${0.9 * neonStrength})` : `rgba(34, 211, 238, ${0.38 * neonStrength})`;
        ctx.shadowBlur = isHover ? 18 * neonStrength : 10 * neonStrength;
        ctx.lineWidth = isHover ? 2.5 : 1.2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        const center = project(anchor, key.x + key.w / 2, key.y + key.h / 2);
        const fontSize = Math.max(11, Math.min(anchor.height * key.h * 0.42, 26));
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isHover ? "rgba(255,255,255,1)" : "rgba(239,246,255,0.92)";
        ctx.fillText(formatKeyLabel(key.label), center.x, center.y + 1);
        ctx.restore();
      });

      cursors.forEach((cursor) => {
        if (!cursor.hoveredKey) return;
        const state = getFingerState(cursor.id);
        if (!state.hoverSince) return;
        const progress = Math.max(0, Math.min(1, (performance.now() - state.hoverSince) / dwellMs));
        const key = cursor.hoveredKey;
        const point = project(anchor, key.x + key.w / 2, key.y - 0.055);
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = `rgba(134,239,172,${0.9 * neonStrength})`;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = `rgba(134,239,172,${0.95 * neonStrength})`;
        ctx.shadowBlur = 12 * neonStrength;
        ctx.stroke();
        ctx.restore();
      });
    }

    function drawHand(hand, thumbPoint) {
      const segments = [
        [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]
      ];
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      segments.forEach(([a,b]) => {
        const p1 = landmarkToPoint(hand[a]);
        const p2 = landmarkToPoint(hand[b]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
      hand.forEach((landmark, index) => {
        const p = landmarkToPoint(landmark);
        const r = index === 4 ? 6 : TIP_INDICES.includes(index) ? 5 : 3.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = index === 4 ? "rgba(134,239,172,0.95)" : TIP_INDICES.includes(index) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.72)";
        ctx.fill();
      });
      if (thumbPoint) {
        ctx.beginPath();
        ctx.arc(thumbPoint.x, thumbPoint.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(134,239,172,0.98)";
        ctx.fill();
      }
      ctx.restore();
    }

    function drawCursor(cursor) {
      ctx.save();
      const stroke = cursor.isThumb ? "rgba(134,239,172,0.95)" : "rgba(34,211,238,0.92)";
      const fill = cursor.isThumb ? "rgba(134,239,172,0.12)" : "rgba(34,211,238,0.12)";
      ctx.beginPath();
      ctx.arc(cursor.point.x, cursor.point.y, cursor.isThumb ? 10 : 13, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 12 * neonStrength;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawOverlayHints() {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 18px Inter, system-ui, sans-serif";
      ctx.fillStyle = "rgba(239,246,255,0.74)";
      let text = placementMode === "sculpt" ? "Start camera, then pinch with one hand to place Halo" : "Start camera and trace a rectangle in the air";
      if (phase === "preview") text = "Pin Halo when it looks right";
      if (phase === "typing") text = "Use a short press gesture to type";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }

    function getActiveDisplayAnchor() {
      const anchor = getAnyAnchor();
      if (!anchor) return null;
      const radians = rotationOffsetDeg * Math.PI / 180;
      let xAxis = rotateVector(anchor.xAxis, radians);
      if (xAxis.x < 0) xAxis = { x: -xAxis.x, y: -xAxis.y };
      let yAxis = anchorMode === "surface" || anchor.anchorMode === "surface"
        ? rotateVector(anchor.yAxis, radians)
        : perpendicularDown(xAxis);
      if (anchorMode === "air") yAxis = perpendicularDown(xAxis);
      return {
        center: { ...anchor.center },
        xAxis: normalize(xAxis),
        yAxis: normalize(yAxis),
        width: anchor.baseWidth * keyboardScale,
        height: anchor.baseHeight * keyboardScale,
        anchorMode: anchor.anchorMode || anchorMode
      };
    }

    function getAnyAnchor() {
      return pinnedAnchor || previewAnchor || sculptAnchor;
    }

    function keyAtPoint(point, anchor, lockedKeyLabel = null) {
      const rel = { x: point.x - anchor.center.x, y: point.y - anchor.center.y };
      const u = dot(rel, anchor.xAxis) / anchor.width + 0.5;
      const v = dot(rel, anchor.yAxis) / anchor.height + 0.5;

      if (lockedKeyLabel) {
        const lockedKey = KEY_LAYOUT.find((key) => key.label === lockedKeyLabel);
        if (lockedKey && pointInExpandedKey(u, v, lockedKey, KEY_STICKY_PADDING)) {
          return { key: lockedKey, u, v };
        }
      }

      for (const key of KEY_LAYOUT) {
        if (pointInExpandedKey(u, v, key, KEY_SNAP_PADDING)) return { key, u, v };
      }

      let nearest = null;
      let nearestDistance = Infinity;
      for (const key of KEY_LAYOUT) {
        const centerU = key.x + key.w / 2;
        const centerV = key.y + key.h / 2;
        const du = (u - centerU) / Math.max(key.w, 0.001);
        const dv = (v - centerV) / Math.max(key.h, 0.001);
        const dist = Math.hypot(du, dv);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearest = { key, u, v };
        }
      }

      return nearestDistance <= NEAREST_KEY_DISTANCE ? nearest : null;
    }

    function pointInExpandedKey(u, v, key, padding) {
      return u >= key.x - padding && u <= key.x + key.w + padding && v >= key.y - padding && v <= key.y + key.h + padding;
    }

    function anchorFromPath(points) {
      if (points.length < 12) return null;
      const center = averagePoint(points);
      let sxx = 0, sxy = 0, syy = 0;
      for (const p of points) {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
      }
      const trace = sxx + syy;
      const diff = sxx - syy;
      const root = Math.sqrt(diff * diff + 4 * sxy * sxy);
      const lambda = (trace + root) / 2;
      let xAxis = normalize({ x: sxy, y: lambda - sxx });
      if (!Number.isFinite(xAxis.x) || !Number.isFinite(xAxis.y) || (Math.abs(xAxis.x) < 0.001 && Math.abs(xAxis.y) < 0.001)) {
        xAxis = { x: 1, y: 0 };
      }
      if (xAxis.x < 0) xAxis = { x: -xAxis.x, y: -xAxis.y };
      let yAxis = anchorMode === "surface" ? perpendicularDown(xAxis) : perpendicularDown(xAxis);
      let bounds = projectBounds(points, center, xAxis, yAxis);
      let width = bounds.maxX - bounds.minX;
      let height = bounds.maxY - bounds.minY;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 40) return null;
      if (height > width) {
        const newXAxis = yAxis.y >= 0 ? yAxis : { x: -yAxis.x, y: -yAxis.y };
        xAxis = newXAxis.x < 0 ? { x: -newXAxis.x, y: -newXAxis.y } : newXAxis;
        yAxis = perpendicularDown(xAxis);
        bounds = projectBounds(points, center, xAxis, yAxis);
        width = bounds.maxX - bounds.minX;
        height = bounds.maxY - bounds.minY;
      }
      width *= 1.08;
      height *= 1.12;
      const localCenter = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      return {
        center: { x: center.x + localCenter.x * xAxis.x + localCenter.y * yAxis.x, y: center.y + localCenter.x * xAxis.y + localCenter.y * yAxis.y },
        xAxis,
        yAxis,
        baseWidth: width,
        baseHeight: height,
        anchorMode
      };
    }

    function projectBounds(points, center, xAxis, yAxis) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) {
        const rel = { x: p.x - center.x, y: p.y - center.y };
        const u = dot(rel, xAxis);
        const v = dot(rel, yAxis);
        minX = Math.min(minX, u); maxX = Math.max(maxX, u); minY = Math.min(minY, v); maxY = Math.max(maxY, v);
      }
      return { minX, maxX, minY, maxY };
    }

    function buildLayout(rows) {
      const result = [];
      const vGap = 0.03;
      const hGap = 0.018;
      const rowHeight = (1 - vGap * (rows.length - 1)) / rows.length;
      let y = 0;
      rows.forEach((row) => {
        const weights = row.map((label) => label === "SPACE" ? 4.2 : label === "BACKSPACE" ? 2.1 : label === "ENTER" ? 2.0 : 1);
        const total = weights.reduce((a, b) => a + b, 0);
        const unit = (1 - hGap * (row.length - 1)) / total;
        let x = 0;
        row.forEach((label, i) => {
          const w = weights[i] * unit;
          result.push({ label, x, y, w, h: rowHeight });
          x += w + hGap;
        });
        y += rowHeight + vGap;
      });
      return result;
    }

    function project(anchor, u, v) {
      return {
        x: anchor.center.x + (u - 0.5) * anchor.width * anchor.xAxis.x + (v - 0.5) * anchor.height * anchor.yAxis.x,
        y: anchor.center.y + (u - 0.5) * anchor.width * anchor.xAxis.y + (v - 0.5) * anchor.height * anchor.yAxis.y
      };
    }

    function landmarkToPoint(landmark) {
      const rect = canvas.getBoundingClientRect();
      let x = landmark.x * rect.width;
      if (getDisplayMirror()) x = rect.width - x;
      return { x, y: landmark.y * rect.height, z: landmark.z };
    }

    function smoothPoint(id, point) {
      const existing = smoothedPoints.get(id);
      if (!existing) {
        const clone = { ...point };
        smoothedPoints.set(id, clone);
        return clone;
      }
      existing.x += (point.x - existing.x) * smoothingAlpha;
      existing.y += (point.y - existing.y) * smoothingAlpha;
      return existing;
    }

    function getFingerState(id) {
      if (!fingerStates.has(id)) {
        fingerStates.set(id, { hoverSince: 0, lastCommitTime: 0, lastHoverKey: null, lastZ: null, depthBaseline: 0, depthVelocity: 0, pressActive: false, pressPeak: 0 });
      }
      return fingerStates.get(id);
    }

    function averagePoint(points) {
      const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return { x: sum.x / points.length, y: sum.y / points.length };
    }

    function normalize(v) {
      const len = Math.hypot(v.x, v.y);
      if (!len) return { x: 1, y: 0 };
      return { x: v.x / len, y: v.y / len };
    }

    function perpendicularDown(xAxis) {
      const cw = { x: -xAxis.y, y: xAxis.x };
      const ccw = { x: xAxis.y, y: -xAxis.x };
      return normalize(cw.y >= ccw.y ? cw : ccw);
    }

    function rotateVector(v, radians) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
    }

    function cloneAnchor(anchor) {
      return JSON.parse(JSON.stringify(anchor));
    }

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function mapRange(value, inMin, inMax, outMin, outMax) {
      const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
      return outMin + (outMax - outMin) * t;
    }
    function dot(a, b) { return a.x * b.x + a.y * b.y; }
    function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function formatKeyLabel(label) { return SPECIAL_LABELS[label] || label; }

    function updateOutput() {
      outputEl.textContent = typedText || "Place Halo and type with a press gesture.";
    }
    function getDisplayMirror() {
      if (viewMode === "selfie") return true;
      if (viewMode === "natural") return currentFacingHint === "front";
      return false;
    }
    function syncMirror() {
      video.classList.toggle("mirrored", getDisplayMirror());
      canvas.classList.remove("mirrored");
    }
    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function setStatus(text, tone) {
      statusBadge.textContent = text;
      statusBadge.style.color = tone === "ok" ? "#86efac" : tone === "bad" ? "#fda4af" : "#fde68a";
    }
    function refreshPhaseBadge() { phaseBadge.textContent = `Phase: ${phase}`; }
    function updateRotationText() {
      const value = ((rotationOffsetDeg % 360) + 360) % 360;
      const signed = value > 180 ? value - 360 : value;
      rotationText.textContent = `${signed}°`;
    }
    function updateModeText() {
      modeText.textContent = `${anchorMode} / ${placementMode}`;
    }
  