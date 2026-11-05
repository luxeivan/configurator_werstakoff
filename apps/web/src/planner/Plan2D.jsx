import { useMemo, useRef, useState } from 'react';
import {
  findItemCollisions,
  findPlacementConflict,
  findPlacementContact,
  findRoomCollision,
  layoutLabelLines,
  normalizeAngle,
  polygonBounds,
  snapValue,
} from '@planner/shared';

function clampToRoom(x, z, item, polygon) {
  const bounds = polygonBounds(polygon);
  const angle = normalizeAngle(item.rotationDeg);
  const w = Number(item.product?.widthCm) || 0;
  const d = Number(item.product?.depthCm) || 0;
  const axisAligned = angle % 180 === 0;
  const halfW = (axisAligned ? w : d) / 2;
  const halfD = (axisAligned ? d : w) / 2;
  return {
    x: Math.min(Math.max(x, bounds.minX + halfW), bounds.maxX - halfW),
    z: Math.min(Math.max(z, bounds.minZ + halfD), bounds.maxZ - halfD),
  };
}

export default function Plan2D({
  room,
  items,
  selectedIds,
  onSelect,
  onUpdateItem,
  onCommitItems,
  gridStep = 5,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, z: 0 });

  const polygon = room?.polygon || [];
  const bounds = useMemo(() => polygonBounds(polygon), [polygon]);
  const roomWidth = Math.max(1, bounds.maxX - bounds.minX);
  const roomDepth = Math.max(1, bounds.maxZ - bounds.minZ);
  const padding = 32;
  const visibleWidth = (roomWidth + padding * 2) / zoom;
  const visibleDepth = (roomDepth + padding * 2) / zoom;
  const viewBox = `${bounds.minX - padding / zoom + pan.x} ${bounds.minZ - padding / zoom + pan.z} ${visibleWidth} ${visibleDepth}`;

  const collisionIds = useMemo(() => {
    const ids = new Set();
    for (const item of items) {
      if (findRoomCollision(item, polygon)) ids.add(item.id);
    }
    for (const id of findItemCollisions(items)) ids.add(id);
    return ids;
  }, [items, polygon]);

  function worldPoint(event) {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    return [local.x, local.y];
  }

  function startItemDrag(event, item) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect(item.id, event.shiftKey);
    if (item.locked) return;
    const [x, z] = worldPoint(event);
    dragRef.current = {
      id: item.id,
      item,
      start: [x, z],
      startX: item.x,
      startZ: item.z,
      before: items,
      moved: false,
      blocked: Boolean(findPlacementConflict(item, items, polygon)),
      lastX: item.x,
      lastZ: item.z,
      pointerId: event.pointerId,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function startPan(event) {
    if (event.button !== 0 || dragRef.current) return;
    const svg = svgRef.current;
    const scaleX = svg ? visibleWidth / Math.max(1, svg.clientWidth) : 1;
    const scaleZ = svg ? visibleDepth / Math.max(1, svg.clientHeight) : 1;
    panRef.current = {
      startClient: [event.clientX, event.clientY],
      pan,
      scale: [scaleX, scaleZ],
      moved: false,
      pointerId: event.pointerId,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current && panRef.current) {
      const panState = panRef.current;
      const dx = (event.clientX - panState.startClient[0]) * panState.scale[0];
      const dz = (event.clientY - panState.startClient[1]) * panState.scale[1];
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) panState.moved = true;
      setPan({ x: panState.pan.x - dx, z: panState.pan.z - dz });
      return;
    }
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const [x, z] = worldPoint(event);
    const dx = x - drag.start[0];
    const dz = z - drag.start[1];
    if (Math.abs(dx) > 0.4 || Math.abs(dz) > 0.4) drag.moved = true;
    const snapped = clampToRoom(
      snapValue(drag.startX + dx, gridStep),
      snapValue(drag.startZ + dz, gridStep),
      drag.item,
      polygon,
    );
    const candidate = { ...drag.item, x: snapped.x, z: snapped.z };
    const conflict = findPlacementConflict(candidate, items, polygon);
    let nextX = snapped.x;
    let nextZ = snapped.z;
    if (conflict && !drag.blocked) {
      // Не откатываемся на 5 см назад, а подходим вплотную к препятствию.
      const contact = findPlacementContact(
        { x: drag.lastX, z: drag.lastZ },
        candidate,
        items,
        polygon,
      );
      nextX = contact.x;
      nextZ = contact.z;
    } else if (!conflict) {
      drag.blocked = false;
    } else {
      drag.blocked = true;
    }
    drag.lastX = nextX;
    drag.lastZ = nextZ;
    onUpdateItem(drag.id, { x: nextX, z: nextZ });
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (drag) {
      if (drag.moved) onCommitItems(drag.before);
      dragRef.current = null;
    }
    panRef.current = null;
  }

  function handleWheel(event) {
    event.preventDefault();
    const next = Math.min(6, Math.max(0.35, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    setZoom(next);
  }

  if (!room) return <div className="plan-empty">Сначала создайте помещение</div>;

  return (
    <div className="plan2d">
      <div className="plan-tools">
        <button type="button" className="button button-ghost button-small" onClick={() => { setZoom(1); setPan({ x: 0, z: 0 }); }}>
          Вписать
        </button>
        <button type="button" className="button button-ghost button-small" onClick={() => setZoom((v) => Math.min(6, v * 1.2))}>+</button>
        <button type="button" className="button button-ghost button-small" onClick={() => setZoom((v) => Math.max(0.35, v / 1.2))}>−</button>
        <span className="badge">{Math.round(zoom * 100)}%</span>
      </div>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={viewBox}
        onWheel={handleWheel}
        onPointerDown={startPan}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="img"
        aria-label="План помещения"
      >
        <defs>
          <pattern id="plan-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" strokeWidth="0.12" />
          </pattern>
          <pattern id="plan-grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#cbd5e1" strokeWidth="0.18" />
          </pattern>
        </defs>

        <rect
          x={bounds.minX - 1000}
          y={bounds.minZ - 1000}
          width={roomWidth + 2000}
          height={roomDepth + 2000}
          fill="#fbfcfe"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onSelect(null);
          }}
        />
        <rect
          x={bounds.minX}
          y={bounds.minZ}
          width={roomWidth}
          height={roomDepth}
          fill="url(#plan-grid)"
          pointerEvents="none"
        />
        <rect
          x={bounds.minX}
          y={bounds.minZ}
          width={roomWidth}
          height={roomDepth}
          fill="url(#plan-grid-major)"
          pointerEvents="none"
        />
        <polygon
          points={polygon.map(([x, z]) => `${x},${z}`).join(' ')}
          fill="rgba(29, 78, 216, 0.035)"
          stroke="#0f172a"
          strokeWidth="1.2"
          strokeLinejoin="round"
          pointerEvents="none"
        />

        {items.map((item, itemIndex) => {
          const product = item.product || {};
          const width = Number(product.widthCm) || 0;
          const depth = Number(product.depthCm) || 0;
          const selected = selectedIds.includes(item.id);
          const collision = collisionIds.has(item.id);
          const labelMaxHeight = Math.max(1.2, depth - 1.5);
          const labelFontSize = Math.max(1.2, Math.min(6, labelMaxHeight / 1.2));
          const labelLineHeight = labelFontSize * 1.2;
          const labelLines = layoutLabelLines(product.name || 'Товар', {
            maxWidth: Math.max(4, width - 2),
            maxHeight: labelMaxHeight,
            fontSize: labelFontSize,
            lineHeight: labelLineHeight,
          });
          const labelStartY = -((labelLines.length - 1) * labelLineHeight) / 2;
          return (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.z}) rotate(${item.rotationDeg || 0})`}
              className="plan-item"
              onPointerDown={(event) => startItemDrag(event, item)}
              style={{ cursor: item.locked ? 'not-allowed' : 'grab' }}
            >
              <rect
                x={-width / 2}
                y={-depth / 2}
                width={width}
                height={depth}
                rx="1"
                fill={collision ? '#fee2e2' : selected ? '#dbeafe' : '#eef4ff'}
                stroke={collision ? '#dc2626' : selected ? '#1d4ed8' : '#64748b'}
                strokeWidth={selected ? '0.9' : '0.55'}
              />
              <line x1={-width / 2} y1={depth / 2} x2={width / 2} y2={depth / 2} stroke="#1d4ed8" strokeWidth="0.5" opacity="0.5" />
              <clipPath id={`plan-label-clip-${itemIndex}`}>
                <rect x={-width / 2} y={-depth / 2} width={width} height={depth} />
              </clipPath>
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={labelFontSize}
                fill={collision ? '#991b1b' : '#1e3a8a'}
                fontWeight="700"
                pointerEvents="none"
                clipPath={`url(#plan-label-clip-${itemIndex})`}
              >
                {labelLines.map((line, index) => (
                  <tspan
                    key={`${item.id}-label-${index}`}
                    x="0"
                    y={labelStartY + index * labelLineHeight}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
              <text textAnchor="middle" y={depth / 2 + 6.8} fontSize="4" fill="#475569" pointerEvents="none">
                {width} × {depth}
              </text>
              {item.locked && (
                <text textAnchor="middle" y={-depth / 2 - 4} fontSize="3.8" fill="#b45309" pointerEvents="none">
                  🔒
                </text>
              )}
            </g>
          );
        })}

        <g pointerEvents="none" fill="#475569" fontSize="3.5" fontWeight="600" textAnchor="middle">
          <line x1={bounds.minX} y1={bounds.minZ - 8} x2={bounds.maxX} y2={bounds.minZ - 8} stroke="#94a3b8" strokeWidth="0.4" />
          <text x={(bounds.minX + bounds.maxX) / 2} y={bounds.minZ - 11}>{roomWidth} см</text>
          <line x1={bounds.minX - 8} y1={bounds.minZ} x2={bounds.minX - 8} y2={bounds.maxZ} stroke="#94a3b8" strokeWidth="0.4" />
          <text transform={`translate(${bounds.minX - 12} ${(bounds.minZ + bounds.maxZ) / 2}) rotate(-90)`}>{roomDepth} см</text>
        </g>
      </svg>
      <div className="plan-legend">
        <span><i className="legend-dot room" /> помещение</span>
        <span><i className="legend-dot selected" /> выбрано</span>
        <span><i className="legend-dot collision" /> конфликт</span>
      </div>
    </div>
  );
}
