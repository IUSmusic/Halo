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
