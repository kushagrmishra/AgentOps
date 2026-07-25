import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Agent, Tool } from '../lib/types';

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextAgents, nextTools] = await Promise.all([api.listAgents(), api.listTools()]);
      setAgents(nextAgents);
      setTools(nextTools);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load sub-agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { agents, tools, loading, error, refresh };
}
