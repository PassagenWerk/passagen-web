import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  deleteReport,
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

const KIND_DESCRIPTIONS: Record<ReportKind, string> = {
  review: "Connect the questions, methods, and contributions into a coherent literature review.",
  comparison: "Compare methods, datasets, evaluation designs, and reported results.",
  gaps: "Surface limitations, tensions, missing evidence, and useful next directions.",
  custom: "Write a source-grounded document from your own research brief.",
};

export function ReportsPanel({
  collectionId,
  papers,
  focused = false,
  initialSelectedId = null,
  onFocusChange,
}: {
  collectionId: string;
  papers: PaperRef[];
  focused?: boolean;
  initialSelectedId?: string | null;
  onFocusChange?: (focused: boolean, reportId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ReportKind>("review");
  const [prompt, setPrompt] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

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

  const remove = useMutation({
    mutationFn: (reportId: string) => deleteReport(collectionId, reportId),
    onSuccess: (_result, reportId) => {
      queryClient.removeQueries({ queryKey: ["collection-report", collectionId, reportId] });
      const nextId = items.find((item) => item.record.id !== reportId)?.record.id ?? null;
      setSelectedId(nextId);
      invalidate();
      if (focused) onFocusChange?.(nextId !== null, nextId ?? undefined);
    },
  });

  const items = reports.data?.items ?? [];
  const missingSummaryCount = papers.filter((paper) => paper.summaryReady === false).length;
  const active = items.find((item) => ["queued", "running"].includes(item.record.status));

  useEffect(() => {
    if (items.length === 0 || items.some((item) => item.record.id === selectedId)) return;
    const reportId = items[0].record.id;
    setSelectedId(reportId);
    if (focused) onFocusChange?.(true, reportId);
  }, [focused, items, onFocusChange, selectedId]);

  useEffect(() => {
    if (initialSelectedId !== null) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  function selectReport(reportId: string) {
    setSelectedId(reportId);
    if (focused) onFocusChange?.(true, reportId);
  }

  function confirmDelete() {
    if (!detail.data || ["queued", "running"].includes(detail.data.record.status)) return;
    if (window.confirm(`Delete research document "${detail.data.record.title}"?`)) {
      remove.mutate(detail.data.record.id);
    }
  }

  return (
    <section
      className={`research-panel ${focused ? "is-document-focus" : ""}`}
      aria-label="Collection reports"
    >
      {focused ? (
        <header className="document-focus-header">
          <div>
            <span>Research documents</span>
            <strong>{detail.data?.report?.title ?? "Reading view"}</strong>
          </div>
          <label>
            <span>Document</span>
            <select
              value={selectedId ?? ""}
              onChange={(event) => selectReport(event.target.value)}
              aria-label="Choose research document"
            >
              {items.map((item) => (
                <option key={item.record.id} value={item.record.id}>{item.record.title}</option>
              ))}
            </select>
          </label>
          <div className="document-focus-actions">
            {detail.data && !["queued", "running"].includes(detail.data.record.status) ? (
              <button type="button" className="is-danger" onClick={confirmDelete} disabled={remove.isPending}>
                {remove.isPending ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button type="button" onClick={() => onFocusChange?.(false)}>
              Back to research desk
            </button>
          </div>
        </header>
      ) : null}
      {!focused ? <form
        className="research-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!generate.isPending) generate.mutate();
        }}
      >
        <div className="research-actions">
          <div className="research-document-kinds" role="radiogroup" aria-label="Document type">
            {(Object.keys(KIND_LABELS) as ReportKind[]).map((option) => (
              <label key={option} className={kind === option ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="report-kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                />
                <strong>{KIND_LABELS[option]}</strong>
                <span>{KIND_DESCRIPTIONS[option]}</span>
              </label>
            ))}
          </div>
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
            type="submit"
            className="primary-button"
            disabled={generate.isPending || papers.length === 0 || (missingSummaryCount > 0 && !allowPartial) || (kind === "custom" && !prompt.trim())}
          >
            {generate.isPending ? "Creating..." : "Create document"}
          </button>
        </div>
        {kind === "custom" ? (
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the question, audience, and emphasis for this research document..."
            aria-label="Custom document brief"
            rows={2}
          />
        ) : null}
      </form> : null}
      {generate.error ? (
        <span className="form-status is-error">{generate.error.message}</span>
      ) : null}
      {reports.error ? (
        <div className="panel-message is-error">{reports.error.message}</div>
      ) : null}
      {active ? (
        <RunStateLine status={active.record.status} error={active.record.error} />
      ) : null}
      {!focused && selectedId && detail.data ? (
        <div className="research-document-view-actions">
          {detail.data.record.status === "completed" ? (
            <button type="button" onClick={() => onFocusChange?.(true, selectedId)}>
              Open reading view
            </button>
          ) : null}
          {!["queued", "running"].includes(detail.data.record.status) ? (
            <button type="button" className="is-danger" onClick={confirmDelete} disabled={remove.isPending}>
              {remove.isPending ? "Deleting..." : "Delete document"}
            </button>
          ) : null}
        </div>
      ) : null}
      {remove.error ? <span className="form-status is-error">{remove.error.message}</span> : null}

      <div className="research-reports">
        {!focused ? <div className="research-report-list" aria-label="Research document history">
          {reports.isPending ? <div className="panel-message">Loading reports...</div> : null}
          {items.length === 0 && !reports.isPending ? (
            <div className="panel-message">
              <strong>No research documents yet.</strong>
              <span>Choose a document type above to create a durable research output.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <button
              key={item.record.id}
              type="button"
              className={`research-report-item ${item.record.id === selectedId ? "is-active" : ""}`}
              onClick={() => selectReport(item.record.id)}
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
        </div> : null}
        <div>
          {detail.isPending ? <div className="panel-message">Opening report...</div> : null}
          {detail.error ? (
            <div className="panel-message is-error">{detail.error.message}</div>
          ) : null}
          <ReportDetail view={detail.data ?? null} collectionId={collectionId} papers={papers} />
        </div>
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
