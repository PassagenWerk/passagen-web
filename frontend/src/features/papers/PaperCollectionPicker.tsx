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
  collectionIds: string[];
}

export function PaperCollectionPicker({
  paperId,
  collections,
  collectionIds,
}: PaperCollectionPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [addedTo, setAddedTo] = useState<{ id: string; name: string } | null>(null);
  const [knownMemberships, setKnownMemberships] = useState(() => new Set(collectionIds));
  const trigger = useRef<HTMLButtonElement>(null);
  const memberships = collections.filter((collection) => knownMemberships.has(collection.id));
  useEscapeClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });

  const add = useMutation({
    mutationFn: () => addCollectionPapers(destination, [paperId]),
    onMutate: () => setAddedTo(null),
    onSuccess: async (collection) => {
      queryClient.setQueryData(["collection", collection.id], collection);
      setKnownMemberships((current) => new Set(current).add(collection.id));
      setDestination("");
      setAddedTo({ id: collection.id, name: collection.name });
      setOpen(false);
      trigger.current?.focus();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["paper", paperId] }),
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
      ]);
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
          {memberships.length > 0 ? (
            <div className="collection-memberships">
              <strong>Already in</strong>
              <span>
                {memberships.map((collection, index) => (
                  <span key={collection.id}>
                    {index > 0 ? ", " : null}
                    <Link to={`/collections/${collection.id}`}>{collection.name}</Link>
                  </span>
                ))}
              </span>
            </div>
          ) : collections.length > 0 ? (
            <span>This paper is not in a collection yet.</span>
          ) : null}
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
                    <option
                      key={collection.id}
                      value={collection.id}
                      disabled={knownMemberships.has(collection.id)}
                    >
                      {collection.name}{knownMemberships.has(collection.id) ? " (Already added)" : ""}
                    </option>
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
