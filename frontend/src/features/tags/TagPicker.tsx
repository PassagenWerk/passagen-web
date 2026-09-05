import { useRef, useState } from "react";

import type { Tag } from "../../api/papers";

interface TagPickerProps {
  tags: Tag[];
  selectedIds: readonly string[];
  onToggle: (tagId: string) => void;
  pendingIds?: ReadonlySet<string>;
  failedIds?: ReadonlyMap<string, string>;
  onRetry?: (tagId: string) => void;
  onCreate?: (name: string) => void;
  createPending?: boolean;
  createError?: string | null;
  createLabel?: (name: string) => string;
  footer?: React.ReactNode;
}

export function TagPicker({
  tags,
  selectedIds,
  onToggle,
  pendingIds,
  failedIds,
  onRetry,
  onCreate,
  createPending = false,
  createError,
  createLabel = (name) => `Create "${name}"`,
  footer,
}: TagPickerProps) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const selected = new Set(selectedIds);
  const normalized = query.trim().toLocaleLowerCase();
  const visible = tags
    .filter((tag) => !normalized || tag.name.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  const exactMatch =
    normalized.length > 0 &&
    tags.some((tag) => tag.name.toLocaleLowerCase() === normalized);
  const showCreate = Boolean(onCreate && normalized && !exactMatch);

  function moveActive(direction: 1 | -1) {
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>(".tag-picker-option");
    if (!options?.length) return;
    const current = Array.from(options).findIndex((option) => option === document.activeElement);
    const nextIndex =
      current < 0
        ? direction === 1
          ? 0
          : options.length - 1
        : (current + direction + options.length) % options.length;
    options[nextIndex].focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      const first = listRef.current?.querySelector<HTMLButtonElement>(
        ".tag-picker-option:not(:disabled)",
      );
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  }

  return (
    <div className="tag-picker" onKeyDown={handleKeyDown}>
      <input
        className="tag-picker-search"
        type="search"
        aria-label="Search tags"
        placeholder="Search tags..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      <ul
        className="tag-picker-list"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Tags"
        ref={listRef}
      >
        {visible.map((tag) => (
          <li key={tag.id}>
            <button
              type="button"
              className="tag-picker-option"
              role="option"
              aria-selected={selected.has(tag.id)}
              disabled={pendingIds?.has(tag.id)}
              onClick={() => onToggle(tag.id)}
            >
              <span className="tag-color" style={{ background: tag.color ?? "#777777" }} />
              <span className="tag-picker-name">{tag.name}</span>
              <span className="tag-picker-check" aria-hidden="true">
                {selected.has(tag.id) ? "✓" : ""}
              </span>
            </button>
            {failedIds?.has(tag.id) ? (
              <p className="tag-picker-status is-error">
                <span>Not saved: {failedIds.get(tag.id)}</span>
                {onRetry ? (
                  <button type="button" onClick={() => onRetry(tag.id)}>
                    Retry
                  </button>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
        {visible.length === 0 && !showCreate ? (
          <li className="tag-picker-empty">
            {tags.length === 0 ? "No Library Tags yet." : "No tags match."}
          </li>
        ) : null}
        {showCreate ? (
          <li>
            <button
              type="button"
              className="tag-picker-option tag-picker-create"
              disabled={createPending}
              onClick={() => onCreate!(query.trim())}
            >
              {createLabel(query.trim())}
            </button>
          </li>
        ) : null}
      </ul>
      {createError ? <p className="tag-picker-status is-error">{createError}</p> : null}
      {footer ? <div className="tag-picker-footer">{footer}</div> : null}
    </div>
  );
}
