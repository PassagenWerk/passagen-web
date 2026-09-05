import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Paper } from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";
import {
  createRun,
  fetchRuns,
  isActiveRun,
  type RebuildStage,
} from "../../api/processing";

const rebuildStages: { value: RebuildStage; label: string }[] = [
  { value: "metadata", label: "All stages" },
  { value: "parse", label: "Full text + Summary + Outline" },
  { value: "summary", label: "Summary + Outline" },
  { value: "outline", label: "Outline only" },
];

export function PaperProcessing({ paper }: { paper: Paper }) {
  const queryClient = useQueryClient();
  const [fromStage, setFromStage] = useState<RebuildStage>("metadata");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEscapeClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });
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
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["paper-runs", paper.id] });
      await queryClient.invalidateQueries({ queryKey: ["processing-runs"] });
      trigger.current?.focus();
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
            <div className="paper-action paper-reprocess">
              <button
                ref={trigger}
                className="paper-action-button"
                type="button"
                aria-expanded={open}
                aria-controls="paper-reprocess-panel"
                onClick={() => setOpen((value) => !value)}
              >Reprocess</button>
              {open ? (
                <div
                  className="settings-panel paper-action-panel reprocess-action-panel"
                  id="paper-reprocess-panel"
                  role="dialog"
                  aria-label="Reprocess paper"
                >
                  <label htmlFor="paper-reprocess-stage">Stages to rebuild</label>
                  <span className="reprocess-control">
                    <select
                      id="paper-reprocess-stage"
                      value={fromStage}
                      onChange={(event) => setFromStage(event.target.value as RebuildStage)}
                    >
                      {rebuildStages.map((stage) => (
                        <option key={stage.value} value={stage.value}>
                          {stage.label}
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
                </div>
              ) : null}
            </div>
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
