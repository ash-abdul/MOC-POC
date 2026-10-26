// Small fetch wrapper. The session token is kept in localStorage for the local demo.
const KEY = 'moe_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error;
    this.details = body?.details;
  }
}

async function request(method, url, body) {
  const isForm = body instanceof FormData;
  const token = getToken();
  const res = await fetch('/api' + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    // hosted demo: the access password expired – reload to show the access page
    if (res.status === 401 && data?.error === 'access_required') window.location.reload();
    if (res.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event('moe:logout'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  patch: (u, b = {}) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, fields, file) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') fd.append(k, v);
    fd.append('file', file);
    return request('POST', u, fd);
  },
};

// Build a query string from an object, skipping empty values
export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Authenticated download (Excel exports, document previews)
export async function download(url, filename) {
  const res = await fetch('/api' + url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const fileUrl = (docId) => `/api/documents/${docId}/file?token=${getToken()}`;
