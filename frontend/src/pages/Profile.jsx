import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { getProfile, updateProfile } from '../api/users.api.js';
import FormField from '../components/FormField.jsx';

// View and edit the current user's profile. Email is read-only (login identity).
export default function Profile() {
  const { updateUser } = useAuth();
  const [form, setForm] = useState(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: null });

  useEffect(() => {
    getProfile()
      .then(({ user }) => {
        setEmail(user.email);
        setForm({
          name: user.name ?? '',
          phone: user.phone ?? '',
          bio: user.bio ?? '',
          avatarUrl: user.avatarUrl ?? '',
        });
      })
      .catch((err) => setStatus({ type: 'error', message: err.message }));
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setStatus({ type: 'error', message: 'Name is required.' });
      return;
    }
    setStatus({ type: 'saving', message: null });
    try {
      // Send empty optional fields as null so they are cleared server-side.
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        avatarUrl: form.avatarUrl.trim() || null,
      };
      const { user } = await updateProfile(payload);
      updateUser(user);
      setStatus({ type: 'success', message: 'Profile saved.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        {status.type === 'error' ? status.message : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Carpool</span>
        <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
          Back
        </Link>
      </header>

      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-2xl font-semibold text-slate-800">Your profile</h1>

        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <FormField id="email" label="Email (read-only)" value={email} readOnly disabled />
          <FormField id="name" label="Name" value={form.name} onChange={update('name')} />
          <FormField id="phone" label="Phone" value={form.phone} onChange={update('phone')} />
          <FormField id="avatarUrl" label="Avatar URL" value={form.avatarUrl} onChange={update('avatarUrl')} />

          <div className="flex flex-col gap-1">
            <label htmlFor="bio" className="text-sm font-medium text-slate-700">
              Bio
            </label>
            <textarea
              id="bio"
              rows={3}
              value={form.bio}
              onChange={update('bio')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />
          </div>

          {status.type === 'error' && <p className="text-sm text-red-500">{status.message}</p>}
          {status.type === 'success' && <p className="text-sm text-green-600">{status.message}</p>}

          <button
            type="submit"
            disabled={status.type === 'saving'}
            className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {status.type === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </main>
    </div>
  );
}
