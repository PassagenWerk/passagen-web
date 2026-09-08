import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  fetchReport,
  fetchReports,
  submitReport,
  type CollectionReportView,
  type ReportKind,
} from "../../api/research";
import { CitationChips, RunStateLine, StatusBadges, type PaperRef } from "./researchShared";

const KIND_LABELS: Record<ReportKind, string> = {
  review: "Literature review",
  comparison: "Comparison",
  gaps: "Research gaps",
  custom: "Custom",
};

export function ReportsPanel({
  collectionId,
  papers,
}: {
  collectionId: string;
  papers: PaperRef[];
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ReportKind>("review");
  const [prompt, setPrompt] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reports = useQuery({
    queryKey: ["collection-reports", collectionId],
    queryFn: () => fetchReports(collectionId),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) =>
        ["queued", "running"].includes(item.record.status),
      )
        ? 900
        : false,
  });
  const detail = useQuery({
    queryKey: ["collection-report", collectionId, selectedId],
    queryFn: () => fetchReport(collectionId, selectedId!),
    enabled: selectedId !== null,
    refetchInterval: (query) =>
      query.state.data && ["queued", "running"].includes(query.state.data.record.status)
        ? 900
        : false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["collection-reports", collectionId] });
    void queryClient.invalidateQueries({ queryKey: ["collection-runs", collectionId] });
    if (selectedId) {
      void queryClient.invalidateQueries({
        queryKey: ["collection-report", collectionId, selectedId],
      });
    }
  };

  const generate = useMutation({
    mutationFn: () =>
      submitReport(collectionId, {
        kind,
        userPrompt: kind === "custom" ? prompt.trim() : undefined,
        allowPartial,
      }),
    onSuccess: (submission) => {
      invalidate();
      if (submission.report_id) setSelectedId(submission.report_id);
    },
  });

  const items = reports.data?.items ?? [];
  const active = items.find((item) => ["queued", "running"].includes(item.record.status));

  return (
    <section className="research-panel" aria-label="Collection reports">
      <form
        className="research-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!generate.isPending) generate.mutate();
        }}
      >
        <div className="research-actions">
          <div className="abstract-version-toggle" role="group" aria-label="Report kind">
            {(Object.keys(KIND_LABELS) as ReportKind[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {KIND_LABELS[option]}
              </button>
            ))}
          </div>
          <label className="research-option">
            <input
              type="checkbox"
              checked={allowPartial}
              onChange={(event) => setAllowPartial(event.target.checked)}
            />
            Allow partial coverage
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={generate.isPending || (kind === "custom" && !prompt.trim())}
          >
            {generate.isPending ? "Submitting..." : "Generate report"}
          </button>
        </div>
        {kind === "custom" ? (
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the research task for this collection..."
            aria-label="Custom report prompt"
            rows={2}
          />
        ) : null}
      </form>
      {generate.error ? (
        <span className="form-status is-error">{generate.error.message}</span>
      ) : null}
      {active ? (
        <RunStateLine status={active.record.status} error={active.record.error} />
      ) : null}

      <div className="research-reports">
        <div className="research-report-list" aria-label="Report history">
          {items.length === 0 && !reports.isPending ? (
            <div className="panel-message">
              <strong>No reports yet.</strong>
              <span>Generate a review, comparison, gaps, or custom report.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <button
              key={item.record.id}
              type="button"
              className={`research-report-item ${item.record.id === selectedId ? "is-active" : ""}`}
              onClick={() => setSelectedId(item.record.id)}
            >
              <strong>{item.record.title}</strong>
              <span className="research-report-meta">
                <span className="ask-source-badge">{KIND_LABELS[item.record.kind]}</span>
                {item.record.status === "completed" ? (
                  <StatusBadges sourceStatus={item.source_status} />
                ) : (
                  <RunStateLine status={item.record.status} error={item.record.error} />
                )}
                <span className="form-status">
                  {new Date(item.record.created_at).toLocaleString()}
                </span>
              </span>
            </button>
          ))}
        </div>
        <ReportDetail view={detail.data ?? null} collectionId={collectionId} papers={papers} />
      </div>
    </section>
  );
}

function ReportDetail({
  view,
  collectionId,
  papers,
}: {
  view: CollectionReportView | null;
  collectionId: string;
  papers: PaperRef[];
}) {
  if (!view) return null;
  if (view.record.status !== "completed" || !view.report) {
    return (
      <div className="panel-message">
        <RunStateLine status={view.record.status} error={view.record.error} />
      </div>
    );
  }
  return (
    <article className="research-content" aria-label="Report detail">
      <header>
        <h3>{view.report.title}</h3>
        <StatusBadges sourceStatus={view.source_status} coverage={view.report.coverage} />
        {view.report.user_prompt ? (
          <p className="form-status">Prompt: {view.report.user_prompt}</p>
        ) : null}
      </header>
      {view.report.sections.map((section) => (
        <section key={section.heading}>
          <h4>{section.heading}</h4>
          <div className="markdown">
            <ReactMarkdown>{section.body_markdown}</ReactMarkdown>
          </div>
        </section>
      ))}
      <CitationChips
        citations={view.report.citations}
        collectionId={collectionId}
        papers={papers}
      />
    </article>
  );
}
