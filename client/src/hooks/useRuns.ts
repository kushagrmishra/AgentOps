import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { RunSummary } from '../lib/types';

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 15000;

export function isActive(status: string): boolean {
  return status === 'planning' || status === 'running';
}

/**
 * The run list, refreshed on a timer.
 *
 * Polls quickly while any run is in flight and slowly otherwise; per-run detail
 * uses a server-sent event stream instead.
 */
export function useRuns(filters: { status?: string; source?: string } = {}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, source } = filters;
  // Keeps the polling effect from restarting on every render.
  const hasActiveRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.listRuns({ limit: 100, status, source });
      setRuns(next);
      hasActiveRef.current = next.some((run) => isActive(run.status));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load runs');
    } finally {
      setLoading(false);
    }
  }, [status, source]);

  useEffect(() => {
    setLoading(true);
    void refresh();

    let timer: number;
    const tick = () => {
      timer = window.setTimeout(async () => {
        await refresh();
        tick();
      }, hasActiveRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    tick();

    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { runs, loading, error, refresh, setRuns };
}
