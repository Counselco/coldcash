'use client';

import { useState, useEffect } from 'react';
import { firstSixApi, FIRST_SIX_CONSTANTS, type VaultState, type ApiMode } from '@/lib/first-six-api';

export function FirstSixVault() {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [mode, setMode] = useState<ApiMode>('PRE_LAUNCH');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVault = async () => {
      setLoading(true);
      try {
        setMode(firstSixApi.getMode());
        const state = await firstSixApi.getVaultState();
        setVault(state);
      } catch (error) {
        console.error('Failed to fetch vault state:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVault();
  }, []);

  if (loading) {
    return (
      <section className="bg-gradient-to-br from-amber-50 to-warmAccent-50 rounded-warm-lg shadow-warm-lg p-8 border-2 border-amber-200">
        <h2 className="font-display text-3xl font-semibold text-ink-900 mb-6 flex items-center gap-2">
          <span className="text-3xl">🔒</span>
          The Visible Vault
        </h2>
        <p className="text-ink-600">Loading vault state...</p>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-amber-50 to-warmAccent-50 rounded-warm-lg shadow-warm-lg p-8 border-2 border-amber-200">
      <h2 className="font-display text-3xl font-semibold text-ink-900 mb-6 flex items-center gap-2">
        <span className="text-3xl">🔒</span>
        The Visible Vault
      </h2>

      {mode === 'PRE_LAUNCH' && (
        <div className="bg-amber-100 border border-amber-300 rounded-warm p-4 mb-6">
          <p className="text-amber-900 font-semibold">
            ⚠️ Preview — Program not yet launched
          </p>
          <p className="text-amber-800 text-sm mt-1">
            Vault state will be available after program launch.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white rounded-warm p-6 border border-cream-300">
          <p className="text-sm font-semibold text-ink-700 mb-2">Armed Pool</p>
          {vault && vault.totalLocked ? (
            <p className="text-3xl font-bold text-ink-900">{vault.totalLocked} KX</p>
          ) : (
            <p className="text-2xl text-ink-500 italic">Not yet armed</p>
          )}
        </div>

        <div className="bg-white rounded-warm p-6 border border-cream-300">
          <p className="text-sm font-semibold text-ink-700 mb-2">Active Grants</p>
          {vault && vault.armedGrantCount !== null ? (
            <p className="text-3xl font-bold text-ink-900">{vault.armedGrantCount} / {FIRST_SIX_CONSTANTS.SEAT_COUNT}</p>
          ) : (
            <p className="text-2xl text-ink-500 italic">TBD</p>
          )}
        </div>

        <div className="bg-white rounded-warm p-6 border border-cream-300">
          <p className="text-sm font-semibold text-ink-700 mb-2">Total Disbursed</p>
          {vault && vault.totalDisbursed ? (
            <p className="text-3xl font-bold text-success-600">{vault.totalDisbursed} KX</p>
          ) : (
            <p className="text-2xl text-ink-500 italic">$0</p>
          )}
        </div>
      </div>

      <div className="mt-6 bg-white rounded-warm p-6 border border-cream-300">
        <p className="text-sm font-semibold text-ink-700 mb-2">Grantor Seat</p>
        <code className="text-xs text-ink-900 bg-cream-200 px-3 py-2 rounded break-all block">
          {FIRST_SIX_CONSTANTS.GRANTOR}
        </code>
        <div className="mt-4 flex gap-4 text-sm">
          <a
            href={`https://chronx.explorer/address/${FIRST_SIX_CONSTANTS.GRANTOR}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-warmAccent-600 hover:text-warmAccent-700 font-medium"
          >
            View on Explorer →
          </a>
          <a
            href={`https://api.uponproof.com/grants?grantor=${FIRST_SIX_CONSTANTS.GRANTOR}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-warmAccent-600 hover:text-warmAccent-700 font-medium"
          >
            API: Get Grants →
          </a>
        </div>
      </div>
    </section>
  );
}
