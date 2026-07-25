import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLlmSettings } from '../hooks/useLlmSettings';
import { cx } from './ui';

const NAV_ITEMS = [
  { to: '/runs', label: 'Runs', hint: 'Goals submitted to the orchestrator' },
  { to: '/evals', label: 'Evals', hint: 'Scenario suite and score trend' },
  { to: '/settings', label: 'Settings', hint: 'Agents, billing, and provider config' },
];

export function AppShell({ extras }: { extras?: ReactNode }) {
  const { settings } = useLlmSettings();
  const liveProvider = settings?.active_provider ?? '…';

  return (
    <div className="flex min-h-screen flex-col bg-base text-fg">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-6">
          <NavLink to="/runs" className="font-mono text-sm font-semibold tracking-tight text-fg">
            AgentOps
          </NavLink>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.hint}
                className={({ isActive }) =>
                  cx(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-2xs text-faint sm:inline">llm:{liveProvider}</span>
          {extras}
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
