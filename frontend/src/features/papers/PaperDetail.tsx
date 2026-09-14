import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { CollectionSummary } from "../../api/collections";
import {
  fetchNote,
  fetchOutline,
  fetchSummary,
  updatePaperNote,
  type Paper,
  type Tag,
} from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";
import { AskPanel, type AskScope } from "../ask/AskPanel";
import { PdfReader } from "../reader/PdfReader";
import { PaperCollectionPicker } from "./PaperCollectionPicker";
import { PaperLibraryEditor } from "./PaperLibraryEditor";
import {
  PaperProcessingStatus,
  StageReprocessButton,
} from "./PaperProcessing";
import { PaperTagPicker } from "./PaperTagPicker";
import { StructuredSummary } from "./StructuredSummary";
import { usePaperProcessing } from "./usePaperProcessing";

interface PaperDetailProps {
  paper: Paper | undefined;
  tags: Tag[];
  collections: CollectionSummary[];
  search: URLSearchParams;
  pending: boolean;
  error: Error | null;
  pdfView: boolean;
  askOpen: boolean;
  onView: (view: "summary" | "outline" | "note") => void;
  onToggleAsk: () => void;
  onReaderOnly: () => void;
  onTogglePdf: () => void;
  onOpenPdf: () => void;
  focused: boolean;
  onExitFocus: () => void;
  paperPath?: string;
  collectionAskScope?: Extract<AskScope, { kind: "collection" }>;
}

