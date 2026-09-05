import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Paper } from "../../api/papers";
import {
  createRun,
  fetchRuns,
  isActiveRun,
  type ProcessingRun,
  type RebuildStage,
  type RunPaperFailure,
} from "../../api/processing";

export interface PaperProcessingController {
  activeRun: ProcessingRun | undefined;
  latestFailure: RunPaperFailure | undefined;
  isStarting: boolean;
  error: Error | null;
  start: (stage?: RebuildStage, onStarted?: () => void) => void;
}

export function usePaperProcessing(paper: Paper | undefined): PaperProcessingController {
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ["paper-runs", paper?.id],
    queryFn: () => fetchRuns({ paperId: paper!.id, limit: 5 }),
    enabled: Boolean(paper),
    retry: false,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isActiveRun) ? 1500 : false,
  });
  const mutation = useMutation({
    mutationFn: (stage?: RebuildStage) =>
      createRun([paper!.id], stage ? "rebuild" : "continue", stage),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["paper-runs", paper?.id] });
      await queryClient.invalidateQueries({ queryKey: ["processing-runs"] });
    },
  });

  return {
    activeRun: (runs.data ?? []).find(isActiveRun),
    latestFailure: runs.data?.[0]?.result?.failed.find(
      (failure) => failure.paper_id === paper?.id,
    ),
    isStarting: mutation.isPending,
    error: mutation.error,
    start: (stage, onStarted) => mutation.mutate(stage, { onSuccess: onStarted }),
  };
}
