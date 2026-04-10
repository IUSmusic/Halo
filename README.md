# Halo

Halo is a static browser app for a camera-based virtual keyboard that can be hosted on GitHub Pages.

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

## Notes

This is still a browser-first implementation. Pointer mode can control the web app UI and page-level interactions, but true system-wide phone control would require native OS integration outside a normal browser/PWA.

## Run locally

Serve over HTTPS or use GitHub Pages. Camera access and installability will not work correctly from an insecure local file URL in most browsers.


## Offline MediaPipe setup

This build is configured to load MediaPipe entirely from `./external/` instead of any CDN.
Place these files in the `external/` folder next to `index.html`:

- `vision_bundle.mjs`
- `hand_landmarker.task`
- `vision_wasm_internal.js`
- `vision_wasm_internal.wasm`
- `vision_wasm_module_internal.js`
- `vision_wasm_module_internal.wasm`
- `vision_wasm_nosimd_internal.js`
- `vision_wasm_nosimd_internal.wasm`

If any of them are missing, Halo will show a local asset error instead of trying the network.
