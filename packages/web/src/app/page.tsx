import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h2>Demo Flows</h2>
      <ul style={{ fontSize: '1.2rem', lineHeight: 2 }}>
        <li>
          <Link href="/backer" style={{ color: '#0070f3' }}>
            Backer Flow: Create Promise
          </Link>
        </li>
        <li>
          <Link href="/seeker" style={{ color: '#0070f3' }}>
            Seeker Flow: Accept Promise
          </Link>
        </li>
        <li>
          <Link href="/status" style={{ color: '#0070f3' }}>
            Status: View Promise State
          </Link>
        </li>
      </ul>
      <hr style={{ margin: '2rem 0' }} />
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        <strong>Demo Mode:</strong> Using anvil dev accounts on localhost:8545
      </p>
    </main>
  );
}
