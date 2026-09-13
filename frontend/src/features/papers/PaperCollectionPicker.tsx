import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  addCollectionPapers,
  type CollectionSummary,
} from "../../api/collections";
import { useEscapeClose } from "../../components/useEscapeClose";

interface PaperCollectionPickerProps {
  paperId: string;
  collections: CollectionSummary[];
}

export function PaperCollectionPicker({
  paperId,
  collections,
}: PaperCollectionPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [addedTo, setAddedTo] = useState<{ id: string; name: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEscapeClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });

  const add = useMutation({
    mutationFn: () => addCollectionPapers(destination, [paperId]),
    onMutate: () => setAddedTo(null),
    onSuccess: async (collection) => {
      queryClient.setQueryData(["collection", collection.id], collection);
      setAddedTo({ id: collection.id, name: collection.name });
      setOpen(false);
      trigger.current?.focus();
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  return (
    <div className="paper-action paper-collection-picker">
      <button
        ref={trigger}
        className="paper-action-button"
        type="button"
        aria-expanded={open}
        aria-controls="paper-collection-picker"
        onClick={() => setOpen((value) => !value)}
      >Add to Collection</button>
      {open ? (
        <div
          className="editor-section settings-panel paper-action-panel collection-action-panel"
          id="paper-collection-picker"
          role="dialog"
          aria-label="Add paper to collection"
        >
          {collections.length > 0 ? (
            <>
              <label>
                <span>Collection</span>
                <select
                  aria-label="Collection for current paper"
                  value={destination}
                  disabled={add.isPending}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  <option value="">Choose collection...</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>{collection.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!destination || add.isPending}
                onClick={() => add.mutate()}
              >{add.isPending ? "Adding..." : "Add"}</button>
            </>
          ) : (
            <span>No collections yet.</span>
          )}
          <Link className="filter-manage-link" to="/collections">Manage collections</Link>
          {add.error ? (
            <span className="form-status is-error" role="alert">Not added: {add.error.message}</span>
          ) : null}
        </div>
      ) : null}
      {addedTo ? (
        <span className="paper-collection-status" role="status">
          Paper is in <Link to={`/collections/${addedTo.id}`}>{addedTo.name}</Link>.
        </span>
      ) : null}
    </div>
  );
}
