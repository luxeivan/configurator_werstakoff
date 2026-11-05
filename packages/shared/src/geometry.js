export const GEOMETRY_EPSILON = 0.5;

export function buildRoomPolygon({
  shape = 'rect',
  widthCm,
  depthCm,
  legWidthCm,
  legDepthCm,
}) {
  const width = Number(widthCm);
  const depth = Number(depthCm);
  if (!(width > 0) || !(depth > 0)) return [];
  if (shape === 'l') {
    const legWidth = Math.min(Math.max(Number(legWidthCm) || width / 2, 1), width - 1);
    const legDepth = Math.min(Math.max(Number(legDepthCm) || depth / 2, 1), depth - 1);
    return [
      [0, 0],
      [width, 0],
      [width, legDepth],
      [legWidth, legDepth],
      [legWidth, depth],
      [0, depth],
    ];
  }
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
}

export function polygonArea(points) {
  if (!points?.length) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[(index + 1) % points.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points) {
  if (!points?.length) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[(index + 1) % points.length];
    total += Math.hypot(x2 - x1, z2 - z1);
  }
  return total;
}

export function polygonBounds(points) {
  if (!points?.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  return {
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
  };
}

export function pointInPolygon([x, z], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rotatePoint(x, z, angleDeg) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - z * sin, x * sin + z * cos];
}

export function obbCorners(item = {}) {
  const { x = 0, z = 0, rotationDeg = 0 } = item;
  // Позиции в проекте хранят габариты в product (snapshot каталога),
  // а расчётные кандидаты — на верхнем уровне.
  const widthCm = item.widthCm ?? item.product?.widthCm ?? 0;
  const depthCm = item.depthCm ?? item.product?.depthCm ?? 0;
  const halfW = Number(widthCm) / 2;
  const halfD = Number(depthCm) / 2;
  return [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ].map(([px, pz]) => {
    const [rx, rz] = rotatePoint(px, pz, rotationDeg);
    return [x + rx, z + rz];
  });
}

function axesOf(points) {
  const axes = [];
  for (let index = 0; index < points.length; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[(index + 1) % points.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz) || 1;
    axes.push([-dz / length, dx / length]);
  }
  return axes;
}

function project(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of points) {
    const value = x * axis[0] + z * axis[1];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

export function obbOverlap(a, b, tolerance = GEOMETRY_EPSILON) {
  const pointsA = obbCorners(a);
  const pointsB = obbCorners(b);
  const axes = [...axesOf(pointsA), ...axesOf(pointsB)];
  for (const axis of axes) {
    const [minA, maxA] = project(pointsA, axis);
    const [minB, maxB] = project(pointsB, axis);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= tolerance) return false;
  }
  return true;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], b[0]) - GEOMETRY_EPSILON <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) + GEOMETRY_EPSILON &&
    Math.min(a[1], b[1]) - GEOMETRY_EPSILON <= c[1] &&
    c[1] <= Math.max(a[1], b[1]) + GEOMETRY_EPSILON
  );
}

export function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) <= 1e-9 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) <= 1e-9 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) <= 1e-9 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) <= 1e-9 && onSegment(c, d, b)) return true;
  return false;
}

function pointOnPolygonBoundary(point, polygon, tolerance) {
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (distanceToSegment(point, a, b) <= tolerance) return true;
  }
  return false;
}

