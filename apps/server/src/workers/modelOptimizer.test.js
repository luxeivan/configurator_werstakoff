import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sample = path.join(root, 'models', 'Тележка PRF-E.stl');
const workerPath = fileURLToPath(new URL('./modelOptimizer.js', import.meta.url));

function optimize(inputPath, outputPath, targetTriangles) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { inputPath, outputPath, targetTriangles } });
    worker.on('message', (message) => {
      if (message.type === 'done') resolve(message);
      if (message.type === 'error') reject(new Error(message.message));
    });
    worker.on('error', reject);
  });
}

describe.skipIf(!existsSync(sample))('model optimizer worker', () => {
  it('упрощает STL и упаковывает корректный GLB', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-model-'));
    const output = path.join(dir, 'optimized.glb');
    try {
      const result = await optimize(sample, output, 5000);
      expect(result.sourceTriangles).toBeGreaterThan(100000);
      expect(result.resultTriangles).toBeLessThanOrEqual(5000);
      const buffer = readFileSync(output);
      expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
      expect(buffer.readUInt32LE(8)).toBe(buffer.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
