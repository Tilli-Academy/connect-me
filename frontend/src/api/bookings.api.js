import { apiRequest } from './client.js';

export function requestBooking({ rideId, seatsBooked }) {
  return apiRequest('/api/bookings', { method: 'POST', body: { rideId, seatsBooked } });
}

export function getMyBookings() {
  return apiRequest('/api/bookings/mine');
}

export function getRideBookings(rideId) {
  return apiRequest(`/api/rides/${rideId}/bookings`);
}

export function acceptBooking(id) {
  return apiRequest(`/api/bookings/${id}/accept`, { method: 'PATCH' });
}

export function rejectBooking(id) {
  return apiRequest(`/api/bookings/${id}/reject`, { method: 'PATCH' });
}

export function cancelBooking(id) {
  return apiRequest(`/api/bookings/${id}/cancel`, { method: 'PATCH' });
}
