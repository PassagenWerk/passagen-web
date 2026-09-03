import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createTag, deleteTag, updateTag, type Tag } from "../../api/papers";

export function LibraryTagManager({ tags }: { tags: Tag[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b705c");
  const create = useMutation({
    mutationFn: () => createTag(name, color),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  return (
    <details className="tag-manager">
      <summary>Manage Library Tags</summary>
      <p className="field-note">Personal labels are separate from generated Paper Keywords.</p>
      <form
        className="tag-create"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input aria-label="New Library Tag" value={name} onChange={(event) => setName(event.target.value)} placeholder="New tag" />
        <input aria-label="New tag color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <button type="submit" disabled={!name.trim() || create.isPending}>Add</button>
      </form>
      {create.error ? <p className="form-status is-error">{create.error.message}</p> : null}
      <div className="tag-manager-list">
        {tags.map((tag) => <TagEditor key={tag.id} tag={tag} />)}
      </div>
    </details>
  );
}

function TagEditor({ tag }: { tag: Tag }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? "#777777");
  const save = useMutation({
    mutationFn: () => updateTag(tag.id, name, color),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["paper"] }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["paper"] }),
      ]);
    },
  });
  const error = save.error ?? remove.error;

  return (
    <div className="tag-manager-row">
      <input aria-label={`Tag name: ${tag.name}`} value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label={`Tag color: ${tag.name}`} type="color" value={color} onChange={(event) => setColor(event.target.value)} />
      <button type="button" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Save</button>
      <button
        type="button"
        className="danger-button"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`Delete Library Tag “${tag.name}”? It will be removed from every assigned paper.`)) {
            remove.mutate();
          }
        }}
      >Delete</button>
      {error ? <p className="form-status is-error">{error.message}</p> : null}
    </div>
  );
}
