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
      setSettings(await api.getLlmSettings());
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

  return { settings, setSettings, loading, error, refresh };
}
