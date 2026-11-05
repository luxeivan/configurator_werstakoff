import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ORDER_STATUS_LABELS, formatMoney } from '@planner/shared';
import { apiFetch } from '../lib/api.js';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitForm, setSubmitForm] = useState({ name: '', phone: '', email: '', consent: false });

  async function load() {
    setLoading(true);
    try {
      setOrders(await apiFetch('/api/orders'));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function open(order) {
    try {
      const detail = await apiFetch(`/api/orders/${order.publicId}`);
      setSelected(detail);
      setSubmitForm({
        name: detail.customer?.name || '',
        phone: detail.customer?.phone || '',
        email: detail.customer?.email || '',
        consent: Boolean(detail.consentAt),
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitDraft() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await apiFetch(`/api/orders/${selected.publicId}/submit`, {
        method: 'POST',
        body: { contacts: submitForm, version: selected.version },
      });
      setSelected(updated);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(order) {
    if (!window.confirm(`Удалить заказ ${order.number}?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${order.publicId}`, { method: 'DELETE' });
      if (selected?.publicId === order.publicId) setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clone(order) {
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${order.publicId}/clone`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="orders-page">
      <div className="hero compact">
        <div>
          <p className="eyebrow">Шаг 4 из 4</p>
          <h1>Мои заказы</h1>
          <p className="muted">Заказы этой сессии. PDF, повторная отправка и копии доступны здесь.</p>
        </div>
        <Link className="button button-ghost button-small" to="/">Новый проект</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Загружаем заказы…</p>}
      {!loading && orders.length === 0 && (
        <div className="empty">
          Пока нет заказов. <Link to="/">Создайте первый проект</Link>.
        </div>
      )}

      <div className="orders-list">
        {orders.map((order) => (
          <article className="card order-card" key={order.publicId}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">{new Date(order.createdAt).toLocaleString('ru-RU')}</p>
                <h2>{order.number}</h2>
              </div>
              <span className={`status ${order.status === 'submitted' || order.status === 'done' ? 'ok' : ''}`}>
                {ORDER_STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            <div className="summary">
              <span>{order.positions} поз. / {order.itemsCount} шт.</span>
              <span>{order.imagesCount} снимков</span>
              <strong>{formatMoney(order.totalKopecks)}</strong>
            </div>
            <div className="actions">
              <button className="button button-small" type="button" onClick={() => open(order)}>Открыть</button>
              {order.pdfReady && (
                <a className="button button-ghost button-small" href={`/api/orders/${order.publicId}/pdf`} target="_blank" rel="noreferrer">
                  PDF
                </a>
              )}
              <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => clone(order)}>
                Копия
              </button>
              <button className="button button-ghost button-small danger" type="button" disabled={busy} onClick={() => remove(order)}>
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-card order-detail" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Заказ</p>
                <h2>{selected.number}</h2>
              </div>
              <button className="button button-ghost button-small" type="button" onClick={() => setSelected(null)}>Закрыть</button>
            </div>

            <div className="summary">
              <span>Статус: {ORDER_STATUS_LABELS[selected.status] || selected.status}</span>
              <span>Позиций: {selected.items.length}</span>
              <strong>{formatMoney(selected.totalKopecks)}</strong>
            </div>

            <div className="order-lines">
              {selected.items.map((item) => (
                <div className="order-line" key={item.id}>
                  <div>
                    <strong>{item.snapshot.name}</strong>
                    <small>
                      {item.quantity} × {formatMoney(item.unitPriceKopecks)}
                      {item.snapshot.options?.length ? ` · ${item.snapshot.options.map((o) => o.label).join(', ')}` : ''}
                    </small>
                  </div>
                  <b>{formatMoney(item.totalKopecks)}</b>
                </div>
              ))}
            </div>

            {selected.images?.length > 0 && (
              <div className="order-thumbs">
                {selected.images.map((image) => (
                  <a key={image.kind} href={image.url} target="_blank" rel="noreferrer">
                    <img src={image.url} alt={image.kind} />
                  </a>
                ))}
              </div>
            )}

            <div className="actions">
              {selected.pdfReady && (
                <a className="button" href={selected.pdfUrl} target="_blank" rel="noreferrer">Скачать PDF</a>
              )}
              {['draft', 'saved'].includes(selected.status) && (
                <button className="button" type="button" disabled={busy} onClick={submitDraft}>Отправить заказ</button>
              )}
            </div>

            {['draft', 'saved'].includes(selected.status) && (
              <div className="form submit-draft-form">
                <div className="grid2">
                  <label>Имя<input value={submitForm.name} onChange={(event) => setSubmitForm({ ...submitForm, name: event.target.value })} /></label>
                  <label>Телефон<input value={submitForm.phone} onChange={(event) => setSubmitForm({ ...submitForm, phone: event.target.value })} /></label>
                  <label>E-mail<input type="email" value={submitForm.email} onChange={(event) => setSubmitForm({ ...submitForm, email: event.target.value })} /></label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={submitForm.consent} onChange={(event) => setSubmitForm({ ...submitForm, consent: event.target.checked })} />
                    Согласие
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
