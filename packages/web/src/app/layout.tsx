import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ColdCash - Demo',
  description: 'ColdCash v1 demo mode against local anvil',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '2rem', maxWidth: '800px', marginInline: 'auto' }}>
        <header>
          <h1>ColdCash Demo</h1>
          <p style={{ color: '#666' }}>Local anvil demo mode - no production keys</p>
        </header>
        {children}
      </body>
    </html>
  )
}
