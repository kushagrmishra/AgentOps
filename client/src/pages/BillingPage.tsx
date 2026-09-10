import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type MeResponse } from '../lib/api';
import { Button, Card, ErrorBanner, SectionHeader, Spinner } from '../components/ui';
import { cx } from '../lib/cx';

type Audience = 'individual' | 'org';
type CheckoutPlan = 'pro' | 'max' | 'team';

const INDIVIDUAL = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '$0',
    blurb: 'Bring your own Anthropic key. Enough to prove the loop.',
    perks: ['Your API key (BYOK)', '20 runs / mo', '200k tokens', 'Personal workspace'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$49',
    blurb: 'Platform API included for solo builders shipping workflows.',
    perks: ['Platform Anthropic key', '500 runs / mo', '5M tokens', 'Priority traces'],
  },
  {
    id: 'max' as const,
    name: 'Max',
    price: '$199',
    blurb: 'Higher limits and priority capacity for heavy individual usage.',
    perks: ['Platform Anthropic key', '5k runs / mo', '50M tokens', 'Priority at peak load'],
  },
] as const;

const ORG = [
  {
    id: 'team' as const,
    name: 'Team',
    price: '$199',
    seatHint: '2–150 users',
    blurb: 'Pooled usage for a company org. Shared agents, evals, and billing.',
    perks: [
      'Platform Anthropic key',
      '20k runs / mo pooled',
      '200M tokens',
      'Clerk org seats & roles',
      'Central billing',
    ],
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 'Custom',
    seatHint: '20+ users',
    blurb: 'Flexible pools, admin controls, and security for larger organizations.',
    perks: [
      'All Team features, plus:',
      'Custom run & token pools',
      'SSO-ready via Clerk',
      'Admin spend controls',
      'Dedicated onboarding',
    ],
  },
] as const;

function planMatches(current: string | undefined, tierId: string) {
  return Boolean(current && current === tierId);
}

export function BillingPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [params] = useSearchParams();
  const status = params.get('status');

  const defaultAudience: Audience =
    me?.in_organization || me?.is_office_account ? 'org' : 'individual';
  const [audience, setAudience] = useState<Audience>('individual');

  useEffect(() => {
    void api
      .me()
      .then((next) => {
        setMe(next);
        if (next.in_organization || next.is_office_account) setAudience('org');
        else setAudience('individual');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load billing'))
      .finally(() => setLoading(false));
  }, []);

  const tiers = useMemo(
    () => (audience === 'individual' ? INDIVIDUAL : ORG),
    [audience],
  );

  async function go(plan?: CheckoutPlan) {
    try {
      setBusy(plan ?? 'portal');
      setError(null);
      const res = plan ? await api.checkout(plan) : await api.billingPortal();
      window.location.href = res.url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Billing request failed');
      setBusy(null);
    }
  }

  const planDisplay = me?.plan_display ?? me?.plan ?? '…';

  return (
    <div className="space-y-5">
      <div>
        <p className="retro-kicker">Subscription</p>
        <h1 className="retro-title mt-1">Billing</h1>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Individual plans for solo work. Team and Enterprise for company orgs — same spectre
          ledger, clearer seats.
        </p>
      </div>

      {status === 'success' && (
        <p className="rounded border border-ok/30 bg-ok/10 px-3 py-2 font-mono text-xs text-ok">
          Checkout complete — plan updates when Stripe confirms.
        </p>
      )}
      {status === 'cancel' && (
        <p className="rounded border border-line bg-black/20 px-3 py-2 font-mono text-xs text-muted">
          Checkout canceled. Your current plan is unchanged.
        </p>
      )}

      {error && <ErrorBanner message={error} />}

      <Card className="overflow-hidden">
        <SectionHeader title="Current plan" subtitle="Usage resets monthly" />
        <div className="space-y-3 p-4">
          {loading && (
            <div className="flex items-center gap-2 text-muted">
              <Spinner />
              <span className="font-mono text-xs">loading…</span>
            </div>
          )}
          {me && (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-lg text-[var(--spectre-cyan)]">{planDisplay}</span>
                {me.platform_key_included ? (
                  <span className="font-mono text-2xs text-ok">platform API included</span>
                ) : (
                  <span className="font-mono text-2xs text-muted">
                    BYOK required ·{' '}
                    <Link to="/api" className="text-[var(--spectre-cyan)] hover:underline">
                      manage key
                    </Link>
                  </span>
                )}
                <span className="font-mono text-2xs text-faint">
                  {me.account_kind === 'office' ? 'office account' : 'personal account'}
                </span>
              </div>
              <p className="font-mono text-xs text-muted">
                runs {me.usage_runs}/{me.limit_runs}
                {' · '}
                tokens {me.usage_tokens}/{me.limit_tokens}
              </p>
              <Button variant="ghost" onClick={() => void go()} loading={busy === 'portal'}>
                Open billing portal
              </Button>
            </>
          )}
        </div>
      </Card>

      <div
        className="inline-flex rounded-full border border-line bg-black/30 p-1"
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
            className={cx(
              'rounded-full px-3 py-1.5 font-mono text-2xs uppercase tracking-wider transition-colors',
              audience === tab.id
                ? 'bg-white/10 text-[var(--spectre-cyan)]'
                : 'text-muted hover:text-fg',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!loading && me && audience !== defaultAudience && (
        <p className="font-mono text-2xs text-faint">
          Tip: your login looks {me.is_office_account ? 'office' : 'personal'} — showing{' '}
          {audience === 'org' ? 'org' : 'individual'} plans.
        </p>
      )}

      <div
        className={cx(
          'grid gap-4',
          audience === 'individual' ? 'md:grid-cols-3' : 'md:grid-cols-2',
        )}
      >
        {tiers.map((tier) => {
          const current = planMatches(me?.plan, tier.id);
          const isEnterprise = tier.id === 'enterprise';
          return (
            <Card
              key={tier.id}
              className={cx('flex flex-col p-4', current && 'ring-1 ring-[var(--spectre-cyan)]/40')}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-mono text-sm font-semibold text-fg">{tier.name}</h2>
                <div className="flex items-center gap-2">
                  {'seatHint' in tier && tier.seatHint && (
                    <span className="font-mono text-2xs text-faint">{tier.seatHint}</span>
                  )}
                  {current && (
                    <span className="font-mono text-2xs uppercase tracking-wider text-[var(--spectre-cyan)]">
                      current
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 font-mono text-2xl text-fg">
                {tier.price}
                {tier.price.startsWith('$') && <span className="text-xs text-muted">/mo</span>}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{tier.blurb}</p>
              <ul className="mt-3 flex-1 space-y-1 border-t border-line pt-3 font-mono text-2xs text-muted">
                {tier.perks.map((perk) => (
                  <li key={perk}>· {perk}</li>
                ))}
              </ul>
              {tier.id === 'free' ? (
                <p className="mt-4 font-mono text-2xs text-faint">Default for new accounts</p>
              ) : isEnterprise ? (
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => {
                    window.location.href =
                      'mailto:sales@agentops.dev?subject=AgentOps%20Enterprise';
                  }}
                >
                  Contact sales
                </Button>
              ) : (
                <Button
                  variant={tier.id === 'pro' || tier.id === 'team' ? 'primary' : 'secondary'}
                  className="mt-4"
                  disabled={current}
                  loading={busy === tier.id}
                  onClick={() => void go(tier.id)}
                >
                  {current ? 'Current plan' : `Upgrade to ${tier.name}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
