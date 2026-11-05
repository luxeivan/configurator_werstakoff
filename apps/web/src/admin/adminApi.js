import { apiFetch, apiFetchFull, getCsrfToken } from '../lib/api.js';

function query(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function upload(path, formData) {
  const headers = new Headers();
  const csrf = getCsrfToken();
  if (csrf) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Ошибка загрузки (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload.data;
}

export const adminApi = {
  listSections: () => apiFetch('/api/admin/sections'),
  listFlatSections: () => apiFetch('/api/admin/sections/flat'),
  createSection: (body) => apiFetch('/api/admin/sections', { method: 'POST', body }),
  updateSection: (id, body) => apiFetch(`/api/admin/sections/${id}`, { method: 'PATCH', body }),
  deleteSection: (id) => apiFetch(`/api/admin/sections/${id}`, { method: 'DELETE' }),

  listProducts: (filters) => apiFetch(`/api/admin/products${query(filters)}`),
  listProductsAll: async (filters = {}) => {
    const all = [];
    for (let page = 1; ; page += 1) {
      const response = await apiFetchFull(`/api/admin/products${query({ ...filters, page, limit: 100 })}`);
      all.push(...response.data);
      if (!response.data.length || all.length >= (response.meta?.total || all.length)) return all;
    }
  },
  listOrders: (filters) => apiFetchFull(`/api/admin/orders${query(filters)}`),
  getProduct: (id) => apiFetch(`/api/admin/products/${id}`),
  createProduct: (body) => apiFetch('/api/admin/products', { method: 'POST', body }),
  updateProduct: (id, body) => apiFetch(`/api/admin/products/${id}`, { method: 'PATCH', body }),
  deleteProduct: (id) => apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' }),

  saveProductProperties: (id, values) =>
    apiFetch(`/api/admin/products/${id}/properties`, { method: 'PUT', body: { values } }),
  saveProductOptions: (id, options) =>
    apiFetch(`/api/admin/products/${id}/options`, { method: 'PUT', body: { options } }),

  uploadProductImage: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload(`/api/admin/products/${id}/images`, formData);
  },
  deleteProductImage: (id, imageId) =>
    apiFetch(`/api/admin/products/${id}/images/${imageId}`, { method: 'DELETE' }),

  getOptimizeStatus: (id) => apiFetch(`/api/admin/products/${id}/optimize`),
  optimizeProductModel: (id, targetTriangles) =>
    apiFetch(`/api/admin/products/${id}/optimize`, { method: 'POST', body: { targetTriangles } }),
  rollbackProductModel: (id) =>
    apiFetch(`/api/admin/products/${id}/optimize/rollback`, { method: 'POST' }),

  uploadProductModel: (id, file, { bboxMm, triangles, transform }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (bboxMm) formData.append('bboxMm', JSON.stringify(bboxMm));
    if (triangles) formData.append('triangles', String(triangles));
    if (transform) formData.append('transform', JSON.stringify(transform));
    return upload(`/api/admin/products/${id}/model`, formData);
  },

  listProperties: () => apiFetch('/api/admin/properties'),
  createProperty: (body) => apiFetch('/api/admin/properties', { method: 'POST', body }),
  updateProperty: (id, body) => apiFetch(`/api/admin/properties/${id}`, { method: 'PATCH', body }),
  deleteProperty: (id) => apiFetch(`/api/admin/properties/${id}`, { method: 'DELETE' }),
  addParam: (id, body) => apiFetch(`/api/admin/properties/${id}/params`, { method: 'POST', body }),
  updateParam: (id, paramId, body) =>
    apiFetch(`/api/admin/properties/${id}/params/${paramId}`, { method: 'PATCH', body }),
  deleteParam: (id, paramId) =>
    apiFetch(`/api/admin/properties/${id}/params/${paramId}`, { method: 'DELETE' }),
};
