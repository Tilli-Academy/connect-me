import { apiRequest } from './client.js';

export function getProfile() {
  return apiRequest('/api/users/me');
}

export function updateProfile(fields) {
  return apiRequest('/api/users/me', { method: 'PATCH', body: fields });
}
