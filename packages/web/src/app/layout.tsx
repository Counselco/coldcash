import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Fraunces } from 'next/font/google'
import { BRAND } from '@/lib/brand'
import './globals.css'
import Link from 'next/link'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: `${BRAND.name}`,
  description: BRAND.tagline,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen">
        <nav className="border-b border-cream-300 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-display text-2xl font-semibold text-ink-900 hover:text-warmAccent-500 transition-colors">
              {BRAND.name}
            </Link>
            <div className="flex gap-6 text-sm">
              <Link href="/backer" className="text-ink-700 hover:text-warmAccent-500 transition-colors font-medium">
                Back a Goal
              </Link>
              <Link href="/seeker" className="text-ink-700 hover:text-warmAccent-500 transition-colors font-medium">
                Earn a Payout
              </Link>
              <Link href="/status" className="text-ink-700 hover:text-warmAccent-500 transition-colors font-medium">
                Status
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-12">
          {children}
        </main>
        <footer className="border-t border-cream-300 bg-white/30 mt-24">
          <div className="max-w-6xl mx-auto px-6 py-8 text-center">
            <p className="font-display text-lg text-ink-700 mb-2">{BRAND.tagline}</p>
            <p className="text-sm text-ink-500">Promises, kept.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
