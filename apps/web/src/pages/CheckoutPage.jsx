import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney, itemUnitPrice, projectSignature } from '@planner/shared';
import { apiFetch, getCsrfToken } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlannerStore } from '../planner/usePlannerStore.js';
import Plan2D from '../planner/Plan2D.jsx';
const Scene3D = lazy(() => import('../planner/Scene3D.jsx'));
import { renderPlanToCanvas } from '../planner/renderPlan.js';
import Icon from '../components/Icon.jsx';

const CAPTURE_KINDS = [
  ['plan2d', 'План 2D'],
  ['view3d_user', '3D: камера'],
  ['view3d_fit', '3D: общий вид'],
  ['front', 'Фронт'],
  ['profile', 'Профиль'],
];

function dataUrlToFile(dataUrl, name) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

async function uploadImage(orderId, kind, dataUrl, camera = null, size = {}) {
  const formData = new FormData();
  formData.append('file', await dataUrlToFile(dataUrl, `${kind}.${dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'}`));
  formData.append('kind', kind);
  if (camera) formData.append('camera', JSON.stringify(camera));
  if (size.width) formData.append('width', String(size.width));
  if (size.height) formData.append('height', String(size.height));
  const headers = new Headers();
  const csrf = getCsrfToken();
  if (csrf) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`/api/orders/${orderId}/images`, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить изображение');
  return payload.data;
}

