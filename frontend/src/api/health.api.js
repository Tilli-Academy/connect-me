import { apiRequest } from './client.js';

export function getHealth() {
  return apiRequest('/api/health');
}
