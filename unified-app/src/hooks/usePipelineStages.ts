import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, PipelineStage } from "../api/client";

// Shared by every screen that used to hardcode the 7-stage enum
// (EnquiryListScreen, PipelineBoardScreen, EnquiryDetailScreen) - stages are
// now configurable per school (FR-EG-3, backend/src/routes/pipeline-stages.ts).
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
      // Leave stages empty on failure - screens already handle an empty list.
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return { stages, isLoading, reload: load };
}
