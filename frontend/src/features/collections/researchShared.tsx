import { Link } from "react-router-dom";

import type { Citation } from "../../api/conversations";
import type { SourceStatus, SynthesisCoverage } from "../../api/research";
import { citationLabel } from "../ask/citations";

export interface PaperRef {
  id: string;
  title: string | null;
}

/** Stale/partial/disposition badges shared by synthesis and report views. */
export function StatusBadges({
  sourceStatus,
  coverage,
  extra,
}: {
  sourceStatus?: SourceStatus;
  coverage?: SynthesisCoverage | null;
  extra?: string | null;
}) {
  return (
    <span className="research-badges">
      {extra ? <span className="ask-source-badge">{extra}</span> : null}
      {sourceStatus?.stale ? (
        <span className="ask-source-badge is-stale" title={sourceStatus.reasons.join(", ")}>
          Stale
        </span>
      ) : null}
      {coverage?.partial ? (
        <span
          className="ask-source-badge is-partial"
          title={`Missing summaries: ${coverage.missing_summary_paper_ids.join(", ")}`}
        >
          Partial ({coverage.included_paper_ids.length}/
          {coverage.included_paper_ids.length + coverage.missing_summary_paper_ids.length} papers)
        </span>
      ) : null}
    </span>
  );
}

/** Citation chips that navigate to the cited paper (and PDF page) inside the collection. */
export function CitationChips({
  citations,
  collectionId,
  papers,
}: {
  citations: Citation[];
  collectionId: string;
  papers: PaperRef[];
}) {
  const titles = new Map(papers.map((paper) => [paper.id, paper.title ?? paper.id]));
  return (
    <div className="ask-citations">
      {citations.map((citation) => {
        const base = `/collections/${collectionId}/papers/${citation.paper_id}`;
        const to = citation.page_start ? `${base}/pdf?page=${citation.page_start}` : base;
        return (
          <Link
            key={citation.citation_id}
            className="evidence-page-link"
            to={to}
            title={citation.excerpt ?? titles.get(citation.paper_id) ?? citation.paper_id}
          >
            {titles.get(citation.paper_id) ?? citation.paper_id} · {citationLabel(citation)}
          </Link>
        );
      })}
    </div>
  );
}

/** Run-state line for queued/running/failed/interrupted generation. */
export function RunStateLine({
  status,
  error,
}: {
  status: string | null;
  error?: string | null;
}) {
  if (status === null) return null;
  if (status === "queued" || status === "running") {
    return (
      <span className="form-status" role="status">
        {status === "queued" ? "Queued..." : "Generating..."}
      </span>
    );
  }
  if (status === "interrupted") {
    return <span className="ask-source-badge is-stale">Interrupted by restart</span>;
  }
  if (status === "failed") {
    return (
      <span className="form-status is-error">
        {error?.startsWith("interrupted") ? "Interrupted by restart" : `Failed: ${error ?? "unknown error"}`}
      </span>
    );
  }
  return null;
}
