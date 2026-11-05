import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ROOM_DEFAULTS,
  buildRoomPolygon,
  findFreePlacement,
  findItemCollisions,
  findRoomCollision,
  formatCm,
  formatMoney,
  itemUnitPrice,
  polygonArea,
  polygonPerimeter,
  projectSignature,
} from '@planner/shared';
import { apiFetch, apiFetchFull } from '../lib/api.js';

const RENDER_PRESETS = [
  { id: 'economy', label: 'Эконом', passes: 3, bufferScale: 0.5 },
  { id: 'standard', label: 'Стандарт', passes: 6, bufferScale: 0.65 },
  { id: 'quality', label: 'Качество', passes: 10, bufferScale: 0.75 },
  { id: 'max', label: 'Максимум', passes: 16, bufferScale: 0.9 },
];
const RENDER_LOCAL_KEY = 'planner-render-settings';
const clampPasses = (value) => Math.min(16, Math.max(2, Number(value) || 6));
const clampScale = (value) => Math.min(1, Math.max(0.4, Number(value) || 0.65));
const clampSoft = (value) => Math.min(2, Math.max(0.5, Number(value) || 1));
const clampPost = (value) => Math.min(2, Math.max(0, Number(value) || 1));
import Plan2D from '../planner/Plan2D.jsx';
const Scene3D = lazy(() => import('../planner/Scene3D.jsx'));
import { usePlannerStore } from '../planner/usePlannerStore.js';

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flatten(node.children || [], depth + 1)]);
}

function defaultOptions(product) {
  return (product.options || []).flatMap((option) => {
    const value = (option.values || []).find((item) => item.isDefault) || (option.values || [])[0];
    return value ? [{ propertyId: option.propertyId, paramId: value.paramId }] : [];
  });
}

function emptyRoom() {
  return {
    shape: 'rect',
    widthCm: 420,
    depthCm: 360,
    legWidthCm: 180,
    legDepthCm: 160,
    ceilingHeightCm: ROOM_DEFAULTS.ceilingHeightCm,
  };
}

