import { HandLandmarker, FilesetResolver } from "./external/vision_bundle.mjs";
import { profileDevice } from "./utils.js";

export const MEDIAPIPE_VERSION = "0.10.34";
const MODEL_URL = "./external/hand_landmarker.task";
const WASM_ROOT = "./external";

export class HandTracker {
  constructor(video, { onStatus } = {}) {
    this.video = video;
    this.onStatus = onStatus || (() => {});
    this.landmarker = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.profile = profileDevice();
    this.brightness = null;
    this.lastBrightnessAt = 0;
    this.latestResult = null;
    this.currentDeviceId = "";
    this.currentFacingHint = "unknown";
  }

  async init({ numHands = 2, lowEnd = false } = {}) {
    if (this.landmarker) return this.landmarker;
    this.onStatus(`Loading hand tracking ${MEDIAPIPE_VERSION}…`, "warn");
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    } catch (error) {
      this.onStatus("Local MediaPipe files missing from /external", "error");
      throw error;
    }
    const base = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: lowEnd ? 0.55 : 0.6,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, base);
    } catch (error) {
      const fallback = JSON.parse(JSON.stringify(base));
      fallback.baseOptions.delegate = "CPU";
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, fallback);
        this.onStatus("GPU unavailable, using CPU fallback", "warn");
      } catch (fallbackError) {
        this.onStatus("Hand model could not load from /external", "error");
        throw fallbackError;
      }
    }
    return this.landmarker;
  }

  async startCamera({ deviceId = "", preferRear = true, numHands = 2, lowEnd = false } = {}) {
    await this.init({ numHands, lowEnd });
    await this.stopCamera();
    const resolution = this.profile.resolution;
    const constraints = deviceId
      ? {
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
          },
          audio: false,
        }
      : {
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            facingMode: preferRear ? "environment" : "user",
          },
          audio: false,
        };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      if (!deviceId && preferRear) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: resolution.width }, height: { ideal: resolution.height }, facingMode: "user" },
          audio: false,
        });
      } else {
        throw error;
      }
    }

    this.video.srcObject = this.stream;
    await this.video.play();
    this.currentDeviceId = deviceId;
    this.currentFacingHint = this.inferFacingHint(deviceId);
    return {
      profile: this.profile,
      facingHint: this.currentFacingHint,
    };
  }

  async stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.stream = null;
    this.video.srcObject = null;
    this.lastVideoTime = -1;
    this.latestResult = null;
  }

  get running() {
    return Boolean(this.stream && this.video.srcObject);
  }

  async listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (_) {
      return [];
    }
  }

  inferFacingHint(deviceId) {
    try {
      const track = this.stream?.getVideoTracks?.()[0];
      const settings = track?.getSettings?.() || {};
      const facingMode = String(settings.facingMode || "").toLowerCase();
      if (facingMode.includes("front") || facingMode.includes("user")) return "front";
      if (facingMode.includes("back") || facingMode.includes("rear") || facingMode.includes("environment")) return "rear";
      const label = String(track?.label || deviceId || "").toLowerCase();
      if (/(front|user|face|facetime|selfie)/.test(label)) return "front";
      if (/(back|rear|environment|world)/.test(label)) return "rear";
    } catch (_) {}
    return "unknown";
  }

  detect(now) {
    if (!this.running || !this.landmarker) return this.latestResult;
    if (this.video.currentTime === this.lastVideoTime) return this.latestResult;
    this.lastVideoTime = this.video.currentTime;
    this.latestResult = this.landmarker.detectForVideo(this.video, now);
    this.sampleBrightness(now);
    return this.latestResult;
  }

  sampleBrightness(now) {
    if (now - this.lastBrightnessAt < 900) return this.brightness;
    this.lastBrightnessAt = now;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      this.brightness = total / (data.length / 4) / 255;
      return this.brightness;
    } catch (_) {
      return this.brightness;
    }
  }
}
