import { deepClone, dot, normalize, perpendicularDown, clamp } from "./utils.js";

export class KeyboardRenderer {
  constructor(overlayCanvas, mirrorCanvas) {
    this.overlay = overlayCanvas;
    this.mirror = mirrorCanvas;
    this.ctx = overlayCanvas.getContext("2d");
    this.mirrorCtx = mirrorCanvas.getContext("2d");
    this.trails = new Map();
    this.lastHoverVibrationKey = "";
  }

  resize() {
    this.resizeCanvas(this.overlay, this.ctx);
    this.resizeCanvas(this.mirror, this.mirrorCtx);
  }

  resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.overlay.clientWidth, this.overlay.clientHeight);
    this.mirrorCtx.clearRect(0, 0, this.mirror.clientWidth, this.mirror.clientHeight);
  }

  drawFrame({ anchor, layout, hoveredLabels, cursors, now, neonStrength, phase, drawPathPoints, pointer, mirrorTouchEnabled, lowLightMode, suggestions = [] }) {
    this.clear();
    if (anchor) {
      this.drawBoard(anchor, layout, hoveredLabels, cursors, now, neonStrength, lowLightMode);
      this.drawMirror(layout, hoveredLabels, cursors, suggestions, mirrorTouchEnabled);
    } else {
      this.drawMirror(layout, hoveredLabels, cursors, suggestions, mirrorTouchEnabled, true);
    }
    this.drawTrails(cursors, neonStrength);
    cursors.forEach((cursor) => this.drawCursor(cursor, neonStrength));
    if (pointer) this.drawPointer(pointer, neonStrength);
    if (drawPathPoints?.length > 1) this.drawPath(drawPathPoints, neonStrength);
    if (!anchor) this.drawOverlayHints(phase);
  }

  project(anchor, u, v) {
    const perspective = anchor.perspective || 0;
    const depthScale = 1 - perspective * (v - 0.25);
    return {
      x: anchor.center.x + (u - 0.5) * anchor.width * depthScale * anchor.xAxis.x + (v - 0.5) * anchor.height * anchor.yAxis.x,
      y: anchor.center.y + (u - 0.5) * anchor.width * depthScale * anchor.xAxis.y + (v - 0.5) * anchor.height * anchor.yAxis.y,
    };
  }

  drawBoard(anchor, layout, hoveredLabels, cursors, now, neonStrength, lowLightMode) {
    const corners = [this.project(anchor, 0, 0), this.project(anchor, 1, 0), this.project(anchor, 1, 1), this.project(anchor, 0, 1)];
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = lowLightMode ? "rgba(3, 10, 22, 0.38)" : "rgba(8, 26, 48, 0.18)";
    ctx.shadowColor = `rgba(34, 211, 238, ${0.86 * neonStrength})`;
    ctx.shadowBlur = 28 * neonStrength;
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.95 * neonStrength})`;
    ctx.lineWidth = 3.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const pulse = 0.6 + 0.4 * Math.sin(now / 240);
    layout.forEach((key) => {
      const corners = [
        this.project(anchor, key.x, key.y),
        this.project(anchor, key.x + key.w, key.y),
        this.project(anchor, key.x + key.w, key.y + key.h),
        this.project(anchor, key.x, key.y + key.h),
      ];
      const isHover = hoveredLabels.has(key.label);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = isHover ? `rgba(96, 165, 250, ${0.18 + pulse * 0.16})` : lowLightMode ? "rgba(255,255,255,0.08)" : "rgba(255, 255, 255, 0.05)";
      ctx.strokeStyle = isHover ? `rgba(96, 165, 250, ${0.98 * neonStrength})` : `rgba(34, 211, 238, ${0.26 * neonStrength})`;
      ctx.shadowColor = isHover ? `rgba(96, 165, 250, ${0.92 * neonStrength})` : `rgba(34, 211, 238, ${0.38 * neonStrength})`;
      ctx.shadowBlur = isHover ? 22 * neonStrength : 12 * neonStrength;
      ctx.lineWidth = isHover ? 2.5 : 1.25;
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const center = this.project(anchor, key.x + key.w / 2, key.y + key.h / 2);
      const fontSize = Math.max(10, Math.min(anchor.height * key.h * 0.42, 24));
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = isHover ? "rgba(255,255,255,1)" : "rgba(239,246,255,0.92)";
      ctx.fillText(key.display, center.x, center.y + 1);
      ctx.restore();
    });

    cursors.forEach((cursor) => {
      if (!cursor.hoveredKey || !cursor.hoverStart) return;
      const progress = Math.max(0, Math.min(1, (performance.now() - cursor.hoverStart) / cursor.dwellMs));
      const key = cursor.hoveredKey;
      const point = this.project(anchor, key.x + key.w / 2, key.y - 0.055);
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

  drawMirror(layout, hoveredLabels, cursors, suggestions, mirrorTouchEnabled, emptyState = false) {
    const ctx = this.mirrorCtx;
    const width = this.mirror.clientWidth;
    const height = this.mirror.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.fillStyle = "rgba(4, 10, 22, 0.46)";
    ctx.fillRect(0, 0, width, height);

    const suggestionHeight = suggestions.length ? Math.min(34, height * 0.22) : 0;
    if (suggestions.length) {
      suggestions.slice(0, 3).forEach((word, index) => {
        const chipWidth = Math.max(64, width * 0.22);
        const gap = 8;
        const x = 10 + index * (chipWidth + gap);
        ctx.fillStyle = "rgba(96,165,250,0.14)";
        ctx.strokeStyle = "rgba(96,165,250,0.5)";
        this.roundRect(ctx, x, 8, chipWidth, suggestionHeight - 12, 12, true, true);
        ctx.fillStyle = "rgba(239,246,255,0.92)";
        ctx.font = "600 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(word, x + chipWidth / 2, 8 + (suggestionHeight - 12) / 2 + 1);
      });
    }

    const originY = suggestionHeight + 10;
    const contentHeight = height - originY - 10;
    layout.forEach((key) => {
      const x = 12 + key.x * (width - 24);
      const y = originY + key.y * contentHeight;
      const w = key.w * (width - 24);
      const h = key.h * contentHeight;
      const isHover = hoveredLabels.has(key.label);
      ctx.fillStyle = isHover ? "rgba(96,165,250,0.26)" : emptyState ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.07)";
      ctx.strokeStyle = isHover ? "rgba(96,165,250,0.95)" : "rgba(34,211,238,0.3)";
      this.roundRect(ctx, x, y, w, h, 9, true, true);
      ctx.fillStyle = isHover ? "rgba(255,255,255,1)" : "rgba(239,246,255,0.9)";
      ctx.font = `${Math.max(9, Math.min(14, h * 0.4))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(key.display, x + w / 2, y + h / 2 + 1);
    });

    cursors.forEach((cursor, index) => {
      if (cursor.u == null || cursor.v == null) return;
      const x = 12 + cursor.u * (width - 24);
      const y = originY + cursor.v * contentHeight;
      ctx.beginPath();
      ctx.arc(x, y, cursor.isThumb ? 6 : 8, 0, Math.PI * 2);
      ctx.fillStyle = cursor.isThumb ? "rgba(134,239,172,0.9)" : "rgba(34,211,238,0.9)";
      ctx.fill();
      ctx.fillStyle = "rgba(239,246,255,0.9)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(String(index + 1), x, y - 14);
    });

    if (!mirrorTouchEnabled) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("touch off", width - 12, height - 12);
    }

    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  drawTrails(cursors, neonStrength) {
    const ctx = this.ctx;
    cursors.forEach((cursor) => {
      const trail = this.trails.get(cursor.id) || [];
      trail.push({ x: cursor.point.x, y: cursor.point.y, t: performance.now() });
      while (trail.length > 18) trail.shift();
      this.trails.set(cursor.id, trail.filter((entry) => performance.now() - entry.t < 260));
    });
    for (const trail of this.trails.values()) {
      if (trail.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      trail.slice(1).forEach((entry) => ctx.lineTo(entry.x, entry.y));
      ctx.strokeStyle = `rgba(34,211,238,${0.28 * neonStrength})`;
      ctx.shadowColor = `rgba(34,211,238,${0.6 * neonStrength})`;
      ctx.shadowBlur = 10 * neonStrength;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawCursor(cursor, neonStrength) {
    const ctx = this.ctx;
    const stroke = cursor.isThumb ? "rgba(134,239,172,0.95)" : "rgba(34,211,238,0.92)";
    const fill = cursor.isThumb ? "rgba(134,239,172,0.12)" : "rgba(34,211,238,0.12)";
    ctx.save();
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

  drawPointer(pointer, neonStrength) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pointer.x, pointer.y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(12, 26);
    ctx.lineTo(5, 21);
    ctx.lineTo(1, 32);
    ctx.lineTo(-3, 30);
    ctx.lineTo(1, 20);
    ctx.lineTo(-6, 20);
    ctx.closePath();
    ctx.fillStyle = pointer.paused ? "rgba(253,230,138,0.9)" : "rgba(255,255,255,0.96)";
    ctx.strokeStyle = `rgba(34,211,238,${0.85 * neonStrength})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = `rgba(34,211,238,${0.8 * neonStrength})`;
    ctx.shadowBlur = 12 * neonStrength;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawPath(points, neonStrength) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = `rgba(34, 211, 238, ${0.8 * neonStrength})`;
    ctx.shadowBlur = 18 * neonStrength;
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.95 * neonStrength})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  drawOverlayHints(phase) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 18px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(239,246,255,0.74)";
    const text = phase === "typing"
      ? "Poke to type or switch to pointer mode"
      : phase === "preview"
        ? "Pin Halo when it looks right"
        : "Start camera, then pinch with one hand to place Halo";
    ctx.fillText(text, this.overlay.clientWidth / 2, this.overlay.clientHeight / 2);
    ctx.restore();
  }

  anchorFromPath(points, anchorMode = "surface") {
    if (points.length < 12) return null;
    const center = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
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
    if (!Number.isFinite(xAxis.x) || !Number.isFinite(xAxis.y)) xAxis = { x: 1, y: 0 };
    if (xAxis.x < 0) xAxis = { x: -xAxis.x, y: -xAxis.y };
    const yAxis = anchorMode === "air" ? perpendicularDown(xAxis) : perpendicularDown(xAxis);
    const bounds = this.projectBounds(points, center, xAxis, yAxis);
    const width = (bounds.maxX - bounds.minX) * 1.08;
    const height = (bounds.maxY - bounds.minY) * 1.12;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 40) return null;
    return {
      center: deepClone(center),
      xAxis,
      yAxis,
      baseWidth: width,
      baseHeight: height,
      perspective: 0.06,
      anchorMode,
    };
  }

  projectBounds(points, center, xAxis, yAxis) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const rel = { x: p.x - center.x, y: p.y - center.y };
      const u = dot(rel, xAxis);
      const v = dot(rel, yAxis);
      minX = Math.min(minX, u);
      maxX = Math.max(maxX, u);
      minY = Math.min(minY, v);
      maxY = Math.max(maxY, v);
    }
    return { minX, maxX, minY, maxY };
  }

  makeMirrorHitTester(layout, suggestions = []) {
    const width = this.mirror.clientWidth;
    const height = this.mirror.clientHeight;
    const suggestionHeight = suggestions.length ? Math.min(34, height * 0.22) : 0;
    const originY = suggestionHeight + 10;
    const contentHeight = height - originY - 10;
    return (clientX, clientY) => {
      const rect = this.mirror.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (suggestions.length && y <= suggestionHeight) {
        const chipWidth = Math.max(64, width * 0.22);
        const gap = 8;
        for (let index = 0; index < Math.min(3, suggestions.length); index += 1) {
          const chipX = 10 + index * (chipWidth + gap);
          if (x >= chipX && x <= chipX + chipWidth && y >= 8 && y <= suggestionHeight - 4) {
            return { type: "suggestion", value: suggestions[index] };
          }
        }
      }
      const u = clamp((x - 12) / Math.max(1, width - 24), 0, 1);
      const v = clamp((y - originY) / Math.max(1, contentHeight), 0, 1);
      const hit = layout.find((key) => u >= key.x && u <= key.x + key.w && v >= key.y && v <= key.y + key.h);
      return hit ? { type: "key", value: hit.label } : null;
    };
  }
}
