import { Link } from "react-router-dom";

import type { PaperPage, Tag } from "../../api/papers";
import type { CollectionSummary } from "../../api/collections";

interface PaperListProps {
  page: PaperPage | undefined;
  tags: Tag[];
  selectedId: string | undefined;
  search: string;
  pending: boolean;
  error: Error | null;
  onPage: (offset: number) => void;
  onFocusPaper: (paperId: string) => void;
  collections: CollectionSummary[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  destination: string;
  addedTo: string;
  adding: boolean;
  addError: Error | null;
  onStartSelection: () => void;
  onCancelSelection: () => void;
  onToggleSelection: (paperId: string) => void;
  onDestination: (collectionId: string) => void;
  onAdd: () => void;
}

const statusLabels: Record<string, string> = {
  discovered: "Discovered",
  metadata_resolved: "Metadata",
  parsed: "Parsed",
  summarized: "Summary",
  outlined: "Outlined",
};

export function PaperList({
  page,
  tags,
  selectedId,
  search,
  pending,
  error,
  onPage,
  onFocusPaper,
  collections,
  selectionMode,
  selectedIds,
  destination,
  addedTo,
  adding,
  addError,
  onStartSelection,
  onCancelSelection,
  onToggleSelection,
  onDestination,
  onAdd,
}: PaperListProps) {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  return (
    <section className="paper-panel" aria-labelledby="papers-heading">
      <div className="panel-heading list-heading">
        <span className="index-number">02</span>
        <h2 id="papers-heading">Papers</h2>
        <span className="result-count">{page ? `${page.total} indexed` : "..."}</span>
        <button className="list-action" type="button" onClick={selectionMode ? onCancelSelection : onStartSelection}>
          {selectionMode ? "Cancel" : "Select"}
        </button>
      </div>

      {selectionMode ? (
        <div className="bulk-bar">
          <strong>{selectedIds.size} selected</strong>
          <select aria-label="Destination collection" value={destination} onChange={(event) => onDestination(event.target.value)}>
            <option value="">Choose collection...</option>
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          <button aria-label="Add selected papers" type="button" disabled={!destination || selectedIds.size === 0 || adding} onClick={onAdd}>
            {adding ? "Adding..." : "Add"}
          </button>
          {addError ? <span className="form-status is-error">{addError.message}</span> : null}
        </div>
      ) : null}
      {addedTo ? (
        <div className="bulk-notice" role="status">
          Papers added. <Link to={`/collections/${addedTo}`}>View collection</Link>
        </div>
      ) : null}

      <div className="paper-list" aria-live="polite" aria-busy={pending}>
        {pending && !page ? <div className="panel-message">Opening the local index...</div> : null}
        {error ? <div className="panel-message is-error">{error.message}</div> : null}
        {page?.items.length === 0 ? (
          <div className="panel-message">
            <strong>No papers found.</strong>
            <span>Try broadening the current filters.</span>
          </div>
        ) : null}
        {page?.items.map((paper, index) => {
          const content = <>
            <span className="paper-order">{String((page.offset ?? 0) + index + 1).padStart(2, "0")}</span>
            <div className="paper-row-content">
              <h3 title={paper.title ?? paper.original_filename}>
                {paper.title ?? paper.original_filename}
              </h3>
              <p className="paper-authors">
                {paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown authors"}
              </p>
              <div className="paper-meta">
                <span>{paper.year ?? "Undated"}</span>
                <span>{paper.venue ?? "No venue"}</span>
                <span>{statusLabels[paper.status] ?? paper.status}</span>
              </div>
              {paper.tag_ids.length > 0 ? (
                <div className="tag-row">
                  {paper.tag_ids.map((tagId) => {
                    const tag = tagsById.get(tagId);
                    return tag ? (
                      <span className="tag-chip" key={tagId} style={{ "--tag-color": tag.color ?? "#777" } as React.CSSProperties}>
                        {tag.name}
                      </span>
                    ) : null;
                  })}
                </div>
              ) : null}
            </div>
            <span className="paper-arrow" aria-hidden="true">↗</span>
          </>;
          return selectionMode ? (
            <div
              key={paper.id}
              className={`paper-row selection-row ${paper.id === selectedId ? "is-selected" : ""} ${selectedIds.has(paper.id) ? "is-checked" : ""}`}
            >
              <input
                type="checkbox"
                aria-label={`Select ${paper.title ?? paper.original_filename}`}
                checked={selectedIds.has(paper.id)}
                onChange={() => onToggleSelection(paper.id)}
              />
              <Link
                to={{ pathname: `/papers/${paper.id}`, search }}
                className="selection-paper-link"
                aria-current={paper.id === selectedId ? "page" : undefined}
                title="Open paper details"
                onDoubleClick={(event) => {
                  event.preventDefault();
                  onFocusPaper(paper.id);
                }}
              >
                {content}
              </Link>
            </div>
          ) : (
            <Link
              key={paper.id}
              to={{ pathname: `/papers/${paper.id}`, search }}
              className={`paper-row ${paper.id === selectedId ? "is-selected" : ""}`}
              aria-current={paper.id === selectedId ? "page" : undefined}
              title="Double-click to focus reading"
              onDoubleClick={(event) => {
                event.preventDefault();
                onFocusPaper(paper.id);
              }}
            >
              {content}
            </Link>
          );
        })}
      </div>

      {page && page.total > page.limit ? (
        <nav className="pagination" aria-label="Paper pages">
          <button type="button" disabled={page.offset === 0} onClick={() => onPage(Math.max(0, page.offset - page.limit))}>
            Previous
          </button>
          <span>{Math.floor(page.offset / page.limit) + 1} / {Math.ceil(page.total / page.limit)}</span>
          <button type="button" disabled={page.offset + page.limit >= page.total} onClick={() => onPage(page.offset + page.limit)}>
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
