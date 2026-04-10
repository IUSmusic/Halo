export const STORAGE_KEY = "halo-settings-v2";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = clamp((value - inMin) / (inMax - inMin || 1), 0, 1);
  return outMin + (outMax - outMin) * t;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  if (!len) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!len) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function rotateVector(v, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function perpendicularDown(xAxis) {
  const cw = { x: -xAxis.y, y: xAxis.x };
  const ccw = { x: xAxis.y, y: -xAxis.x };
  return normalize(cw.y >= ccw.y ? cw : ccw);
}

export function averagePoint(points) {
  const count = Math.max(points.length, 1);
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / count, y: sum.y / count };
}

export function averagePoint3(points) {
  const count = Math.max(points.length, 1);
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / count, y: sum.y / count, z: sum.z / count };
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadSettings(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(defaults);
    return mergeDeep(deepClone(defaults), JSON.parse(raw));
  } catch (_) {
    return deepClone(defaults);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function mergeDeep(base, extra) {
  if (typeof extra !== "object" || extra === null) return base;
  Object.entries(extra).forEach(([key, value]) => {
    if (Array.isArray(value)) base[key] = value.slice();
    else if (value && typeof value === "object") base[key] = mergeDeep(base[key] || {}, value);
    else base[key] = value;
  });
  return base;
}

export function nowMs() {
  return performance.now();
}

export function angleDeg(v) {
  return Math.atan2(v.y, v.x) * 180 / Math.PI;
}

export function getCurrentWord(text) {
  const match = text.match(/([A-Za-z']+)$/);
  return match ? match[1] : "";
}

export function replaceCurrentWord(text, replacement) {
  return text.replace(/([A-Za-z']+)$/, replacement);
}

export function isLikelyMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

export function profileDevice() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const mobile = isLikelyMobile();
  const lowEnd = mobile ? (cores <= 4 || memory <= 4) : (cores <= 4 && memory <= 4);
  return {
    mobile,
    lowEnd,
    cores,
    memory,
    resolution: lowEnd ? { width: 960, height: 540 } : mobile ? { width: 1280, height: 720 } : { width: 1280, height: 720 },
    inferenceInterval: lowEnd ? 65 : 34,
    label: lowEnd ? "fast" : mobile ? "mobile balanced" : "balanced",
  };
}

export class Kalman1D {
  constructor({ q = 0.008, r = 0.12 } = {}) {
    this.q = q;
    this.r = r;
    this.x = 0;
    this.p = 1;
    this.initialized = false;
  }
  filter(measurement) {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return measurement;
    }
    this.p += this.q;
    const k = this.p / (this.p + this.r);
    this.x = this.x + k * (measurement - this.x);
    this.p = (1 - k) * this.p;
    return this.x;
  }
}

export class KalmanPointFilter {
  constructor(options = {}) {
    this.x = new Kalman1D(options);
    this.y = new Kalman1D(options);
    this.z = new Kalman1D(options);
    this.last = null;
  }
  filter(point, alpha = 0.34) {
    const next = {
      x: this.x.filter(point.x),
      y: this.y.filter(point.y),
      z: this.z.filter(point.z ?? 0),
    };
    if (!this.last) {
      this.last = next;
      return { ...next };
    }
    this.last = {
      x: lerp(this.last.x, next.x, alpha),
      y: lerp(this.last.y, next.y, alpha),
      z: lerp(this.last.z, next.z, alpha),
    };
    return { ...this.last };
  }
}

export async function supportsWebXR() {
  if (!navigator.xr?.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch (_) {
    return false;
  }
}

export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {}
}
