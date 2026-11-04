import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUsers, setUserActive } from '../../api/admin.api.js';
import { useAuth } from '../../hooks/useAuth.js';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    listUsers()
      .then(({ items }) => setUsers(items))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const toggle = async (id, active) => {
    setBusyId(id);
    setError(null);
    try {
      await setUserActive(id, active);
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
        <span className="text-lg font-semibold text-slate-800">Admin · Users</span>
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm font-medium text-slate-600 hover:underline">
            Dashboard
          </Link>
          <Link to="/admin/rides" className="text-sm font-medium text-slate-600 hover:underline">
            Rides
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-6">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {users === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {users?.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {u.name}
                {u.role === 'ADMIN' && (
                  <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    admin
                  </span>
                )}
                {!u.isActive && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    deactivated
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-slate-500">{u.email}</p>
            </div>

            {u.id === me?.id ? (
              <span className="text-xs text-slate-400">you</span>
            ) : u.isActive ? (
              <button
                onClick={() => toggle(u.id, false)}
                disabled={busyId === u.id}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Deactivate
              </button>
            ) : (
              <button
                onClick={() => toggle(u.id, true)}
                disabled={busyId === u.id}
                className="rounded-lg border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        ))}

        {users && users.length === 0 && <p className="text-sm text-slate-500">No users.</p>}
      </main>
    </div>
  );
}
