import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, formatMoney } from './index.js';

describe('shared helpers', () => {
  it('contains all order statuses', () => {
    expect(ORDER_STATUSES).toContain('submitted');
    expect(ORDER_STATUSES).toContain('done');
  });

  it('formats rubles from kopecks', () => {
    expect(formatMoney(1234500)).toMatch(/12\s?345/);
  });
});

import {
  buildRoomPolygon,
  findFreePlacement,
  obbOverlap,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  findPlacementConflict,
  findPlacementContact,
  findRoomCollision,
  findItemCollisions,
  isWallFacingCamera,
} from './geometry.js';
import { calculateTotals, itemUnitPrice, optionDelta } from './pricing.js';

describe('room geometry', () => {
  it('строит прямоугольник и L-форму', () => {
    expect(buildRoomPolygon({ shape: 'rect', widthCm: 420, depthCm: 360 })).toHaveLength(4);
    expect(buildRoomPolygon({ shape: 'l', widthCm: 420, depthCm: 360, legWidthCm: 180, legDepthCm: 160 })).toHaveLength(6);
  });

  it('считает площадь и периметр', () => {
    const rect = buildRoomPolygon({ shape: 'rect', widthCm: 420, depthCm: 360 });
    expect(polygonArea(rect) / 10000).toBeCloseTo(15.12, 2);
    expect(polygonPerimeter(rect) / 100).toBeCloseTo(15.6, 2);
    const l = buildRoomPolygon({ shape: 'l', widthCm: 420, depthCm: 360, legWidthCm: 180, legDepthCm: 160 });
    expect(polygonArea(l) / 10000).toBeCloseTo(10.32, 2);
  });

  it('проверяет точку и выход OBB за комнату', () => {
    const l = buildRoomPolygon({ shape: 'l', widthCm: 420, depthCm: 360, legWidthCm: 180, legDepthCm: 160 });
    expect(pointInPolygon([100, 100], l)).toBe(true);
    expect(pointInPolygon([300, 300], l)).toBe(false);
    expect(findRoomCollision({ x: 100, z: 100, widthCm: 50, depthCm: 50, rotationDeg: 0 }, l)).toBeNull();
    expect(findRoomCollision({ x: 10, z: 10, widthCm: 50, depthCm: 50, rotationDeg: 0 }, l)).toBe('OUTSIDE_ROOM');
  });

  it('находит пересечение двух OBB', () => {
    expect(obbOverlap(
      { x: 100, z: 100, widthCm: 50, depthCm: 50, rotationDeg: 0 },
      { x: 120, z: 120, widthCm: 50, depthCm: 50, rotationDeg: 0 },
    )).toBe(true);
    expect(obbOverlap(
      { x: 100, z: 100, widthCm: 50, depthCm: 50, rotationDeg: 0 },
      { x: 300, z: 300, widthCm: 50, depthCm: 50, rotationDeg: 0 },
    )).toBe(false);
  });

  it('подбирает свободное место', () => {
    const room = buildRoomPolygon({ shape: 'rect', widthCm: 420, depthCm: 360 });
    const existing = [{ id: 'a', x: 210, z: 180, widthCm: 100, depthCm: 100, rotationDeg: 0 }];
    const placement = findFreePlacement({ widthCm: 50, depthCm: 50 }, room, existing, 10);
    expect(findRoomCollision({ ...placement, widthCm: 50, depthCm: 50, rotationDeg: 0 }, room)).toBeNull();
  });
});

