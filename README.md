# Halo

<p align="center">
  <a href="https://iusmusic.github.io/Halo/"><img alt="Live Demo" src="https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-black"></a>
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Web%20App-black">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-black">
  <img alt="Tracking" src="https://img.shields.io/badge/Tracking-MediaPipe%20Tasks%20Vision-black">
  <img alt="Offline Assets" src="https://img.shields.io/badge/Assets-Local%20%2F%20Offline-black">
  <img alt="Input" src="https://img.shields.io/badge/Input-Hand%20%2B%20Voice-black">
  <img alt="Mobile" src="https://img.shields.io/badge/Mobile-Optimized-black">
</p>

Halo is a browser-based virtual keyboard that uses camera hand tracking, gesture recognition, predictive suggestions, and voice input to enable touchless typing on phones, tablets, and desktops.

The project is designed as a static web app with no backend requirement. It supports installable PWA behavior, local/offline MediaPipe assets, mobile-friendly interaction modes, and calibration flows for more stable tracking.

## Live Demo

**Website:** https://iusmusic.github.io/Halo/

## What’s New

- Added Pointer Mode with air-mouse navigation
- Added selectable control modes: index finger, any finger, or whole hand
- Added air gestures for click, drag, scroll, and pinch-zoom
- Improved offline support with local MediaPipe assets
- Added Bed Mode and mirror overlay controls

## Highlights

- Camera-based hand tracking powered by MediaPipe Tasks Vision
- Air mode and surface-aware placement with plane fitting
- Bed Mode for single-hand, relaxed mobile use
- 2D mirror overlay for easier visual confirmation while typing
- Expanded keyboard layout with numbers, symbols, arrows, Shift, and Caps behavior
- Predictive suggestions loaded client-side
- Continuous voice input with typing and control commands
- Touch fallback when camera access is unavailable
- Installable PWA with offline caching support
- Persistent calibration, placement, scale, rotation, and UI preferences

## Key Features

### Accurate hand and gesture input
Halo uses confidence-aware hand tracking with per-finger smoothing and enhanced press detection based on depth change, motion, acceleration, and hover timing. Calibration helps tailor thresholds to the user’s hand posture and device position.

### Mirror overlay for fast feedback
A synchronized 2D mirror overlay reflects the projected keyboard state in real time, showing hovered keys and fingertip position without requiring constant interpretation of the 3D layout.

### Bed Mode
Bed Mode is optimized for one-handed mobile use in reclined or side-lying positions. It enables single-hand tracking, stronger smoothing, rear-camera preference, and relaxed-angle calibration for more stable input in low-movement scenarios.

### Hybrid voice input
Halo supports browser speech recognition for dictation and command-style input, including phrases such as typing text, pressing keys, toggling caps, and turning voice mode off.

### Progressive Web App
The application includes a web manifest and service worker, allowing installation to the home screen on supported devices and improved repeat-load performance through cached assets.

## Feature Overview

| Area | Included |
|---|---|
| Hand tracking | MediaPipe Tasks Vision with local runtime/model assets |
| Gesture engine | Press detection, hover timing, smoothing, confidence gating |
| Keyboard | Alphanumeric layout, symbols, arrows, Shift, Caps, suggestions |
| Visual feedback | Hover glow, trails, mirror overlay, low-light-friendly contrast |
| Voice | Continuous recognition, command parsing, undo/commit controls |
| Mobile support | Touch fallback, Bed Mode, low-end device profiling |
| Persistence | Calibration state, UI settings, placement, scaling, rotation |
| Offline support | Service worker caching and local `external/` asset loading |

## Architecture

The application is organized into focused ES modules:

- `script.js` — entry point and application bootstrap
- `handTracker.js` — camera, MediaPipe, landmarks, confidence filtering
- `gestureEngine.js` — press logic, smoothing, calibration, interaction state
- `keyboardRenderer.js` — 3D keyboard rendering, mirror overlay, feedback visuals
- `voiceInput.js` — speech recognition and command handling
- `uiControls.js` — settings, onboarding, toggles, persistence wiring

## Getting Started

### Requirements

- A modern browser with camera access enabled
- HTTPS for camera permissions and installability
- A device with reasonable real-time video performance for the best experience

### Run locally

Serve the project from a local web server or deploy it to GitHub Pages.

Examples:

```bash
python3 -m http.server 8080
```

Then open the site through a browser and grant camera permission when prompted.

### Important browser note

Opening the project directly from a `file://` URL is not recommended. Camera access, module loading behavior, and PWA capabilities are more reliable when served over HTTP(S).

## Offline / Local MediaPipe Assets

This build is configured to load MediaPipe entirely from the local `external/` folder.

Required files:

- `vision_bundle.mjs`
- `hand_landmarker.task`
- `vision_wasm_internal.js`
- `vision_wasm_internal.wasm`
- `vision_wasm_module_internal.js`
- `vision_wasm_module_internal.wasm`
- `vision_wasm_nosimd_internal.js`
- `vision_wasm_nosimd_internal.wasm`

If any required file is missing, Halo surfaces a local asset error instead of falling back to network-hosted resources.

## Usage

### Basic flow

1. Start the camera
2. Complete calibration
3. Place or sculpt the keyboard
4. Hover and press to type
5. Use voice input or touch fallback when needed

### Interaction modes

- **Air Mode** for free-space typing
- **Surface Mode** for anchored interaction using estimated hand-plane fitting
- **Bed Mode** for single-hand mobile sessions

### Voice commands

Examples include:

- `type hello world`
- `press enter`
- `backspace`
- `caps on`
- `voice off`

## Device Compatibility

Halo is designed primarily for modern Chromium-based mobile browsers and desktop browsers with camera support. Performance and feature availability can vary by browser, device class, lighting conditions, and camera quality.

### Current compatibility focus

- Android Chrome
- iPhone and iPad Safari
- Desktop Chromium browsers

### WebXR

The app can detect WebXR availability in supported environments. Full world-anchored AR keyboard placement is not enabled in the current browser build.

## Privacy

Halo is a client-side application. Camera processing and interaction logic are designed to run in the browser. No backend service is required for the core experience.

Browser voice recognition behavior may depend on the user agent’s speech services and permissions model.

## Project Structure

```text
.
├── index.html
├── styles.css
├── script.js
├── handTracker.js
├── gestureEngine.js
├── keyboardRenderer.js
├── voiceInput.js
├── uiControls.js
├── manifest.webmanifest
├── sw.js
└── external/
```

## Roadmap

Planned and ongoing areas of improvement include:

- deeper mobile tuning for low-light and low-power devices
- more advanced prediction dictionaries and suggestion ranking
- richer pointer/navigation gestures
- additional accessibility and onboarding improvements
- broader AR/XR experimentation where browser support allows

## Third-Party Components

Halo includes vendored MediaPipe runtime and model assets for local/offline operation. See `THIRD_PARTY_NOTICES.md` for third-party attribution and license information.

## License

See the repository `LICENSE` file for the project license.

## Acknowledgements

- Google MediaPipe Tasks Vision for browser hand tracking
- Browser APIs that enable camera, speech recognition, vibration, storage, and PWA installation
