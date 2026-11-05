/**
 * Подпись проекта (комната + расстановка) для проверки актуальности
 * сохранённого рендера 3D перед использованием в заказе/PDF.
 * Если комната или мебель изменились — рендер считается устаревшим.
 */
export function projectSignature(room, items) {
  const polygon = Array.isArray(room?.polygon) ? room.polygon : [];
  const roomSig = polygon
    .map((point) => (Array.isArray(point) ? point.map((v) => Math.round(Number(v) || 0)).join(',') : ''))
    .join('|');
  const itemSig = (Array.isArray(items) ? items : [])
    .map((item) => {
      const product = item.product || {};
      return `${product.publicId || product.id || ''}@${Math.round(Number(item.x) || 0)},${Math.round(
        Number(item.z) || 0,
      )},${Math.round(Number(item.rotationDeg) || 0)}:${Number(item.quantity) || 1}`;
    })
    .sort()
    .join(';');
  return `${roomSig}||${itemSig}`;
}
