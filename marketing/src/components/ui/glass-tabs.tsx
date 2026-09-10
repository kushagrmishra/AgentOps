import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GlassTab = {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

type GlassTabsProps = {
  tabs: GlassTab[];
  defaultTabId?: string;
  className?: string;
  /** Called when the active tab changes */
  onChange?: (tabId: string) => void;
};

const ICONS = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  runs: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M5 7h14M5 12h10M5 17h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="18" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  evals: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14l-7-3.5L5 19V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
} as const;

/** Example set — four tabs with icons + glass panels. */
export const DEFAULT_GLASS_TABS: GlassTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: ICONS.overview,
    content: (
      <p className="text-sm leading-relaxed text-white/75">
        High-level health for planners, sub-agents, and evals — usage, pass rate, and recent
        failures in one frosted pane.
      </p>
    ),
  },
  {
    id: 'runs',
    label: 'Runs',
    icon: ICONS.runs,
    content: (
      <p className="text-sm leading-relaxed text-white/75">
        Live and historical run traces. Open any goal to inspect steps, tool calls, and tokens.
      </p>
    ),
  },
  {
    id: 'evals',
    label: 'Evals',
    icon: ICONS.evals,
    content: (
      <p className="text-sm leading-relaxed text-white/75">
        Scenario suites and judge scores. Track pass rate over time against expected outcomes.
      </p>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: ICONS.settings,
    content: (
      <p className="text-sm leading-relaxed text-white/75">
        Agents, API keys, and billing. Free is BYOK; Pro and Max include the platform key.
      </p>
    ),
  },
];

export function GlassTabs({
  tabs,
  defaultTabId,
  className,
  onChange,
}: GlassTabsProps) {
  const baseId = useId();
  const initial = defaultTabId && tabs.some((t) => t.id === defaultTabId) ? defaultTabId : tabs[0]?.id;
  const [activeId, setActiveId] = useState(initial);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!tabs.length || !active) return null;

  function select(id: string) {
    setActiveId(id);
    onChange?.(id);
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Sections"
        className="liquid-glass relative flex items-stretch gap-1 rounded-2xl p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cn(
                'relative z-[1] flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5',
                'font-mono text-[11px] uppercase tracking-[0.14em]',
                'transition-all duration-300 ease-out',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50',
                selected
                  ? 'liquid-glass-inset text-white'
                  : 'bg-transparent text-white/55 hover:bg-white/[0.06] hover:text-white/85',
              )}
            >
              <span
                className={cn(
                  'transition-colors duration-300',
                  selected ? 'text-white' : 'text-white/50',
                )}
              >
                {tab.icon}
              </span>
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Glass content panel */}
      <div
        id={`${baseId}-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active.id}`}
        className="liquid-glass mt-3 rounded-2xl p-5 transition-all duration-300 ease-out"
      >
        <div key={active.id} className="glass-tab-panel-in">
          {active.content}
        </div>
      </div>
    </div>
  );
}
