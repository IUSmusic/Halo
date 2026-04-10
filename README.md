# Halo

https://iusmusic.github.io/Halo/

Halo is a static browser app for a camera-based virtual keyboard.

## What changed in this update

### Tracking and gesture upgrades
- Upgraded MediaPipe Tasks Vision from `0.10.0` to the latest CDN package used here: `0.10.34`.
- Added per-finger Kalman + EMA smoothing presets with auto-selection for low-end devices and Bed mode.
- Press detection now combines:
  - depth delta
  - depth velocity
  - depth acceleration
  - minimum hover time
  - hand-confidence filtering
- Added least-squares plane fitting from multiple hand landmarks to stabilize surface placement.
- Added a calibration flow after camera start to capture span, tilt, and press depth.

### Architecture cleanup
- Split the old monolithic code into modules:
  - `handTracker.js`
  - `keyboardRenderer.js`
  - `gestureEngine.js`
  - `voiceInput.js`
  - `uiControls.js`
- Kept `script.js` as the entry point.
- Removed duplicate `check*.js` files.
- Added stronger camera error handling and touch fallback.
- Added throttled inference inside the animation loop.
- Keyboard position, rotation, scale, and UI state now persist through `localStorage`.

### Keyboard and UX upgrades
- Expanded the layout with numbers, symbols, arrows, Shift, and symbol toggle keys.
- Added predictive text suggestions loaded client-side.
- Added a live 2D mirror overlay that matches the 3D keyboard and shows fingertip feedback.
- Added hover glow, finger trails, and improved contrast for low-light use.
- Added a first-run guided tour.
- Added PWA support with a manifest and service worker.

### Voice and hybrid input
- Added continuous speech recognition when the browser supports it.
- Voice commands include phrases like `type hello world`, `press enter`, `backspace`, `caps on`, and `voice off`.
- Added a visible recognized-text strip and voice undo/commit controls.

### Performance and compatibility
- Added basic device profiling to choose a faster path on low-end phones.
- Added touch fallback for mobile when camera access is unavailable.
- Added WebXR availability detection in the UI.

### Bed mode
- Added **Bed Mode (Single Hand)** with:
  - single-hand tracking
  - stronger smoothing
  - rear-camera preference
  - mirror mode default
  - relaxed-hand calibration
  - saved state between sessions

# Third-Party Notices for `external/`

This project vendors third-party runtime assets under `external/`.
Do not replace the original upstream license with a new custom license.
Instead, keep the original filenames, preserve upstream notices, and include this notice file alongside the project license.

## MediaPipe Tasks Vision

The following files in `external/` are vendored from Google's MediaPipe Tasks Vision distribution and related Hand Landmarker assets:

- `vision_bundle.mjs`
- `vision_wasm_internal.js`
- `vision_wasm_internal.wasm`
- `vision_wasm_module_internal.js`
- `vision_wasm_module_internal.wasm`
- `vision_wasm_nosimd_internal.js`
- `vision_wasm_nosimd_internal.wasm`
- `hand_landmarker.task`

### Upstream project
- Package: `@mediapipe/tasks-vision`
- Project: MediaPipe / Google AI Edge

### Upstream license
- Apache License 2.0 for the MediaPipe code/package distribution

### Model file note
- `hand_landmarker.task` is a Google-distributed model bundle used by the MediaPipe Hand Landmarker docs. If Google provides model-specific terms with the exact file you downloaded, keep those terms alongside this notice.

### Suggested attribution
These files are unmodified third-party assets bundled locally for offline use.
Copyright belongs to their respective upstream authors and copyright holders.

Source references:
- MediaPipe repository license: Apache License 2.0
- `@mediapipe/tasks-vision` npm package license: Apache-2.0
- Google AI Edge Hand Landmarker Web guide documents local package/model usage

### Maintainer note
If you replace any of these files with newer upstream versions, keep this notice updated and preserve any upstream copyright, NOTICE, and license information distributed with them.
