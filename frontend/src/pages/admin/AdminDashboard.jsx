import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../../api/admin.api.js';

// Small labelled stat card.
function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-2xl font-semibold text-slate-800">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

// Renders a { STATUS: count } breakdown as a row of small pills.
function Breakdown({ byStatus }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {Object.entries(byStatus).map(([status, count]) => (
        <span key={status} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {status}: {count}
        </span>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStats()
      .then(({ stats }) => setStats(stats))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Admin · Dashboard</span>
        <div className="flex items-center gap-3">
          <Link to="/admin/users" className="text-sm font-medium text-slate-600 hover:underline">
            Users
          </Link>
          <Link to="/admin/rides" className="text-sm font-medium text-slate-600 hover:underline">
            Rides
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {stats === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {stats && (
          <>
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Users</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Total" value={stats.users.total} />
                <Stat label="Active" value={stats.users.active} />
                <Stat label="Deactivated" value={stats.users.deactivated} />
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Rides</h2>
              <Stat label="Total" value={stats.rides.total} />
              <Breakdown byStatus={stats.rides.byStatus} />
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Bookings</h2>
              <Stat label="Total" value={stats.bookings.total} />
              <Breakdown byStatus={stats.bookings.byStatus} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
