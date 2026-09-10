import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamEvents } from '../lib/api';
import type { EvalRunDetail, EvalRunSummary, Scenario } from '../lib/types';

export function useScenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setScenarios(await api.listScenarios());
      setError(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not load scenarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { scenarios, loading, error, refresh };
}

/**
 * Eval run history plus a live view of the suite currently executing.
 *
 * History drives the trend chart; the active suite is followed over its event
 * stream so per-scenario scores appear as they are judged.
 */
export function useEvalRuns() {
  const [history, setHistory] = useState<EvalRunSummary[]>([]);
  const [active, setActive] = useState<EvalRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.listEvalRuns());
      setError(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not load eval runs');
    } finally {
      setLoading(false);
    }
  }, []);

  const follow = useCallback(
    (evalRunId: string) => {
      unsubscribe.current?.();
      unsubscribe.current = streamEvents<EvalRunDetail>(`/evals/runs/${evalRunId}/events`, {
        onMessage: (data) => {
          if (data && data.id) {
            setActive(data);
          }
        },
        onDone: () => {
          void refreshHistory();
          void api
            .getEvalRun(evalRunId)
            .then((run) => {
              if (run && run.id) setActive(run);
            })
            .catch(() => {});
        },
        onError: (caught: Error) => setError(caught.message),
      });
    },
    [refreshHistory],
  );

  useEffect(() => {
    void refreshHistory();
    return () => unsubscribe.current?.();
  }, [refreshHistory]);

  // Resume following a suite that is still running (e.g. after a page reload),
  // or default to the most recent run so results are displayed.
  useEffect(() => {
    if (active) return;
    const running = history.find((run) => run.status === 'running');
    if (running) {
      void api.getEvalRun(running.id).then((run) => {
        if (run && run.id) setActive(run);
      });
      follow(running.id);
      return;
    }
    if (history.length > 0) {
      void api
        .getEvalRun(history[0].id)
        .then((run) => {
          if (run && run.id) setActive(run);
        })
        .catch(() => {});
    }
  }, [history, active, follow]);

  const start = useCallback(
    async (scenarioIds: string[] = []) => {
      const started = await api.startEvalRun(scenarioIds);
      setActive(started);
      follow(started.id);
      void refreshHistory();
      return started;
    },
    [follow, refreshHistory],
  );

  const open = useCallback(async (evalRunId: string) => {
    unsubscribe.current?.();
    setActive(await api.getEvalRun(evalRunId));
  }, []);

  const terminate = useCallback(
    async (evalRunId: string) => {
      const terminated = await api.terminateEvalRun(evalRunId);
      setActive(terminated);
      void refreshHistory();
      return terminated;
    },
    [refreshHistory],
  );

  return { history, active, loading, error, start, open, terminate, refreshHistory };
}
