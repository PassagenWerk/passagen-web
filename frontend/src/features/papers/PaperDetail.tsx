import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

import { fetchOutline, fetchSummary, type Paper, type Tag } from "../../api/papers";
import { PdfReader } from "../reader/PdfReader";
import { PaperLibraryEditor } from "./PaperLibraryEditor";
import { StructuredSummary } from "./StructuredSummary";

interface PaperDetailProps {
  paper: Paper | undefined;
  tags: Tag[];
  search: URLSearchParams;
  pending: boolean;
  error: Error | null;
  pdfView: boolean;
  onView: (view: "summary" | "outline") => void;
  onTogglePdf: () => void;
  onOpenPdf: () => void;
  focused: boolean;
  onExitFocus: () => void;
  paperPath?: string;
}

export function PaperDetail({
  paper,
  tags,
  search,
  pending,
  error,
  pdfView,
  onView,
  onTogglePdf,
  onOpenPdf,
  focused,
  onExitFocus,
  paperPath,
}: PaperDetailProps) {
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
  const currentPaperPath = paperPath ?? (paper ? `/papers/${encodeURIComponent(paper.id)}` : "");

  return (
    <article className={`detail-panel ${pdfView ? "has-pdf" : ""}`} aria-labelledby="detail-heading">
      {focused ? (
        <button
          className="focus-back"
          type="button"
          aria-label="Back to three columns"
          onClick={onExitFocus}
        >
          <span aria-hidden="true">&lt;</span>
          <span>Index</span>
        </button>
      ) : null}
      <div className="detail-document">
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
            <PaperLibraryEditor key={paper.id} paper={paper} tags={tags} />
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
                {summary.data ? (
                  <StructuredSummary
                    paperId={paper.id}
                    paperPath={currentPaperPath}
                    content={summary.data.content}
                    onOpenPdf={onOpenPdf}
                  />
                ) : null}
              </ArtifactState>
            ) : (
              <ArtifactState
                available={paper.artifacts.outline}
                status={paper.status}
                pending={outline.isPending}
                error={outline.error}
                label="Outline"
              >
                {outline.data ? (
                  <div className="markdown">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => href?.startsWith(`${currentPaperPath}/pdf`)
                          ? <Link className="evidence-page-link" to={href} onClick={onOpenPdf}>{children}</Link>
                          : <a href={href}>{children}</a>,
                      }}
                    >
                      {linkOutlineEvidence(outline.data.content, currentPaperPath)}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </ArtifactState>
            )}
          </div>
        </>
      ) : null}
      </div>
      {focused && paper ? (
        <button
          className="pdf-toggle"
          type="button"
          aria-label={pdfView ? "Close PDF panel" : "Open PDF panel"}
          aria-pressed={pdfView}
          disabled={!paper.artifacts.pdf}
          onClick={onTogglePdf}
        >
          <span aria-hidden="true">{pdfView ? ">" : "<"}</span>
          <span>PDF</span>
        </button>
      ) : null}
      {focused && paper ? (
        <aside className="pdf-pane" aria-label="PDF reader" aria-hidden={!pdfView}>
          {pdfView ? (
            <ArtifactState
              available={paper.artifacts.pdf}
              status={paper.status}
              pending={false}
              error={null}
              label="PDF"
            >
              <PdfReader paper={paper} page={search.get("page")} />
            </ArtifactState>
          ) : null}
        </aside>
      ) : null}
    </article>
  );
}

function linkOutlineEvidence(content: string, paperPath: string): string {
  return content.replace(
    /(Evidence pages:\s*)(\d+(?:\s*,\s*\d+)*)/gi,
    (_match, label: string, pages: string) => {
      const links = pages
        .split(",")
        .map((page) => page.trim())
        .map((page) => `[${page}](${paperPath}/pdf?view=outline&page=${page})`)
        .join(", ");
      return `${label}${links}`;
    },
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
