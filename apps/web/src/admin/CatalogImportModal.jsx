import { useEffect, useRef, useState } from 'react';
import { adminApi } from './adminApi.js';

const STAGE_LABELS = {
  extracting: 'Распаковка архива…',
  parsing: 'Разбор манифеста…',
  creating: 'Создание и обновление товаров…',
  optimizing: 'Оптимизация моделей…',
  done: 'Готово',
  failed: 'Ошибка',
};

export default function CatalogImportModal({ onClose, onDone, onError }) {
  const [file, setFile] = useState(null);
  const [createParams, setCreateParams] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const started = await adminApi.importZip(file, { createParams });
      const id = started.id;
      const poll = async () => {
        let current = null;
        try {
          current = await adminApi.getImportStatus(id);
        } catch (error) {
          clearInterval(pollRef.current);
          setBusy(false);
          onError?.(error.message);
          return;
        }
        setStatus(current);
        if (current.status === 'done' || current.status === 'failed') {
          clearInterval(pollRef.current);
          setBusy(false);
          if (current.status === 'done') onDone?.(current);
        }
      };
      await poll();
      pollRef.current = setInterval(poll, 1500);
    } catch (error) {
      setBusy(false);
      onError?.(error.message);
    }
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setBusy(false);
    setStatus(null);
    setFile(null);
    setCreateParams(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const progress = status?.progress ?? 0;
  const finished = status && (status.status === 'done' || status.status === 'failed');
  const working = status && !finished;
  const hasErrors = status?.errors?.length > 0;

  return (
    <div className="import-modal">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Каталог</p>
          <h2>Импорт из ZIP</h2>
        </div>
        <button className="button button-ghost button-small" type="button" onClick={() => { reset(); onClose?.(); }}>
          Закрыть
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <p className="muted">
          Архив с манифестом <code>manifest.csv</code> / <code>manifest.json</code> и папками моделей и фото. Совместим
          с форматом «models.zip + export.json». Подробности — в <code>docs/import.md</code>.
        </p>
        <label className="upload-field">
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <span>{file ? file.name : 'Выбрать ZIP-архив'}</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={createParams}
            disabled={busy}
            onChange={(event) => setCreateParams(event.target.checked)}
          />
          Создавать недостающие параметры свойств (enum/color) автоматически
        </label>

        {!finished && (
          <button className="button" type="submit" disabled={busy || !file}>
            {busy ? 'Загрузка…' : 'Импортировать'}
          </button>
        )}

        {working && (
          <div className="import-progress">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <p className="muted small">
              {STAGE_LABELS[status.stage] || status.stage} · {progress}%
              {status.stage === 'creating' && status.total ? ` · ${status.done}/${status.total}` : ''}
              {status.stage === 'optimizing' && status.total ? ` · ${status.done}/${status.total}` : ''}
            </p>
          </div>
        )}

        {status?.status === 'done' && (
          <div className="alert alert-ok">
            Готово: создано товаров <strong>{status.created}</strong>, обновлено <strong>{status.updated}</strong>,
            оптимизировано моделей <strong>{status.optimized}</strong>
            {hasErrors ? `, ошибок ${status.errors.length}` : ''}.
          </div>
        )}
        {status?.status === 'failed' && (
          <div className="alert alert-error">Импорт не удался: {status.errors?.[0]?.error || 'неизвестная ошибка'}</div>
        )}
        {hasErrors && (
          <details className="import-errors">
            <summary>Ошибки и предупреждения ({status.errors.length})</summary>
            <ul>
              {status.errors.slice(0, 50).map((item, index) => (
                <li key={index}><strong>{item.row}:</strong> {item.error}</li>
              ))}
            </ul>
          </details>
        )}

        {finished && (
          <button className="button" type="button" onClick={() => { reset(); onClose?.(); }}>
            Закрыть
          </button>
        )}
      </form>

      <style>{`
        .import-modal { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 20px; }
        .import-modal .upload-field { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .import-modal .upload-field input { max-width: 320px; }
        .import-modal .check-row { display: flex; gap: 8px; align-items: center; }
        .import-modal .progress-track { height: 10px; border-radius: 6px; background: var(--bg, #eef0f3); overflow: hidden; }
        .import-modal .progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand, #0078ee), #3bdcff); border-radius: 6px; transition: width .4s ease; }
        .import-modal .import-errors { max-height: 220px; overflow: auto; font-size: 13px; }
        .import-modal .import-errors ul { margin: 8px 0 0; padding-left: 18px; }
      `}</style>
    </div>
  );
}
