import {
  KalmanPointFilter,
  angleDeg,
  averagePoint,
  averagePoint3,
  clamp,
  cross3,
  deepClone,
  distance,
  distance3,
  dot,
  getCurrentWord,
  mapRange,
  normalize,
  normalize3,
  perpendicularDown,
  replaceCurrentWord,
  rotateVector,
} from "./utils.js";
import { getSuggestions } from "./words.js";

export const TIP_INDICES = [4, 8, 12, 16, 20];
export const FINGER_NAMES = { 4: "thumb", 8: "index", 12: "middle", 16: "ring", 20: "pinky" };
export const SPECIAL_LABELS = {
  SPACE: "space",
  BACKSPACE: "⌫",
  ENTER: "⏎",
  SHIFT: "⇧",
  CAPS: "⇪",
  SYM: "#+=",
  LEFT: "←",
  RIGHT: "→",
};

const LETTER_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
  ["SYM", "SPACE", "LEFT", "RIGHT", "ENTER"],
];

const SYMBOL_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
  ["-", "+", "=", "/", "?", ":", ";", "'", '"'],
  ["SHIFT", ",", ".", "_", "[", "]", "{", "}", "BACKSPACE"],
  ["SYM", "SPACE", "LEFT", "RIGHT", "ENTER"],
];

