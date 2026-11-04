import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRides, setRideActive } from '../../api/admin.api.js';

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

export default function AdminRides() {
  const [rides, setRides] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    listRides()
      .then(({ items }) => setRides(items))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const toggle = async (id, active) => {
    setBusyId(id);
    setError(null);
    try {
      await setRideActive(id, active);
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
        <span className="text-lg font-semibold text-slate-800">Admin · Rides</span>
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm font-medium text-slate-600 hover:underline">
            Dashboard
          </Link>
          <Link to="/admin/users" className="text-sm font-medium text-slate-600 hover:underline">
            Users
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {rides === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {rides?.map((ride) => (
          <div
            key={ride.id}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {ride.origin} → {ride.destination}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ride.status] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {ride.status}
                </span>
              </p>
              <p className="truncate text-sm text-slate-500">
                {new Date(ride.departureAt).toLocaleString()} · {ride.driver?.name}
              </p>
            </div>

            {ride.status === 'ACTIVE' && (
              <button
                onClick={() => toggle(ride.id, false)}
                disabled={busyId === ride.id}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Deactivate
              </button>
            )}
            {ride.status === 'SUSPENDED' && (
              <button
                onClick={() => toggle(ride.id, true)}
                disabled={busyId === ride.id}
                className="rounded-lg border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        ))}

        {rides && rides.length === 0 && <p className="text-sm text-slate-500">No rides.</p>}
      </main>
    </div>
  );
}
