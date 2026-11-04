import { apiRequest } from './client.js';

export function createRide(ride) {
  return apiRequest('/api/rides', { method: 'POST', body: ride });
}

export function searchRides({ origin, destination, date } = {}) {
  const params = new URLSearchParams();
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  if (date) params.set('date', date);
  const qs = params.toString();
  // auth:true sends the token when present so the caller's own rides are excluded.
  return apiRequest(`/api/rides${qs ? `?${qs}` : ''}`);
}

export function getRide(id) {
  return apiRequest(`/api/rides/${id}`, { auth: false });
}

export function getMyRides() {
  return apiRequest('/api/rides/mine/offered');
}

export function updateRide(id, fields) {
  return apiRequest(`/api/rides/${id}`, { method: 'PATCH', body: fields });
}

export function cancelRide(id) {
  return apiRequest(`/api/rides/${id}`, { method: 'DELETE' });
}
