import { Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
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
  const location = useLocation();

  return (
    <div className="spectre-shell relative flex min-h-screen flex-col text-white pb-28">
      <WebGLShader className="opacity-90" />
      <header className="sticky top-0 z-40 w-full frosted-navbar transition-all">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 py-2">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-4">
            <Logo to="/runs" />
          </div>

          {/* Right: Actions, Model selector & Auth */}
          <div className="flex shrink-0 items-center gap-2.5">
            <a
              href={marketingUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-medium text-white transition-all hover:bg-white/10 hover:text-white hover:border-white/35"
            >
              <span aria-hidden className="text-sm">←</span>
              Marketing
            </a>
            
            {settings && (
              <div className="font-mono text-xs flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[var(--spectre-phosphor)]/90">
                <span className="text-white hidden sm:inline text-xs font-sans font-medium">llm:</span>
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
                    className="bg-transparent text-[var(--spectre-phosphor)] border-none focus:outline-none focus:ring-0 cursor-pointer font-mono font-medium truncate max-w-[150px] sm:max-w-none"
                  >
                    {[...new Set([settings.model, ...settings.available_models])].map((m) => (
                      <option key={m} value={m} className="bg-[#0c1017] text-white font-mono text-sm py-1">
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-danger font-semibold">no keys</span>
                )}
              </div>
            )}

            {extras}
          </div>
        </div>
      </header>

      <main className="retro-page flex-1">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0.35, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full h-full"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Floating dock properly fixed at bottom of viewport */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[95vw] pointer-events-auto"
        style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}
      >
        <DashboardDock items={NAV_ITEMS} />
      </div>
    </div>
  );
}
