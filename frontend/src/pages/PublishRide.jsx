import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRide } from '../api/rides.api.js';
import FormField from '../components/FormField.jsx';

const EMPTY = { origin: '', destination: '', departureAt: '', totalSeats: 1, pricePerSeat: 0, notes: '' };

export default function PublishRide() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const validate = () => {
    if (!form.origin.trim() || !form.destination.trim()) return 'Origin and destination are required.';
    if (!form.departureAt) return 'Departure date/time is required.';
    if (new Date(form.departureAt) <= new Date()) return 'Departure must be in the future.';
    if (Number(form.totalSeats) < 1) return 'At least one seat is required.';
    if (Number(form.pricePerSeat) < 0) return 'Price cannot be negative.';
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createRide({
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        departureAt: new Date(form.departureAt).toISOString(),
        totalSeats: Number(form.totalSeats),
        pricePerSeat: Number(form.pricePerSeat),
        notes: form.notes.trim() || null,
      });
      navigate('/rides');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Publish a ride</span>
        <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
          Back
        </Link>
      </header>

      <main className="mx-auto max-w-lg p-6">
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <FormField id="origin" label="Pickup (origin)" value={form.origin} onChange={update('origin')} />
          <FormField id="destination" label="Destination" value={form.destination} onChange={update('destination')} />
          <FormField
            id="departureAt"
            label="Departure"
            type="datetime-local"
            value={form.departureAt}
            onChange={update('departureAt')}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="totalSeats"
              label="Seats"
              type="number"
              min="1"
              max="8"
              value={form.totalSeats}
              onChange={update('totalSeats')}
            />
            <FormField
              id="pricePerSeat"
              label="Price per seat"
              type="number"
              min="0"
              step="0.01"
              value={form.pricePerSeat}
              onChange={update('pricePerSeat')}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium text-slate-700">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={update('notes')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Publishing…' : 'Publish ride'}
          </button>
        </form>
      </main>
    </div>
  );
}