export function buildLayout(rows) {
  const result = [];
  const vGap = 0.022;
  const hGap = 0.014;
  const rowHeight = (1 - vGap * (rows.length - 1)) / rows.length;
  let y = 0;
  rows.forEach((row) => {
    const weights = row.map((label) => {
      if (label === "SPACE") return 4.2;
      if (label === "BACKSPACE") return 1.8;
      if (label === "SHIFT") return 1.8;
      if (label === "ENTER") return 1.7;
      if (label === "SYM") return 1.5;
      if (label === "LEFT" || label === "RIGHT") return 1.2;
      return 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const unit = (1 - hGap * (row.length - 1)) / total;
    let x = 0;
    row.forEach((label, index) => {
      const w = weights[index] * unit;
      result.push({ label, display: SPECIAL_LABELS[label] || label, x, y, w, h: rowHeight });
      x += w + hGap;
    });
    y += rowHeight + vGap;
  });
  return result;
}

export function currentLayout(shiftOn, symbolMode) {
  return buildLayout(symbolMode ? SYMBOL_ROWS : LETTER_ROWS.map((row) => row.map((label) => {
    if (label.length === 1 && /[A-Z]/i.test(label)) return shiftOn ? label.toUpperCase() : label.toLowerCase();
    return label;
  })));
}

export function formatKeyLabel(label) {
  return SPECIAL_LABELS[label] || label;
}

export function createFilterPreset(mode, confidence = 1, bedMode = false) {
  const lowConfidenceBoost = confidence < 0.78 ? 0.14 : 0;
  if (mode === "fast") return { alpha: 0.48 + lowConfidenceBoost, pressDepth: 0.0087, pressVelocity: 0.00062, pressAcceleration: 0.00024, hoverMs: 40 };
  if (mode === "stable") return { alpha: 0.2 + lowConfidenceBoost, pressDepth: 0.0106, pressVelocity: 0.00048, pressAcceleration: 0.00018, hoverMs: 60 };
  if (mode === "bed") return { alpha: 0.16 + lowConfidenceBoost, pressDepth: 0.0073, pressVelocity: 0.00042, pressAcceleration: 0.00015, hoverMs: 58 };
  return { alpha: 0.32 + lowConfidenceBoost, pressDepth: bedMode ? 0.0078 : 0.0096, pressVelocity: 0.00052, pressAcceleration: 0.0002, hoverMs: 48 };
}

export function getPoint(rect, landmark, mirrored) {
  let x = landmark.x * rect.width;
  if (mirrored) x = rect.width - x;
  return { x, y: landmark.y * rect.height, z: landmark.z };
}

export function smoothCursor(id, point, filters, preset) {
  if (!filters.has(id)) filters.set(id, new KalmanPointFilter({ q: 0.008, r: 0.12 }));
  const filter = filters.get(id);
  return filter.filter(point, preset.alpha);
}

export function getHandConfidence(result, handIndex) {
  const handedness = result?.handedness?.[handIndex] || result?.handednesses?.[handIndex] || [];
  return handedness?.[0]?.score ?? 1;
}

export function fitPlaneLeastSquares(points3D) {
  if (points3D.length < 3) return null;
  let sumX = 0, sumY = 0, sumZ = 0;
  let sumXX = 0, sumYY = 0, sumXY = 0, sumXZ = 0, sumYZ = 0;
  for (const p of points3D) {
    sumX += p.x; sumY += p.y; sumZ += p.z;
    sumXX += p.x * p.x; sumYY += p.y * p.y; sumXY += p.x * p.y;
    sumXZ += p.x * p.z; sumYZ += p.y * p.z;
  }
  const n = points3D.length;
  const A = [
    [sumXX, sumXY, sumX],
    [sumXY, sumYY, sumY],
    [sumX, sumY, n],
  ];
  const B = [sumXZ, sumYZ, sumZ];
  const solution = solve3x3(A, B);
  if (!solution) return null;
  const [a, b, c] = solution;
  const normal = normalize3({ x: -a, y: -b, z: 1 });
  let error = 0;
  for (const p of points3D) {
    const fitted = a * p.x + b * p.y + c;
    error += Math.abs(fitted - p.z);
  }
  error /= n;
  const centroid = averagePoint3(points3D);
  return { a, b, c, normal, centroid, error, tilt: 1 - clamp(Math.abs(normal.z), 0, 1) };
}

function solve3x3(A, B) {
  const m = A.map((row, i) => row.concat(B[i]));
  for (let i = 0; i < 3; i += 1) {
    let maxRow = i;
    for (let j = i + 1; j < 3; j += 1) if (Math.abs(m[j][i]) > Math.abs(m[maxRow][i])) maxRow = j;
    if (Math.abs(m[maxRow][i]) < 1e-9) return null;
    [m[i], m[maxRow]] = [m[maxRow], m[i]];
    const pivot = m[i][i];
    for (let k = i; k < 4; k += 1) m[i][k] /= pivot;
    for (let j = 0; j < 3; j += 1) {
      if (j === i) continue;
      const factor = m[j][i];
      for (let k = i; k < 4; k += 1) m[j][k] -= factor * m[i][k];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

export function computeCalibration({ landmarks, worldLandmarks, rect, mirrored, bedMode }) {
  if (!landmarks || !worldLandmarks) return null;
  const wrist = getPoint(rect, landmarks[0], mirrored);
  const indexMcp = getPoint(rect, landmarks[5], mirrored);
  const pinkyMcp = getPoint(rect, landmarks[17], mirrored);
  const indexTip = getPoint(rect, landmarks[8], mirrored);
  const middleTip = getPoint(rect, landmarks[12], mirrored);
  const plane = fitPlaneLeastSquares([0, 5, 8, 9, 12, 13, 16, 17, 20].map((i) => worldLandmarks[i]).filter(Boolean));
  const spanPx = distance(indexMcp, pinkyMcp);
  const fingerSpanPx = distance(indexTip, middleTip);
  const wristAngle = angleDeg({ x: indexMcp.x - wrist.x, y: indexMcp.y - wrist.y });
  const tiltFactor = plane ? clamp(Math.abs(plane.normal.z), 0.35, 1) : 0.8;
  const pressDepth = (bedMode ? 0.0068 : 0.0086) * tiltFactor * clamp(mapRange(spanPx, 80, 240, 1.18, 0.88), 0.75, 1.3);
  return {
    spanPx,
    fingerSpanPx,
    wristAngle,
    tiltFactor,
    pressDepth,
    keyboardScale: clamp(mapRange(spanPx, 90, 240, 0.9, 1.25), 0.88, 1.32),
    plane,
    timestamp: Date.now(),
  };
}

export function createAnchorFromHand({ landmarks, worldLandmarks, rect, mirrored, anchorMode, calibration, bedMode }) {
  if (!landmarks) return null;
  const wrist = getPoint(rect, landmarks[0], mirrored);
  const indexTip = getPoint(rect, landmarks[8], mirrored);
  const thumbTip = getPoint(rect, landmarks[4], mirrored);
  const middleMcp = getPoint(rect, landmarks[9], mirrored);
  const pinkyMcp = getPoint(rect, landmarks[17], mirrored);
  const indexMcp = getPoint(rect, landmarks[5], mirrored);
  const palmCenter = averagePoint([wrist, middleMcp, pinkyMcp, indexMcp]);
  const plane = fitPlaneLeastSquares([0, 5, 8, 9, 12, 13, 16, 17, 20].map((i) => worldLandmarks?.[i]).filter(Boolean));
  const pinchDistance = distance(indexTip, thumbTip) / Math.max(rect.width, rect.height);
  const isGrab = pinchDistance < 0.12;
  const xAxisRaw = normalize({ x: indexMcp.x - pinkyMcp.x, y: indexMcp.y - pinkyMcp.y });
  const xAxis = xAxisRaw.x < 0 ? { x: -xAxisRaw.x, y: -xAxisRaw.y } : xAxisRaw;
  let yAxis = anchorMode === "surface" ? normalize({ x: middleMcp.x - wrist.x, y: middleMcp.y - wrist.y }) : perpendicularDown(xAxis);
  if (!Number.isFinite(yAxis.x) || !Number.isFinite(yAxis.y) || Math.abs(dot(xAxis, yAxis)) > 0.84) yAxis = perpendicularDown(xAxis);
  if (anchorMode === "surface" && yAxis.y < 0) yAxis = { x: -yAxis.x, y: -yAxis.y };
  if (anchorMode === "air") yAxis = perpendicularDown(xAxis);
  const handSpan = distance(indexMcp, pinkyMcp);
  const calibrationScale = calibration?.keyboardScale ?? 1;
  const sculptScale = clamp(mapRange(pinchDistance, 0.025, 0.15, 0.72, 1.7), 0.62, 2.05);
  const width = handSpan * (bedMode ? 3.2 : 3.0) * sculptScale * calibrationScale;
  const height = width * 0.46;
  const center = anchorMode === "surface"
    ? { x: palmCenter.x, y: palmCenter.y + height * (bedMode ? 0.04 : 0.08) }
    : { x: palmCenter.x, y: palmCenter.y - height * 0.12 };
  const perspective = plane ? clamp(plane.tilt * 0.34, 0.03, 0.18) : 0.06;
  return {
    center,
    xAxis,
    yAxis,
    baseWidth: width,
    baseHeight: height,
    perspective,
    planeQuality: plane ? 1 - clamp(plane.error * 32, 0, 0.55) : 0.48,
    pinchDistance,
    isGrab,
    anchorMode,
  };
}

export function getActiveAnchor(anchor, keyboardScale, rotationOffsetDeg, anchorMode) {
  if (!anchor) return null;
  const radians = rotationOffsetDeg * Math.PI / 180;
  let xAxis = rotateVector(anchor.xAxis, radians);
  if (xAxis.x < 0) xAxis = { x: -xAxis.x, y: -xAxis.y };
  let yAxis = (anchorMode === "surface" || anchor.anchorMode === "surface") ? rotateVector(anchor.yAxis, radians) : perpendicularDown(xAxis);
  if (anchorMode === "air") yAxis = perpendicularDown(xAxis);
  return {
    center: { ...anchor.center },
    xAxis: normalize(xAxis),
    yAxis: normalize(yAxis),
    width: anchor.baseWidth * keyboardScale,
    height: anchor.baseHeight * keyboardScale,
    perspective: anchor.perspective || 0.06,
    anchorMode: anchor.anchorMode || anchorMode,
  };
}

export function keyAtPoint(point, anchor, layout, lockedLabel = null, snapPadding = 0.028, stickyPadding = 0.055) {
  const rel = { x: point.x - anchor.center.x, y: point.y - anchor.center.y };
  const u = dot(rel, anchor.xAxis) / anchor.width + 0.5;
  const v = dot(rel, anchor.yAxis) / anchor.height + 0.5;

  if (lockedLabel) {
    const lockedKey = layout.find((key) => key.label === lockedLabel);
    if (lockedKey && pointInKey(u, v, lockedKey, stickyPadding)) return { key: lockedKey, u, v };
  }
  for (const key of layout) {
    if (pointInKey(u, v, key, snapPadding)) return { key, u, v };
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const key of layout) {
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
  return nearestDistance <= 0.9 ? nearest : null;
}

function pointInKey(u, v, key, padding) {
  return u >= key.x - padding && u <= key.x + key.w + padding && v >= key.y - padding && v <= key.y + key.h + padding;
}

export function getFingerState(map, id) {
  if (!map.has(id)) {
    map.set(id, {
      hoverSince: 0,
      lastCommitTime: 0,
      lastHoverKey: null,
      lastZ: null,
      lastVelocity: 0,
      depthBaseline: 0,
      depthVelocity: 0,
      depthAcceleration: 0,
      pressActive: false,
      pressPeak: 0,
      palmOpenSince: 0,
    });
  }
  return map.get(id);
}

export function updateDepthState(state, z) {
  if (state.lastZ === null) {
    state.lastZ = z;
    state.depthVelocity = 0;
    state.depthAcceleration = 0;
    state.depthBaseline = z;
    return;
  }
  const velocity = z - state.lastZ;
  state.depthAcceleration = velocity - state.lastVelocity;
  state.depthVelocity = velocity;
  state.lastVelocity = velocity;
  state.lastZ = z;
  const baselineAlpha = state.pressActive ? 0.012 : 0.05;
  state.depthBaseline = state.depthBaseline + (z - state.depthBaseline) * baselineAlpha;
}

export function detectPressGesture(state, z, now, thresholds, confidence) {
  if (confidence < 0.7) return { pressed: false, score: 0 };
  const depthDelta = Math.abs(z - state.depthBaseline);
  const velocity = Math.abs(state.depthVelocity);
  const acceleration = Math.abs(state.depthAcceleration);
  const score = depthDelta * 120 + velocity * 1200 + acceleration * 2000;

  if (!state.pressActive) {
    if (!state.hoverSince || now - state.hoverSince < thresholds.hoverMs) return { pressed: false, score };
    if (depthDelta > thresholds.pressDepth && velocity > thresholds.pressVelocity && acceleration > thresholds.pressAcceleration) {
      state.pressActive = true;
      state.pressPeak = depthDelta;
    }
    return { pressed: false, score };
  }

  state.pressPeak = Math.max(state.pressPeak || 0, depthDelta);
  if (depthDelta < thresholds.pressDepth * 0.46) {
    const peak = state.pressPeak || 0;
    state.pressActive = false;
    state.pressPeak = 0;
    state.depthBaseline = z;
    return { pressed: peak > thresholds.pressDepth * 1.1, score };
  }
  return { pressed: false, score };
}

export function detectTwoFingerSwipe(hand, rect, mirrored, state) {
  const indexTip = getPoint(rect, hand[8], mirrored);
  const middleTip = getPoint(rect, hand[12], mirrored);
  const center = averagePoint([indexTip, middleTip]);
  if (!state.lastSwipePoint) {
    state.lastSwipePoint = center;
    return null;
  }
  const dx = center.x - state.lastSwipePoint.x;
  const dy = center.y - state.lastSwipePoint.y;
  state.lastSwipePoint = center;
  if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3) return dx > 0 ? "CAPS" : "SHIFT";
  if (Math.abs(dy) > 54 && Math.abs(dy) > Math.abs(dx) * 1.2) return dy > 0 ? "SCROLL_DOWN" : "SCROLL_UP";
  return null;
}

export function isPalmOpen(hand, rect, mirrored) {
  const wrist = getPoint(rect, hand[0], mirrored);
  const tips = [8, 12, 16, 20].map((index) => getPoint(rect, hand[index], mirrored));
  const avg = tips.reduce((sum, tip) => sum + distance(wrist, tip), 0) / tips.length;
  return avg > rect.width * 0.15;
}

export function detectThreeFingerSpread(hand, worldLandmarks) {
  if (!hand || !worldLandmarks) return false;
  const a = distance3(worldLandmarks[8], worldLandmarks[12]);
  const b = distance3(worldLandmarks[12], worldLandmarks[16]);
  return a > 0.035 && b > 0.03;
}

export function applyKeyToText(text, label, { shiftOn = false, capsLock = false, symbolMode = false } = {}) {
  let nextText = text;
  let nextShift = shiftOn;
  let nextCaps = capsLock;
  let nextSymbols = symbolMode;

  if (label === "SPACE") nextText += " ";
  else if (label === "BACKSPACE") nextText = nextText.slice(0, -1);
  else if (label === "ENTER") nextText += "\n";
  else if (label === "LEFT") nextText += "←";
  else if (label === "RIGHT") nextText += "→";
  else if (label === "SHIFT") nextShift = !shiftOn;
  else if (label === "CAPS") nextCaps = !capsLock;
  else if (label === "SYM") nextSymbols = !symbolMode;
  else {
    if (/^[a-z]$/i.test(label)) {
      const upper = nextShift || nextCaps;
      nextText += upper ? label.toUpperCase() : label.toLowerCase();
      if (nextShift) nextShift = false;
    } else {
      nextText += label;
    }
  }
  return { text: nextText, shiftOn: nextShift, capsLock: nextCaps, symbolMode: nextSymbols };
}

export function insertVoiceText(text, phrase) {
  const spaced = text && !/[\s\n]$/.test(text) ? `${text} ${phrase}` : `${text}${phrase}`;
  return spaced;
}

export function getTextSuggestions(text) {
  return getSuggestions(getCurrentWord(text));
}

export function applySuggestion(text, suggestion) {
  const currentWord = getCurrentWord(text);
  if (!currentWord) return `${text}${text && !/[\s\n]$/.test(text) ? " " : ""}${suggestion}`;
  return replaceCurrentWord(text, suggestion);
}
