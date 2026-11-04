import { apiRequest } from './client.js';

export function register({ email, password, name, phone }) {
  const body = { email, password, name };
  if (phone) body.phone = phone;
  return apiRequest('/api/auth/register', { method: 'POST', body, auth: false });
}

export function login({ email, password }) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
}

export function getMe() {
  return apiRequest('/api/auth/me');
}

export function changePassword({ currentPassword, newPassword }) {
  return apiRequest('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}
