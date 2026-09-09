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
  onAsk,
}: {
  collectionId: string;
  papers: PaperRef[];
  onAsk?: (question: string) => void;
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
  const missingSummaryCount = papers.filter((paper) => paper.summaryReady === false).length;
  const busy =
    generate.isPending || runStatus === "queued" || runStatus === "running";

  return (
    <section className="research-panel" aria-label="Collection synthesis">
      <div className="research-toolbar">
        <div>
          <StatusBadges
            sourceStatus={result?.source_status}
            coverage={result?.synthesis.coverage}
            extra={result ? (result.disposition === "reused" ? "Sources unchanged" : "Current") : null}
          />
        </div>
        <div className="research-actions">
          {missingSummaryCount > 0 ? (
            <label className="research-option">
              <input
                type="checkbox"
                checked={allowPartial}
                onChange={(event) => setAllowPartial(event.target.checked)}
              />
              Continue with {papers.length - missingSummaryCount} of {papers.length} papers
            </label>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={busy || papers.length === 0 || (missingSummaryCount > 0 && !allowPartial)}
            onClick={() => generate.mutate(Boolean(result))}
          >
            {busy ? "Building intelligence..." : result ? "Refresh intelligence" : "Generate intelligence"}
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
          <strong>{papers.length === 0 ? "Add papers to begin." : "No collection intelligence yet."}</strong>
          <span>Build a citation-checked overview of themes, evidence, and differences across the paper summaries.</span>
        </div>
      ) : null}
      {result ? (
        <article className="research-content">
          <div className="markdown">
            <ReactMarkdown>{result.synthesis.executive_overview}</ReactMarkdown>
          </div>
          {result.synthesis.paper_roles.length > 0 ? (
            <div className="research-themes">
              <h3>Paper roles</h3>
              <div className="paper-role-grid">
                {result.synthesis.paper_roles.map((role) => (
                  <article key={role.paper_id} className="paper-role-card">
                    <span>{papers.find((paper) => paper.id === role.paper_id)?.title ?? role.paper_id}</span>
                    <strong>{role.role}</strong>
                    <p>{role.contribution}</p>
                    {role.method ? <small>{role.method}</small> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {result.synthesis.themes.length > 0 ? (
            <div className="research-themes">
              <h3>Themes</h3>
              {result.synthesis.themes.map((theme) => (
                <div key={theme.name} className="research-theme">
                  <strong>{theme.name}</strong>
                  <p>{theme.description}</p>
                  {onAsk ? <button className="research-ask-link" type="button" onClick={() => onAsk(`Explain the collection theme "${theme.name}" and how the papers relate.`)}>Ask about this</button> : null}
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
          <InsightGroup title="Agreements" insights={result.synthesis.agreements} papers={papers} onAsk={onAsk} />
          <InsightGroup title="Tensions" insights={result.synthesis.disagreements} papers={papers} onAsk={onAsk} />
          <InsightGroup title="Complementary contributions" insights={result.synthesis.complementary_contributions} papers={papers} onAsk={onAsk} />
          <InsightGroup title="Research gaps" insights={result.synthesis.gaps} papers={papers} onAsk={onAsk} />
          {result.synthesis.open_questions.length > 0 ? (
            <div className="research-themes">
              <h3>Questions to pursue</h3>
              {result.synthesis.open_questions.map((question) => (
                <button key={question.question} className="open-question" type="button" onClick={() => onAsk?.(question.question)}>
                  <strong>{question.question}</strong>
                  <span>{question.rationale}</span>
                </button>
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

function InsightGroup({
  title,
  insights,
  papers,
  onAsk,
}: {
  title: string;
  insights: { name: string; description: string; paper_ids: string[] }[];
  papers: PaperRef[];
  onAsk?: (question: string) => void;
}) {
  if (insights.length === 0) return null;
  return (
    <div className="research-themes">
      <h3>{title}</h3>
      {insights.map((insight) => (
        <div key={insight.name} className="research-theme">
          <strong>{insight.name}</strong>
          <p>{insight.description}</p>
          <div className="ask-selected-papers">
            {insight.paper_ids.map((paperId) => (
              <span key={paperId} className="ask-source-badge">{papers.find((paper) => paper.id === paperId)?.title ?? paperId}</span>
            ))}
          </div>
          {onAsk ? <button className="research-ask-link" type="button" onClick={() => onAsk(`Explore ${title.toLowerCase()}: ${insight.name}. ${insight.description}`)}>Ask about this</button> : null}
        </div>
      ))}
    </div>
  );
}
