import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AdminShell from '../admin/AdminShell.jsx';
import { apiFetch } from '../lib/api.js';

const EMPTY_FORM = {
  companyName: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  pdfTitle: '',
  pdfPrefix: '',
  vatMode: 'included',
  vatRate: 20,
  note: '',
  renderPreset: 'standard',
  renderPasses: 6,
  renderBufferScale: 0.65,
  renderLightSoftness: 1,
  renderPostIntensity: 1,
};

// Пресеты качества рендера: [id, название, число проходов, масштаб буфера].
const RENDER_PRESETS = [
  ['economy', 'Эконом (быстро)', 3, 0.5],
  ['standard', 'Стандарт', 6, 0.65],
  ['quality', 'Качество', 10, 0.75],
  ['max', 'Максимум (медленно)', 16, 0.9],
];

function presetFor(passes, bufferScale) {
  const found = RENDER_PRESETS.find(([, , p, s]) => p === passes && s === bufferScale);
  return found ? found[0] : 'custom';
}

export default function AdminPage() {
  const { user, loading, isAdmin, reason } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setState('loading');
    apiFetch('/api/admin/settings')
      .then((settings) => {
        if (cancelled) return;
        setForm({
          companyName: settings.company?.name || '',
          companyPhone: settings.company?.phone || '',
          companyEmail: settings.company?.email || '',
          companyWebsite: settings.company?.website || '',
          pdfTitle: settings.pdf?.title || '',
          pdfPrefix: settings.pdf?.prefix || '',
          vatMode: settings.pdf?.vatMode || 'included',
          vatRate: Number(settings.pdf?.vatRate ?? 20),
          note: settings.pdf?.note || '',
          renderPasses: Math.min(16, Math.max(2, Number(settings.render?.passes) || 6)),
          renderBufferScale: Math.min(1, Math.max(0.4, Number(settings.render?.bufferScale) || 0.65)),
          renderLightSoftness: Math.min(2, Math.max(0.5, Number(settings.render?.lightSoftness) || 1)),
          renderPostIntensity: Math.min(2, Math.max(0, Number(settings.render?.postIntensity) || 1)),
          renderPreset: presetFor(
            Math.min(16, Math.max(2, Number(settings.render?.passes) || 6)),
            Math.min(1, Math.max(0.4, Number(settings.render?.bufferScale) || 0.65)),
          ),
        });
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage('');
  }

  function applyRenderPreset(preset) {
    const found = RENDER_PRESETS.find(([id]) => id === preset);
    if (!found) return;
    setForm((current) => ({
      ...current,
      renderPreset: preset,
      renderPasses: found[2],
      renderBufferScale: found[3],
    }));
    setMessage('');
  }

  async function save(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setState('saving');
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: {
          company: {
            name: form.companyName,
            phone: form.companyPhone,
            email: form.companyEmail,
            website: form.companyWebsite,
          },
          pdf: {
            title: form.pdfTitle,
            prefix: form.pdfPrefix,
            vatMode: form.vatMode,
            vatRate: Number(form.vatRate),
            note: form.note,
          },
          render: {
            passes: Number(form.renderPasses),
            bufferScale: Number(form.renderBufferScale),
            lightSoftness: Number(form.renderLightSoftness),
            postIntensity: Number(form.renderPostIntensity),
          },
        },
      });
      setMessage('Настройки сохранены');
      setState('ready');
    } catch (err) {
      setError(err.message);
      setState('ready');
    }
  }

  if (loading) {
    return (
      <section className="card page">
        <p className="muted">Проверяем сессию…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="card page narrow">
        <h1>Требуется вход</h1>
        <p className="muted">
          {reason === 'SESSION_EXPIRED'
            ? 'Сессия истекла. Войдите снова.'
            : 'Админка доступна администратору и менеджеру.'}
        </p>
        <Link className="button" to="/login">
          Войти
        </Link>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="card page narrow">
        <h1>Недостаточно прав</h1>
        <p className="muted">
          Вы вошли как {user.name || user.email} ({user.role}). Управление настройками доступно
          администратору.
        </p>
        <Link className="button button-ghost" to="/">
          На главную
        </Link>
      </section>
    );
  }

  return (
    <section className="admin-settings-page">
      <AdminShell
        eyebrow="Админка · настройки"
        title="Настройки планировщика"
        subtitle={`${user.name || user.email} · ${user.role}. Смена пароля и управление менеджерами — через API/CLI.`}
      >
      {state === 'loading' ? (
        <p className="muted">Загружаем настройки…</p>
      ) : (
        <form className="card form settings-form" onSubmit={save}>
          <fieldset>
            <legend>Компания</legend>
            <div className="grid2">
              <label>
                Название
                <input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
              </label>
              <label>
                Телефон
                <input value={form.companyPhone} onChange={(e) => update('companyPhone', e.target.value)} />
              </label>
              <label>
                E-mail
                <input value={form.companyEmail} onChange={(e) => update('companyEmail', e.target.value)} />
              </label>
              <label>
                Сайт
                <input value={form.companyWebsite} onChange={(e) => update('companyWebsite', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>PDF и НДС</legend>
            <div className="grid2">
              <label>
                Заголовок документа
                <input value={form.pdfTitle} onChange={(e) => update('pdfTitle', e.target.value)} />
              </label>
              <label>
                Префикс номера
                <input value={form.pdfPrefix} onChange={(e) => update('pdfPrefix', e.target.value)} />
              </label>
              <label>
                НДС
                <select value={form.vatMode} onChange={(e) => update('vatMode', e.target.value)}>
                  <option value="none">Без НДС</option>
                  <option value="included">Включён в цену</option>
                  <option value="added">Сверху</option>
                </select>
              </label>
              <label>
                Ставка, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.vatRate}
                  onChange={(e) => update('vatRate', e.target.value)}
                />
              </label>
            </div>
            <label>
              Примечание в PDF
              <input value={form.note} onChange={(e) => update('note', e.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Рендер 3D</legend>
            <p className="muted small">
              Эти значения применяются к кнопке «Рендер 3D» у всех посетителей планировщика и
              к снимку камеры в PDF заказа.
            </p>
            <div className="grid2">
              <label>
                Пресет качества
                <select
                  value={form.renderPreset}
                  onChange={(e) => applyRenderPreset(e.target.value)}
                >
                  {RENDER_PRESETS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                  <option value="custom">Свой набор</option>
                </select>
              </label>
              <label>
                Проходы (мягкость теней и сглаживание)
                <select
                  value={form.renderPasses}
                  onChange={(e) => update('renderPasses', Number(e.target.value))}
                >
                  {[3, 5, 6, 8, 10, 12, 16].map((value) => (
                    <option key={value} value={value}>
                      {value} проходов
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Разрешение буфера
                <select
                  value={form.renderBufferScale}
                  onChange={(e) => update('renderBufferScale', Number(e.target.value))}
                >
                  {[0.5, 0.6, 0.65, 0.7, 0.8, 0.9].map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Мягкость теней
                <select
                  value={form.renderLightSoftness}
                  onChange={(e) => update('renderLightSoftness', Number(e.target.value))}
                >
                  {[0.75, 1, 1.25, 1.5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Интенсивность постобработки (тон, свечение, виньетка)
                <select
                  value={form.renderPostIntensity}
                  onChange={(e) => update('renderPostIntensity', Number(e.target.value))}
                >
                  {[0.5, 1, 1.5, 2].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          {message && <div className="alert alert-ok">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="actions">
            <button className="button" type="submit" disabled={state === 'saving'}>
              {state === 'saving' ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <span className="muted small">Изменения пишутся в MySQL и журнал аудита.</span>
          </div>
        </form>
      )}
      </AdminShell>
    </section>
  );
}
