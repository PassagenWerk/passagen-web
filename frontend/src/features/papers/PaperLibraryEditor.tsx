import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  updatePaperMetadata,
  type MetadataUpdate,
  type Paper,
} from "../../api/papers";

export function PaperLibraryEditor({ paper }: { paper: Paper }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(paper.title ?? "");
  const [venue, setVenue] = useState(paper.venue ?? "");
  const [year, setYear] = useState(paper.year?.toString() ?? "");
  const [metadataSaved, setMetadataSaved] = useState(false);

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
    },
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
    <details className="paper-library-editor">
      <summary>Edit Metadata</summary>
      <div className="editor-section">
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
      </div>
    </details>
  );
}

function SaveStatus({ pending, saved, error }: { pending: boolean; saved: boolean; error: Error | null }) {
  if (pending) return <span className="form-status">Saving...</span>;
  if (error) return <span className="form-status is-error">Not saved: {error.message}</span>;
  if (saved) return <span className="form-status is-saved">Saved</span>;
  return null;
}
