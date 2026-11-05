import { layoutLabelLines, polygonBounds } from '@planner/shared';

export function renderPlanToCanvas(room, items, { width = 2400, height = 1600, background = '#ffffff' } = {}) {
  if (typeof document === 'undefined') return null;
  const polygon = room?.polygon || [];
  const bounds = polygonBounds(polygon);
  const roomWidth = Math.max(1, bounds.maxX - bounds.minX);
  const roomDepth = Math.max(1, bounds.maxZ - bounds.minZ);
  const padding = 140;
  const scale = Math.min((width - padding * 2) / roomWidth, (height - padding * 2) / roomDepth);
  const offsetX = (width - roomWidth * scale) / 2;
  const offsetY = (height - roomDepth * scale) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const project = ([x, z]) => [offsetX + (x - bounds.minX) * scale, offsetY + (z - bounds.minZ) * scale];

  // Grid
  ctx.strokeStyle = '#e8edf3';
  ctx.lineWidth = 1;
  const step = 50;
  for (let x = Math.floor(bounds.minX / step) * step; x <= bounds.maxX; x += step) {
    const [px] = project([x, 0]);
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + roomDepth * scale);
    ctx.stroke();
  }
  for (let z = Math.floor(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) {
    const [, py] = project([0, z]);
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + roomWidth * scale, py);
    ctx.stroke();
  }

  // Room
  ctx.beginPath();
  polygon.forEach(([x, z], index) => {
    const [px, py] = project([x, z]);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Items
  for (const item of items || []) {
    const product = item.product || {};
    const w = Number(product.widthCm) * scale;
    const d = Number(product.depthCm) * scale;
    const [x, z] = project([item.x, item.z]);
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(((Number(item.rotationDeg) || 0) * Math.PI) / 180);
    ctx.fillStyle = '#dbeafe';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 4;
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.fillStyle = '#1e3a8a';
    const labelMaxHeight = Math.max(7, d - 12);
    const labelFontSize = Math.max(7, Math.min(22, labelMaxHeight / 1.2));
    ctx.font = `600 ${labelFontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = labelFontSize * 1.15;
    const labelLines = layoutLabelLines(product.name || 'Товар', {
      maxWidth: Math.max(40, w - 12),
      maxHeight: labelMaxHeight,
      fontSize: labelFontSize,
      lineHeight,
      measureText: (line) => ctx.measureText(line).width,
    });
    const labelStartY = -((labelLines.length - 1) * lineHeight) / 2;
    labelLines.forEach((line, index) => {
      ctx.fillText(line, 0, labelStartY + index * lineHeight);
    });
    ctx.restore();
  }

  // Dimensions
  ctx.fillStyle = '#334155';
  ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  const top = project([0, bounds.minZ])[1] - 50;
  ctx.fillText(`${roomWidth} см`, width / 2, Math.max(40, top));
  ctx.save();
  ctx.translate(50, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${roomDepth} см`, 0, 0);
  ctx.restore();

  return canvas;
}
