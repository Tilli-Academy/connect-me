import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyBookings, cancelBooking } from '../api/bookings.api.js';
import BookingBadge from '../components/BookingBadge.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getMyBookings()
      .then(({ bookings }) => setBookings(bookings))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  // Cancellable while still pending/accepted and the ride has not departed.
  const isCancellable = (b) =>
    (b.status === 'PENDING' || b.status === 'ACCEPTED') && new Date(b.ride.departureAt) > new Date();

  const onConfirmCancel = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cancelBooking(confirmId);
      setNotice('Booking cancelled.');
      setConfirmId(null);
      load();
    } catch (err) {
      setError(err.message);
      setConfirmId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">My bookings</span>
        <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
          Back
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 p-6">
        {notice && <p className="text-sm text-green-600">{notice}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {bookings === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {bookings && bookings.length === 0 && (
          <p className="text-sm text-slate-500">
            You have no bookings yet.{' '}
            <Link to="/search" className="font-medium text-slate-800 hover:underline">
              Find a ride
            </Link>
            .
          </p>
        )}

        {bookings?.map((b) => (
          <div key={b.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">
                  {b.ride.origin} → {b.ride.destination}
                </p>
                <p className="text-sm text-slate-500">{new Date(b.ride.departureAt).toLocaleString()}</p>
              </div>
              <BookingBadge status={b.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-x-4 text-sm text-slate-600">
                <span>
                  {b.seatsBooked} seat{b.seatsBooked === 1 ? '' : 's'}
                </span>
                <span>${b.ride.pricePerSeat.toFixed(2)} / seat</span>
                <span>Driver: {b.ride.driver?.name}</span>
              </div>
              {isCancellable(b) && (
                <button
                  onClick={() => setConfirmId(b.id)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Cancel booking
                </button>
              )}
            </div>
          </div>
        ))}
      </main>

      <ConfirmDialog
        open={!!confirmId}
        title="Cancel this booking?"
        message="If it was accepted, the seats will be released back to the ride. This cannot be undone."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        busy={busy}
        onConfirm={onConfirmCancel}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
