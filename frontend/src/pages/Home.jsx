import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

// Protected landing page for Phase 2 — confirms the authenticated session.
// Ride search / dashboards arrive in later phases.
export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Carpool</span>
        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Admin
            </Link>
          )}
          <Link
            to="/profile"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Profile
          </Link>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold text-slate-800">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">You are signed in as {user?.email}.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/search"
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300"
          >
            <p className="font-medium text-slate-800">Find a ride</p>
            <p className="mt-1 text-sm text-slate-500">Search trips by pickup, destination, and date.</p>
          </Link>
          <Link
            to="/publish"
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300"
          >
            <p className="font-medium text-slate-800">Publish a ride</p>
            <p className="mt-1 text-sm text-slate-500">Offer seats on a trip you are driving.</p>
          </Link>
          <Link
            to="/rides"
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300"
          >
            <p className="font-medium text-slate-800">My rides</p>
            <p className="mt-1 text-sm text-slate-500">View requests and manage rides you offer.</p>
          </Link>
          <Link
            to="/bookings"
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300"
          >
            <p className="font-medium text-slate-800">My bookings</p>
            <p className="mt-1 text-sm text-slate-500">Track seats you have requested.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
