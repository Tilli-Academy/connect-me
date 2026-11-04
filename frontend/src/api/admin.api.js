// Admin API calls (Phase 10). All requests go through the shared client, which
// attaches the Bearer token; the backend enforces role = ADMIN on every route.
import { apiRequest } from './client.js';

export function getStats() {
  return apiRequest('/api/admin/stats');
}

export function listUsers({ limit = 20, offset = 0 } = {}) {
  return apiRequest(`/api/admin/users?limit=${limit}&offset=${offset}`);
}

export function setUserActive(id, active) {
  // Body-less PATCH (the client omits Content-Type when there is no body).
  return apiRequest(`/api/admin/users/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'PATCH' });
}

export function listRides({ limit = 20, offset = 0 } = {}) {
  return apiRequest(`/api/admin/rides?limit=${limit}&offset=${offset}`);
}

export function setRideActive(id, active) {
  return apiRequest(`/api/admin/rides/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'PATCH' });
}
