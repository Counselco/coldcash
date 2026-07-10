'use client';

import { useState, useEffect } from 'react';
import { firstSixApi, FIRST_SIX_CONSTANTS, type SeatsState, type ApiMode } from '@/lib/first-six-api';

export function FirstSixSeats() {
  const [seats, setSeats] = useState<SeatsState | null>(null);
  const [mode, setMode] = useState<ApiMode>('PRE_LAUNCH');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeats = async () => {
      setLoading(true);
      try {
        setMode(firstSixApi.getMode());
        const state = await firstSixApi.getSeatsState();
        setSeats(state);
      } catch (error) {
        console.error('Failed to fetch seats state:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSeats();
  }, []);

  if (loading) {
    return (
      <section className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
        <h2 className="font-display text-3xl font-semibold text-ink-900 mb-6">
          Seats
        </h2>
        <p className="text-ink-600">Loading seats state...</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
      <h2 className="font-display text-3xl font-semibold text-ink-900 mb-6">
        Seats
      </h2>

      {mode === 'PRE_LAUNCH' && (
        <div className="bg-amber-100 border border-amber-300 rounded-warm p-4 mb-6">
          <p className="text-amber-900 font-semibold">
            ⚠️ Preview — Program not yet launched
          </p>
          <p className="text-amber-800 text-sm mt-1">
            Seats will open on a 30-day cadence after program launch.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-success-50 to-success-100 rounded-warm p-6 border-2 border-success-300">
          <p className="text-sm font-semibold text-success-900 mb-2">Open Now</p>
          {seats && seats.openNow !== null ? (
            <p className="text-4xl font-bold text-success-700">{seats.openNow}</p>
          ) : (
            <p className="text-3xl text-success-600 italic">TBD</p>
          )}
          {seats && seats.openNow && seats.openNow > 0 ? (
            <p className="text-sm text-success-700 mt-2 font-medium">
              First-come-first-served (FCFS)
            </p>
          ) : null}
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-warm p-6 border-2 border-amber-300">
          <p className="text-sm font-semibold text-amber-900 mb-2">Claimed</p>
          {seats && seats.claimed !== null ? (
            <p className="text-4xl font-bold text-amber-700">{seats.claimed} / {seats.total}</p>
          ) : (
            <p className="text-3xl text-amber-600 italic">0 / {seats && seats.total}</p>
          )}
        </div>

        <div className="bg-gradient-to-br from-ink-50 to-ink-100 rounded-warm p-6 border-2 border-ink-300">
          <p className="text-sm font-semibold text-ink-900 mb-2">Next Seat Opens</p>
          {seats && seats.nextSeatOpensAt ? (
            <p className="text-xl font-bold text-ink-700">
              {new Date(seats.nextSeatOpensAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          ) : (
            <p className="text-2xl text-ink-600 italic">TBD</p>
          )}
        </div>
      </div>

      <div className="mt-6 bg-cream-100 border border-cream-300 rounded-warm p-4">
        <p className="text-ink-900 font-semibold mb-2">
          🕐 30-Day Cadence Explained
        </p>
        <p className="text-sm text-ink-700">
          Seat 1 opens at program launch. Each subsequent seat opens automatically 30 days after
          the prior seat opened. Claims are resolved by DAG commit order — first valid claim
          wins, no site discretion.
        </p>
      </div>
    </section>
  );
}
