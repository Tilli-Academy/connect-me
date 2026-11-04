import { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchRides } from '../api/rides.api.js';
import RideCard from '../components/RideCard.jsx';
import FormField from '../components/FormField.jsx';

export default function SearchRides() {
  const [criteria, setCriteria] = useState({ origin: '', destination: '', date: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setCriteria({ ...criteria, [field]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { rides } = await searchRides({
        origin: criteria.origin.trim() || undefined,
        destination: criteria.destination.trim() || undefined,
        date: criteria.date || undefined,
      });
      setResults(rides);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-800">Find a ride</span>
        <Link to="/" className="text-sm font-medium text-slate-600 hover:underline">
          Back
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-6">
        <form onSubmit={onSubmit} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="origin" label="Pickup" value={criteria.origin} onChange={update('origin')} />
            <FormField id="destination" label="Destination" value={criteria.destination} onChange={update('destination')} />
            <FormField id="date" label="Date" type="date" value={criteria.date} onChange={update('date')} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {results !== null && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-slate-600">
              {results.length} ride{results.length === 1 ? '' : 's'} found
            </h2>
            {results.map((ride) => (
              <RideCard key={ride.id} ride={ride}>
                <Link
                  to={`/rides/${ride.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  View details
                </Link>
              </RideCard>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
