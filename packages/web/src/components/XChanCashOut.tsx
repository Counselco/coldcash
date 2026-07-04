'use client';

export function XChanCashOut() {
  const xchanUrl = process.env.NEXT_PUBLIC_XCHAN_URL;
  const isDev = process.env.NODE_ENV === 'development';

  // Production: render nothing if URL not configured
  if (!xchanUrl) {
    if (isDev) {
      return (
        <div style={{ fontSize: '0.85rem', color: '#999', fontStyle: 'italic', marginTop: '1rem' }}>
          XChan link inactive — set NEXT_PUBLIC_XCHAN_URL
        </div>
      );
    }
    return null;
  }

  // Validate it's an https URL
  let url: URL;
  try {
    url = new URL(xchanUrl);
    if (url.protocol !== 'https:') {
      console.error('NEXT_PUBLIC_XCHAN_URL must be https');
      return null;
    }
  } catch (e) {
    console.error('Invalid NEXT_PUBLIC_XCHAN_URL:', e);
    return null;
  }

  const domain = url.hostname;

  return (
    <section
      style={{
        marginTop: '2rem',
        padding: '1.5rem',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        backgroundColor: '#fafafa',
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>Cash out KX → USDC via XChan</h3>

      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, margin: '0.5rem 0' }}>
        Promises on ColdCash settle natively in KX. XChan converts KX to USDC <strong>on the Base network</strong>.
      </p>

      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, margin: '0.5rem 0' }}>
        <strong>USDC from XChan arrives on Base. ColdCash escrow payouts use Arbitrum. These are different networks — always match your wallet's network to the payout source.</strong>
      </p>

      <div
        style={{
          marginTop: '1.25rem',
          padding: '0.75rem',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: '#856404',
        }}
      >
        ⚠️ You are leaving ColdCash — XChan is a separate service
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <a
          href={xchanUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 500,
          }}
        >
          Go to XChan
        </a>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          {domain}
        </span>
      </div>
    </section>
  );
}
