import { describe, expect, it } from 'vitest';
import { projectSignature } from './signature.js';

describe('projectSignature', () => {
  const room = {
    polygon: [
      [0, 0],
      [420, 0],
      [420, 160],
      [180, 160],
      [180, 360],
      [0, 360],
    ],
  };
  const item = (id, x, z, rotationDeg, quantity = 1) => ({
    id,
    product: { publicId: id },
    x,
    z,
    rotationDeg,
    quantity,
  });

  it('учитывает полигон комнаты', () => {
    const a = projectSignature(room, [item('p1', 100, 80, 0)]);
    const b = projectSignature({ polygon: [[0, 0], [300, 0], [300, 300], [0, 300]] }, [item('p1', 100, 80, 0)]);
    expect(a).not.toBe(b);
  });

  it('не зависит от порядка предметов', () => {
    const a = projectSignature(room, [item('p1', 100, 80, 0), item('p2', 200, 90, 15)]);
    const b = projectSignature(room, [item('p2', 200, 90, 15), item('p1', 100, 80, 0)]);
    expect(a).toBe(b);
  });

  it('меняется при изменении расстановки', () => {
    const a = projectSignature(room, [item('p1', 100, 80, 0)]);
    const b = projectSignature(room, [item('p1', 110, 80, 0)]);
    const c = projectSignature(room, [item('p1', 100, 80, 90)]);
    const d = projectSignature(room, [item('p1', 100, 80, 0, 2)]);
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('корректно обрабатывает пустой проект', () => {
    expect(projectSignature(null, [])).toBe('||');
  });
});
