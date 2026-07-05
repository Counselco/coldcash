import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: `${BRAND.name} - Demo`,
  description: BRAND.tagline,
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
          <h1>{BRAND.name}</h1>
          <p style={{ color: '#666' }}>{BRAND.tagline}</p>
        </header>
        {children}
      </body>
    </html>
  )
}
