import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyRides, cancelRide } from '../api/rides.api.js';
import RideCard from '../components/RideCard.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function MyRides() {
  const [rides, setRides] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getMyRides()
      .then(({ rides }) => setRides(rides))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const onConfirmCancel = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cancelRide(confirmId);
      setNotice('Ride cancelled. Any outstanding bookings were cancelled too.');
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
        <span className="text-lg font-semibold text-slate-800">My rides</span>
        <div className="flex items-center gap-3">
          <Link to="/publish" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            Publish
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 p-6">
        {notice && <p className="text-sm text-green-600">{notice}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {rides === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {rides && rides.length === 0 && (
          <p className="text-sm text-slate-500">
            You have not published any rides yet.{' '}
            <Link to="/publish" className="font-medium text-slate-800 hover:underline">
              Publish one
            </Link>
            .
          </p>
        )}

        {rides?.map((ride) => (
          <RideCard key={ride.id} ride={ride}>
            {ride.pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-700">
                {ride.pendingCount} pending request{ride.pendingCount === 1 ? '' : 's'}
              </span>
            )}
            <Link
              to={`/rides/${ride.id}/requests`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              View requests
            </Link>
            {ride.status === 'ACTIVE' && (
              <button
                onClick={() => setConfirmId(ride.id)}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancel ride
              </button>
            )}
          </RideCard>
        ))}
      </main>

      <ConfirmDialog
        open={!!confirmId}
        title="Cancel this ride?"
        message="Outstanding bookings will be cancelled too. This cannot be undone."
        confirmLabel="Cancel ride"
        cancelLabel="Keep ride"
        busy={busy}
        onConfirm={onConfirmCancel}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
