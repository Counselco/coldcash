'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PayoutQR } from '@/components/PayoutQR';

interface ResolutionData {
  grant_id: string;
  resolution: {
    grant_id: string;
    payload_hash: string;
    window: number;
    metric_value: number;
    evidence_hash: string;
    payout_kx: string;
    settlement_ref: string | null;
    resolved_at: string;
  };
  grantee_seat: string;
  grantor_seat: string;
  pool_kx: string;
}

function StatusPageContent() {
  const searchParams = useSearchParams();
  const queryGrantId = searchParams.get('grant');
  const [grantId, setGrantId] = useState(queryGrantId || 'coldcash-g0001');
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<ResolutionData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    handleLoad();
  }, []);

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    try {
      // For g0001, use embedded data (inaugural grant)
      if (grantId === 'coldcash-g0001') {
        const g0001Data: ResolutionData = {
          grant_id: "coldcash-g0001",
          resolution: {
            grant_id: "coldcash-g0001",
            payload_hash: "0xf5971717a4e12c67efddd69bf043b12169f964b3126906e3fa86717dfb061cea",
            window: 1,
            metric_value: 1,
            evidence_hash: "0x813bba1e31e4e1db333fe1c258926a1fc73deb6c4b282ae82835f9e9f1413664",
            payout_kx: "1000",
            settlement_ref: null,
            resolved_at: "2026-07-05T11:39:56.948Z"
          },
          grantee_seat: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",
          grantor_seat: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",
          pool_kx: "50000"
        };
        setResolution(g0001Data);
        setLoading(false);
        return;
      }

      // For other grants, fetch from server
      const response = await fetch(`/data/${grantId}-payout.json`);
      if (!response.ok) {
        throw new Error(`Grant ${grantId} not found`);
      }
      const data = await response.json();
      setResolution(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h2>Resolution Status</h2>

      {!queryGrantId && !resolution && !loading && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#eff6ff',
          borderRadius: '6px',
          border: '1px solid #3b82f6'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: '#1e40af' }}>
            Latest Resolved Grant
          </p>
          <p style={{ margin: '0.25rem 0', fontSize: '0.95rem' }}>
            <strong>coldcash-g0001</strong> — inaugural kept promise
          </p>
          <a
            href="/status?grant=coldcash-g0001"
            style={{
              display: 'inline-block',
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
            }}
          >
            View Payout →
          </a>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Grant ID
        </label>
        <input
          type="text"
          value={grantId}
          onChange={(e) => setGrantId(e.target.value)}
          placeholder="coldcash-g0001"
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        />
        <button
          onClick={handleLoad}
          disabled={loading || !grantId}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !grantId ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Load Resolution'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fee', borderRadius: '4px', color: '#c00' }}>
          {error}
        </div>
      )}

      {resolution && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h3>Resolution Record</h3>
            <p><strong>Grant ID:</strong> {resolution.grant_id}</p>
            <p><strong>Window:</strong> {resolution.resolution.window}</p>
            <p><strong>Metric Value:</strong> {resolution.resolution.metric_value}</p>
            <p><strong>Payout:</strong> {resolution.resolution.payout_kx} KX</p>
            <p><strong>Resolved At:</strong> {new Date(resolution.resolution.resolved_at).toLocaleString()}</p>
            <p><strong>Evidence Hash:</strong> <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{resolution.resolution.evidence_hash}</code></p>
            <p><strong>Payload Hash:</strong> <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{resolution.resolution.payload_hash}</code></p>
          </div>

          {parseFloat(resolution.resolution.payout_kx) > 0 && (
            <PayoutQR
              grantId={resolution.grant_id}
              granteeAddress={resolution.grantee_seat}
              payoutKx={resolution.resolution.payout_kx}
              resolutionHashPrefix={resolution.resolution.payload_hash.slice(0, 10)}
            />
          )}

          {parseFloat(resolution.resolution.payout_kx) === 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#fef3c7',
              borderRadius: '4px',
              border: '1px solid #fbbf24'
            }}>
              <p style={{ margin: 0, color: '#92400e' }}>
                ⚠️ Zero payout - no settlement action required
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<main><h2>Loading...</h2></main>}>
      <StatusPageContent />
    </Suspense>
  );
}
