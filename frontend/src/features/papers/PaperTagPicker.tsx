import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  addPaperTag,
  createTag,
  DEFAULT_TAG_COLOR,
  removePaperTag,
  type Paper,
  type Tag,
} from "../../api/papers";
import { TagPicker } from "../tags/TagPicker";

export function PaperTagPicker({ paper, tags }: { paper: Paper; tags: Tag[] }) {
  const queryClient = useQueryClient();
  const [assigned, setAssigned] = useState<string[]>(paper.tag_ids);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [failedIds, setFailedIds] = useState<ReadonlyMap<string, string>>(new Map());
  const [assignError, setAssignError] = useState<{ tag: Tag; message: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function refreshLibrary() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["paper", paper.id] }),
      queryClient.invalidateQueries({ queryKey: ["papers"] }),
    ]);
  }

  function trackPending(tagId: string) {
    setPendingIds((current) => new Set(current).add(tagId));
  }

  function clearPending(tagId: string) {
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(tagId);
      return next;
    });
  }

  const toggle = useMutation({
    mutationFn: ({ tagId, assign }: { tagId: string; assign: boolean }) =>
      assign ? addPaperTag(paper.id, tagId) : removePaperTag(paper.id, tagId),
    onMutate: ({ tagId, assign }) => {
      trackPending(tagId);
      setFailedIds((current) => {
        const next = new Map(current);
        next.delete(tagId);
        return next;
      });
      setAssigned((current) =>
        assign ? [...current, tagId] : current.filter((id) => id !== tagId),
      );
    },
    onError: (error, { tagId, assign }) => {
      setAssigned((current) =>
        assign ? current.filter((id) => id !== tagId) : [...current, tagId],
      );
      setFailedIds((current) => new Map(current).set(tagId, error.message));
    },
    onSettled: async (_data, _error, { tagId }) => {
      clearPending(tagId);
      await refreshLibrary();
    },
  });

  const createAssign = useMutation({
    mutationFn: async (name: string) => {
      const created = await createTag(name, DEFAULT_TAG_COLOR);
      try {
        await addPaperTag(paper.id, created.id);
        return { created, assignFailure: null as string | null };
      } catch (error) {
        return {
          created,
          assignFailure: error instanceof Error ? error.message : String(error),
        };
      }
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<Tag[]>(["tags"], (current) =>
        current && !current.some((tag) => tag.id === result.created.id)
          ? [...current, result.created]
          : current,
      );
      if (result.assignFailure === null) {
        setCreateError(null);
        setAssigned((current) =>
          current.includes(result.created.id) ? current : [...current, result.created.id],
        );
      } else {
        setAssignError({ tag: result.created, message: result.assignFailure });
      }
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await refreshLibrary();
    },
    onError: (error) => setCreateError(error.message),
  });

  const retryAssign = useMutation({
    mutationFn: (tagId: string) => addPaperTag(paper.id, tagId),
    onMutate: trackPending,
    onSuccess: async (_updated, tagId) => {
      setAssignError(null);
      setAssigned((current) => (current.includes(tagId) ? current : [...current, tagId]));
      await refreshLibrary();
    },
    onError: (error, tagId) => {
      setAssignError((current) =>
        current && current.tag.id === tagId ? { ...current, message: error.message } : current,
      );
    },
    onSettled: (_data, _error, tagId) => clearPending(tagId),
  });

  return (
    <>
      <TagPicker
        tags={tags}
        selectedIds={assigned}
        pendingIds={pendingIds}
        failedIds={failedIds}
        onToggle={(tagId) => toggle.mutate({ tagId, assign: !assigned.includes(tagId) })}
        onRetry={(tagId) => toggle.mutate({ tagId, assign: !assigned.includes(tagId) })}
        onCreate={(name) => createAssign.mutate(name)}
        createPending={createAssign.isPending}
        createError={createError}
        createLabel={(name) => `Create and assign "${name}"`}
        footer={
          <>
            <p className="field-note">Personal labels; separate from generated Paper Keywords.</p>
            <Link className="filter-manage-link" to="/tags">Manage library tags</Link>
          </>
        }
      />
      {assignError ? (
        <p className="tag-picker-status is-error">
          <span>
            Tag "{assignError.tag.name}" was created but could not be assigned:{" "}
            {assignError.message}
          </span>
          <button
            type="button"
            disabled={retryAssign.isPending}
            onClick={() => retryAssign.mutate(assignError.tag.id)}
          >
            Retry assign
          </button>
        </p>
      ) : null}
    </>
  );
}