export function PaperDetail({
  paper,
  tags,
  collections,
  search,
  pending,
  error,
  pdfView,
  askOpen,
  onView,
  onToggleAsk,
  onReaderOnly,
  onTogglePdf,
  onOpenPdf,
  focused,
  onExitFocus,
  paperPath,
  collectionAskScope,
}: PaperDetailProps) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [abstractExpanded, setAbstractExpanded] = useState(true);
  const [abstractVersion, setAbstractVersion] = useState<"cleaned" | "original">("cleaned");
  const [askScope, setAskScope] = useState<"paper" | "collection">("paper");
  const tagPickerToggle = useRef<HTMLButtonElement>(null);
  const paperId = paper?.id;
  useEffect(() => setTagPickerOpen(false), [paperId]);
  useEffect(() => {
    setAbstractExpanded(true);
    setAbstractVersion("cleaned");
    setAskScope("paper");
  }, [paperId]);
  useEscapeClose(tagPickerOpen, () => {
    setTagPickerOpen(false);
    tagPickerToggle.current?.focus();
  });
  const requestedView = ["outline", "note"].includes(search.get("view") ?? "")
    ? search.get("view") as "outline" | "note"
    : "summary";
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
  const note = useQuery({
    queryKey: ["note", paper?.id],
    queryFn: () => fetchNote(paper!.id),
    enabled: Boolean(paper && view === "note"),
    retry: false,
  });
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const currentPaperPath = paperPath ?? (paper ? `/papers/${encodeURIComponent(paper.id)}` : "");
  const processing = usePaperProcessing(paper);

  return (
    <article
      className={`detail-panel ${pdfView || askOpen ? "has-companion" : ""} ${pdfView ? "has-pdf" : ""} ${askOpen ? "has-ask" : ""} ${pdfView && askOpen ? "is-ask-primary" : ""}`}
      aria-labelledby="detail-heading"
    >
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
            <div className="paper-header-actions">
              <PaperCollectionPicker
                key={`collection-${paper.id}`}
                paperId={paper.id}
                collections={collections}
                collectionIds={paper.collection_ids}
              />
              <PaperLibraryEditor key={paper.id} paper={paper} />
              {paper.status === "outlined" ? (
                <StageReprocessButton
                  key={`metadata-reprocess-${paper.id}`}
                  stage="metadata"
                  label="Metadata"
                  processing={processing}
                />
              ) : null}
              <PaperProcessingStatus paper={paper} processing={processing} />
            </div>
          </header>

          {paper.abstract ? (
            <section className="paper-abstract" aria-labelledby="paper-abstract-heading">
              <div className="abstract-heading">
                <div>
                  <h3 id="paper-abstract-heading">Author abstract</h3>
                  {paper.cleaned_abstract && abstractVersion === "cleaned" ? (
                    <span className="abstract-provenance">LLM-assisted</span>
                  ) : null}
                </div>
                <div className="abstract-controls">
                  {paper.status === "outlined" ? (
                    <StageReprocessButton
                      key={`abstract-reprocess-${paper.id}`}
                      stage="abstract"
                      label="Abstract clean"
                      processing={processing}
                    />
                  ) : null}
                  {paper.cleaned_abstract && abstractExpanded ? (
                    <div className="abstract-version-toggle" aria-label="Abstract version">
                      <button
                        type="button"
                        aria-pressed={abstractVersion === "cleaned"}
                        onClick={() => setAbstractVersion("cleaned")}
                      >Cleaned</button>
                      <button
                        type="button"
                        aria-pressed={abstractVersion === "original"}
                        onClick={() => setAbstractVersion("original")}
                      >Original</button>
                    </div>
                  ) : null}
                  <button
                    className="abstract-collapse"
                    type="button"
                    aria-expanded={abstractExpanded}
                    aria-controls="paper-abstract-content"
                    onClick={() => setAbstractExpanded((expanded) => !expanded)}
                  >{abstractExpanded ? "Collapse" : "Expand"}</button>
                </div>
              </div>
              <div id="paper-abstract-content" hidden={!abstractExpanded}>
                <p>
                  {abstractVersion === "cleaned" && paper.cleaned_abstract
                    ? paper.cleaned_abstract
                    : paper.abstract}
                </p>
              </div>
            </section>
          ) : null}

          <div className="reader-tabs">
            <div className="reader-tab-list" role="tablist" aria-label="Paper artifacts">
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
              <button
                type="button"
                role="tab"
                aria-selected={view === "note"}
                onClick={() => onView("note")}
              >Note</button>
            </div>
            <button
              className="reader-ask-toggle"
              type="button"
              aria-pressed={askOpen}
              onClick={onToggleAsk}
            >
              <span>Ask</span>
              <span aria-hidden="true">{askOpen ? "×" : "→"}</span>
            </button>
            <button
              className="reader-paper-toggle"
              type="button"
              aria-label={pdfView ? "Close paper PDF" : "Open paper PDF"}
              aria-pressed={pdfView}
              disabled={!paper.artifacts.pdf}
              onClick={onTogglePdf}
            >
              <span>Paper</span>
              <span aria-hidden="true">{pdfView ? "×" : "→"}</span>
            </button>
            <div className="reader-actions">
              {paper.status === "outlined" && view !== "note" ? (
                <StageReprocessButton
                  key={`${view}-reprocess-${paper.id}`}
                  stage={view as "summary" | "outline"}
                  label={view === "summary" ? "Summary" : "Outline"}
                  processing={processing}
                />
              ) : null}
              <div className="reader-tags">
                <button
                  ref={tagPickerToggle}
                  className="reader-settings-toggle"
                  type="button"
                  aria-expanded={tagPickerOpen}
                  aria-controls="paper-tag-picker"
                  onClick={() => setTagPickerOpen((open) => !open)}
                >Tags {paper.tag_ids.length}</button>
                {tagPickerOpen ? (
                  <div className="settings-panel tag-picker-panel" id="paper-tag-picker">
                    <PaperTagPicker key={paper.id} paper={paper} tags={tags} />
                  </div>
                ) : null}
              </div>
            </div>
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
            ) : view === "outline" ? (
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
            ) : (
              <NoteEditor paperId={paper.id} content={note.data?.content ?? ""} pending={note.isPending} error={note.error} />
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
        <aside className="ask-pane" aria-label="Paper assistant" aria-hidden={!askOpen}>
          {askOpen ? (
            <>
              <div className="companion-heading">
                <div>
                  <span>{askScope === "collection" ? "Whole collection" : "Current paper"}</span>
                  <strong>Ask</strong>
                </div>
                <button type="button" onClick={onReaderOnly}>
                  <span aria-hidden="true">←</span> Paper only
                </button>
              </div>
              {collectionAskScope ? (
                <div className="ask-scope-switch" role="group" aria-label="Assistant scope">
                  <button type="button" aria-pressed={askScope === "paper"} onClick={() => setAskScope("paper")}>This paper</button>
                  <button type="button" aria-pressed={askScope === "collection"} onClick={() => setAskScope("collection")}>Whole collection</button>
                </div>
              ) : null}
              <AskPanel
                scope={askScope === "collection" && collectionAskScope
                  ? collectionAskScope
                  : {
                      kind: "paper",
                      paper,
                      paperPath: currentPaperPath,
                      readerView: view,
                      onOpenPdf,
                      onView,
                    }}
              />
            </>
          ) : null}
        </aside>
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

function NoteEditor({
  paperId,
  content,
  pending,
  error,
}: {
  paperId: string;
  content: string;
  pending: boolean;
  error: Error | null;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(content);
  const [preview, setPreview] = useState(Boolean(content));
  useEffect(() => {
    setDraft(content);
    setPreview(Boolean(content));
  }, [content, paperId]);
  const save = useMutation({
    mutationFn: () => updatePaperNote(paperId, draft),
    onSuccess: (updated) => queryClient.setQueryData(["note", paperId], updated),
  });

  if (pending) return <div className="artifact-message">Loading note...</div>;
  if (error) return <div className="artifact-message is-error"><strong>Note could not be opened.</strong><p>{error.message}</p></div>;
  return (
    <section className="note-editor" aria-label="Paper note">
      <div className="note-editor-actions">
        <div className="abstract-version-toggle" aria-label="Note mode">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
        </div>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending || draft === content}>Save note</button>
      </div>
      {preview ? (
        <div className="markdown note-preview"><ReactMarkdown>{draft || "_No note yet._"}</ReactMarkdown></div>
      ) : (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a Markdown note..."
          aria-label="Note Markdown"
        />
      )}
      {save.isPending ? <span className="form-status">Saving...</span> : null}
      {save.error ? <span className="form-status is-error">Not saved: {save.error.message}</span> : null}
      {save.isSuccess ? <span className="form-status is-saved">Saved</span> : null}
    </section>
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
