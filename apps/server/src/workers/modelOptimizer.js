import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs/promises';
import { MeshoptSimplifier } from 'meshoptimizer';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_TYPES = {
  5120: { size: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  5121: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  5122: { size: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  5123: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  5125: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  5126: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
};

function report(progress, stage) {
  parentPort?.postMessage({ type: 'progress', progress, stage });
}

function parseStl(buffer) {
  if (buffer.length >= 84) {
    const triangles = buffer.readUInt32LE(80);
    if (84 + triangles * 50 === buffer.length) {
      const positions = new Float64Array(triangles * 9);
      for (let index = 0; index < triangles; index += 1) {
        const base = 84 + index * 50 + 12;
        for (let vertex = 0; vertex < 3; vertex += 1) {
          const offset = base + vertex * 12;
          positions[index * 9 + vertex * 3] = buffer.readFloatLE(offset);
          positions[index * 9 + vertex * 3 + 1] = buffer.readFloatLE(offset + 4);
          positions[index * 9 + vertex * 3 + 2] = buffer.readFloatLE(offset + 8);
        }
      }
      return positions;
    }
  }
  const text = buffer.toString('utf8');
  if (!/facet\s+normal/i.test(text)) throw new Error('STL повреждён или имеет неподдерживаемый формат');
  const values = [...text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)]
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
  if (!values.length) throw new Error('В STL не найдены вершины');
  return new Float64Array(values.flat());
}

function readGlb(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Файл не является GLB');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error('Поддерживается только GLB версии 2');
  const length = buffer.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    if (chunkType === 'JSON') json = JSON.parse(buffer.toString('utf8', start, start + chunkLength));
    if (chunkType === 'BIN\0') binary = buffer.subarray(start, start + chunkLength);
    offset = start + chunkLength;
  }
  if (!json || !binary) throw new Error('В GLB отсутствует JSON или BIN-блок');
  return { json, binary };
}

function accessorValues(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error('Повреждён accessor GLB');
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error('Повреждён bufferView GLB');
  const component = COMPONENT_TYPES[accessor.componentType];
  const components = COMPONENTS[accessor.type];
  if (!component || !components) throw new Error('Неподдерживаемый тип данных GLB');
  const stride = view.byteStride || component.size * components;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const result = new Float64Array(accessor.count * components);
  for (let index = 0; index < accessor.count; index += 1) {
    for (let part = 0; part < components; part += 1) {
      result[index * components + part] = component.read(binary, base + index * stride + part * component.size);
    }
  }
  return result;
}

function multiply(a, b) {
  const out = new Float64Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      out[row * 4 + column] =
        a[row * 4] * b[column] +
        a[row * 4 + 1] * b[4 + column] +
        a[row * 4 + 2] * b[8 + column] +
        a[row * 4 + 3] * b[12 + column];
    }
  }
  return out;
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return Float64Array.from([
    (1 - 2 * (yy + zz)) * sx, 2 * (xy - wz) * sx, 2 * (xz + wy) * sx, 0,
    2 * (xy + wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz - wx) * sy, 0,
    2 * (xz - wy) * sz, 2 * (yz + wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function transformPosition(position, matrix) {
  const [x, y, z] = position;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function parseGlb(buffer) {
  const { json, binary } = readGlb(buffer);
  const positions = [];
  const matrices = new Map();
  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const matrix = multiply(parentMatrix, nodeMatrix(node));
    matrices.set(nodeIndex, matrix);
    for (const child of node.children || []) visit(child, matrix);
  };
  const scene = json.scenes?.[json.scene || 0];
  for (const root of scene?.nodes || []) visit(root, identity);
  if (!scene?.nodes && json.nodes) json.nodes.forEach((_, index) => visit(index, identity));

  for (const [nodeIndex, matrix] of matrices) {
    const node = json.nodes[nodeIndex];
    if (node.mesh === undefined) continue;
    const mesh = json.meshes?.[node.mesh];
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const source = accessorValues(json, binary, primitive.attributes?.POSITION);
      for (let index = 0; index < source.length; index += 3) {
        positions.push(...transformPosition([source[index], source[index + 1], source[index + 2]], matrix));
      }
    }
  }
  if (!positions.length) throw new Error('В GLB не найдена полигональная геометрия');
  return new Float64Array(positions);
}

function weld(flat) {
  const unique = [];
  const indices = [];
  const map = new Map();
  const precision = 1000;
  for (let index = 0; index < flat.length; index += 3) {
    const point = [flat[index], flat[index + 1], flat[index + 2]];
    const key = point.map((value) => Math.round(value * precision)).join(',');
    let target = map.get(key);
    if (target === undefined) {
      target = unique.length / 3;
      map.set(key, target);
      unique.push(...point);
    }
    indices.push(target);
  }
  return { positions: new Float32Array(unique), indices: new Uint32Array(indices) };
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const vertex of [a, b, c]) {
      normals[vertex] += nx;
      normals[vertex + 1] += ny;
      normals[vertex + 2] += nz;
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return normals;
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max };
}

function pad(buffer, byte, alignment = 4) {
  const remainder = buffer.length % alignment;
  if (!remainder) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(alignment - remainder, byte)]);
}

function writeGlb(positions, normals, indices) {
  const positionBuffer = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const normalBuffer = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
  const indexBuffer = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
  const box = bounds(positions);
  const json = {
    asset: { version: '2.0', generator: 'iron-planner optimizer' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.62, 0.67, 0.73, 1],
        metallicFactor: 0.25,
        roughnessFactor: 0.65,
      },
    }],
    buffers: [{ byteLength: positionBuffer.length + normalBuffer.length + indexBuffer.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: positionBuffer.length, byteLength: normalBuffer.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBuffer.length + normalBuffer.length,
        byteLength: indexBuffer.length,
        target: 34963,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: box.min, max: box.max },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };
  const binary = Buffer.concat([positionBuffer, normalBuffer, indexBuffer]);
  const jsonBuffer = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binBuffer = pad(binary, 0);
  const total = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer]);
}

async function run() {
  const { inputPath, outputPath, targetTriangles } = workerData;
  const extension = String(inputPath).toLowerCase().split('.').pop();
  const buffer = await fs.readFile(inputPath);
  report(10, 'Чтение модели');
  const flat = extension === 'glb' ? parseGlb(buffer) : parseStl(buffer);
  report(30, 'Сварка вершин');
  const welded = weld(flat);
  if (welded.indices.length % 3 !== 0) throw new Error('Геометрия не состоит из треугольников');
  const sourceTriangles = welded.indices.length / 3;
  report(45, 'Упрощение сетки');
  await MeshoptSimplifier.ready;
  const requested = Math.max(100, Math.floor(Number(targetTriangles) || 50000));
  const targetIndexCount = Math.min(welded.indices.length, requested * 3);
  let indices = welded.indices;
  if (targetIndexCount < welded.indices.length) {
    const [simplified] = MeshoptSimplifier.simplify(
      welded.indices,
      welded.positions,
      3,
      targetIndexCount,
      0.02,
    );
    indices = simplified;
  }
  report(75, 'Нормали и упаковка GLB');
  const normals = computeNormals(welded.positions, indices);
  const output = writeGlb(welded.positions, normals, indices);
  await fs.writeFile(outputPath, output);
  report(100, 'Готово');
  parentPort?.postMessage({
    type: 'done',
    sourceTriangles,
    resultTriangles: indices.length / 3,
    sizeBytes: output.length,
  });
}

run().catch((error) => {
  parentPort?.postMessage({ type: 'error', message: error.message || 'Ошибка оптимизации' });
});
