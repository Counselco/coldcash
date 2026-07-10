'use client';

import Link from 'next/link';

export function FirstSixHero() {
  return (
    <section className="text-center py-12">
      <h1 className="font-display text-5xl md:text-6xl font-bold text-ink-900 mb-6">
        The First Six
      </h1>
      <p className="text-2xl text-ink-700 max-w-3xl mx-auto leading-relaxed mb-4">
        Run a ChronX node. Get paid up to $20/month — escrowed on-chain before you start.
      </p>
      <p className="text-lg text-ink-600 max-w-2xl mx-auto mb-8">
        6 seats available. First-come-first-served. Claim your seat and earn for keeping the network reliable.
      </p>
      <div className="flex gap-4 justify-center">
        <Link
          href="/first-six/dashboard"
          className="inline-block px-8 py-3 bg-warmAccent-500 text-white font-semibold rounded-warm hover:bg-warmAccent-600 transition-colors text-lg"
        >
          Operator Dashboard →
        </Link>
        <a
          href="https://github.com/uponproof/coldcash/blob/main/docs/FIRST-SIX-PROGRAM.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-8 py-3 bg-white text-warmAccent-700 border-2 border-warmAccent-500 font-semibold rounded-warm hover:bg-warmAccent-50 transition-colors text-lg"
        >
          Program Law →
        </a>
      </div>
    </section>
  );
}