function RoomEditor({ initial, onSave, onCancel, title }) {
  const [form, setForm] = useState(() => ({ ...emptyRoom(), ...(initial || {}) }));
  const polygon = useMemo(() => buildRoomPolygon(form), [form]);
  const area = polygonArea(polygon) / 10000;
  const perimeter = polygonPerimeter(polygon) / 100;
  const invalid =
    !(Number(form.widthCm) > 0) ||
    !(Number(form.depthCm) > 0) ||
    (form.shape === 'l' &&
      (!(Number(form.legWidthCm) > 0) ||
        !(Number(form.legDepthCm) > 0) ||
        Number(form.legWidthCm) >= Number(form.widthCm) ||
        Number(form.legDepthCm) >= Number(form.depthCm)));

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <form
      className="card form room-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSave({ ...form, polygon });
      }}
    >
      <div className="hero compact room-editor-head">
        <div>
          <p className="eyebrow">Помещение</p>
          <h2>{title}</h2>
        </div>
        <span className="badge">
          {area.toFixed(2)} м² · {perimeter.toFixed(1)} м
        </span>
      </div>

      <div className="segmented" role="group" aria-label="Форма помещения">
        <button
          type="button"
          className={form.shape === 'rect' ? 'seg active' : 'seg'}
          onClick={() => field('shape', 'rect')}
        >
          Прямоугольное
        </button>
        <button
          type="button"
          className={form.shape === 'l' ? 'seg active' : 'seg'}
          onClick={() => field('shape', 'l')}
        >
          Г-образное
        </button>
      </div>

      <div className="grid2">
        <label>
          Ширина, см
          <input
            type="number"
            min="50"
            value={form.widthCm}
            onChange={(event) => field('widthCm', event.target.value)}
          />
        </label>
        <label>
          Глубина, см
          <input
            type="number"
            min="50"
            value={form.depthCm}
            onChange={(event) => field('depthCm', event.target.value)}
          />
        </label>
        {form.shape === 'l' && (
          <>
            <label>
              Ширина вертикальной части, см
              <input
                type="number"
                min="1"
                value={form.legWidthCm}
                onChange={(event) => field('legWidthCm', event.target.value)}
              />
            </label>
            <label>
              Глубина горизонтальной части, см
              <input
                type="number"
                min="1"
                value={form.legDepthCm}
                onChange={(event) => field('legDepthCm', event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Высота потолка, см
          <input
            type="number"
            min="150"
            value={form.ceilingHeightCm}
            onChange={(event) => field('ceilingHeightCm', event.target.value)}
          />
        </label>
      </div>

      {invalid && (
        <div className="alert alert-error">
          Проверьте размеры: для Г-формы выступы должны быть меньше сторон.
        </div>
      )}

      <div className="actions">
        <button className="button" type="submit" disabled={invalid}>
          Применить
        </button>
        {onCancel && (
          <button className="button button-ghost" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

export default function PlannerPage() {
  const navigate = useNavigate();
  const room = usePlannerStore((state) => state.room);
  const items = usePlannerStore((state) => state.items);
  const selectedIds = usePlannerStore((state) => state.selectedIds);
  const setRoom = usePlannerStore((state) => state.setRoom);
  const addItem = usePlannerStore((state) => state.addItem);
  const updateItem = usePlannerStore((state) => state.updateItem);
  const commitItems = usePlannerStore((state) => state.commitItems);
  const select = usePlannerStore((state) => state.select);
  const removeSelected = usePlannerStore((state) => state.removeSelected);
  const duplicateSelected = usePlannerStore((state) => state.duplicateSelected);
  const rotateSelected = usePlannerStore((state) => state.rotateSelected);
  const setQuantity = usePlannerStore((state) => state.setQuantity);
  const setItemOptions = usePlannerStore((state) => state.setItemOptions);
  const toggleLock = usePlannerStore((state) => state.toggleLock);
  const pasteItems = usePlannerStore((state) => state.pasteItems);
  const alignSelected = usePlannerStore((state) => state.alignSelected);
  const pushSelectedToWall = usePlannerStore((state) => state.pushSelectedToWall);
  const undo = usePlannerStore((state) => state.undo);
  const redo = usePlannerStore((state) => state.redo);

  const [tree, setTree] = useState([]);
  const [products, setProducts] = useState([]);
  const [sectionId, setSectionId] = useState(null);
  const [search, setSearch] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [viewMode, setViewMode] = useState('split');
  const [showWalls, setShowWalls] = useState(true);
  const [renderPreview, setRenderPreview] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderSettingsOpen, setRenderSettingsOpen] = useState(false);
  const [adminRender, setAdminRender] = useState(null);
  const [localRender, setLocalRender] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RENDER_LOCAL_KEY) || 'null');
      if (raw && Number.isFinite(raw.passes)) return raw;
    } catch {
      // повреждённые личные настройки игнорируем
    }
    return null;
  });
  const renderSettingsRef = useRef(null);
  const [roomEditorOpen, setRoomEditorOpen] = useState(!room);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const sceneRef = useRef(null);
  const popoverRef = useRef(null);
  const activeInspectorRef = useRef(null);
  const clipboardRef = useRef(null);

  const flatSections = useMemo(() => flatten(tree), [tree]);

  function applyLocalRender(patch) {
    setLocalRender((prev) => {
      const next = { passes: 6, bufferScale: 0.65, lightSoftness: 1, postIntensity: 1, ...(prev || {}), ...patch };
      try {
        localStorage.setItem(RENDER_LOCAL_KEY, JSON.stringify(next));
      } catch {
        // хранилище может быть недоступно
      }
      return next;
    });
  }

  function resetLocalRender() {
    try {
      localStorage.removeItem(RENDER_LOCAL_KEY);
    } catch {
      // ignore
    }
    setLocalRender(null);
    setNotice('Настройки рендера сброшены — применяются админские по умолчанию.');
  }

  function openRenderSettings() {
    setRenderSettingsOpen((value) => !value);
    if (!adminRender) {
      apiFetch('/api/config')
        .then((config) => setAdminRender(config?.settings?.render || null))
        .catch(() => setAdminRender(null));
    }
  }

  // Закрытие попапа кликом снаружи и по Escape.
  useEffect(() => {
    if (!renderSettingsOpen) return undefined;
    const onPointerDown = (event) => {
      if (renderSettingsRef.current && !renderSettingsRef.current.contains(event.target)) {
        setRenderSettingsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setRenderSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [renderSettingsOpen]);

  const effectiveRender = localRender || adminRender || {};
  const effPasses = clampPasses(effectiveRender.passes);
  const effScale = clampScale(effectiveRender.bufferScale);
  const effSoft = clampSoft(effectiveRender.lightSoftness);
  const effPost = clampPost(effectiveRender.postIntensity);
  const activePreset = RENDER_PRESETS.find(
    (preset) => preset.passes === effPasses && preset.bufferScale === effScale,
  );

  async function handleRender() {
    setRendering(true);
    setRenderPct(0);
    try {
      // Личные настройки (из этого браузера) перекрывают админские.
      let settings = localRender;
      if (!settings) {
        const config = await apiFetch('/api/config').catch(() => null);
        settings = config?.settings?.render || {};
      }
      const options = {
        passes: clampPasses(settings.passes || 6),
        bufferScale: clampScale(settings.bufferScale || 0.65),
        lightSoftness: clampSoft(settings.lightSoftness || 1),
        postIntensity: clampPost(settings.postIntensity || 1),
        onProgress: (fraction) => setRenderPct(Math.round(fraction * 100)),
      };
      const cap = await sceneRef.current?.renderSnapshot?.(options);
      if (!cap?.dataUrl) {
        setNotice('Не удалось выполнить рендер.');
        return;
      }
      const signature = projectSignature(room, items);
      sessionStorage.setItem(
        'planner-render',
        JSON.stringify({
          dataUrl: cap.dataUrl,
          camera: cap.camera,
          width: cap.width,
          height: cap.height,
          signature,
          savedAt: new Date().toISOString(),
        }),
      );
      setRenderPreview({ dataUrl: cap.dataUrl, width: cap.width, height: cap.height });
      setNotice('Рендер готов — мягкие тени, этот вид попадёт в PDF заказа.');
    } finally {
      setRendering(false);
      setRenderPct(0);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      const [treeData, firstPage] = await Promise.all([
        apiFetch('/api/catalog/tree'),
        apiFetchFull('/api/catalog/products?limit=100&page=1'),
      ]);
      const allProducts = [...firstPage.data];
      const total = firstPage.meta?.total || allProducts.length;
      for (let page = 2; allProducts.length < total; page += 1) {
        const nextPage = await apiFetchFull(`/api/catalog/products?limit=100&page=${page}`);
        allProducts.push(...nextPage.data);
        if (!nextPage.data.length) break;
      }
      if (cancelled) return;
      setTree(treeData);
      setProducts(allProducts);
    }

    loadCatalog()
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (room) setRoomEditorOpen(false);
  }, [room]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const state = usePlannerStore.getState();
        clipboardRef.current = state.items
          .filter((item) => state.selectedIds.includes(item.id))
          .map((item) => ({ ...item, selectedOptions: [...(item.selectedOptions || [])] }));
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteItems(clipboardRef.current);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedIds.length) {
          event.preventDefault();
          removeSelected();
        }
      } else if (event.key === 'Escape') {
        select(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duplicateSelected, pasteItems, redo, removeSelected, select, selectedIds.length, undo]);

  const activeSection = useMemo(
    () => flatSections.find((section) => section.id === sectionId) || null,
    [flatSections, sectionId],
  );

  const sectionProductCounts = useMemo(() => {
    const counts = new Map();
    for (const section of flatSections) {
      const ids = new Set([section.id]);
      const stack = [section.id];
      while (stack.length) {
        const current = stack.pop();
        for (const node of flatSections) {
          if (node.parentId === current && !ids.has(node.id)) {
            ids.add(node.id);
            stack.push(node.id);
          }
        }
      }
      counts.set(section.id, products.filter((product) => ids.has(product.sectionId)).length);
    }
    return counts;
  }, [flatSections, products]);

  const visibleProducts = useMemo(() => {
    if (!sectionId) return [];
    const query = search.trim().toLowerCase();
    const sectionIds = new Set([sectionId]);
    const stack = [sectionId];
    while (stack.length) {
      const current = stack.pop();
      for (const node of flatSections) {
        if (node.parentId === current && !sectionIds.has(node.id)) {
          sectionIds.add(node.id);
          stack.push(node.id);
        }
      }
    }
    return products.filter((product) => {
      if (!sectionIds.has(product.sectionId)) return false;
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        String(product.sku || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [products, sectionId, flatSections, search]);

  useEffect(() => {
    activeInspectorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIds[0]]);

  useEffect(() => {
    if (sectionId === null) return undefined;

    function onPointerDown(event) {
      if (popoverRef.current?.contains(event.target)) return;
      if (event.target.closest?.('.catalog-tree-row')) return;
      setSectionId(null);
    }

    function onEscape(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setSectionId(null);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [sectionId]);

  const selectedItem = items.find((item) => item.id === selectedIds[0]) || null;
  const selectedProduct = selectedItem?.product;

  const collisionInfo = useMemo(() => {
    const result = new Map();
    if (!room) return result;
    for (const item of items) {
      if (findRoomCollision(item, room.polygon)) result.set(item.id, 'OUTSIDE_ROOM');
    }
    for (const id of findItemCollisions(items)) {
      result.set(id, result.get(id) || 'ITEM_OVERLAP');
    }
    return result;
  }, [items, room]);

  const warningList = useMemo(() => {
    const list = [];
    for (const [id, code] of collisionInfo) {
      const item = items.find((entry) => entry.id === id);
      list.push({
        id,
        code,
        text:
          code === 'OUTSIDE_ROOM'
            ? `${item?.product?.name || 'Предмет'} выходит за границы помещения`
            : `${item?.product?.name || 'Предмет'} пересекается с другим предметом`,
      });
    }
    return list;
  }, [collisionInfo, items]);

  const totalKopecks = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + itemUnitPrice(item.product, item.selectedOptions) * Number(item.quantity || 1),
        0,
      ),
    [items],
  );

  function toggleSection(section) {
    setSectionId((current) => (current === section.id ? null : section.id));
    setSearch('');
  }

  function closeSection() {
    setSectionId(null);
    setSearch('');
  }

  async function handleAdd(productSummary) {
    if (!room) {
      setRoomEditorOpen(true);
      setNotice('Сначала задайте помещение');
      return;
    }
    setAddingId(productSummary.publicId);
    setError('');
    try {
      const product = await apiFetch(`/api/catalog/products/${productSummary.publicId}`);
      const placement = findFreePlacement(product, room.polygon, items, 10);
      addItem(product, {
        ...placement,
        rotationDeg: 0,
        quantity: 1,
        selectedOptions: defaultOptions(product),
      });
      const candidate = {
        ...placement,
        id: 'new',
        widthCm: product.widthCm,
        depthCm: product.depthCm,
        rotationDeg: 0,
      };
      const collides = findRoomCollision(candidate, room.polygon);
      setNotice(
        collides
          ? 'Свободное место не найдено — предмет добавлен в центр'
          : `«${product.name}» добавлен на план`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  function applyRoom(nextRoom) {
    setRoom(nextRoom);
    setRoomEditorOpen(false);
    setNotice('Помещение обновлено');
  }

  function updateSelected(patch) {
    if (!selectedItem) return;
    updateItem(selectedItem.id, patch);
  }

  function goCheckout() {
    if (!items.length) {
      setError('Добавьте хотя бы один предмет');
      return;
    }
    if (warningList.length) {
      setError('Исправьте конфликты на плане перед оформлением');
      return;
    }
    try {
      const camera = sceneRef.current?.getCamera?.();
      if (camera) sessionStorage.setItem('planner-camera', JSON.stringify(camera));
    } catch {
      // camera is optional
    }
    navigate('/checkout');
  }

  if (!room && roomEditorOpen) {
    return (
      <section className="planner planner-setup">
        <div className="hero">
          <div>
            <p className="eyebrow">Шаг 1 из 4</p>
            <h1>Сначала — помещение</h1>
            <p className="muted">
              Задайте форму и размеры комнаты. Всё сохраняется в браузере автоматически.
            </p>
          </div>
        </div>
        <div className="split">
          <RoomEditor title="Параметры комнаты" onSave={applyRoom} />
          <div className="card preview">
            <div className="preview-head">
              <strong>Как это работает</strong>
              <span className="badge">2D / 3D</span>
            </div>
            <ol className="steps">
              <li>Задайте комнату и потолок.</li>
              <li>Добавьте мебель из каталога.</li>
              <li>Двигайте и поворачивайте на плане.</li>
              <li>Оформите заказ и получите PDF.</li>
            </ol>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="planner">
      <div className="hero compact">
        <div>
          <p className="eyebrow">Шаг 2 из 4 · планировщик</p>
          <h1>Расстановка мебели</h1>
          <p className="muted">
            {room
              ? `${room.widthCm} × ${room.depthCm} см · ${(polygonArea(room.polygon) / 10000).toFixed(2)} м²`
              : ''}
            {items.length ? ` · предметов: ${items.length}` : ''}
          </p>
        </div>
        <div className="actions">
          <div className="segmented compact">
            {[
              ['split', '2D + 3D'],
              ['2d', '2D'],
              ['3d', '3D'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={viewMode === value ? 'seg active' : 'seg'}
                onClick={() => setViewMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => setRoomEditorOpen(true)}
          >
            Комната
          </button>
          <button className="button" type="button" onClick={goCheckout}>
            Оформить · {formatMoney(totalKopecks)}
          </button>
        </div>
      </div>

      {notice && <div className="alert alert-ok">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="planner-layout">
        <div className="catalog-shell">
          <aside className="catalog-panel card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Каталог</p>
                <h2>Разделы</h2>
              </div>
              <span className="badge">{products.length}</span>
            </div>
            <div className="catalog-tree">
              {catalogLoading && <p className="muted small">Загружаем каталог…</p>}
              {!catalogLoading && flatSections.length === 0 && (
                <p className="muted small">Разделов пока нет.</p>
              )}
              {flatSections.map((section) => (
                <div
                  key={section.id}
                  className={`tree-row catalog-tree-row ${sectionId === section.id ? 'active' : ''}`}
                  style={{ paddingLeft: `${8 + section.depth * 14}px` }}
                >
                  <button
                    type="button"
                    className="tree-name"
                    onClick={() => toggleSection(section)}
                    aria-haspopup="dialog"
                    aria-expanded={sectionId === section.id}
                  >
                    <span>{section.name}</span>
                    <small>{sectionProductCounts.get(section.id) ?? section.productCount}</small>
                  </button>
                </div>
              ))}
            </div>
            <p className="muted small catalog-hint">Выберите раздел — товары откроются рядом.</p>
          </aside>

          {activeSection && (
            <div
              className="card catalog-popover"
              ref={popoverRef}
              role="dialog"
              aria-labelledby="catalog-popover-title"
            >
              <div className="catalog-popover-head">
                <div>
                  <p className="eyebrow">Раздел каталога</p>
                  <h3 id="catalog-popover-title">{activeSection.name}</h3>
                </div>
                <button
                  type="button"
                  className="popover-close"
                  aria-label="Закрыть список товаров"
                  onClick={closeSection}
                >
                  ×
                </button>
              </div>
              {activeSection.description && (
                <p className="muted small catalog-popover-sub">{activeSection.description}</p>
              )}
              <p className="muted small catalog-popover-sub">
                Товаров: {sectionProductCounts.get(activeSection.id) ?? 0}
              </p>
              <input
                className="search-input"
                placeholder="Поиск по названию или SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="catalog-list">
                {catalogLoading && <p className="muted small">Загружаем каталог…</p>}
                {!catalogLoading && visibleProducts.length === 0 && (
                  <p className="muted small">
                    {search.trim() ? 'Ничего не найдено.' : 'В этом разделе пока нет товаров.'}
                  </p>
                )}
                {visibleProducts.map((product) => (
                  <article className="catalog-card" key={product.publicId}>
                    <div className="catalog-thumb">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} />
                      ) : (
                        <span>Fe</span>
                      )}
                    </div>
                    <div className="catalog-card-body">
                      <strong>{product.name}</strong>
                      <small>
                        {formatCm(product.widthCm)} × {formatCm(product.depthCm)} ×{' '}
                        {formatCm(product.heightCm)}
                      </small>
                      <div className="catalog-card-foot">
                        <b>{product.priceKopecks > 0 ? formatMoney(product.priceKopecks) : 'Цена по запросу'}</b>
                        <button
                          className="button button-small"
                          type="button"
                          disabled={addingId === product.publicId}
                          onClick={() => handleAdd(product)}
                        >
                          {addingId === product.publicId ? '…' : '+'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="workspace">
          <div className={`view-stack mode-${viewMode}`}>
            <div className="view-pane plan-pane">
              <div className="view-label">2D-план</div>
              <Plan2D
                room={room}
                items={items}
                selectedIds={selectedIds}
                onSelect={select}
                onUpdateItem={(id, patch) => updateItem(id, patch, { recordHistory: false })}
                onCommitItems={commitItems}
                gridStep={5}
              />
            </div>
            <div className="view-pane scene-pane">
              <div className="view-label">3D-вид</div>
              {rendering && (
                <div className="render-progress" role="status" aria-live="polite">
                  Рендер: {renderPct}%
                </div>
              )}
              <Suspense fallback={<div className="scene-placeholder">Загрузка 3D…</div>}>
                <Scene3D
                  ref={sceneRef}
                  room={room}
                  items={items}
                  selectedIds={selectedIds}
                  onSelect={select}
                  onTransformEnd={(id, patch, beforeItems) => {
                    updateItem(id, patch, { recordHistory: false });
                    commitItems(beforeItems);
                  }}
                  showWalls={showWalls}
                />
              </Suspense>
              {renderPreview && (
                <div
                  className="render-overlay"
                  onClick={() => setRenderPreview(null)}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Рендер 3D-вида"
                >
                  <div className="render-card" onClick={(event) => event.stopPropagation()}>
                    <img src={renderPreview.dataUrl} alt="Рендер 3D-вида" />
                    <div className="render-card-foot">
                      <span className="muted small">
                        {renderPreview.width}×{renderPreview.height} · этот вид будет в PDF заказа
                      </span>
                      <div className="actions">
                        <a
                          className="button button-small"
                          href={renderPreview.dataUrl}
                          download="render-3d.jpg"
                        >
                          Скачать JPG
                        </a>
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          onClick={() => setRenderPreview(null)}
                        >
                          Закрыть
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="plan-bar">
            <div className="actions">
              <button className="button button-ghost button-small" type="button" onClick={undo}>
                ↶ Undo
              </button>
              <button className="button button-ghost button-small" type="button" onClick={redo}>
                ↷ Redo
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => {
                  const state = usePlannerStore.getState();
                  clipboardRef.current = state.items
                    .filter((item) => state.selectedIds.includes(item.id))
                    .map((item) => ({
                      ...item,
                      selectedOptions: [...(item.selectedOptions || [])],
                    }));
                  setNotice(clipboardRef.current.length ? 'Скопировано' : 'Ничего не выбрано');
                }}
              >
                Копировать
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => pasteItems(clipboardRef.current)}
              >
                Вставить
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => sceneRef.current?.fitAll()}
              >
                Вписать 3D
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => sceneRef.current?.setView('front')}
              >
                Фронт
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => sceneRef.current?.setView('profile')}
              >
                Профиль
              </button>
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={rendering}
                onClick={handleRender}
                title="Рендер с мягкими тенями и рассеянным светом — попадёт в PDF заказа"
              >
                {rendering ? `Рендер… ${renderPct}%` : 'Рендер 3D'}
              </button>
              <div className="render-settings-wrap" ref={renderSettingsRef}>
                <button
                  className={`button button-ghost button-small${renderSettingsOpen ? ' active' : ''}`}
                  type="button"
                  aria-label="Настройки рендера: качество, проходы, мягкость теней, постобработка"
                  aria-expanded={renderSettingsOpen}
                  title={
                    localRender
                      ? 'Настройки рендера (личные, действуют в этом браузере)'
                      : 'Настройки рендера (по умолчанию администратора)'
                  }
                  onClick={openRenderSettings}
                >
                  ⚙
                </button>
                {renderSettingsOpen && (
                  <div
                    className="render-settings-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Настройки рендера 3D"
                    onClick={(event) => {
                      if (event.target === event.currentTarget) setRenderSettingsOpen(false);
                    }}
                  >
                    <div className="render-settings-modal">
                      <div className="render-settings-head">
                        <span className="render-settings-title">
                          <strong>Рендер 3D</strong>
                          {localRender && <span className="badge">личные</span>}
                        </span>
                        <button
                          className="popover-close"
                          type="button"
                          aria-label="Закрыть настройки рендера"
                          onClick={() => setRenderSettingsOpen(false)}
                        >
                          ×
                        </button>
                      </div>
                    <div className="preset-chips">
                      {RENDER_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`preset-chip${activePreset?.id === preset.id ? ' active' : ''}`}
                          onClick={() => applyLocalRender({ passes: preset.passes, bufferScale: preset.bufferScale })}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <label className="render-settings-row">
                      <span>
                        Проходы <em>{effPasses}</em>
                      </span>
                      <input
                        type="range"
                        min="2"
                        max="16"
                        step="1"
                        value={effPasses}
                        onChange={(event) => applyLocalRender({ passes: Number(event.target.value) })}
                      />
                      <small>чистота рёбер и мягкость; больше — дольше</small>
                    </label>
                    <label className="render-settings-row">
                      <span>
                        Разрешение буфера <em>{Math.round(effScale * 100)}%</em>
                      </span>
                      <input
                        type="range"
                        min="40"
                        max="100"
                        step="5"
                        value={Math.round(effScale * 100)}
                        onChange={(event) => applyLocalRender({ bufferScale: Number(event.target.value) / 100 })}
                      />
                      <small>внутренний размер кадра; 100% — максимально детально</small>
                    </label>
                    <label className="render-settings-row">
                      <span>
                        Мягкость теней <em>×{effSoft.toFixed(1)}</em>
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="20"
                        step="1"
                        value={Math.round(effSoft * 10)}
                        onChange={(event) => applyLocalRender({ lightSoftness: Number(event.target.value) / 10 })}
                      />
                      <small>ширина полутеней и свет в тенях; больше — мягче и светлее</small>
                    </label>
                    <label className="render-settings-row">
                      <span>
                        Постобработка <em>×{effPost.toFixed(1)}</em>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={Math.round(effPost * 10)}
                        onChange={(event) => applyLocalRender({ postIntensity: Number(event.target.value) / 10 })}
                      />
                      <small>контраст, свечение, виньетка; 0 — чистый кадр</small>
                    </label>
                    <div className="render-settings-foot">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={resetLocalRender}
                      >
                        Сбросить
                      </button>
                      <span className="muted small">личное, в этом браузере</span>
                    </div>
                  </div>
                  </div>
                )}
              </div>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => setShowWalls((value) => !value)}
              >
                {showWalls ? 'Скрыть стены' : 'Показать стены'}
              </button>
            </div>
            <span className="muted small">
              Перетаскивайте предметы, колесо — зум. Delete — удалить.
            </span>
          </div>
          <div className={`warnings ${warningList.length ? 'has-warnings' : 'ok'}`}>
            {warningList.length === 0 ? (
              <span>✓ Конфликтов нет</span>
            ) : (
              warningList.slice(0, 6).map((warning) => (
                <button key={warning.id} type="button" onClick={() => select(warning.id)}>
                  ⚠ {warning.text}
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="inspector card">
          <div className="panel-head inspector-head">
            <div>
              <p className="eyebrow">Инспектор</p>
              <h2>Объекты на плане</h2>
            </div>
            <span className="badge">{items.length}</span>
          </div>

          <div className="inspector-body">
            {items.length === 0 ? (
              <p className="muted small">
                Добавьте предмет из каталога или выберите его на 2D-плане. Shift — мультивыбор.
              </p>
            ) : (
              items.map((item) => {
                const expanded = selectedItem?.id === item.id;
                const selected = selectedIds.includes(item.id);
                const conflict = collisionInfo.has(item.id);
                const price =
                  itemUnitPrice(item.product, item.selectedOptions) * Number(item.quantity || 1);
                return (
                  <article
                    key={item.id}
                    ref={expanded ? activeInspectorRef : null}
                    className={`inspector-item ${expanded ? 'expanded' : ''} ${selected ? 'selected' : ''} ${conflict ? 'has-conflict' : ''}`}
                  >
                    <button
                      type="button"
                      className="inspector-item-head"
                      aria-expanded={expanded}
                      onClick={(event) => {
                        if (expanded && selectedIds.length === 1) select(null);
                        else select(item.id, event.shiftKey);
                      }}
                    >
                      <span className="inspector-item-chevron">{expanded ? '▾' : '▸'}</span>
                      <span className="inspector-item-title">
                        <strong>{item.product?.name || 'Предмет'}</strong>
                        <small>
                          {formatCm(item.product?.widthCm)} × {formatCm(item.product?.depthCm)} ×{' '}
                          {formatCm(item.product?.heightCm)}
                          {item.locked ? ' · 🔒' : ''}
                          {conflict ? ' · ⚠ конфликт' : ''}
                        </small>
                      </span>
                      <span className="inspector-item-price">
                        {price > 0 ? formatMoney(price) : 'Цена по запросу'}
                        {Number(item.quantity) > 1 && <small>× {item.quantity}</small>}
                      </span>
                    </button>

                    {expanded && (
                      <div className="inspector-item-body form inspector-form">
                        {selectedIds.length > 1 && (
                          <p className="muted small">
                            Выбрано объектов: {selectedIds.length}. Свойства показаны для первого.
                          </p>
                        )}

                        <div className="grid2">
                          <label>
                            X, см
                            <input
                              type="number"
                              value={Math.round(selectedItem.x)}
                              onChange={(event) =>
                                updateSelected({ x: Number(event.target.value) })
                              }
                            />
                          </label>
                          <label>
                            Z, см
                            <input
                              type="number"
                              value={Math.round(selectedItem.z)}
                              onChange={(event) =>
                                updateSelected({ z: Number(event.target.value) })
                              }
                            />
                          </label>
                          <label>
                            Угол, °
                            <input
                              type="number"
                              value={Math.round(selectedItem.rotationDeg)}
                              onChange={(event) =>
                                updateSelected({
                                  rotationDeg: ((Number(event.target.value) % 360) + 360) % 360,
                                })
                              }
                            />
                          </label>
                          <label>
                            Количество
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={selectedItem.quantity}
                              onChange={(event) => setQuantity(selectedItem.id, event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="actions">
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => rotateSelected(-15)}
                          >
                            −15°
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => rotateSelected(15)}
                          >
                            +15°
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => rotateSelected(-90)}
                          >
                            −90°
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => rotateSelected(90)}
                          >
                            +90°
                          </button>
                        </div>

                        {selectedProduct?.options?.map((option) => {
                          const current = selectedItem.selectedOptions?.find(
                            (entry) => Number(entry.propertyId) === Number(option.propertyId),
                          );
                          return (
                            <label key={option.propertyId}>
                              {option.propertyName}
                              <select
                                value={current?.paramId || ''}
                                onChange={(event) => {
                                  const next = (selectedItem.selectedOptions || []).filter(
                                    (entry) =>
                                      Number(entry.propertyId) !== Number(option.propertyId),
                                  );
                                  if (event.target.value) {
                                    next.push({
                                      propertyId: option.propertyId,
                                      paramId: Number(event.target.value),
                                    });
                                  }
                                  setItemOptions(selectedItem.id, next);
                                }}
                              >
                                <option value="">—</option>
                                {option.values.map((value) => (
                                  <option key={value.paramId} value={value.paramId}>
                                    {value.label}
                                    {value.priceDeltaKopecks
                                      ? ` (+${formatMoney(value.priceDeltaKopecks)})`
                                      : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}

                        <div className="summary">
                          <span>
                            Габариты: {formatCm(selectedProduct?.widthCm)} ×{' '}
                            {formatCm(selectedProduct?.depthCm)} ×{' '}
                            {formatCm(selectedProduct?.heightCm)}
                          </span>
                          <strong>
                            {formatMoney(
                              itemUnitPrice(selectedProduct, selectedItem.selectedOptions) *
                                selectedItem.quantity,
                            )}
                          </strong>
                        </div>

                        <div className="actions">
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => toggleLock(selectedItem.id)}
                          >
                            {selectedItem.locked ? 'Разблокировать' : 'Заблокировать'}
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={duplicateSelected}
                          >
                            Дублировать
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={pushSelectedToWall}
                          >
                            К стене
                          </button>
                          {selectedIds.length > 1 && (
                            <button
                              className="button button-ghost button-small"
                              type="button"
                              onClick={() => alignSelected('centerX')}
                            >
                              Выровнять
                            </button>
                          )}
                          <button
                            className="button button-ghost button-small danger"
                            type="button"
                            onClick={removeSelected}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <div className="totals-box inspector-footer">
            <span>Итого</span>
            <strong>{formatMoney(totalKopecks)}</strong>
          </div>
        </aside>
      </div>

      {roomEditorOpen && (
        <div className="modal-backdrop" onClick={() => room && setRoomEditorOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <RoomEditor
              initial={room}
              title="Изменить помещение"
              onSave={applyRoom}
              onCancel={room ? () => setRoomEditorOpen(false) : null}
            />
          </div>
        </div>
      )}
    </section>
  );
}
