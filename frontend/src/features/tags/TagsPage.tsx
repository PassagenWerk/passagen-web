import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createTag,
  DEFAULT_TAG_COLOR,
  deleteTag,
  fetchTags,
  updateTag,
  type Tag,
} from "../../api/papers";

export function TagsPage() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: fetchTags, retry: false });
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
      queryClient.invalidateQueries({ queryKey: ["papers"] }),
      queryClient.invalidateQueries({ queryKey: ["paper"] }),
    ]);
  }

  const create = useMutation({
    mutationFn: () => createTag(newName, DEFAULT_TAG_COLOR),
    onSuccess: async (tag) => {
      setNewName("");
      await refresh();
      void navigate(`/tags/${tag.id}`);
    },
  });

  const normalized = query.trim().toLocaleLowerCase();
  const filtered = (tags.data ?? []).filter(
    (tag) => !normalized || tag.name.toLocaleLowerCase().includes(normalized),
  );
  const selected = tagId ? tags.data?.find((tag) => tag.id === tagId) : undefined;

  return (
    <div className="collections-grid">
      <aside className="collections-nav" aria-label="Library Tags">
        <div className="panel-heading">
          <span className="index-number">01</span>
          <h2>Tags</h2>
        </div>
        <form
          className="collection-create"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            <span>New Library Tag</span>
            <input
              aria-label="New Library Tag"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New tag"
            />
          </label>
          <button type="submit" disabled={!newName.trim() || create.isPending}>Create</button>
          {create.error ? <span className="form-status is-error">{create.error.message}</span> : null}
        </form>
        <div className="tag-index-search">
          <input
            type="search"
            aria-label="Search Library Tags"
            placeholder="Search tags..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="collection-list">
          {filtered.map((tag) => (
            <Link
              key={tag.id}
              to={`/tags/${tag.id}`}
              className={tag.id === tagId ? "is-active" : ""}
            >
              <strong>
                <span className="tag-color" style={{ background: tag.color ?? "#777777" }} />
                {tag.name}
              </strong>
              <span>{tag.paper_count} papers</span>
            </Link>
          ))}
          {tags.data && tags.data.length > 0 && filtered.length === 0 ? (
            <p>No tags match.</p>
          ) : null}
          {tags.data?.length === 0 ? <p>No Library Tags yet.</p> : null}
        </div>
      </aside>

      <section className="collection-workspace" aria-labelledby="tag-heading">
        {!tagId ? (
          <div className="collection-empty">
            <span>Library Tags</span>
            <h1>Organize your library.</h1>
            <p>Create a Library Tag or select one from the index.</p>
          </div>
        ) : null}
        {tagId && tags.isPending ? <div className="panel-message">Loading tags...</div> : null}
        {tagId && tags.data && !selected ? (
          <div className="panel-message is-error">This Library Tag does not exist.</div>
        ) : null}
        {selected ? <TagWorkspace key={selected.id} tag={selected} onChanged={refresh} /> : null}
      </section>
    </div>
  );
}

function TagWorkspace({ tag, onChanged }: { tag: Tag; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? DEFAULT_TAG_COLOR);
  const save = useMutation({
    mutationFn: () => updateTag(tag.id, name, color),
    onSuccess: onChanged,
  });
  const destroy = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: async () => {
      await onChanged();
      void navigate("/tags");
    },
  });

  return (
    <>
      <header className="collection-header">
        <div>
          <span className="paper-kicker">
            Library Tag / {tag.paper_count} {tag.paper_count === 1 ? "paper" : "papers"}
          </span>
          <h1 id="tag-heading">{tag.name}</h1>
        </div>
      </header>
      <form
        className="collection-editor tag-editor"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Color</span>
          <input
            aria-label="Tag color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <div>
          <button type="submit" disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Saving..." : "Save tag"}
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={destroy.isPending}
            onClick={() => {
              const target = tag.paper_count === 1 ? "1 paper" : `${tag.paper_count} papers`;
              if (window.confirm(`Delete Library Tag "${tag.name}"? It will be removed from ${target}.`)) {
                destroy.mutate();
              }
            }}
          >
            Delete tag
          </button>
        </div>
        {save.isSuccess ? <span className="form-status is-saved">Saved</span> : null}
        {save.error || destroy.error ? (
          <span className="form-status is-error">{(save.error ?? destroy.error)?.message}</span>
        ) : null}
      </form>
    </>
  );
}
