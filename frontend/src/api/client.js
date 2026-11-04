// Central HTTP client. All API calls go through this layer (CLAUDE.md §5) — components
// never call fetch/axios directly. The JWT is read from localStorage unless overridden.
//
// API paths ("/api/...") are prefixed with the app's base so requests work under a
// path-prefixed proxy. In development BASE_URL is "/5175/" (the code-server subpath),
// so a call becomes "/5175/api/..."; in production BASE_URL is "/", so it stays
// "/api/...". Set VITE_API_URL to an absolute origin to override entirely.
const BASE_URL = import.meta.env.VITE_API_URL ?? import.meta.env.BASE_URL.replace(/\/$/, '');

const TOKEN_KEY = 'carpool_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, { method = 'GET', body, token, auth = true } = {}) {
  const headers = {};
  // Only declare a JSON body when one is actually sent. Body-less mutations
  // (e.g. PATCH accept/reject, DELETE cancel) must NOT set Content-Type, or the
  // server rejects the empty body with FST_ERR_CTP_EMPTY_JSON_BODY.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const bearer = token ?? (auth ? getToken() : null);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content (e.g. change-password) has no body.
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error?.message ?? 'Request failed');
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}
