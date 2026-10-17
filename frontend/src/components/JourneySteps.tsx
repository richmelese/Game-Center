import { Check } from 'lucide-react';

/** The Customer Journey from the RFP response, section 2.2 — in order, word for word. */
export const JOURNEY = [
  { short: 'Open', text: 'Customer opens telebirr Game Center.' },
  { short: 'Choose', text: 'Customer discovers/selects an available game.' },
  { short: 'Subscribe', text: 'Customer completes the applicable purchase/subscription flow where the game is monetized.' },
  { short: 'Pay', text: 'Payment is processed through the approved telebirr/payment integration.' },
  { short: 'Access', text: 'Successful transaction results in the applicable game access/entitlement.' },
  { short: 'Launch', text: 'Customer launches and uses the game.' },
  { short: 'Earn', text: 'Customers play the purchased games and accumulate the coins.' },
  { short: 'Convert', text: 'Customer can change/convert the accumulated coins into ETB/e-money in hassle free ways.' },
] as const;

/** Compact progress bar: "Step 3 of 8 · Subscribe". `step` is 1-based. */
export function JourneyProgress({ step }: { step: number }) {
  return (
    <div className="card px-4 py-3" aria-label={`Customer journey step ${step} of ${JOURNEY.length}`}>
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-brand-700">
          Step {step} of {JOURNEY.length} · {JOURNEY[step - 1].short}
        </span>
        <span className="text-slate-400">Customer journey</span>
      </div>
      <ol className="mt-2 flex gap-1">
        {JOURNEY.map((s, i) => (
          <li
            key={s.short}
            title={`${i + 1}. ${s.text}`}
            className={`h-1.5 flex-1 rounded-full ${
              i + 1 < step ? 'bg-leaf-500' : i + 1 === step ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">{JOURNEY[step - 1].text}</p>
    </div>
  );
}

/** Full list for the Game Center home page ("How it works"). */
export function JourneyList({ completedThrough = 0 }: { completedThrough?: number }) {
  return (
    <ol className="space-y-3">
      {JOURNEY.map((s, i) => {
        const done = i + 1 <= completedThrough;
        return (
          <li key={s.short} className="flex gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-leaf-500 text-white' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
              }`}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className="pt-1 text-sm text-slate-700">{s.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
