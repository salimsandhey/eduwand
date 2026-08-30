import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, PipelineStage } from "../api/client";

export function usePipelineStages() {
  const { accessToken } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.listPipelineStages(accessToken);
      setStages([...res].sort((a, b) => a.order - b.order));
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return { stages, isLoading, reload: load };
}