function readSavedRender(room, items) {
  const raw = sessionStorage.getItem('planner-render');
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved?.dataUrl || !saved?.signature) return null;
    if (saved.signature !== projectSignature(room, items)) return null;
    return saved;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const room = usePlannerStore((state) => state.room);
  const items = usePlannerStore((state) => state.items);
  const sceneRef = useRef(null);
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    company: '',
    inn: '',
    comment: '',
    consent: false,
  });
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + itemUnitPrice(item.product, item.selectedOptions) * item.quantity, 0),
    [items],
  );

  useEffect(() => {
    const raw = sessionStorage.getItem('planner-camera');
    if (!raw) return;
    try {
      const camera = JSON.parse(raw);
      window.setTimeout(() => sceneRef.current?.setCamera(camera), 250);
    } catch {
      // ignore invalid camera
    }
  }, []);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!room || !items.length) {
      setError('Проект пуст: вернитесь в планировщик.');
      return;
    }
    if (!form.consent) {
      setError('Нужно согласие на обработку персональных данных.');
      return;
    }
    setStatus('working');
    setProgress(draftOrder ? 'Продолжаем оформление черновика…' : 'Создаём заказ…');
    try {
      const created = draftOrder || await apiFetch('/api/orders', {
        method: 'POST',
        body: {
          room,
          items: items.map((item) => ({
            productId: item.product.publicId,
            placement: {
              x: item.x,
              z: item.z,
              rotationDeg: item.rotationDeg,
              elevationCm: item.elevationCm || 0,
            },
            quantity: item.quantity,
            options: item.selectedOptions || [],
          })),
          contacts: form,
        },
      });
      if (!draftOrder) setDraftOrder(created);

      setProgress('Готовим снимки 2D…');
      const planCanvas = renderPlanToCanvas(room, items);
      if (planCanvas) {
        await uploadImage(created.publicId, 'plan2d', planCanvas.toDataURL('image/png'), null, {
          width: planCanvas.width,
          height: planCanvas.height,
        });
      }

      const savedRender = readSavedRender(room, items);
      for (const kind of ['view3d_user', 'view3d_fit', 'front', 'profile']) {
        setProgress(`Снимок: ${CAPTURE_KINDS.find(([key]) => key === kind)?.[1] || kind}…`);
        if (kind === 'view3d_user' && savedRender) {
          await uploadImage(created.publicId, kind, savedRender.dataUrl, savedRender.camera, savedRender);
          continue;
        }
        const capture = await sceneRef.current?.capture?.(kind);
        if (capture?.dataUrl) {
          await uploadImage(created.publicId, kind, capture.dataUrl, capture.camera, capture);
        }
      }

      setProgress('Формируем PDF…');
      await apiFetch(`/api/orders/${created.publicId}/pdf`, { method: 'POST' });

      setProgress('Отправляем заказ…');
      const submitted = await apiFetch(`/api/orders/${created.publicId}/submit`, {
        method: 'POST',
        body: { contacts: form, version: created.version },
      });
      setOrder(submitted);
      setDraftOrder(null);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(draftOrder
        ? `${err.message}. Черновик заказа сохранён — нажмите «Повторить» или откройте «Мои заказы».`
        : err.message);
    }
  }

  if (!room || !items.length) {
    return (
      <section className="card page narrow">
        <p className="eyebrow">Шаг 3 из 4</p>
        <h1>Пока нечего оформлять</h1>
        <p className="muted">Вернитесь в планировщик, задайте комнату и добавьте мебель.</p>
        <Link className="button" to="/">В планировщик</Link>
      </section>
    );
  }

  if (order) {
    return (
      <section className="card page narrow">
        <p className="eyebrow">Готово</p>
        <h1>Заказ {order.number}</h1>
        <p className="muted">Заказ отправлен. PDF сформирован и доступен для скачивания.</p>
        <div className="actions">
          <a className="button" href={order.pdfUrl || `/api/orders/${order.publicId}/pdf`} target="_blank" rel="noreferrer">
            Скачать PDF
          </a>
          <Link className="button button-ghost" to="/orders">Мои заказы</Link>
          <button className="button button-ghost" type="button" onClick={() => navigate('/')}>Вернуться к плану</button>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <div className="hero compact">
        <div>
          <p className="eyebrow">Шаг 3 из 4 · оформление</p>
          <h1>Проверьте заказ</h1>
          <p className="muted">Снимки плана и 3D-видов будут приложены к PDF. Проверьте контакты.</p>
        </div>
        <Link className="button button-ghost button-small" to="/"><Icon name="arrow-left" size={13} /> Вернуться в планировщик</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status === 'working' && <div className="alert alert-ok">{progress}</div>}

      <div className="checkout-grid">
        <div className="card checkout-preview">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Проект</p>
              <h2>План и 3D</h2>
            </div>
            <span className="badge">{items.length} поз.</span>
          </div>
          <div className="checkout-plan">
            <Plan2D
              room={room}
              items={items}
              selectedIds={[]}
              onSelect={() => {}}
              onUpdateItem={() => {}}
              onCommitItems={() => {}}
            />
          </div>
          <div className="checkout-scene">
            <Suspense fallback={<div className="scene-placeholder">Загрузка 3D…</div>}>
              <Scene3D ref={sceneRef} room={room} items={items} selectedIds={[]} />
            </Suspense>
          </div>
        </div>

        <form className="card form" onSubmit={submit}>
          <fieldset>
            <legend>Контакты</legend>
            <div className="grid2">
              <label>
                Имя
                <input value={form.name} onChange={(event) => field('name', event.target.value)} required />
              </label>
              <label>
                Телефон
                <input value={form.phone} onChange={(event) => field('phone', event.target.value)} required />
              </label>
              <label>
                E-mail
                <input type="email" value={form.email} onChange={(event) => field('email', event.target.value)} required />
              </label>
              <label>
                Компания
                <input value={form.company} onChange={(event) => field('company', event.target.value)} />
              </label>
              <label>
                ИНН
                <input value={form.inn} onChange={(event) => field('inn', event.target.value)} />
              </label>
            </div>
            <label>
              Комментарий
              <textarea rows="3" value={form.comment} onChange={(event) => field('comment', event.target.value)} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.consent} onChange={(event) => field('consent', event.target.checked)} />
              Согласен на обработку персональных данных
            </label>
          </fieldset>

          <div className="order-lines">
            {items.map((item) => (
              <div className="order-line" key={item.id}>
                <div>
                  <strong>{item.product.name}</strong>
                  <small>
                    {item.quantity} × {formatMoney(itemUnitPrice(item.product, item.selectedOptions))}
                    {item.selectedOptions?.length ? ` · ${item.selectedOptions.length} опц.` : ''}
                  </small>
                </div>
                <b>{formatMoney(itemUnitPrice(item.product, item.selectedOptions) * item.quantity)}</b>
              </div>
            ))}
          </div>

          <div className="summary total-line">
            <span>Итого к оплате</span>
            <strong>{formatMoney(total)}</strong>
          </div>

          <button className="button" type="submit" disabled={status === 'working'}>
            {status === 'working' ? progress || 'Отправляем…' : draftOrder ? 'Повторить оформление' : 'Отправить заказ'}
          </button>
          <p className="muted small">
            Снимки: план 2D, камера пользователя, общий вид, фронт и профиль. PDF формируется на сервере.
          </p>
        </form>
      </div>
    </section>
  );
}
