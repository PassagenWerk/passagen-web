import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { addCollectionPapers, fetchCollections } from "../../api/collections";
import { fetchPaper, fetchPapers, fetchTags } from "../../api/papers";
import { PaperDetail } from "./PaperDetail";
import { PaperFilters } from "./PaperFilters";
import { PaperList } from "./PaperList";

interface LibraryPageProps {
  readingFocused: boolean;
  onFocusReading: () => void;
  onExitReading: () => void;
}

export function LibraryPage({
  readingFocused,
  onFocusReading,
  onExitReading,
}: LibraryPageProps) {
  const { paperId } = useParams();
  const location = useLocation();
  const pdfView = location.pathname.endsWith("/pdf");
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const askOpen = search.get("ask") === "true" || search.get("view") === "ask";
  const focused = Boolean(paperId) && (readingFocused || pdfView || askOpen);
  const deferredSearch = useDeferredValue(search.toString());
  const papers = useQuery({
    queryKey: ["papers", deferredSearch],
    queryFn: () => fetchPapers(new URLSearchParams(deferredSearch)),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const tags = useQuery({ queryKey: ["tags"], queryFn: fetchTags, retry: false });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    retry: false,
  });
  const queryClient = useQueryClient();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const targetCollection = search.get("addToCollection") ?? "";
  const addPapers = useMutation({
    mutationFn: () => addCollectionPapers(destination, [...selectedIds]),
    onSuccess: async () => {
      setAddedTo(destination);
      setSelectedIds(new Set());
      setSelecting(false);
      const next = new URLSearchParams(search);
      next.delete("addToCollection");
      setSearch(next);
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
      await queryClient.invalidateQueries({ queryKey: ["collection", destination] });
    },
  });
  const listedPaper = papers.data?.items.find((paper) => paper.id === paperId);
  const detail = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => fetchPaper(paperId!),
    enabled: Boolean(paperId),
    retry: false,
  });
  const selectedPaper = detail.data ?? listedPaper;

  function changeSearch(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "offset" && key !== "view") next.delete("offset");
    startTransition(() => setSearch(next, { replace: key === "q" }));
  }

  function changeReaderView(view: "summary" | "outline" | "note") {
    const next = new URLSearchParams(search);
    if (view === "summary") next.delete("view");
    else next.set("view", view);
    if (askOpen) next.set("ask", "true");
    setSearch(next);
  }

  function changeTags(tagIds: string[], match: "all" | "any") {
    const next = new URLSearchParams(search);
    next.delete("tag");
    for (const tagId of tagIds) next.append("tag", tagId);
    next.delete("tag_match");
    if (tagIds.length > 1 && match === "any") next.set("tag_match", "any");
    next.delete("offset");
    startTransition(() => setSearch(next));
  }

  function clearFilters() {
    const next = new URLSearchParams();
    const view = search.get("view");
    if (view) next.set("view", view);
    if (targetCollection) next.set("addToCollection", targetCollection);
    setSearch(next);
  }

  function changeBrowse(value: string) {
    const next = new URLSearchParams(search);
    next.delete("collection");
    next.delete("unfiled");
    next.delete("offset");
    if (search.get("sort") === "collection_order" && !value) next.delete("sort");
    if (search.get("sort") === "collection_order" && value === "unfiled") next.delete("sort");
    if (value === "unfiled") next.set("unfiled", "true");
    else if (value) next.set("collection", value);
    setSearch(next);
  }

  function cancelSelection() {
    setSelecting(false);
    setSelectedIds(new Set());
    const next = new URLSearchParams(search);
    next.delete("addToCollection");
    setSearch(next);
  }

  useEffect(() => {
    if (!targetCollection) return;
    setSelecting(true);
    setDestination(targetCollection);
  }, [targetCollection]);

  function focusPaper(nextPaperId: string) {
    onFocusReading();
    void navigate({ pathname: `/papers/${nextPaperId}`, search: search.toString() });
  }

  function togglePdf() {
    if (!paperId) return;
    const next = new URLSearchParams(search);
    if (pdfView) next.delete("page");
    else onFocusReading();
    void navigate({
      pathname: pdfView ? `/papers/${paperId}` : `/papers/${paperId}/pdf`,
      search: next.toString(),
    });
  }

  function toggleAsk() {
    const next = new URLSearchParams(search);
    if (next.get("view") === "ask") next.delete("view");
    if (askOpen) next.delete("ask");
    else {
      next.set("ask", "true");
      onFocusReading();
    }
    setSearch(next);
  }

  function showReaderOnly() {
    if (!paperId) return;
    const next = new URLSearchParams(search);
    next.delete("ask");
    next.delete("page");
    if (next.get("view") === "ask") next.delete("view");
    onFocusReading();
    void navigate({ pathname: `/papers/${paperId}`, search: next.toString() });
  }

  function exitFocus() {
    onExitReading();
    if (!paperId) return;
    const next = new URLSearchParams(search);
    next.delete("page");
    next.delete("ask");
    if (next.get("view") === "ask") next.delete("view");
    void navigate({ pathname: `/papers/${paperId}`, search: next.toString() });
  }

  useEffect(() => {
    function handleNavigation(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("input, select, textarea, button, a")) return;
      if (!["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) return;
      const items = papers.data?.items ?? [];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.findIndex((paper) => paper.id === paperId);
      const forward = event.key === "ArrowDown" || event.key === "j";
      const nextIndex = forward
        ? Math.min(current + 1, items.length - 1)
        : current < 0
          ? items.length - 1
          : Math.max(current - 1, 0);
      void navigate({ pathname: `/papers/${items[nextIndex].id}`, search: search.toString() });
    }
    window.addEventListener("keydown", handleNavigation);
    return () => window.removeEventListener("keydown", handleNavigation);
  }, [navigate, paperId, papers.data?.items, search]);

  return (
    <div
      className={`library-grid ${paperId ? "has-selection" : ""} ${focused ? "is-focus" : ""}`}
    >
      <PaperFilters
        search={search}
        tags={tags.data ?? []}
        collections={collections.data ?? []}
        onChange={changeSearch}
        onTags={changeTags}
        onBrowse={changeBrowse}
        onClear={clearFilters}
      />
      <PaperList
        page={papers.data}
        tags={tags.data ?? []}
        selectedId={paperId}
        search={search.toString()}
        pending={papers.isPending}
        error={papers.error}
        onPage={(offset) => changeSearch("offset", String(offset))}
        onFocusPaper={focusPaper}
        collections={collections.data ?? []}
        selectionMode={selecting}
        selectedIds={selectedIds}
        destination={destination}
        addedTo={addedTo}
        adding={addPapers.isPending}
        addError={addPapers.error}
        onStartSelection={() => {
          setAddedTo("");
          setSelecting(true);
        }}
        onCancelSelection={cancelSelection}
        onToggleSelection={(id) => {
          const next = new Set(selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelectedIds(next);
        }}
        onDestination={setDestination}
        onAdd={() => addPapers.mutate()}
      />
      <PaperDetail
        paper={selectedPaper}
        tags={tags.data ?? []}
        search={search}
        pending={Boolean(paperId && !listedPaper && detail.isPending)}
        error={detail.error}
        pdfView={pdfView}
        askOpen={askOpen}
        onView={changeReaderView}
        onToggleAsk={toggleAsk}
        onReaderOnly={showReaderOnly}
        onTogglePdf={togglePdf}
        onOpenPdf={onFocusReading}
        focused={focused}
        onExitFocus={exitFocus}
      />
    </div>
  );
}
