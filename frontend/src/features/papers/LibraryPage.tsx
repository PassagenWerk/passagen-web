import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { startTransition, useDeferredValue, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { fetchPaper, fetchPapers, fetchTags } from "../../api/papers";
import { PaperDetail } from "./PaperDetail";
import { PaperFilters } from "./PaperFilters";
import { PaperList } from "./PaperList";

export function LibraryPage() {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const deferredSearch = useDeferredValue(search.toString());
  const papers = useQuery({
    queryKey: ["papers", deferredSearch],
    queryFn: () => fetchPapers(new URLSearchParams(deferredSearch)),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const tags = useQuery({ queryKey: ["tags"], queryFn: fetchTags, retry: false });
  const listedPaper = papers.data?.items.find((paper) => paper.id === paperId);
  const detail = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => fetchPaper(paperId!),
    enabled: Boolean(paperId && !listedPaper),
    retry: false,
  });
  const selectedPaper = listedPaper ?? detail.data;

  function changeSearch(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "offset" && key !== "view") next.delete("offset");
    startTransition(() => setSearch(next, { replace: key === "q" }));
  }

  function clearFilters() {
    const next = new URLSearchParams();
    const view = search.get("view");
    if (view) next.set("view", view);
    startTransition(() => setSearch(next));
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
    <div className={`library-grid ${paperId ? "has-selection" : ""}`}>
      <PaperFilters
        search={search}
        tags={tags.data ?? []}
        onChange={changeSearch}
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
      />
      <PaperDetail
        paper={selectedPaper}
        tags={tags.data ?? []}
        search={search}
        pending={Boolean(paperId && !listedPaper && detail.isPending)}
        error={detail.error}
        onView={(view) => changeSearch("view", view)}
      />
    </div>
  );
}
