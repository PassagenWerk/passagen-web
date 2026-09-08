import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  fetchGenerationRun,
  fetchSynthesis,
  submitSynthesis,
} from "../../api/research";
import { CitationChips, RunStateLine, StatusBadges, type PaperRef } from "./researchShared";

export function SynthesisPanel({
  collectionId,
  papers,
}: {
  collectionId: string;
  papers: PaperRef[];
}) {
  const queryClient = useQueryClient();
  const [allowPartial, setAllowPartial] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const synthesis = useQuery({
    queryKey: ["collection-synthesis", collectionId],
    queryFn: () => fetchSynthesis(collectionId),
  });
  const activeRun = useQuery({
    queryKey: ["generation-run", activeRunId],
    queryFn: () => fetchGenerationRun(activeRunId!),
    enabled: activeRunId !== null,
    refetchInterval: (query) =>
      query.state.data && ["completed", "failed", "interrupted"].includes(query.state.data.status)
        ? false
        : 900,
  });

  const runStatus = activeRun.data?.status ?? null;
  useEffect(() => {
    if (runStatus === "completed" || runStatus === "failed" || runStatus === "interrupted") {
      void queryClient.invalidateQueries({ queryKey: ["collection-synthesis", collectionId] });
      void queryClient.invalidateQueries({ queryKey: ["collection-runs", collectionId] });
      void queryClient.invalidateQueries({ queryKey: ["collection-reports", collectionId] });
    }
  }, [runStatus, collectionId, queryClient]);

  const generate = useMutation({
    mutationFn: (force: boolean) =>
      submitSynthesis(collectionId, { allowPartial, force }),
    onSuccess: (submission) => {
      if (submission.run_id) {
        setActiveRunId(submission.run_id);
      } else {
        void queryClient.invalidateQueries({ queryKey: ["collection-synthesis", collectionId] });
      }
    },
  });

  const result = synthesis.data;
  const busy =
    generate.isPending || runStatus === "queued" || runStatus === "running";

  return (
    <section className="research-panel" aria-label="Collection synthesis">
      <div className="research-toolbar">
        <div>
          <StatusBadges
            sourceStatus={result?.source_status}
            coverage={result?.synthesis.coverage}
            extra={
              result
                ? `${result.disposition === "reused" ? "Reused" : "Generated"} · ${result.strategy}`
                : null
            }
          />
        </div>
        <div className="research-actions">
          <label className="research-option">
            <input
              type="checkbox"
              checked={allowPartial}
              onChange={(event) => setAllowPartial(event.target.checked)}
            />
            Allow partial coverage
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => generate.mutate(Boolean(result))}
          >
            {busy ? "Running..." : result ? "Regenerate synthesis" : "Generate synthesis"}
          </button>
        </div>
      </div>
      <RunStateLine status={busy || activeRunId ? runStatus : null} error={activeRun.data?.error_message} />
      {generate.error ? (
        <span className="form-status is-error">{generate.error.message}</span>
      ) : null}
      {synthesis.error ? (
        <div className="panel-message is-error">{synthesis.error.message}</div>
      ) : null}
      {synthesis.isPending ? <div className="panel-message">Loading synthesis...</div> : null}
      {!result && !synthesis.isPending && !busy ? (
        <div className="panel-message">
          <strong>No synthesis yet.</strong>
          <span>Generate a citation-checked overview across the collection summaries.</span>
        </div>
      ) : null}
      {result ? (
        <article className="research-content">
          <div className="markdown">
            <ReactMarkdown>{result.synthesis.overview}</ReactMarkdown>
          </div>
          {result.synthesis.themes.length > 0 ? (
            <div className="research-themes">
              <h3>Themes</h3>
              {result.synthesis.themes.map((theme) => (
                <div key={theme.name} className="research-theme">
                  <strong>{theme.name}</strong>
                  <p>{theme.description}</p>
                  <div className="ask-selected-papers">
                    {theme.paper_ids.map((paperId) => (
                      <span key={paperId} className="ask-source-badge">
                        {papers.find((paper) => paper.id === paperId)?.title ?? paperId}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {result.synthesis.comparison_matrix.dimensions.length > 0 ? (
            <table className="research-matrix">
              <thead>
                <tr>
                  <th>Paper</th>
                  {result.synthesis.comparison_matrix.dimensions.map((dimension) => (
                    <th key={dimension}>{dimension}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.synthesis.comparison_matrix.rows.map((row) => (
                  <tr key={row.paper_id}>
                    <th>{papers.find((paper) => paper.id === row.paper_id)?.title ?? row.paper_id}</th>
                    {row.cells.map((cell) => (
                      <td key={cell.dimension}>{cell.value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <CitationChips
            citations={result.synthesis.citations}
            collectionId={collectionId}
            papers={papers}
          />
        </article>
      ) : null}
    </section>
  );
}
