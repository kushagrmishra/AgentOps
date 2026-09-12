import { Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLlmSettings } from '../hooks/useLlmSettings';
import { Logo } from './Logo';
import { WebGLShader } from './WebGLShader';
import { DashboardNavIcons } from './Dock';
import { DashboardDock } from './DashboardDock';
import { api } from '../lib/api';

const NAV_ITEMS = [
  { to: '/runs', label: 'Runs', icon: DashboardNavIcons.runs },
  { to: '/evals', label: 'Evals', icon: DashboardNavIcons.evals },
  { to: '/api', label: 'API', icon: DashboardNavIcons.api },
  { to: '/billing', label: 'Usage', icon: DashboardNavIcons.billing },
  { to: '/settings', label: 'Settings', icon: DashboardNavIcons.settings },
];

export function AppShell({
  extras,
  marketingUrl,
}: {
  extras?: ReactNode;
  marketingUrl: string;
}) {
  const { settings, setSettings } = useLlmSettings();

  return (
    <div className="spectre-shell relative flex min-h-screen flex-col text-fg pb-20">
      <WebGLShader className="opacity-55" />
      <header className="relative z-20 mx-3 mt-3 flex items-center justify-between gap-3 overflow-visible px-2 pb-3 pt-2">
        <Logo to="/runs" />
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={marketingUrl}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            <span aria-hidden>←</span>
            Marketing
          </a>
          
          {settings && (
            <div className="font-mono text-2xs flex items-center gap-1 text-[var(--spectre-phosphor)]/80 max-w-[170px] sm:max-w-none">
              <span className="text-white/40 hidden sm:inline">llm:</span>
              {settings.has_api_key || settings.platform_key_included ? (
                <select
                  value={settings.model}
                  onChange={async (e) => {
                    const newModel = e.target.value;
                    localStorage.setItem('agentops_selected_model', newModel);
                    window.dispatchEvent(new CustomEvent('agentops:model_change', { detail: newModel }));
                    try {
                      const updated = await api.updateLlmSettings({ model: newModel });
                      setSettings(updated);
                    } catch (err) {
                      console.error('Failed to update model settings', err);
                    }
                  }}
                  className="bg-transparent text-[var(--spectre-phosphor)] border-none focus:outline-none focus:ring-0 cursor-pointer pr-3 font-mono font-medium truncate max-w-[130px] sm:max-w-none"
                >
                  {[...new Set([settings.model, ...settings.available_models])].map((m) => (
                    <option key={m} value={m} className="bg-base text-fg font-mono text-xs">
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-danger">no keys</span>
              )}
            </div>
          )}

          {extras}
        </div>
      </header>

      {/* Floating dock centered at the bottom of the page */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 max-w-[95vw]">
        <DashboardDock items={NAV_ITEMS} />
      </div>

      <main className="retro-page flex-1">
        <Outlet />
      </main>
    </div>
  );
}
