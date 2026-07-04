'use client';

import { useState } from 'react';

export default function StatusPage() {
  const [promiseId, setPromiseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    try {
      // In real impl, fetch /promises/:id
      // For demo, simulate
      const mockStatus = {
        status: 'Accepted',
        backer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        seeker: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        prize: '100.00 USDC',
        frozen: {
          goal: 'Merge PR #42 in testorg/testrepo',
          standardHash: '0x' + '0'.repeat(64),
        },
        escrowBalance: '100.00 USDC',
        attestations: [
          {
            id: 'att_1',
            timestamp: Date.now() / 1000,
            payoutBps: 10000,
            evidenceHash: '0x' + '1'.repeat(64),
            txHash: '0x' + '2'.repeat(64),
          },
        ],
      };
      setStatus(mockStatus);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h2>Status: View Promise State</h2>
      <div style={{ marginTop: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Promise ID
        </label>
        <input
          type="text"
          value={promiseId}
          onChange={(e) => setPromiseId(e.target.value)}
          placeholder="0x..."
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
          disabled={loading || !promiseId}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !promiseId ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Load Status'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fee', borderRadius: '4px', color: '#c00' }}>
          {error}
        </div>
      )}

      {status && (
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h3>Live Escrow State</h3>
          <p><strong>Status:</strong> <span style={{ fontWeight: 'bold', color: getStatusColor(status.status) }}>{status.status}</span></p>
          <p><strong>Backer:</strong> {status.backer}</p>
          {status.seeker && <p><strong>Seeker:</strong> {status.seeker}</p>}
          <p><strong>Prize:</strong> {status.prize}</p>
          <p><strong>Escrow Balance:</strong> {status.escrowBalance}</p>

          <hr style={{ margin: '1rem 0' }} />

          <h4>Frozen Standard</h4>
          <p><strong>Goal:</strong> {status.frozen.goal}</p>
          <p><strong>Standard Hash:</strong> <code>{status.frozen.standardHash}</code></p>

          {status.attestations && status.attestations.length > 0 && (
            <>
              <hr style={{ margin: '1rem 0' }} />
              <h4>Evidence / Attestation Trail</h4>
              {status.attestations.map((att: any) => (
                <div key={att.id} style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '3px solid #0070f3' }}>
                  <p><strong>Timestamp:</strong> {new Date(att.timestamp * 1000).toLocaleString()}</p>
                  <p><strong>Payout BPS:</strong> {att.payoutBps} ({(att.payoutBps / 100).toFixed(2)}%)</p>
                  <p><strong>Evidence Hash:</strong> <code>{att.evidenceHash}</code></p>
                  <p><strong>TX Hash:</strong> <code>{att.txHash}</code></p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'Offered': return '#0070f3';
    case 'Accepted': return '#ff8c00';
    case 'Paid': return '#00c800';
    case 'Refunded': return '#666';
    case 'Canceled': return '#666';
    default: return '#000';
  }
}
