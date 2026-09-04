import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { Paper } from "../../api/papers";
import {
  createRun,
  fetchRuns,
  isActiveRun,
  type RebuildStage,
} from "../../api/processing";

const rebuildStages: { value: RebuildStage; label: string }[] = [
  { value: "metadata", label: "Metadata" },
  { value: "parse", label: "Parse" },
  { value: "summary", label: "Summary" },
];

export function PaperProcessing({ paper }: { paper: Paper }) {
  const queryClient = useQueryClient();
  const [fromStage, setFromStage] = useState<RebuildStage>("metadata");
  const runs = useQuery({
    queryKey: ["paper-runs", paper.id],
    queryFn: () => fetchRuns({ paperId: paper.id, limit: 5 }),
    retry: false,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isActiveRun) ? 1500 : false,
  });
  const activeRun = (runs.data ?? []).find(isActiveRun);
  const latestFailure = runs.data?.[0]?.result?.failed.find(
    (failure) => failure.paper_id === paper.id,
  );

  const start = useMutation({
    mutationFn: (options: { rebuild?: RebuildStage }) =>
      createRun([paper.id], options.rebuild ? "rebuild" : "continue", options.rebuild),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["paper-runs", paper.id] });
      await queryClient.invalidateQueries({ queryKey: ["processing-runs"] });
    },
  });

  const complete = paper.status === "outlined";
  return (
    <section className="paper-processing" aria-label="Processing status">
      {activeRun ? (
        <p className="processing-note">
          Processing{activeRun.current_stage ? `: ${activeRun.current_stage}` : " queued"} —{" "}
          <Link to={`/processing/runs/${activeRun.id}`}>view run</Link>
        </p>
      ) : (
        <div className="paper-processing-actions">
          {complete ? (
            <span className="reprocess-control">
              <select
                aria-label="Reprocess from stage"
                value={fromStage}
                onChange={(event) => setFromStage(event.target.value as RebuildStage)}
              >
                {rebuildStages.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    From {stage.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-button"
                disabled={start.isPending}
                onClick={() => start.mutate({ rebuild: fromStage })}
              >
                Reprocess
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={start.isPending}
              onClick={() => start.mutate({})}
            >
              {start.isPending
                ? "Starting..."
                : paper.status === "discovered"
                  ? "Process"
                  : "Continue processing"}
            </button>
          )}
          {latestFailure ? (
            <span className="form-status is-error">
              Last run failed at {latestFailure.category}: {latestFailure.message}
            </span>
          ) : null}
          {start.error ? (
            <span className="form-status is-error" role="alert">{start.error.message}</span>
          ) : null}
        </div>
      )}
    </section>
  );
}
