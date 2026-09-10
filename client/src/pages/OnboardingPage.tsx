import { Link, useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/ui';

export function OnboardingPage() {
  const navigate = useNavigate();

  function finish(path = '/runs') {
    localStorage.setItem('agentops.onboarded', '1');
    navigate(path);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="retro-kicker">Welcome · boot sequence</p>
      <h1 className="retro-title text-2xl">You&apos;re in. Here&apos;s the console.</h1>
      <p className="text-sm text-muted">
        Free plans use your own Anthropic key. Add it once, then dispatch goals from Runs.
      </p>
      <ol className="space-y-3 text-sm text-muted">
        <li>
          <Card className="p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-[var(--spectre-cyan)]">
              01 · API key
            </p>
            <p className="mt-2">
              On Free, paste your Anthropic key under{' '}
              <Link className="text-[var(--spectre-cyan)] hover:underline" to="/api" onClick={() => localStorage.setItem('agentops.onboarded', '1')}>
                API
              </Link>
              . Pro and Max include ours after you upgrade in Billing.
            </p>
          </Card>
        </li>
        <li>
          <Card className="p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-[var(--spectre-cyan)]">
              02 · First run
            </p>
            <p className="mt-2">
              Open{' '}
              <button
                type="button"
                className="text-[var(--spectre-cyan)] hover:underline"
                onClick={() => finish('/runs')}
              >
                Runs
              </button>{' '}
              and submit a goal. The planner breaks it into subtasks and streams the trace.
            </p>
          </Card>
        </li>
        <li>
          <Card className="p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-[var(--spectre-cyan)]">
              03 · Agents
            </p>
            <p className="mt-2">
              Customize sub-agents anytime in{' '}
              <Link
                className="text-[var(--spectre-cyan)] hover:underline"
                to="/settings"
                onClick={() => localStorage.setItem('agentops.onboarded', '1')}
              >
                Settings
              </Link>
              .
            </p>
          </Card>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => finish('/runs')}>
          Enter the console →
        </Button>
        <Button variant="secondary" onClick={() => finish('/api')}>
          Add API key first
        </Button>
      </div>
    </div>
  );
}
