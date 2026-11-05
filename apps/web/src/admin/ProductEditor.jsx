import { useEffect, useMemo, useState } from 'react';
import { adminApi } from './adminApi.js';

const TABS = [
  ['main', 'Основное'],
  ['images', 'Изображения'],
  ['model', '3D-модель'],
  ['properties', 'Свойства'],
  ['options', 'Опции'],
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formFromProduct(product) {
  return {
    sectionId: product?.sectionId ? String(product.sectionId) : '',
    name: product?.name || '',
    sku: product?.sku || '',
    price: product ? String(product.priceKopecks / 100) : '',
    widthCm: text(product?.widthCm),
    depthCm: text(product?.depthCm),
    heightCm: text(product?.heightCm),
    weightKg: text(product?.weightKg),
    shortDescription: product?.shortDescription || '',
    description: product?.description || '',
    sort: text(product?.sort ?? 0),
    isActive: product?.isActive !== false,
  };
}

function valuesFromProduct(product) {
  const map = {};
  for (const value of product?.propertyValues || []) {
    map[value.propertyId] = {
      paramId: value.paramId ? String(value.paramId) : '',
      valueText: value.valueText || '',
      valueNumber: value.valueNumber === null ? '' : text(value.valueNumber),
      valueBool: Boolean(value.valueBool),
    };
  }
  return map;
}

function optionsFromProduct(product) {
  const map = {};
  for (const option of product?.options || []) {
    const values = {};
    for (const value of option.values || []) {
      values[value.paramId] = {
        checked: true,
        delta: String((value.priceDeltaKopecks || 0) / 100),
        isDefault: Boolean(value.isDefault),
      };
    }
    map[option.propertyId] = {
      enabled: true,
      isRequired: Boolean(option.isRequired),
      isMultiple: Boolean(option.isMultiple),
      values,
    };
  }
  return map;
}

const OPTIMIZE_LABELS = {
  idle: 'не запускалась',
  running: 'выполняется',
  done: 'готово',
  failed: 'ошибка',
};

function modelFromProduct(product) {
  const bbox = product?.model?.bboxMm || [0, 0, 0];
  const transform = product?.model?.transform || {};
  const scale = Array.isArray(transform.scale) ? transform.scale[0] : 1;
  const rotation = Array.isArray(transform.rotationDeg) ? transform.rotationDeg : [0, 0, 0];
  const offset = Array.isArray(transform.offsetCm) ? transform.offsetCm : [0, 0, 0];
  return {
    bboxX: text(bbox[0]),
    bboxY: text(bbox[1]),
    bboxZ: text(bbox[2]),
    triangles: text(product?.model?.triangles),
    fitMode: transform.fitMode || 'uniform',
    scale: text(scale),
    rotX: text(rotation[0]),
    rotY: text(rotation[1]),
    rotZ: text(rotation[2]),
    offX: text(offset[0]),
    offY: text(offset[1]),
    offZ: text(offset[2]),
  };
}

export default function ProductEditor({
  product,
  sections,
  properties,
  defaultSectionId,
  onSaved,
  onDeleted,
  onOpenDictionary,
  onError,
}) {
  const [tab, setTab] = useState('main');
  const [form, setForm] = useState(() => formFromProduct(product));
  const [values, setValues] = useState(() => valuesFromProduct(product));
  const [options, setOptions] = useState(() => optionsFromProduct(product));
  const [modelForm, setModelForm] = useState(() => modelFromProduct(product));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [modelFile, setModelFile] = useState(null);
  const [optimizeTarget, setOptimizeTarget] = useState('50000');

  useEffect(() => {
    setForm(formFromProduct(product));
    setValues(valuesFromProduct(product));
    setOptions(optionsFromProduct(product));
    setModelForm(modelFromProduct(product));
    setTab('main');
    setMessage('');
    setError('');
    setImageFile(null);
    setModelFile(null);
  }, [product?.id]);

  useEffect(() => {
    if (!product && defaultSectionId) {
      setForm((current) => ({ ...current, sectionId: String(defaultSectionId) }));
    }
  }, [defaultSectionId, product]);

  const enumProperties = useMemo(
    () => properties.filter((property) => ['enum', 'color'].includes(property.type)),
    [properties],
  );

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setMessage('');
  }

  function showError(value) {
    setError(value);
    onError?.(value);
  }

  async function saveMain(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.sectionId) return showError('Выберите раздел');
    setBusy(true);
    try {
      const body = {
        sectionId: Number(form.sectionId),
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        priceKopecks: Math.round(Number(form.price) * 100),
        widthCm: Number(form.widthCm),
        depthCm: Number(form.depthCm),
        heightCm: Number(form.heightCm),
        weightKg: form.weightKg === '' ? null : Number(form.weightKg),
        shortDescription: form.shortDescription,
        description: form.description,
        sort: Number(form.sort) || 0,
        isActive: form.isActive,
      };
      const saved = product
        ? await adminApi.updateProduct(product.id, body)
        : await adminApi.createProduct(body);
      setMessage('Товар сохранён');
      await onSaved(saved);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage() {
    if (!imageFile) return showError('Выберите файл изображения');
    setBusy(true);
    setError('');
    try {
      await adminApi.uploadProductImage(product.id, imageFile);
      setImageFile(null);
      const fresh = await adminApi.getProduct(product.id);
      await onSaved(fresh);
      setMessage('Изображение загружено');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(image) {
    if (!window.confirm('Удалить изображение?')) return;
    setBusy(true);
    try {
      await adminApi.deleteProductImage(product.id, image.id);
      const fresh = await adminApi.getProduct(product.id);
      await onSaved(fresh);
      setMessage('Изображение удалено');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function suggestScale() {
    const bx = Number(modelForm.bboxX);
    const by = Number(modelForm.bboxY);
    const bz = Number(modelForm.bboxZ);
    const widthMm = Number(form.widthCm) * 10;
    const depthMm = Number(form.depthCm) * 10;
    const heightMm = Number(form.heightCm) * 10;
    if (!bx || !by || !bz || !widthMm || !depthMm || !heightMm) {
      return showError('Заполните габариты товара и bbox модели');
    }
    const variants = [
      { source: 'X ↔ ширина', value: widthMm / bx },
      { source: 'Z ↔ глубина', value: depthMm / bz },
      { source: 'Y ↔ высота', value: heightMm / by },
    ];
    const min = variants.reduce((best, item) => (item.value < best.value ? item : best), variants[0]);
    setModelForm((current) => ({ ...current, scale: min.value.toFixed(4) }));
    setMessage(`Масштаб ${min.value.toFixed(4)} по оси ${min.source}. Проверьте ориентацию модели.`);
  }

  async function uploadModel() {
    if (!modelFile) return showError('Выберите файл модели');
    setBusy(true);
    setError('');
    try {
      const body = {
        bboxMm: [Number(modelForm.bboxX), Number(modelForm.bboxY), Number(modelForm.bboxZ)],
        triangles: modelForm.triangles ? Number(modelForm.triangles) : null,
        transform: {
          fitMode: modelForm.fitMode,
          scale: [Number(modelForm.scale) || 1, Number(modelForm.scale) || 1, Number(modelForm.scale) || 1],
          rotationDeg: [Number(modelForm.rotX) || 0, Number(modelForm.rotY) || 0, Number(modelForm.rotZ) || 0],
          offsetCm: [Number(modelForm.offX) || 0, Number(modelForm.offY) || 0, Number(modelForm.offZ) || 0],
        },
      };
      await adminApi.uploadProductModel(product.id, modelFile, body);
      setModelFile(null);
      const fresh = await adminApi.getProduct(product.id);
      await onSaved(fresh);
      setMessage('3D-модель загружена');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function optimizeModel() {
    if (!product?.model?.fileId) return showError('Сначала загрузите модель');
    setBusy(true);
    setError('');
    setMessage('Оптимизация выполняется…');
    try {
      const result = await adminApi.optimizeProductModel(product.id, Number(optimizeTarget) || 50000);
      const fresh = await adminApi.getProduct(product.id);
      await onSaved(fresh);
      setMessage(`Готово: ${result.sourceTriangles.toLocaleString('ru-RU')} → ${result.resultTriangles.toLocaleString('ru-RU')} треугольников`);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rollbackModel() {
    setBusy(true);
    setError('');
    try {
      const fresh = await adminApi.rollbackProductModel(product.id);
      await onSaved(fresh);
      setMessage('Оптимизированная модель отключена, используется оригинал');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProperties() {
    setBusy(true);
    setError('');
    try {
      const list = [];
      for (const property of properties) {
        const value = values[property.id];
        if (!value) continue;
        if (['enum', 'color'].includes(property.type)) {
          if (value.paramId) list.push({ propertyId: property.id, paramId: Number(value.paramId) });
        } else if (property.type === 'number') {
          if (value.valueNumber !== '') list.push({ propertyId: property.id, valueNumber: Number(value.valueNumber) });
        } else if (property.type === 'boolean') {
          list.push({ propertyId: property.id, valueBool: Boolean(value.valueBool) });
        } else if (value.valueText.trim()) {
          list.push({ propertyId: property.id, valueText: value.valueText });
        }
      }
      const fresh = await adminApi.saveProductProperties(product.id, list);
      await onSaved(fresh);
      setMessage('Свойства сохранены');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function optionRow(propertyId) {
    return options[propertyId] || { enabled: false, isRequired: false, isMultiple: false, values: {} };
  }

  function setOption(propertyId, patch) {
    setOptions((current) => ({ ...current, [propertyId]: { ...optionRow(propertyId), ...patch } }));
    setMessage('');
  }

  function setOptionValue(propertyId, paramId, patch) {
    const row = optionRow(propertyId);
    setOption(propertyId, {
      values: {
        ...row.values,
        [paramId]: { checked: false, delta: '0', isDefault: false, ...(row.values[paramId] || {}), ...patch },
      },
    });
  }

  async function saveOptions() {
    setBusy(true);
    setError('');
    try {
      const list = [];
      for (const property of enumProperties) {
        const row = options[property.id];
        if (!row?.enabled) continue;
        const listValues = [];
        for (const param of property.params) {
          const selected = row.values[param.id];
          if (!selected?.checked) continue;
          listValues.push({
            paramId: param.id,
            priceDeltaKopecks: Math.round(Number(selected.delta || 0) * 100),
            isDefault: Boolean(selected.isDefault),
          });
        }
        list.push({
          propertyId: property.id,
          isRequired: Boolean(row.isRequired),
          isMultiple: Boolean(row.isMultiple),
          values: listValues,
        });
      }
      const fresh = await adminApi.saveProductOptions(product.id, list);
      await onSaved(fresh);
      setMessage('Опции сохранены');
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct() {
    if (!window.confirm(`Скрыть товар «${product.name}»?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteProduct(product.id);
      await onDeleted();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function renderMain() {
    return (
      <form className="form" onSubmit={saveMain}>
        <div className="grid2">
          <label>
            Название
            <input value={form.name} onChange={(e) => field('name', e.target.value)} required />
          </label>
          <label>
            Раздел
            <select value={form.sectionId} onChange={(e) => field('sectionId', e.target.value)} required>
              <option value="">— выберите —</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {'— '.repeat(section.depth || 0)}
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <input value={form.sku} onChange={(e) => field('sku', e.target.value)} />
          </label>
          <label>
            Цена, ₽
            <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => field('price', e.target.value)} required />
          </label>
        </div>

        <fieldset>
          <legend>Габариты</legend>
          <div className="grid2">
            <label>
              Ширина, см
              <input type="number" min="0.1" step="0.1" value={form.widthCm} onChange={(e) => field('widthCm', e.target.value)} required />
            </label>
            <label>
              Глубина, см
              <input type="number" min="0.1" step="0.1" value={form.depthCm} onChange={(e) => field('depthCm', e.target.value)} required />
            </label>
            <label>
              Высота, см
              <input type="number" min="0.1" step="0.1" value={form.heightCm} onChange={(e) => field('heightCm', e.target.value)} required />
            </label>
            <label>
              Вес, кг
              <input type="number" min="0" step="0.1" value={form.weightKg} onChange={(e) => field('weightKg', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <label>
          Краткое описание
          <input value={form.shortDescription} onChange={(e) => field('shortDescription', e.target.value)} />
        </label>
        <label>
          Полное описание
          <textarea rows="4" value={form.description} onChange={(e) => field('description', e.target.value)} />
        </label>

        <div className="grid2">
          <label>
            Сортировка
            <input type="number" value={form.sort} onChange={(e) => field('sort', e.target.value)} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.isActive} onChange={(e) => field('isActive', e.target.checked)} />
            Опубликован
          </label>
        </div>

        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : product ? 'Сохранить товар' : 'Создать товар'}
          </button>
          {product && (
            <button className="button button-ghost" type="button" onClick={removeProduct} disabled={busy}>
              Скрыть товар
            </button>
          )}
        </div>
      </form>
    );
  }

  function renderImages() {
    return (
      <div className="form">
        <div className="actions">
          <label className="file-button">
            Выбрать изображение
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          </label>
          <button className="button button-small" type="button" onClick={uploadImage} disabled={busy || !imageFile}>
            Загрузить
          </button>
          {imageFile && <span className="muted small">{imageFile.name}</span>}
        </div>
        {product.images.length === 0 ? (
          <p className="muted">Изображений пока нет. Первое станет главным.</p>
        ) : (
          <div className="image-grid">
            {product.images.map((image) => (
              <figure key={image.id} className="image-card">
                <img src={image.url} alt={image.alt || product.name} />
                <figcaption>
                  {image.isMain && <span className="badge">Главное</span>}
                  <button className="link-danger" type="button" onClick={() => removeImage(image)}>
                    Удалить
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderModel() {
    return (
      <div className="form">
        {product.model ? (
          <div className="summary">
            <span>Формат: <strong>{product.model.format}</strong></span>
            <span>Треугольников: <strong>{product.model.triangles || '—'}</strong></span>
            {product.model.url && (
              <a href={product.model.url} target="_blank" rel="noreferrer">
                Открыть файл
              </a>
            )}
          </div>
        ) : (
          <p className="muted">Модель ещё не загружена.</p>
        )}

        <div className="actions">
          <label className="file-button">
            Выбрать GLB / GLTF / STL
            <input type="file" accept=".glb,.gltf,.stl" onChange={(e) => setModelFile(e.target.files?.[0] || null)} />
          </label>
          {modelFile && <span className="muted small">{modelFile.name}</span>}
        </div>

        <fieldset>
          <legend>Калибровка</legend>
          <p className="muted small">
            Bbox — габариты исходной модели в миллиметрах. Масштаб подбирается так, чтобы модель
            вписалась в карточку товара. Ось Y — вверх.
          </p>
          <div className="grid2">
            <label>Bbox X, мм<input type="number" step="0.1" value={modelForm.bboxX} onChange={(e) => setModelForm({ ...modelForm, bboxX: e.target.value })} /></label>
            <label>Bbox Y, мм<input type="number" step="0.1" value={modelForm.bboxY} onChange={(e) => setModelForm({ ...modelForm, bboxY: e.target.value })} /></label>
            <label>Bbox Z, мм<input type="number" step="0.1" value={modelForm.bboxZ} onChange={(e) => setModelForm({ ...modelForm, bboxZ: e.target.value })} /></label>
            <label>Треугольников<input type="number" value={modelForm.triangles} onChange={(e) => setModelForm({ ...modelForm, triangles: e.target.value })} /></label>
            <label>Масштаб<input type="number" step="0.0001" value={modelForm.scale} onChange={(e) => setModelForm({ ...modelForm, scale: e.target.value })} /></label>
            <label>Режим<select value={modelForm.fitMode} onChange={(e) => setModelForm({ ...modelForm, fitMode: e.target.value })}><option value="uniform">Равномерный</option><option value="manual">Вручную</option></select></label>
          </div>
          <div className="grid2">
            <label>Поворот X, °<input type="number" value={modelForm.rotX} onChange={(e) => setModelForm({ ...modelForm, rotX: e.target.value })} /></label>
            <label>Поворот Y, °<input type="number" value={modelForm.rotY} onChange={(e) => setModelForm({ ...modelForm, rotY: e.target.value })} /></label>
            <label>Поворот Z, °<input type="number" value={modelForm.rotZ} onChange={(e) => setModelForm({ ...modelForm, rotZ: e.target.value })} /></label>
            <label>Смещение X, см<input type="number" step="0.1" value={modelForm.offX} onChange={(e) => setModelForm({ ...modelForm, offX: e.target.value })} /></label>
            <label>Смещение Y, см<input type="number" step="0.1" value={modelForm.offY} onChange={(e) => setModelForm({ ...modelForm, offY: e.target.value })} /></label>
            <label>Смещение Z, см<input type="number" step="0.1" value={modelForm.offZ} onChange={(e) => setModelForm({ ...modelForm, offZ: e.target.value })} /></label>
          </div>
          <div className="actions">
            <button className="button button-ghost button-small" type="button" onClick={suggestScale}>
              Рассчитать масштаб
            </button>
            <button className="button button-small" type="button" onClick={uploadModel} disabled={busy || !modelFile}>
              Загрузить модель
            </button>
          </div>
        </fieldset>

        {product?.model && (
          <fieldset>
            <legend>Оптимизация для просмотра</legend>
            <p className="muted small">
              Оригинал сохраняется. Для планировщика можно подготовить облегчённый GLB:
              меньше треугольников — быстрее 3D.
            </p>
            <div className="summary">
              <span>Статус: <b>{OPTIMIZE_LABELS[product.model.optimizeStatus] || product.model.optimizeStatus}</b></span>
              <span>Оригинал: {Number(product.model.triangles || 0).toLocaleString('ru-RU')} тр.</span>
              {product.model.optimized && (
                <span>Оптимизировано: {Number(product.model.optimized.triangles || 0).toLocaleString('ru-RU')} тр.</span>
              )}
            </div>
            {Number(product.model.triangles || 0) > 100000 && (
              <div className="alert alert-warn">Модель тяжёлая для браузера. Рекомендуется оптимизация до 50–100 тыс. треугольников.</div>
            )}
            {product.model.optimizeError && <div className="alert alert-error">{product.model.optimizeError}</div>}
            <div className="grid2">
              <label>
                Цель, треугольников
                <input type="number" min="500" max="500000" step="1000" value={optimizeTarget} onChange={(e) => setOptimizeTarget(e.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button className="button button-small" type="button" onClick={optimizeModel} disabled={busy}>
                Оптимизировать
              </button>
              {product.model.optimized && (
                <button className="button button-ghost button-small" type="button" onClick={rollbackModel} disabled={busy}>
                  Вернуть оригинал
                </button>
              )}
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  function renderProperties() {
    return (
      <div className="form">
        <div className="actions">
          <button className="button button-ghost button-small" type="button" onClick={onOpenDictionary}>
            Справочник свойств
          </button>
          <span className="muted small">Значения сохраняются для карточки товара.</span>
        </div>
        {properties.length === 0 && <p className="muted">Свойств пока нет. Создайте их в справочнике.</p>}
        {properties.map((property) => {
          const value = values[property.id] || { paramId: '', valueText: '', valueNumber: '', valueBool: false };
          return (
            <div className="property-row" key={property.id}>
              <div>
                <strong>{property.name}</strong>
                <small>{property.type}{property.unit ? `, ${property.unit}` : ''}</small>
              </div>
              {['enum', 'color'].includes(property.type) ? (
                <select
                  value={value.paramId}
                  onChange={(e) => setValues({ ...values, [property.id]: { ...value, paramId: e.target.value } })}
                >
                  <option value="">— не задано —</option>
                  {property.params.map((param) => (
                    <option key={param.id} value={param.id}>{param.label}</option>
                  ))}
                </select>
              ) : property.type === 'number' ? (
                <input
                  type="number"
                  step="0.01"
                  value={value.valueNumber}
                  onChange={(e) => setValues({ ...values, [property.id]: { ...value, valueNumber: e.target.value } })}
                />
              ) : property.type === 'boolean' ? (
                <label className="checkbox-label inline">
                  <input
                    type="checkbox"
                    checked={value.valueBool}
                    onChange={(e) => setValues({ ...values, [property.id]: { ...value, valueBool: e.target.checked } })}
                  />
                  Да
                </label>
              ) : (
                <input
                  value={value.valueText}
                  onChange={(e) => setValues({ ...values, [property.id]: { ...value, valueText: e.target.value } })}
                />
              )}
            </div>
          );
        })}
        <div className="actions">
          <button className="button button-small" type="button" onClick={saveProperties} disabled={busy}>
            Сохранить свойства
          </button>
        </div>
      </div>
    );
  }

  function renderOptions() {
    return (
      <div className="form">
        <p className="muted small">
          Опции — это выбираемые параметры с доплатой. Для цвета/списка используются параметры свойства.
        </p>
        {enumProperties.length === 0 && <p className="muted">Нет свойств типа «список» или «цвет».</p>}
        {enumProperties.map((property) => {
          const row = optionRow(property.id);
          return (
            <fieldset key={property.id}>
              <legend>
                <label className="checkbox-label inline">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => setOption(property.id, { enabled: e.target.checked })}
                  />
                  {property.name}
                </label>
              </legend>
              {row.enabled && (
                <>
                  <div className="actions">
                    <label className="checkbox-label inline">
                      <input type="checkbox" checked={row.isRequired} onChange={(e) => setOption(property.id, { isRequired: e.target.checked })} />
                      Обязательная
                    </label>
                    <label className="checkbox-label inline">
                      <input type="checkbox" checked={row.isMultiple} onChange={(e) => setOption(property.id, { isMultiple: e.target.checked })} />
                      Множественный выбор
                    </label>
                  </div>
                  <div className="option-values">
                    {property.params.map((param) => {
                      const selected = row.values[param.id] || { checked: false, delta: '0', isDefault: false };
                      return (
                        <div className="option-row" key={param.id}>
                          <label className="checkbox-label inline">
                            <input
                              type="checkbox"
                              checked={selected.checked}
                              onChange={(e) => setOptionValue(property.id, param.id, { checked: e.target.checked })}
                            />
                            {param.hex && <span className="color-dot" style={{ background: param.hex }} />}
                            {param.label}
                          </label>
                          <label>
                            Доплата, ₽
                            <input
                              type="number"
                              step="0.01"
                              value={selected.delta}
                              onChange={(e) => setOptionValue(property.id, param.id, { delta: e.target.value })}
                            />
                          </label>
                          <label className="checkbox-label inline">
                            <input
                              type="radio"
                              name={`default-${property.id}`}
                              checked={selected.isDefault}
                              onChange={() => setOptionValue(property.id, param.id, { isDefault: true, checked: true })}
                            />
                            По умолчанию
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>
          );
        })}
        <div className="actions">
          <button className="button button-small" type="button" onClick={saveOptions} disabled={busy}>
            Сохранить опции
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel product-editor">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{product ? 'Редактирование' : 'Новый товар'}</p>
          <h2>{product?.name || 'Карточка товара'}</h2>
        </div>
        {product && (
          <span className={`status ${product.isActive ? 'ok' : ''}`}>
            {product.isActive ? 'опубликован' : 'скрыт'}
          </span>
        )}
      </div>

      {message && <div className="alert alert-ok">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!product && tab !== 'main' ? (
        <p className="muted">Сначала сохраните товар, затем загрузите файлы и настройте свойства.</p>
      ) : tab === 'main' ? (
        renderMain()
      ) : tab === 'images' ? (
        renderImages()
      ) : tab === 'model' ? (
        renderModel()
      ) : tab === 'properties' ? (
        renderProperties()
      ) : (
        renderOptions()
      )}
    </div>
  );
}
