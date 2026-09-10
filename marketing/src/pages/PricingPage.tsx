import { useMemo, useState } from 'react';
import { FrostedGlassCard } from '@/components/ui/frosted-glass-card';
import { LiquidButton } from '@/components/ui/liquid-glass-button';

type Audience = 'individual' | 'org';

const INDIVIDUAL = [
  {
    name: 'Free',
    price: '$0',
    tag: 'STARTER',
    blurb: 'Meet the planner → sub-agent → eval loop. Bring your own Anthropic key.',
    cta: 'Start free',
    perks: [
      'Your API key (BYOK)',
      '20 runs / mo',
      '200k tokens',
      'Personal workspace',
      'Live run traces',
    ],
  },
  {
    name: 'Pro',
    price: '$49',
    tag: 'BUILD',
    blurb: 'Research, ship, and organize agent workflows. Platform API included.',
    cta: 'Get Pro',
    perks: [
      'Everything in Free, and:',
      'Platform Anthropic key',
      '500 runs / mo',
      '5M tokens',
      'Priority traces',
    ],
    featured: true,
  },
  {
    name: 'Max',
    price: '$199',
    tag: 'SCALE',
    blurb: 'Higher limits and priority capacity for heavy individual usage.',
    cta: 'Get Max',
    perks: [
      'Everything in Pro, plus:',
      '5k runs / mo',
      '50M tokens',
      'Higher output ceiling',
      'Priority at peak load',
    ],
  },
] as const;

const ORG = [
  {
    name: 'Team',
    price: '$199',
    tag: '2–150 seats',
    blurb: 'Predictable usage for a company workspace. Platform API + shared traces.',
    cta: 'Get Team',
    perks: [
      'Platform Anthropic key',
      '20k runs / mo pooled',
      '200M tokens',
      'Clerk org seats & roles',
      'Central billing',
      'Shared evals & agents',
    ],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    tag: '20+ seats',
    blurb: 'Flexible pooled usage, admin controls, and security for larger orgs.',
    cta: 'Contact sales',
    perks: [
      'All Team features, plus:',
      'Custom run & token pools',
      'SSO-ready via Clerk',
      'Admin spend controls',
      'Audit-friendly traces',
      'Dedicated onboarding',
    ],
  },
] as const;

export function PricingPage({ appUrl }: { appUrl: string }) {
  const [audience, setAudience] = useState<Audience>('individual');
  const tiers = useMemo(() => (audience === 'individual' ? INDIVIDUAL : ORG), [audience]);

  return (
    <main className="relative mx-auto max-w-6xl px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-[0.07]"
      >
        <div className="absolute left-1/2 top-24 -translate-x-1/2 font-mono text-[18rem] font-semibold leading-none text-[var(--money-gold)]">
          $
        </div>
        <div className="absolute bottom-10 right-8 rotate-12 font-mono text-6xl text-[var(--money-green)]">
          $$$
        </div>
      </div>

      <div className="relative">
        <p className="money-eyebrow">Retro money · Stripe ledger</p>
        <h1 className="money-title mt-3 text-2xl sm:text-3xl">Plans that grow with you</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Individuals bring a key on Free, or use ours on Pro and Max. Teams and Enterprise share
          an org workspace with pooled limits.
        </p>

        <div
          className="mt-8 inline-flex rounded-full border border-white/15 bg-black/35 p-1 backdrop-blur-md"
          role="tablist"
          aria-label="Plan audience"
        >
          {(
            [
              { id: 'individual' as const, label: 'Individual' },
              { id: 'org' as const, label: 'Team and Enterprise' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={audience === tab.id}
              onClick={() => setAudience(tab.id)}
              className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                audience === tab.id
                  ? 'bg-white/15 text-[var(--money-gold)] shadow-[0_0_16px_rgba(212,175,55,0.2)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className={`mt-10 grid gap-5 ${
            audience === 'individual' ? 'md:grid-cols-3' : 'md:grid-cols-2 md:max-w-4xl'
          }`}
        >
          {tiers.map((tier) => (
            <FrostedGlassCard
              key={tier.name}
              money
              className={`flex flex-col ${
                'featured' in tier && tier.featured ? 'md:-translate-y-1 ring-1 ring-[var(--money-gold)]/40' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--money-gold)]">
                  {tier.tag}
                </p>
                {'featured' in tier && tier.featured && (
                  <span className="rounded-full border border-[var(--money-gold)]/40 bg-[var(--money-gold)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--money-gold)]">
                    POPULAR
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-mono text-sm font-semibold tracking-wide text-[var(--money-green)]">
                {tier.name}
              </h2>
              <p className="money-title mt-2 text-3xl sm:text-4xl">
                {tier.price}
                {tier.price.startsWith('$') && (
                  <span className="text-sm font-normal text-muted">/mo</span>
                )}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{tier.blurb}</p>
              <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4 font-mono text-xs text-[var(--money-green)]/90">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[var(--money-gold)]">✓</span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <LiquidButton
                size="lg"
                className="mt-6 self-start px-6"
                onClick={() => {
                  if (tier.name === 'Enterprise') {
                    window.location.href = 'mailto:sales@agentops.dev?subject=AgentOps%20Enterprise';
                    return;
                  }
                  window.location.href = `${appUrl}/sign-up`;
                }}
              >
                {tier.cta}
              </LiquidButton>
            </FrostedGlassCard>
          ))}
        </div>

        <FrostedGlassCard money className="mt-10 text-center" as="div">
          <p className="money-eyebrow">Settlement note</p>
          <p className="mt-3 text-sm text-muted">
            Quotas return HTTP 402 when exceeded. Switch ledgers anytime from Billing in the
            dashboard — the API is the source of truth.
          </p>
        </FrostedGlassCard>
      </div>
    </main>
  );
}
