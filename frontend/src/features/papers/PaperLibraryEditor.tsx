import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  deletePaper,
  updatePaperMetadata,
  type MetadataUpdate,
  type Paper,
} from "../../api/papers";
import { useEscapeClose } from "../../components/useEscapeClose";

export function PaperLibraryEditor({
  paper,
  onDeleted,
}: {
  paper: Paper;
  onDeleted?: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(paper.title ?? "");
  const [venue, setVenue] = useState(paper.venue ?? "");
  const [year, setYear] = useState(paper.year?.toString() ?? "");
  const [metadataSaved, setMetadataSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEscapeClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });

  async function refresh(updated: Paper) {
    queryClient.setQueryData(["paper", paper.id], updated);
    await queryClient.invalidateQueries({ queryKey: ["papers"] });
  }

  const metadata = useMutation({
    mutationFn: (update: MetadataUpdate) => updatePaperMetadata(paper.id, update),
    onMutate: () => setMetadataSaved(false),
    onSuccess: async (updated) => {
      setMetadataSaved(true);
      await refresh(updated);
      setOpen(false);
      trigger.current?.focus();
    },
  });
  const destroy = useMutation({
    mutationFn: () => deletePaper(paper.id),
    onSuccess: onDeleted,
  });

  function saveMetadata() {
    const update: MetadataUpdate = { expected_updated_at: paper.updated_at };
    if (title.trim() && title.trim() !== (paper.title ?? "")) update.title = title.trim();
    if (venue.trim() && venue.trim() !== (paper.venue ?? "")) update.venue = venue.trim();
    if (year && Number(year) !== paper.year) update.year = Number(year);
    if (Object.keys(update).length === 1) {
      setMetadataSaved(true);
      return;
    }
    metadata.mutate(update);
  }

  return (
    <div className="paper-action paper-library-editor">
      <button
        ref={trigger}
        className="paper-action-button"
        type="button"
        aria-expanded={open}
        aria-controls="paper-metadata-editor"
        onClick={() => setOpen((value) => !value)}
      >Edit Metadata</button>
      {open ? (
        <div
          className="editor-section settings-panel paper-action-panel metadata-action-panel"
          id="paper-metadata-editor"
          role="dialog"
          aria-label="Edit paper metadata"
        >
          <div className="editor-heading">
            <strong>Bibliographic metadata</strong>
            <span>User edits are protected from generated metadata refreshes.</span>
          </div>
          <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="editor-split">
            <label><span>Venue</span><input value={venue} onChange={(event) => setVenue(event.target.value)} /></label>
            <label><span>Year</span><input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
          </div>
          <button type="button" onClick={saveMetadata} disabled={metadata.isPending || !title.trim()}>Save metadata</button>
          <SaveStatus pending={metadata.isPending} saved={metadataSaved} error={metadata.error} />
          {onDeleted ? (
            <div className="editor-heading">
              <strong>Delete paper</strong>
              <span>
                Remove {paper.tag_ids.length} tag assignment(s), {paper.collection_ids.length}
                collection membership(s), conversations, and all managed artifacts.
              </span>
              <button
                className="danger-button"
                type="button"
                disabled={destroy.isPending}
                onClick={() => {
                  if (window.confirm(`Delete paper "${paper.title ?? paper.original_filename}"? This cannot be undone.`)) {
                    destroy.mutate();
                  }
                }}
              >{destroy.isPending ? "Deleting..." : "Delete paper"}</button>
              {destroy.error ? <span className="form-status is-error">Delete failed: {destroy.error.message}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SaveStatus({ pending, saved, error }: { pending: boolean; saved: boolean; error: Error | null }) {
  if (pending) return <span className="form-status">Saving...</span>;
  if (error) return <span className="form-status is-error">Not saved: {error.message}</span>;
  if (saved) return <span className="form-status is-saved">Saved</span>;
  return null;
}
