'use client';

import { useState, useEffect } from 'react';
import { firstSixApi, type ApiMode } from '@/lib/first-six-api';

export function FirstSixValveBanner() {
  const [valve, setValve] = useState<{ isPaused: boolean; reason?: string } | null>(null);
  const [mode, setMode] = useState<ApiMode>('PRE_LAUNCH');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchValve = async () => {
      setLoading(true);
      try {
        setMode(firstSixApi.getMode());
        const state = await firstSixApi.getValveState();
        setValve(state);
      } catch (error) {
        console.error('Failed to fetch valve state:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchValve();
  }, []);

  // Don't render anything if loading, in pre-launch, or valve not paused
  if (loading || mode === 'PRE_LAUNCH' || !valve?.isPaused) {
    return null;
  }

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-warm-lg shadow-warm-lg p-6 mb-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-red-500 rounded-warm flex items-center justify-center flex-shrink-0">
          <span className="text-2xl text-white">⚠️</span>
        </div>
        <div className="flex-1">
          <p className="font-bold text-red-900 text-lg mb-2">
            Enrollment Paused
          </p>
          <p className="text-red-800 mb-2">
            {valve.reason || 'The rail operator has paused new seat openings pending review.'}
          </p>
          <p className="text-red-700 text-sm">
            Claimed and armed grants are unaffected. This valve only affects not-yet-claimed openings.
          </p>
        </div>
      </div>
    </div>
  );
}