describe('pricing', () => {
  const product = {
    priceKopecks: 100000,
    options: [
      { propertyId: 1, propertyName: 'Цвет', values: [{ paramId: 10, label: 'RAL 7016', priceDeltaKopecks: 5000 }] },
    ],
  };

  it('считает доплату опции', () => {
    expect(optionDelta(product, [{ propertyId: 1, paramId: 10 }]).delta).toBe(5000);
    expect(itemUnitPrice(product, [{ propertyId: 1, paramId: 10 }])).toBe(105000);
  });

  it('считает НДС включённый и сверху', () => {
    const items = [{ unitPriceKopecks: 120000, quantity: 1 }];
    expect(calculateTotals(items, { vatMode: 'included', vatRate: 20 })).toMatchObject({
      subtotalKopecks: 120000,
      vatKopecks: 20000,
      totalKopecks: 120000,
    });
    expect(calculateTotals(items, { vatMode: 'added', vatRate: 20 })).toMatchObject({
      subtotalKopecks: 120000,
      vatKopecks: 24000,
      totalKopecks: 144000,
    });
  });
});

describe('wall visibility', () => {
  it('скрывает переднюю стену и оставляет заднюю', () => {
    // Комната 420×360, камера перед ней (+Z).
    expect(isWallFacingCamera([210, 700], [210, 360], [0, 1])).toBe(true);
    expect(isWallFacingCamera([210, 700], [210, 0], [0, -1])).toBe(false);
    // Камера справа (+X): правая стена скрыта, левая видна.
    expect(isWallFacingCamera([900, 180], [420, 180], [1, 0])).toBe(true);
    expect(isWallFacingCamera([900, 180], [0, 180], [-1, 0])).toBe(false);
  });

  it('внутри комнаты стены не скрываются', () => {
    expect(isWallFacingCamera([210, 180], [210, 360], [0, 1])).toBe(false);
    expect(isWallFacingCamera([210, 180], [210, 0], [0, -1])).toBe(false);
  });
});


describe('collision prevention', () => {
  const room = buildRoomPolygon({ shape: 'rect', widthCm: 420, depthCm: 360 });

  it('понимает габариты из product snapshot', () => {
    const items = [
      { id: 'a', x: 100, z: 100, rotationDeg: 0, product: { widthCm: 50, depthCm: 80 } },
      { id: 'b', x: 120, z: 100, rotationDeg: 0, product: { widthCm: 50, depthCm: 80 } },
    ];
    expect(findItemCollisions(items).size).toBe(2);
  });

  it('блокирует пересечение и выход из комнаты', () => {
    const items = [
      { id: 'a', x: 100, z: 100, rotationDeg: 0, product: { widthCm: 50, depthCm: 80 } },
      { id: 'b', x: 250, z: 250, rotationDeg: 0, product: { widthCm: 50, depthCm: 80 } },
    ];
    expect(findPlacementConflict({ ...items[0], x: 260, z: 250 }, items, room)).toBe('ITEM_OVERLAP');
    expect(findPlacementConflict({ ...items[0], x: 5, z: 5 }, items, room)).toBe('OUTSIDE_ROOM');
    expect(findPlacementConflict({ ...items[0], x: 100, z: 260 }, items, room)).toBeNull();
  });
});


describe('flush placement and contact', () => {
  const room = buildRoomPolygon({ shape: 'rect', widthCm: 420, depthCm: 360 });

  it('разрешает предмет вплотную к стене', () => {
    expect(findRoomCollision({ x: 395, z: 180, widthCm: 50, depthCm: 80, rotationDeg: 0 }, room)).toBeNull();
    expect(findRoomCollision({ x: 420, z: 180, widthCm: 50, depthCm: 80, rotationDeg: 0 }, room)).not.toBeNull();
  });

  it('разрешает касание и подводит к контакту без зазора', () => {
    const fixed = { id: 'a', x: 100, z: 100, widthCm: 50, depthCm: 80, rotationDeg: 0 };
    const touching = { id: 'b', x: 150, z: 100, widthCm: 50, depthCm: 80, rotationDeg: 0 };
    expect(findPlacementConflict(touching, [fixed], room)).toBeNull();

    const overlapping = { ...touching, x: 130 };
    expect(findPlacementConflict(overlapping, [fixed], room)).toBe('ITEM_OVERLAP');
    const contact = findPlacementContact({ x: 200, z: 100 }, overlapping, [fixed], room);
    expect(contact.x).toBeGreaterThan(149.5);
    expect(contact.x).toBeLessThan(150.5);
  });
});
