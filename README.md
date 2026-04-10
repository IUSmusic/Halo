# Halo

A static GitHub Pages web app prototype for a camera-based virtual keyboard.

Users draw a rectangle in the air over a visible surface, the app converts that traced area into a neon keyboard pad, and then the keyboard can be pinned in place for typing with fingertip motion plus pinch or dwell selection.


## Core flow

1. Start the camera.
2. Pick a built-in or external camera.
3. Draw a rectangle in the air where the keyboard should live.
4. Finish the rectangle and preview the detected pad.
5. Pin the keyboard.
6. Type by hovering and using pinch, dwell, or both.

## Current behavior

This starter is intentionally lightweight and GitHub Pages friendly.

- The app runs entirely in the browser.
- Camera access happens with `getUserMedia()`.
- Hand tracking uses MediaPipe in the browser.
- The keyboard is treated as a pinned 2D pad in camera view.
- Accuracy is best when the camera is stationary.

## Important limitations

This is an MVP, not a production spatial tracking system.

- It does not yet perform true 3D surface anchoring.
- It does not yet persist a calibrated plane if the camera moves a lot.
- Rectangle detection is inferred from the traced path and may need cleaner calibration for reliable long sessions.
- Finger tap detection is based on hover and pinch heuristics, not full physical contact detection.

## Good next upgrades

- Manual corner adjustment after rectangle detection
- Perspective correction and keystone adjustment
- Saved calibration presets
- Better multi-hand logic
- Worker-based inference for smoother performance on slower devices
- Optional text export and clipboard copy
- AR-style surface anchoring for supported devices

## Deploy to GitHub Pages

This repo uses a GitHub Actions workflow for deployment.

### Steps

1. Create a new GitHub repository.
2. Upload these files to the repository root.
3. Push to your default branch, usually `main`.
4. In GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to **GitHub Actions**.
6. The included workflow will deploy the site automatically on push.

## Camera and HTTPS note

Camera access in browsers requires HTTPS or another secure context. GitHub Pages is suitable for this because it serves sites over HTTPS.

## Local testing

You can open `index.html` directly for layout work, but camera access is more reliable when served locally over HTTP from a dev server.

Examples:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Suggested repo name

- `ghostboard-surface-pad`
- `neon-air-keyboard`
- `surface-vision-keyboard`

## License

Add the license you want before publishing publicly.
