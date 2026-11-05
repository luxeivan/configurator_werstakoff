let csrfToken = null;

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export async function apiFetchFull(path, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (isMutation && csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Ошибка запроса (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.fields = payload?.error?.fields;
    throw error;
  }

  return payload;
}

export async function apiFetch(path, options = {}) {
  const payload = await apiFetchFull(path, options);
  return payload.data;
}
