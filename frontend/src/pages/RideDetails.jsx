import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRide } from '../api/rides.api.js';
import { requestBooking } from '../api/bookings.api.js';
import { useAuth } from '../hooks/useAuth.js';

export default function RideDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ride, setRide] = useState(null);
  const [error, setError] = useState(null);
  const [seats, setSeats] = useState(1);
  const [request, setRequest] = useState({ state: 'idle', message: null });

  useEffect(() => {
    getRide(id)
      .then(({ ride }) => setRide(ride))
      .catch((err) => setError(err.message));
  }, [id]);

  const onRequest = async () => {
    setRequest({ state: 'submitting', message: null });
    try {
      await requestBooking({ rideId: id, seatsBooked: Number(seats) });
      setRequest({ state: 'success', message: 'Request sent! Track it under My bookings.' });
    } catch (err) {
      setRequest({ state: 'error', message: err.message });
    }
  };

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>;
  }
  if (!ride) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }

  const isOwnRide = ride.driver?.id === user?.id;
  const bookable = ride.status === 'ACTIVE' && ride.availableSeats > 0 && !isOwnRide;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Ride details</span>
        <Link to="/search" className="text-sm font-medium text-slate-600 hover:underline">
          Back to search
        </Link>
      </header>

      <main className="mx-auto max-w-lg p-6">
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-semibold text-slate-800">
            {ride.origin} → {ride.destination}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{new Date(ride.departureAt).toLocaleString()}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Driver</dt>
              <dd className="font-medium text-slate-800">{ride.driver?.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Seats available</dt>
              <dd className="font-medium text-slate-800">
                {ride.availableSeats} / {ride.totalSeats}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Price per seat</dt>
              <dd className="font-medium text-slate-800">${ride.pricePerSeat.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-slate-800">{ride.status}</dd>
            </div>
          </dl>

          {ride.notes && <p className="mt-4 text-sm text-slate-600">{ride.notes}</p>}

          <div className="mt-6 border-t border-slate-100 pt-4">
            {isOwnRide && <p className="text-sm text-slate-500">This is your ride.</p>}
            {!isOwnRide && ride.status !== 'ACTIVE' && (
              <p className="text-sm text-slate-500">This ride is no longer open for booking.</p>
            )}
            {!isOwnRide && ride.status === 'ACTIVE' && ride.availableSeats === 0 && (
              <p className="text-sm text-slate-500">This ride is full.</p>
            )}

            {bookable && request.state !== 'success' && (
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="seats" className="text-sm font-medium text-slate-700">
                    Seats
                  </label>
                  <select
                    id="seats"
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500"
                  >
                    {Array.from({ length: ride.availableSeats }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={onRequest}
                  disabled={request.state === 'submitting'}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {request.state === 'submitting' ? 'Requesting…' : 'Request seats'}
                </button>
              </div>
            )}

            {request.state === 'success' && (
              <p className="text-sm text-green-600">
                {request.message}{' '}
                <Link to="/bookings" className="font-medium underline">
                  My bookings
                </Link>
              </p>
            )}
            {request.state === 'error' && <p className="mt-2 text-sm text-red-500">{request.message}</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
