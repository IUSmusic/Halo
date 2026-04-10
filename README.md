# Halo

Halo is a static browser app for a camera-based virtual keyboard that can be hosted on GitHub Pages.

## New in this update

- Project name changed to **Halo**
- **Press gesture mode** added, so a short poke motion can trigger a key instead of relying only on hover timing
- **3D surface / air mode toggle** added
- **One-hand sculpt placement** added:
  - pinch to grab and place the keyboard
  - open or close the pinch slightly to resize it
  - wrist direction helps set orientation
- **Rotate left / right** controls added
- **Mirror mode off by default** to reduce front-camera reversal issues
- **All ten fingertips** are supported for typing
- **Subtle feedback sound** and **vibration** toggles added
- Optional **voice letters/actions** mode added for commands like `type b`, `press enter`, `backspace`, or NATO words like `bravo`
- Optional **word recognition** mode added for normal spoken words

## Notes

This is still a browser-only approximation of a surface keyboard. The 3D surface feel and press gesture use hand pose and depth estimates from the camera, not full AR plane detection.

## Run locally

Serve over HTTPS or use GitHub Pages. Camera access will not work from an insecure local file URL in most browsers.

## Deploy to GitHub Pages

1. Create a GitHub repository
2. Upload all files from this folder
3. In GitHub, open **Settings → Pages**
4. Set the source to **GitHub Actions**
5. Push to `main`

The included workflow will publish the site automatically.
