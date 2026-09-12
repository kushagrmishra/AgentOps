import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LlmSettings } from '../lib/types';

/** Provider config for the signed-in account. Used by the shell badge and Settings. */
export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getLlmSettings();
      setSettings(data);
      if (data?.model) {
        localStorage.setItem('agentops_selected_model', data.model);
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load provider settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleModelChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSettings((prev) => (prev ? { ...prev, model: customEvent.detail } : prev));
      }
    };
    window.addEventListener('agentops:model_change', handleModelChange);
    return () => window.removeEventListener('agentops:model_change', handleModelChange);
  }, []);

  return { settings, setSettings, loading, error, refresh };
}
