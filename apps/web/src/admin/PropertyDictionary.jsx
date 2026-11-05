import { useState } from 'react';
import { adminApi } from './adminApi.js';

const TYPES = [
  ['string', 'Строка'],
  ['text', 'Текст'],
  ['number', 'Число'],
  ['boolean', 'Да/нет'],
  ['enum', 'Список'],
  ['color', 'Цвет'],
];

export default function PropertyDictionary({ properties, onRefresh, onClose, onError }) {
  const [form, setForm] = useState({
    name: '',
    type: 'string',
    unit: '',
    isFilterable: false,
    showInCard: true,
    showInPdf: true,
  });
  const [paramFor, setParamFor] = useState(null);
  const [param, setParam] = useState({ label: '', hex: '#888888', ral: '', defaultPriceDeltaKopecks: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createProperty(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    onError?.('');
    try {
      await adminApi.createProperty({
        name: form.name,
        type: form.type,
        unit: form.unit || null,
        isFilterable: form.isFilterable,
        showInCard: form.showInCard,
        showInPdf: form.showInPdf,
      });
      setForm({ name: '', type: 'string', unit: '', isFilterable: false, showInCard: true, showInPdf: true });
      await onRefresh();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addParam(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.addParam(paramFor, {
        label: param.label,
        hex: ['color'].includes(properties.find((item) => item.id === paramFor)?.type) ? param.hex : undefined,
        ral: param.ral || undefined,
        defaultPriceDeltaKopecks: Number(param.defaultPriceDeltaKopecks) || 0,
      });
      setParam({ label: '', hex: '#888888', ral: '', defaultPriceDeltaKopecks: 0 });
      setParamFor(null);
      await onRefresh();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProperty(property) {
    if (!window.confirm(`Удалить свойство «${property.name}»?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteProperty(property.id);
      await onRefresh();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeParam(property, item) {
    if (!window.confirm(`Удалить параметр «${item.label}»?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteParam(property.id, item.id);
      await onRefresh();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel dictionary-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Справочник</p>
          <h2>Свойства</h2>
        </div>
        {onClose && (
          <button className="button button-ghost button-small" type="button" onClick={onClose}>
            Закрыть
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <p className="muted small">
        Названия уникальны без учёта регистра, лишних пробелов и «ё». Параметры используются в
        опциях и фильтрах.
      </p>

      <form className="form" onSubmit={createProperty}>
        <div className="grid2">
          <label>
            Новое свойство
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Например, Цвет"
              required
            />
          </label>
          <label>
            Тип
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Единица
            <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          </label>
          <div className="checkbox-stack">
            <label className="checkbox-label inline">
              <input type="checkbox" checked={form.isFilterable} onChange={(event) => setForm({ ...form, isFilterable: event.target.checked })} />
              Фильтр
            </label>
            <label className="checkbox-label inline">
              <input type="checkbox" checked={form.showInCard} onChange={(event) => setForm({ ...form, showInCard: event.target.checked })} />
              В карточке
            </label>
            <label className="checkbox-label inline">
              <input type="checkbox" checked={form.showInPdf} onChange={(event) => setForm({ ...form, showInPdf: event.target.checked })} />
              В PDF
            </label>
          </div>
        </div>
        <div className="actions">
          <button className="button button-small" type="submit" disabled={busy}>
            Добавить свойство
          </button>
        </div>
      </form>

      <div className="dictionary-list">
        {properties.length === 0 && <p className="muted">Свойств пока нет.</p>}
        {properties.map((property) => (
          <div className="dictionary-item" key={property.id}>
            <div className="dictionary-head">
              <div>
                <strong>{property.name}</strong>
                <small>
                  {property.type}
                  {property.unit ? `, ${property.unit}` : ''} · использований: {property.usageCount || 0}
                </small>
              </div>
              <div className="actions">
                {['enum', 'color'].includes(property.type) && (
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => {
                      setParamFor(property.id);
                      setParam({ label: '', hex: '#888888', ral: '', defaultPriceDeltaKopecks: 0 });
                    }}
                  >
                    + параметр
                  </button>
                )}
                <button className="link-danger" type="button" onClick={() => removeProperty(property)}>
                  Удалить
                </button>
              </div>
            </div>

            {property.params.length > 0 && (
              <div className="chips">
                {property.params.map((item) => (
                  <span className="chip" key={item.id}>
                    {item.hex && <span className="color-dot" style={{ background: item.hex }} />}
                    {item.label}
                    <button type="button" title="Удалить параметр" onClick={() => removeParam(property, item)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {paramFor === property.id && (
              <form className="param-form" onSubmit={addParam}>
                <label>
                  Название
                  <input value={param.label} onChange={(event) => setParam({ ...param, label: event.target.value })} required autoFocus />
                </label>
                {['color'].includes(property.type) && (
                  <label>
                    HEX
                    <input type="color" value={param.hex} onChange={(event) => setParam({ ...param, hex: event.target.value })} />
                  </label>
                )}
                <label>
                  RAL
                  <input value={param.ral} onChange={(event) => setParam({ ...param, ral: event.target.value })} />
                </label>
                <label>
                  Доплата, коп.
                  <input
                    type="number"
                    value={param.defaultPriceDeltaKopecks}
                    onChange={(event) => setParam({ ...param, defaultPriceDeltaKopecks: event.target.value })}
                  />
                </label>
                <div className="actions">
                  <button className="button button-small" type="submit" disabled={busy}>
                    Сохранить
                  </button>
                  <button className="button button-ghost button-small" type="button" onClick={() => setParamFor(null)}>
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
