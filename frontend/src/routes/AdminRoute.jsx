// Guards admin-only pages: waits for session restore, requires authentication,
// then requires role = ADMIN. Non-admins are sent back to the home page. This is a
// UX gate only — the backend independently enforces admin authorization.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function AdminRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return children;
}
