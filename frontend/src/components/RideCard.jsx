// Reusable ride summary card. Used by My Rides now and ride search later.
// `children` renders an optional action area (e.g. a Cancel button).

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
};

export default function RideCard({ ride, children }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">
            {ride.origin} → {ride.destination}
          </p>
          <p className="text-sm text-slate-500">{new Date(ride.departureAt).toLocaleString()}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ride.status] ?? ''}`}
        >
          {ride.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>
          {ride.availableSeats}/{ride.totalSeats} seats open
        </span>
        <span>${ride.pricePerSeat.toFixed(2)} / seat</span>
      </div>

      {ride.notes && <p className="mt-1 text-sm text-slate-500">{ride.notes}</p>}

      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}
