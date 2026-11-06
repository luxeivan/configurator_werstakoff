import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, formatMoney } from '@planner/shared';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import AdminShell from '../admin/AdminShell.jsx';
import { adminApi } from '../admin/adminApi.js';
import Icon from '../components/Icon.jsx';

export default function AdminOrdersPage() {
  const { user, loading, isManager } = useAuth();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: 'in_progress', comment: '' });

  async function load(nextPage = page) {
    setBusy(true);
    try {
      const [list, statsData] = await Promise.all([
        adminApi.listOrders({ status, q: q.trim(), page: nextPage, limit: 20 }),
        apiFetch('/api/admin/orders/stats'),
      ]);
      setOrders(list.data);
      setMeta(list.meta || { total: list.data.length, page: nextPage, limit: 20 });
      setStats(statsData);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isManager) load();
  }, [isManager, status, page]);

  async function open(order) {
    try {
      const detail = await apiFetch(`/api/admin/orders/${order.publicId}`);
      setSelected(detail);
      setStatusForm({ status: detail.status, comment: detail.customer?.comment || '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveStatus() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await apiFetch(`/api/admin/orders/${selected.publicId}`, {
        method: 'PATCH',
        body: { ...statusForm, version: selected.version },
      });
      setSelected(updated);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/orders/${selected.publicId}/pdf/regenerate`, { method: 'POST' });
      setSelected(await apiFetch(`/api/admin/orders/${selected.publicId}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function purge(order) {
    if (!window.confirm(`Удалить заказ ${order.number} безвозвратно?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/orders/${order.publicId}`, { method: 'DELETE' });
      if (selected?.publicId === order.publicId) setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <section className="card page">
        <p className="muted">Проверяем сессию…</p>
      </section>
    );
  if (!user)
    return (
      <section className="card page narrow">
        <h1>Требуется вход</h1>
        <Link className="button" to="/login">
          Войти
        </Link>
      </section>
    );
  if (!isManager)
    return (
      <section className="card page narrow">
        <h1>Недостаточно прав</h1>
        <Link className="button button-ghost" to="/">
          На главную
        </Link>
      </section>
    );

  return (
    <section className="admin-orders-page">
      <AdminShell
        eyebrow="Админка · заказы"
        title="Заказы"
        subtitle={`${user.name || user.email} · ${user.role}`}
      >
      <div className="admin-orders-toolbar">
        {stats && (
          <span className="badge">
            {stats.total} заказов · {formatMoney(stats.totalKopecks)}
          </span>
        )}
        {user.role === 'admin' && (
          <a className="button button-ghost button-small" href="/api/admin/orders/export.csv">
            Экспорт CSV
          </a>
        )}
      </div>

      <div className="admin-orders-body">
        {stats && (
          <div className="admin-grid">
            {ORDER_STATUSES.map((key) => (
              <div className="admin-tile" key={key}>
                <strong>{stats.byStatus?.[key] || 0}</strong>
                <span>{ORDER_STATUS_LABELS[key]}</span>
              </div>
            ))}
          </div>
        )}

        {stats && (
          <div className="dashboard-grid">
            <div className="card dashboard-card">
              <div className="panel-head">
                <h2>Последние заказы</h2>
                <span className="badge">{stats.total} всего</span>
              </div>
              <div className="dashboard-list">
                {(stats.recent || []).map((order) => (
                  <button
                    key={order.publicId}
                    type="button"
                    className="dashboard-row"
                    onClick={() => open(order)}
                  >
                    <span>
                      <b>{order.number}</b>
                      <small>{order.customer?.name || 'Без имени'}</small>
                    </span>
                    <span>{formatMoney(order.totalKopecks)}</span>
                  </button>
                ))}
                {!stats.recent?.length && <p className="muted small">Заказов пока нет.</p>}
              </div>
            </div>
            <div className="card dashboard-card">
              <div className="panel-head">
                <h2>Топ товаров</h2>
                <span className="badge">по количеству</span>
              </div>
              <div className="dashboard-list">
                {(stats.topProducts || []).map((product) => (
                  <div className="dashboard-row static" key={product.name}>
                    <span>
                      <b>{product.name}</b>
                      <small>{product.quantity} шт.</small>
                    </span>
                    <span>{formatMoney(product.totalKopecks)}</span>
                  </div>
                ))}
                {!stats.topProducts?.length && <p className="muted small">Нет данных.</p>}
              </div>
            </div>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="card orders-filter">
          <input
            placeholder="Номер, имя, телефон, e-mail"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Все статусы</option>
            {ORDER_STATUSES.map((key) => (
              <option key={key} value={key}>
                {ORDER_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            className="button button-small"
            type="button"
            onClick={() => {
              setPage(1);
              load(1);
            }}
            disabled={busy}
          >
            Найти
          </button>
        </div>

        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Статус</th>
                <th>Позиции</th>
                <th>Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.publicId}>
                  <td>
                    <strong>{order.number}</strong>
                  </td>
                  <td>{new Date(order.createdAt).toLocaleString('ru-RU')}</td>
                  <td>
                    {order.customer?.name}
                    <br />
                    <small>{order.customer?.phone}</small>
                  </td>
                  <td>
                    <span
                      className={`status ${['submitted', 'done'].includes(order.status) ? 'ok' : ''}`}
                    >
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td>
                    {order.positions} / {order.itemsCount}
                  </td>
                  <td>{formatMoney(order.totalKopecks)}</td>
                  <td>
                    <button
                      className="button button-small"
                      type="button"
                      onClick={() => open(order)}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan="7" className="muted">
                    Заказов нет.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            className="button button-ghost button-small"
            type="button"
            disabled={busy || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <Icon name="arrow-left" size={13} /> Назад
          </button>
          <span className="muted small">
            Стр. {meta.page} · всего {meta.total}
          </span>
          <button
            className="button button-ghost button-small"
            type="button"
            disabled={busy || page * (meta.limit || 20) >= meta.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Вперёд <Icon name="arrow-right" size={13} />
          </button>
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-card order-detail" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Заказ</p>
                <h2>{selected.number}</h2>
              </div>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => setSelected(null)}
              >
                Закрыть
              </button>
            </div>

            <div className="summary">
              <span>
                {selected.customer?.name} · {selected.customer?.phone} · {selected.customer?.email}
              </span>
              <strong>{formatMoney(selected.totalKopecks)}</strong>
            </div>

            <div className="order-lines">
              {selected.items.map((item) => (
                <div className="order-line" key={item.id}>
                  <div>
                    <strong>{item.snapshot.name}</strong>
                    <small>
                      {item.quantity} × {formatMoney(item.unitPriceKopecks)} ·{' '}
                      {item.snapshot.options?.map((o) => o.label).join(', ')}
                    </small>
                  </div>
                  <b>{formatMoney(item.totalKopecks)}</b>
                </div>
              ))}
            </div>

            {selected.images?.length > 0 && (
              <div className="order-thumbs">
                {selected.images.map((image) => (
                  <a href={image.url} target="_blank" rel="noreferrer" key={image.kind}>
                    <img src={image.url} alt={image.kind} />
                  </a>
                ))}
              </div>
            )}

            <div className="grid2">
              <label>
                Статус
                <select
                  value={statusForm.status}
                  onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}
                >
                  {ORDER_STATUSES.map((key) => (
                    <option key={key} value={key}>
                      {ORDER_STATUS_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Комментарий
                <input
                  value={statusForm.comment}
                  onChange={(event) =>
                    setStatusForm({ ...statusForm, comment: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                className="button button-small"
                type="button"
                onClick={saveStatus}
                disabled={busy}
              >
                Сохранить статус
              </button>
              <a
                className="button button-ghost button-small"
                href={`/api/orders/${selected.publicId}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                PDF
              </a>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={regenerate}
                disabled={busy}
              >
                Пересобрать PDF
              </button>
              {user.role === 'admin' && (
                <button
                  className="button button-ghost button-small danger"
                  type="button"
                  onClick={() => purge(selected)}
                  disabled={busy}
                >
                  Удалить
                </button>
              )}
            </div>

            <details>
              <summary>История статусов</summary>
              <ul className="history-list">
                {selected.history?.map((entry) => (
                  <li key={entry.id}>
                    {ORDER_STATUS_LABELS[entry.toStatus] || entry.toStatus} ·{' '}
                    {new Date(entry.createdAt).toLocaleString('ru-RU')}
                    {entry.comment ? ` · ${entry.comment}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
      </AdminShell>
    </section>
  );
}