import { FirstSixHero } from '@/components/FirstSixHero';
import { FirstSixValveBanner } from '@/components/FirstSixValveBanner';
import { FirstSixVault } from '@/components/FirstSixVault';
import { FirstSixSeats } from '@/components/FirstSixSeats';
import { FirstSixHowItWorks } from '@/components/FirstSixHowItWorks';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="space-y-12">
      <FirstSixHero />
      <FirstSixValveBanner />

      <div className="grid md:grid-cols-1 gap-8">
        <FirstSixVault />
        <FirstSixSeats />
      </div>

      <FirstSixHowItWorks />

      {/* Link to program law */}
      <section className="bg-cream-100 border border-cream-300 rounded-warm p-6 text-center">
        <p className="text-ink-900 font-semibold mb-3">
          📄 Full Program Specification
        </p>
        <p className="text-ink-700 text-sm mb-4">
          Read the complete program law: eligibility, payout curve, claim mechanics, valve rules, and safety sequence.
        </p>
        <a
          href="https://github.com/uponproof/coldcash/blob/main/docs/FIRST-SIX-PROGRAM.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2.5 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors"
        >
          View Program Law →
        </a>
      </section>

      {/* General promises - coming soon */}
      <section className="bg-ink-50 border border-ink-300 rounded-warm p-6">
        <p className="text-ink-800 font-semibold mb-2">
          💼 General Promises — Coming Soon
        </p>
        <p className="text-ink-600 text-sm mb-4">
          The generic backer/seeker promise flows are being refined. They'll return to primary
          navigation once the flagship payment rail is proven reliable.
        </p>
        <div className="flex gap-4">
          <Link
            href="/backer"
            className="text-warmAccent-600 hover:text-warmAccent-700 font-medium text-sm"
          >
            Preview: Back a Goal →
          </Link>
          <Link
            href="/seeker"
            className="text-warmAccent-600 hover:text-warmAccent-700 font-medium text-sm"
          >
            Preview: Earn a Payout →
          </Link>
        </div>
      </section>
    </div>
  );
}
