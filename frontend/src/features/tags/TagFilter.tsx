import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Tag } from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";
import { TagPicker } from "./TagPicker";

interface TagFilterProps {
  search: URLSearchParams;
  tags: Tag[];
  onChange: (tagIds: string[], match: "all" | "any") => void;
}

export function TagFilter({ search, tags, onChange }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEscapeClose(open, () => {
    setOpen(false);
    toggleRef.current?.focus();
  });
  const selectedIds = search.getAll("tag").filter(Boolean);
  const match = search.get("tag_match") === "any" ? "any" : "all";
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const selectedTags = selectedIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is Tag => Boolean(tag));

  function toggleTag(tagId: string) {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    onChange(next, match);
  }

  return (
    <div className="field tag-filter">
      <div className="tag-filter-heading">
        <span>Tags</span>
        <Link className="filter-manage-link" to="/tags">Manage</Link>
      </div>
      <button
        ref={toggleRef}
        type="button"
        className="tag-filter-toggle"
        aria-expanded={open}
        aria-controls="tag-filter-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tag-filter-summary">
          {selectedTags.length ? (
            <>
              {selectedTags.slice(0, 2).map((tag) => (
                <span
                  className="tag-chip"
                  key={tag.id}
                  style={{ "--tag-color": tag.color ?? "#777" } as React.CSSProperties}
                >
                  {tag.name}
                </span>
              ))}
              {selectedTags.length > 2 ? (
                <span className="tag-filter-more">+{selectedTags.length - 2}</span>
              ) : null}
            </>
          ) : (
            <span className="tag-filter-placeholder">All tags</span>
          )}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="settings-panel tag-filter-panel" id="tag-filter-panel">
          <TagPicker tags={tags} selectedIds={selectedIds} onToggle={toggleTag} />
          <fieldset className="tag-filter-match">
            <legend>Match</legend>
            <label>
              <input
                type="radio"
                name="tag-match"
                checked={match === "all"}
                onChange={() => onChange(selectedIds, "all")}
              />
              All selected tags
            </label>
            <label>
              <input
                type="radio"
                name="tag-match"
                checked={match === "any"}
                onChange={() => onChange(selectedIds, "any")}
              />
              Any selected tag
            </label>
          </fieldset>
          <button
            type="button"
            className="text-button tag-filter-clear"
            disabled={selectedIds.length === 0}
            onClick={() => onChange([], "all")}
          >
            Clear tags
          </button>
        </div>
      ) : null}
    </div>
  );
}