export function obbOutsideRoom(corners, polygon, tolerance = GEOMETRY_EPSILON) {
  if (
    corners.some(
      (corner) =>
        !pointInPolygon(corner, polygon) &&
        !pointOnPolygonBoundary(corner, polygon, tolerance),
    )
  ) {
    return true;
  }
  // Дополнительно проверяем точки вдоль рёбер: для Г-образной комнаты
  // предмет может пересекать вырез, хотя все его углы лежат внутри.
  const samples = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (const t of samples) {
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (
        !pointInPolygon(point, polygon) &&
        !pointOnPolygonBoundary(point, polygon, tolerance)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function snapValue(value, step) {
  const numericStep = Number(step);
  if (!(numericStep > 0)) return Number(value) || 0;
  return Math.round(Number(value) / numericStep) * numericStep;
}

export function normalizeAngle(value) {
  let angle = Number(value) || 0;
  angle %= 360;
  if (angle < 0) angle += 360;
  return angle;
}

export function distanceToSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (!lengthSq) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function findRoomCollision(item, polygon, tolerance = GEOMETRY_EPSILON) {
  const corners = obbCorners(item);
  return obbOutsideRoom(corners, polygon, tolerance) ? 'OUTSIDE_ROOM' : null;
}

export function findItemCollisions(items, tolerance = GEOMETRY_EPSILON) {
  const collisions = new Set();
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (obbOverlap(items[i], items[j], tolerance)) {
        collisions.add(items[i].id);
        collisions.add(items[j].id);
      }
    }
  }
  return collisions;
}

/**
 * Проверяет, можно ли поставить item в предложенную позицию.
 * Возвращает null, если место свободно, иначе OUTSIDE_ROOM или ITEM_OVERLAP.
 */
export function findPlacementConflict(item, items = [], polygon = [], tolerance = GEOMETRY_EPSILON) {
  if (polygon?.length && findRoomCollision(item, polygon, tolerance)) return 'OUTSIDE_ROOM';
  for (const other of items) {
    if (other.id === item.id) continue;
    if (obbOverlap(item, other, tolerance)) return 'ITEM_OVERLAP';
  }
  return null;
}

/**
 * Максимально близкая к `to` свободная позиция на отрезке от `from` до `to`.
 * Нужна, чтобы предмет останавливался вплотную к стене/другому предмету,
 * а не за несколько сантиметров до него.
 */
export function findPlacementContact(from, to, items = [], polygon = [], steps = 14) {
  let free = 0;
  let blocked = 1;
  for (let index = 0; index < steps; index += 1) {
    const t = (free + blocked) / 2;
    const candidate = {
      ...to,
      x: Number(from.x) + (Number(to.x) - Number(from.x)) * t,
      z: Number(from.z) + (Number(to.z) - Number(from.z)) * t,
    };
    if (findPlacementConflict(candidate, items, polygon)) blocked = t;
    else free = t;
  }
  return {
    x: Number(from.x) + (Number(to.x) - Number(from.x)) * free,
    z: Number(from.z) + (Number(to.z) - Number(from.z)) * free,
  };
}

export function findFreePlacement(product, polygon, items, stepCm = 10) {
  const bounds = polygonBounds(polygon);
  const width = Number(product.widthCm);
  const depth = Number(product.depthCm);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  const maxRadius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const startX = snapValue(center.x, stepCm);
  const startZ = snapValue(center.z, stepCm);

  function fits(x, z) {
    const candidate = { id: '__candidate__', x, z, widthCm: width, depthCm: depth, rotationDeg: 0 };
    if (findRoomCollision(candidate, polygon)) return false;
    return !items.some((item) => obbOverlap(candidate, item, GEOMETRY_EPSILON));
  }

  if (fits(startX, startZ)) return { x: startX, z: startZ };

  for (let radius = stepCm; radius <= maxRadius; radius += stepCm) {
    const offsets = [];
    for (let offset = -radius; offset <= radius; offset += stepCm) {
      offsets.push([offset, -radius], [offset, radius], [-radius, offset], [radius, offset]);
    }
    for (const [dx, dz] of offsets) {
      const x = snapValue(startX + dx, stepCm);
      const z = snapValue(startZ + dz, stepCm);
      if (fits(x, z)) return { x, z };
    }
  }

  return { x: startX, z: startZ };
}

export function nearestWallSnap(item, polygon, thresholdCm = 8) {
  const center = [item.x, item.z];
  let best = null;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const distance = distanceToSegment(center, a, b);
    if (distance <= thresholdCm && (!best || distance < best.distance)) {
      best = { distance, a, b };
    }
  }
  return best;
}

/**
 * Стена обращена наружу к камере (её нужно скрыть, чтобы видеть сцену).
 * normal — внешняя нормаль стены в плоскости XZ.
 */
export function isWallFacingCamera(camera, center, normal, threshold = 1) {
  const dx = Number(camera?.[0] || 0) - Number(center?.[0] || 0);
  const dz = Number(camera?.[1] || 0) - Number(center?.[1] || 0);
  return dx * Number(normal?.[0] || 0) + dz * Number(normal?.[1] || 0) > threshold;
}
