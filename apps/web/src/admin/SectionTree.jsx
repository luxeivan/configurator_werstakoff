import { useMemo, useState } from 'react';
import { adminApi } from './adminApi.js';
import Icon from '../components/Icon.jsx';

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children || [], depth + 1),
  ]);
}

function branchIds(node) {
  const ids = [node.id];
  for (const child of node.children || []) ids.push(...branchIds(child));
  return ids;
}

export default function SectionTree({ sections, selectedId, onSelect, onRefresh, onError }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', parentId: '', description: '' });
  const [saving, setSaving] = useState(false);
  const flat = useMemo(() => flatten(sections), [sections]);

  function startCreate(parentId = '') {
    setEditing(null);
    setForm({ name: '', parentId: parentId ? String(parentId) : '', description: '' });
    setFormOpen(true);
  }

  function startEdit(node) {
    setEditing(node);
    setForm({ name: node.name, parentId: node.parentId ? String(node.parentId) : '', description: node.description || '' });
    setFormOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      const body = {
        name: form.name,
        parentId: form.parentId ? Number(form.parentId) : null,
        description: form.description,
      };
      if (editing) await adminApi.updateSection(editing.id, body);
      else await adminApi.createSection(body);
      setFormOpen(false);
      setEditing(null);
      await onRefresh();
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(node) {
    if (!window.confirm(`Удалить раздел «${node.name}»?`)) return;
    onError('');
    try {
      await adminApi.deleteSection(node.id);
      if (selectedId === node.id) onSelect(null);
      await onRefresh();
    } catch (error) {
      onError(error.message);
    }
  }

  const excluded = editing ? new Set(branchIds(editing)) : new Set();
  const parentOptions = flat.filter((node) => !excluded.has(node.id));

  return (
    <aside className="admin-panel section-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Каталог</p>
          <h2>Разделы</h2>
        </div>
        <button type="button" className="button button-small" onClick={() => startCreate()}>
          + Корень
        </button>
      </div>

      <button
        type="button"
        className={`tree-row tree-all ${selectedId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        Все товары
      </button>

      <div className="tree">
        {flat.length === 0 && <p className="muted small">Разделов пока нет.</p>}
        {flat.map((node) => (
          <div
            key={node.id}
            className={`tree-row ${selectedId === node.id ? 'active' : ''}`}
            style={{ paddingLeft: `${10 + node.depth * 14}px` }}
          >
            <button type="button" className="tree-name" onClick={() => onSelect(node.id)}>
              <span>{node.name}</span>
              <small>{node.productCount}</small>
            </button>
            <span className="tree-actions">
              <button type="button" title="Добавить подраздел" onClick={() => startCreate(node.id)}>
                <Icon name="plus" size={13} />
              </button>
              <button type="button" title="Изменить" onClick={() => startEdit(node)}>
                <Icon name="edit" size={13} />
              </button>
              <button type="button" title="Удалить" onClick={() => remove(node)}>
                <Icon name="trash" size={13} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {formOpen && (
        <form className="section-form" onSubmit={submit}>
          <strong>{editing ? 'Изменить раздел' : 'Новый раздел'}</strong>
          <label>
            Название
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label>
            Родитель
            <select
              value={form.parentId}
              onChange={(event) => setForm({ ...form, parentId: event.target.value })}
            >
              <option value="">— корневой —</option>
              {parentOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {'— '.repeat(node.depth)}
                  {node.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Описание
            <input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="actions">
            <button className="button button-small" type="submit" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              className="button button-ghost button-small"
              type="button"
              onClick={() => setFormOpen(false)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
