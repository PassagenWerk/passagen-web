import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

import { fetchOutline, fetchSummary, type Paper, type Tag } from "../../api/papers";
import { StructuredSummary } from "./StructuredSummary";

interface PaperDetailProps {
  paper: Paper | undefined;
  tags: Tag[];
  search: URLSearchParams;
  pending: boolean;
  error: Error | null;
  onView: (view: "summary" | "outline") => void;
}

export function PaperDetail({ paper, tags, search, pending, error, onView }: PaperDetailProps) {
  const requestedView = search.get("view") === "outline" ? "outline" : "summary";
  const view = requestedView === "summary" && !paper?.artifacts.summary && paper?.artifacts.outline
    ? "outline"
    : requestedView;
  const summary = useQuery({
    queryKey: ["summary", paper?.id],
    queryFn: () => fetchSummary(paper!.id),
    enabled: Boolean(paper && view === "summary" && paper.artifacts.summary),
    retry: false,
  });
  const outline = useQuery({
    queryKey: ["outline", paper?.id],
    queryFn: () => fetchOutline(paper!.id),
    enabled: Boolean(paper && view === "outline" && paper.artifacts.outline),
    retry: false,
  });
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  return (
    <article className="detail-panel" aria-labelledby="detail-heading">
      <div className="panel-heading detail-heading">
        <span className="index-number">03</span>
        <h2 id="detail-heading">Read</h2>
        <Link className="mobile-back" to={{ pathname: "/", search: search.toString() }}>Back to index</Link>
      </div>

      {pending ? <div className="panel-message">Retrieving paper...</div> : null}
      {error ? <div className="panel-message is-error">{error.message}</div> : null}
      {!paper && !pending && !error ? (
        <div className="detail-empty">
          <span className="detail-empty-mark">P</span>
          <h3>Select a paper to begin.</h3>
          <p>Summary and outline artifacts stay on this machine and open here.</p>
        </div>
      ) : null}

      {paper ? (
        <>
          <header className="paper-header">
            <div className="paper-kicker">{paper.status.replaceAll("_", " ")} / {paper.year ?? "undated"}</div>
            <h1>{paper.title ?? paper.original_filename}</h1>
            <p className="detail-authors">{paper.authors.join(", ") || "Unknown authors"}</p>
            <dl className="metadata-grid">
              <div><dt>Venue</dt><dd>{paper.venue ?? "Not recorded"}</dd></div>
              <div><dt>Year</dt><dd>{paper.year ?? "Not recorded"}</dd></div>
              <div><dt>DOI</dt><dd>{paper.doi ?? "Not recorded"}</dd></div>
              <div><dt>arXiv</dt><dd>{paper.arxiv_id ?? "Not recorded"}</dd></div>
            </dl>
            {paper.tag_ids.length > 0 ? (
              <div className="tag-row detail-tags">
                {paper.tag_ids.map((tagId) => {
                  const tag = tagsById.get(tagId);
                  return tag ? <span className="tag-chip" key={tagId}>{tag.name}</span> : null;
                })}
              </div>
            ) : null}
          </header>

          <div className="reader-tabs" role="tablist" aria-label="Paper artifacts">
            <button
              type="button"
              role="tab"
              aria-selected={view === "summary"}
              disabled={!paper.artifacts.summary}
              onClick={() => onView("summary")}
            >Summary</button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "outline"}
              disabled={!paper.artifacts.outline}
              onClick={() => onView("outline")}
            >Outline</button>
          </div>

          <div className="reader" role="tabpanel">
            {view === "summary" ? (
              <ArtifactState
                available={paper.artifacts.summary}
                status={paper.status}
                pending={summary.isPending}
                error={summary.error}
                label="Summary"
              >
                {summary.data ? <StructuredSummary content={summary.data.content} /> : null}
              </ArtifactState>
            ) : (
              <ArtifactState
                available={paper.artifacts.outline}
                status={paper.status}
                pending={outline.isPending}
                error={outline.error}
                label="Outline"
              >
                {outline.data ? <div className="markdown"><ReactMarkdown>{outline.data.content}</ReactMarkdown></div> : null}
              </ArtifactState>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}

function ArtifactState({
  available,
  status,
  pending,
  error,
  label,
  children,
}: {
  available: boolean;
  status: string;
  pending: boolean;
  error: Error | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!available) {
    return <div className="artifact-message"><strong>{label} is not available.</strong><p>The paper is currently at the “{status.replaceAll("_", " ")}” processing stage.</p></div>;
  }
  if (pending) return <div className="artifact-message">Loading {label.toLowerCase()}...</div>;
  if (error) return <div className="artifact-message is-error"><strong>{label} could not be opened.</strong><p>{error.message}</p></div>;
  return children;
}
