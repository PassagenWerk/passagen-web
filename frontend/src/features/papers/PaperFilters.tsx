import type { CollectionSummary } from "../../api/collections";
import type { Tag } from "../../api/papers";
import { LibraryTagManager } from "../tags/LibraryTagManager";
import { Link } from "react-router-dom";

interface PaperFiltersProps {
  search: URLSearchParams;
  tags: Tag[];
  collections: CollectionSummary[];
  onChange: (key: string, value: string) => void;
  onBrowse: (value: string) => void;
  onClear: () => void;
}

export function PaperFilters({ search, tags, collections, onChange, onBrowse, onClear }: PaperFiltersProps) {
  const hasFilters = ["q", "status", "tag", "venue", "year", "collection", "unfiled"].some((key) => search.has(key));
  const browseValue = search.has("unfiled") ? "unfiled" : search.get("collection") ?? "";

  return (
    <aside className="filter-panel" aria-label="Library filters">
      <div className="panel-heading">
        <span className="index-number">01</span>
        <h2>Find</h2>
      </div>

      <label className="field search-field">
        <span>Search title</span>
        <input
          type="search"
          value={search.get("q") ?? ""}
          onChange={(event) => onChange("q", event.target.value)}
          placeholder="Keywords..."
        />
      </label>

      <LibraryTagManager tags={tags} />

      <label className="field">
        <span>Collection</span>
        <select aria-label="Collection" key={collections.length} value={browseValue} onChange={(event) => onBrowse(event.target.value)}>
          <option value="">All papers</option>
          <option value="unfiled">Not in any collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>{collection.name}</option>
          ))}
        </select>
        {search.get("collection") ? <Link className="filter-manage-link" to={`/collections/${search.get("collection")}`}>Manage selected collection</Link> : null}
      </label>

      <label className="field">
        <span>Status</span>
        <select
          value={search.get("status") ?? ""}
          onChange={(event) => onChange("status", event.target.value)}
        >
          <option value="">All stages</option>
          <option value="discovered">Discovered</option>
          <option value="metadata_resolved">Metadata resolved</option>
          <option value="parsed">Parsed</option>
          <option value="summarized">Summarized</option>
          <option value="outlined">Outlined</option>
        </select>
      </label>

      <label className="field">
        <span>Tag</span>
        <select
          value={search.get("tag") ?? ""}
          onChange={(event) => onChange("tag", event.target.value)}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Venue</span>
        <input
          value={search.get("venue") ?? ""}
          onChange={(event) => onChange("venue", event.target.value)}
          placeholder="SOSP, OSDI..."
        />
      </label>

      <label className="field">
        <span>Year</span>
        <input
          inputMode="numeric"
          value={search.get("year") ?? ""}
          onChange={(event) => onChange("year", event.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="2025"
        />
      </label>

      <div className="field split-field">
        <label>
          <span>Sort by</span>
          <select
            value={search.get("sort") ?? "imported_at"}
            onChange={(event) => onChange("sort", event.target.value)}
          >
            {search.has("collection") ? <option value="collection_order">Collection order</option> : null}
            <option value="imported_at">Imported</option>
            <option value="updated_at">Updated</option>
            <option value="title">Title</option>
            <option value="venue">Venue</option>
            <option value="year">Year</option>
          </select>
        </label>
        <label>
          <span>Order</span>
          <select
            value={search.get("direction") ?? "desc"}
            onChange={(event) => onChange("direction", event.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>

      <button className="text-button" type="button" onClick={onClear} disabled={!hasFilters}>
        Clear filters
      </button>

      <div className="keyboard-note">
        <span>KEYS</span>
        <p><kbd>J</kbd>/<kbd>K</kbd> or arrows to move through papers</p>
      </div>
    </aside>
  );
}
