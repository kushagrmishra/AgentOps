/** Poll fallback every 2s if SSE drops. WebSocket upgrade: /ws/runs/:id */
import { useEffect, useRef, useState } from 'react';
import { api, streamEvents } from '../lib/api';
import type { RunDetail } from '../lib/types';

type Connection = 'connecting' | 'live' | 'closed' | 'error';

/**
 * Live run detail.
 *
 * Loads once over REST so the view paints immediately, then follows the run's
 * server-sent event stream. The stream sends the whole run document per change,
 * so state is a straight replace. If the stream drops while the run is still in
 * flight, it falls back to polling.
 */
export function useRunStream(runId: string | undefined) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const latestStatus = useRef<string>('');

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let pollTimer: number | undefined;

    const apply = (next: RunDetail) => {
      if (cancelled) return;
      latestStatus.current = next.status;
      setRun(next);
      setError(null);
      setLoading(false);
    };

    const poll = () => {
      pollTimer = window.setTimeout(async () => {
        try {
          const next = await api.getRun(runId);
          apply(next);
          if (next.status === 'planning' || next.status === 'running') poll();
          else setConnection('closed');
        } catch (caught: unknown) {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : 'Lost contact with the run');
          }
        }
      }, 2000); // 2s polling fallback (WebSocket upgrade later)
    };

    void (async () => {
      try {
        apply(await api.getRun(runId));
      } catch (caught: unknown) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the run');
        setLoading(false);
        return;
      }

      if (cancelled) return;
      unsubscribe = streamEvents<RunDetail>(`/runs/${runId}/events`, {
        onMessage: (next: RunDetail) => {
          setConnection('live');
          apply(next);
        },
        onDone: () => {
          if (!cancelled) setConnection('closed');
        },
        onError: () => {
          if (cancelled) return;
          setConnection('error');
          // Only worth polling while the run can still change.
          if (latestStatus.current === 'planning' || latestStatus.current === 'running') poll();
        },
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [runId]);

  return { run, loading, error, connection };
}
