import Link from 'next/link';
import { XChanCashOut } from '@/components/XChanCashOut';

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="font-display text-5xl md:text-6xl font-bold text-ink-900 mb-6">
          Promises, kept.
        </h1>
        <p className="text-xl text-ink-700 max-w-2xl mx-auto leading-relaxed">
          Back someone's goal. Or earn the payout. Paid the moment it's proven.
        </p>
      </section>

      {/* Two-Sided Value Props */}
      <section className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Backer Side */}
        <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
          <div className="w-12 h-12 bg-warmAccent-500/10 rounded-warm flex items-center justify-center mb-4">
            <span className="text-2xl">🎯</span>
          </div>
          <h3 className="font-display text-2xl font-semibold text-ink-900 mb-3">
            Back a Goal
          </h3>
          <p className="text-ink-700 mb-6">
            Fund someone's ambition with a clear promise: achieve the goal, earn the reward.
          </p>
          <div className="space-y-3 mb-6 text-sm text-ink-600">
            <div className="flex items-start gap-2">
              <span className="text-warmAccent-500 font-bold">1.</span>
              <span>Describe what you want to see happen</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-warmAccent-500 font-bold">2.</span>
              <span>Lock your funds in a promise</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-warmAccent-500 font-bold">3.</span>
              <span>They deliver, you release the reward</span>
            </div>
          </div>
          <Link
            href="/backer"
            className="inline-block w-full text-center px-6 py-3 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors"
          >
            Create Promise
          </Link>
        </div>

        {/* Seeker Side */}
        <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
          <div className="w-12 h-12 bg-amber-500/10 rounded-warm flex items-center justify-center mb-4">
            <span className="text-2xl">💰</span>
          </div>
          <h3 className="font-display text-2xl font-semibold text-ink-900 mb-3">
            Earn a Payout
          </h3>
          <p className="text-ink-700 mb-6">
            Accept a promise, do the work, prove you did it. Get paid instantly.
          </p>
          <div className="space-y-3 mb-6 text-sm text-ink-600">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">1.</span>
              <span>Find a promise that matches your skills</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">2.</span>
              <span>Accept the terms and deliver the goal</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">3.</span>
              <span>Submit proof — get paid automatically</span>
            </div>
          </div>
          <Link
            href="/seeker"
            className="inline-block w-full text-center px-6 py-3 bg-amber-500 text-white font-medium rounded-warm hover:bg-amber-600 transition-colors"
          >
            Find Promises
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white rounded-warm-lg shadow-warm p-8 md:p-12 border border-cream-300">
        <h2 className="font-display text-3xl font-semibold text-ink-900 text-center mb-8">
          How It Works
        </h2>
        <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 bg-warmAccent-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🔒</span>
            </div>
            <h4 className="font-semibold text-ink-900 mb-2">Lock</h4>
            <p className="text-sm text-ink-600">Funds secured in smart contract</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🤝</span>
            </div>
            <h4 className="font-semibold text-ink-900 mb-2">Agree</h4>
            <p className="text-sm text-ink-600">Both parties commit to clear terms</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-success-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">✓</span>
            </div>
            <h4 className="font-semibold text-ink-900 mb-2">Prove</h4>
            <p className="text-sm text-ink-600">Evidence submitted on-chain</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-success-600/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">💸</span>
            </div>
            <h4 className="font-semibold text-ink-900 mb-2">Paid</h4>
            <p className="text-sm text-ink-600">Instant settlement to seeker</p>
          </div>
        </div>
      </section>

      {/* XChan Cash Out */}
      <XChanCashOut />
    </div>
  );
}
