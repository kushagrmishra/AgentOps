import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui';

export function OnboardingPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleRunId, setSampleRunId] = useState<string | null>(null);

  useEffect(() => {
    // Pre-load a sample run for first-time users.
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        const run = await api.createRun(
          'Research the trade-offs between vector databases for RAG workloads and write a short recommendation.',
        );
        if (!cancelled) setSampleRunId(run.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not create sample run');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function finish() {
    localStorage.setItem('agentops.onboarded', '1');
    navigate(sampleRunId ? `/runs/${sampleRunId}` : '/runs');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <p className="font-mono text-2xs uppercase tracking-wider text-accent">Welcome</p>
      <h1 className="text-2xl font-semibold tracking-tight">Get oriented in two minutes</h1>
      <ol className="space-y-3 text-sm text-muted">
        <li className="rounded-lg border border-line bg-panel p-4">
          <p className="font-medium text-fg">1. Sample run</p>
          <p className="mt-1">
            {busy && 'Creating a sample run…'}
            {!busy && sampleRunId && (
              <>
                Ready —{' '}
                <Link className="text-accent hover:underline" to={`/runs/${sampleRunId}`}>
                  open the live trace
                </Link>
              </>
            )}
            {error && <span className="text-danger">{error}</span>}
          </p>
        </li>
        <li className="rounded-lg border border-line bg-panel p-4">
          <p className="font-medium text-fg">2. Create your first agent</p>
          <p className="mt-1">
            Seed agents are already in Settings. Tweak prompts or tool allowlists anytime.
          </p>
        </li>
        <li className="rounded-lg border border-line bg-panel p-4">
          <p className="font-medium text-fg">3. Invite your team</p>
          <p className="mt-1">Use the org switcher to manage Clerk organizations and roles.</p>
        </li>
      </ol>
      <Button variant="primary" onClick={finish} className="rounded-lg px-4 py-2">
        Go to dashboard
      </Button>
    </div>
  );
}
