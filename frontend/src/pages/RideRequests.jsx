import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRideBookings, acceptBooking, rejectBooking } from '../api/bookings.api.js';
import { getRide } from '../api/rides.api.js';
import BookingBadge from '../components/BookingBadge.jsx';

export default function RideRequests() {
  const { id } = useParams();
  const [ride, setRide] = useState(null);
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    Promise.all([getRide(id), getRideBookings(id)])
      .then(([r, b]) => {
        setRide(r.ride);
        setRequests(b.bookings);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [id]);

  const act = async (bookingId, action) => {
    setBusyId(bookingId);
    setError(null);
    setNotice(null);
    try {
      await (action === 'accept' ? acceptBooking(bookingId) : rejectBooking(bookingId));
      setNotice(action === 'accept' ? 'Request accepted — seats confirmed.' : 'Request rejected.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Ride requests</span>
        <Link to="/rides" className="text-sm font-medium text-slate-600 hover:underline">
          Back to my rides
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 p-6">
        {ride && (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="font-medium text-slate-800">
              {ride.origin} → {ride.destination}
            </p>
            <p className="text-sm text-slate-500">
              {new Date(ride.departureAt).toLocaleString()} · {ride.availableSeats}/{ride.totalSeats} seats open
            </p>
          </div>
        )}

        {notice && <p className="text-sm text-green-600">{notice}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {requests === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {requests && requests.length === 0 && (
          <p className="text-sm text-slate-500">No requests yet.</p>
        )}

        {requests?.map((b) => (
          <div key={b.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">{b.passenger?.name}</p>
                <p className="text-sm text-slate-500">
                  {b.seatsBooked} seat{b.seatsBooked === 1 ? '' : 's'} requested
                </p>
              </div>
              <BookingBadge status={b.status} />
            </div>

            {b.status === 'PENDING' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => act(b.id, 'accept')}
                  disabled={busyId === b.id}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => act(b.id, 'reject')}
                  disabled={busyId === b.id}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
