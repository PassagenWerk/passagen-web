import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  createCollection,
  deleteCollection,
  fetchCollection,
  fetchCollections,
  removeCollectionPaper,
  reorderCollection,
  updateCollection,
  type Collection,
} from "../../api/collections";
import { fetchTags } from "../../api/papers";
import { AskPanel } from "../ask/AskPanel";
import { PaperDetail } from "../papers/PaperDetail";
import { ReportsPanel } from "./ReportsPanel";
import { SynthesisPanel } from "./SynthesisPanel";

export function CollectionsPage() {
  const { collectionId, paperId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => fetchCollection(collectionId!),
    enabled: Boolean(collectionId),
    retry: false,
  });
  const tags = useQuery({ queryKey: ["tags"], queryFn: fetchTags, retry: false });
  const [newName, setNewName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.name);
    setDescription(detail.data.description ?? "");
  }, [detail.data]);

  async function refresh(collection?: Collection) {
    if (collection) queryClient.setQueryData(["collection", collection.id], collection);
    await queryClient.invalidateQueries({ queryKey: ["collections"] });
  }

  const create = useMutation({
    mutationFn: () => createCollection(newName, ""),
    onSuccess: async (collection) => {
      setNewName("");
      await refresh(collection);
      void navigate(`/collections/${collection.id}`);
    },
  });
  const save = useMutation({
    mutationFn: () => updateCollection(collectionId!, name, description),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (memberPaperId: string) => removeCollectionPaper(collectionId!, memberPaperId),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (paperIds: string[]) => reorderCollection(collectionId!, paperIds),
    onSuccess: refresh,
  });
  const destroy = useMutation({
    mutationFn: () => deleteCollection(collectionId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
      void navigate("/collections");
    },
  });

  function move(index: number, direction: -1 | 1) {
    const ids = detail.data?.papers.map((member) => member.paper.id) ?? [];
    const destination = index + direction;
    if (destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    reorder.mutate(ids);
  }

  const memberPapers =
    detail.data?.papers.map((member) => ({
      id: member.paper.id,
      title: member.paper.title,
      summaryReady: member.paper.artifacts.summary,
    })) ?? [];
  const researchHome = Boolean(collectionId && location.pathname.endsWith("/research"));
  const askFocused = researchHome && search.get("view") === "ask";
  const documentFocused = researchHome && search.get("view") === "document";
  const workspaceFocused = askFocused || documentFocused;
  const [paperRailCollapsed, setPaperRailCollapsed] = useState(researchHome);
  const viewLevel = researchHome
    ? workspaceFocused ? 2 : 1
    : paperId ? location.pathname.endsWith("/pdf") ? 3 : 2
    : 0;
  const previousViewLevel = useRef(viewLevel);
  const [viewMotion, setViewMotion] = useState<{
    direction: "forward" | "back" | null;
    sequence: number;
  }>({ direction: null, sequence: 0 });
  const motionClass = viewMotion.direction
    ? `is-motion-${viewMotion.direction}-${viewMotion.sequence % 2}`
    : "";

  useEffect(() => {
    setPaperRailCollapsed(researchHome);
  }, [collectionId, researchHome]);

  useLayoutEffect(() => {
    if (viewLevel === previousViewLevel.current) return;
    const direction = viewLevel > previousViewLevel.current ? "forward" : "back";
    previousViewLevel.current = viewLevel;
    setViewMotion((current) => ({ direction, sequence: current.sequence + 1 }));
  }, [viewLevel]);

  function askCollection(question: string) {
    const next = new URLSearchParams(search);
    next.set("question", question);
    next.set("view", "ask");
    next.delete("report");
    setSearch(next);
  }

  function setAskFocused(focused: boolean) {
    const next = new URLSearchParams(search);
    if (focused) next.set("view", "ask");
    else next.delete("view");
    next.delete("report");
    setSearch(next);
  }

  function setDocumentFocused(focused: boolean, reportId?: string) {
    const next = new URLSearchParams(search);
    if (focused) {
      next.set("view", "document");
      if (reportId) next.set("report", reportId);
    } else {
      next.delete("view");
      next.delete("report");
    }
    setSearch(next);
  }

  useEffect(() => {
    if (!collectionId || (!paperId && !researchHome)) return;
    function handleNavigation(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("input, select, textarea, button, a")) return;
      if (!["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) return;
      const members = detail.data?.papers ?? [];
      if (members.length === 0) return;
      event.preventDefault();
      const current = members.findIndex((member) => member.paper.id === paperId);
      const forward = event.key === "ArrowDown" || event.key === "j";
      const nextIndex = forward
        ? Math.min(current + 1, members.length - 1)
        : current < 0
          ? members.length - 1
          : Math.max(current - 1, 0);
      void navigate(`/collections/${collectionId}/papers/${members[nextIndex].paper.id}`);
    }
    window.addEventListener("keydown", handleNavigation);
    return () => window.removeEventListener("keydown", handleNavigation);
  }, [collectionId, detail.data?.papers, navigate, paperId, researchHome]);

  if (collectionId && (paperId || researchHome)) {
    const index = detail.data?.papers.findIndex((member) => member.paper.id === paperId) ?? -1;
    const paper = index >= 0 ? detail.data?.papers[index].paper : undefined;
    const base = paperId ? `/collections/${collectionId}/papers/${paperId}` : "";
    const pdfView = location.pathname.endsWith("/pdf");
    const askOpen = search.get("ask") === "true" || search.get("view") === "ask";
    function changeView(view: "summary" | "outline" | "note") {
      const next = new URLSearchParams(search);
      if (view === "summary") next.delete("view");
      else next.set("view", view);
      if (askOpen) next.set("ask", "true");
      setSearch(next);
    }
    function toggleAsk() {
      const next = new URLSearchParams(search);
      if (next.get("view") === "ask") next.delete("view");
      if (askOpen) next.delete("ask");
      else next.set("ask", "true");
      setSearch(next);
    }
    function showReaderOnly() {
      const next = new URLSearchParams(search);
      next.delete("ask");
      next.delete("page");
      if (next.get("view") === "ask") next.delete("view");
      void navigate({ pathname: base, search: next.toString() });
    }
    function togglePdf() {
      const next = new URLSearchParams(search);
      if (pdfView) next.delete("page");
      void navigate({ pathname: pdfView ? base : `${base}/pdf`, search: next.toString() });
    }
    return (
      <div className={`collection-research-desk ${paperRailCollapsed ? "is-paper-rail-collapsed" : ""} ${workspaceFocused ? "is-workspace-focus" : ""} ${motionClass}`}>
        <CollectionResearchRail
          collection={detail.data}
          selectedPaperId={paperId}
          collapsed={paperRailCollapsed}
          onCollapsedChange={setPaperRailCollapsed}
        />
        <section className="collection-research-canvas" aria-label="Collection research canvas">
          {detail.isPending ? <div className="panel-message">Opening research desk...</div> : null}
          {detail.error ? <div className="panel-message is-error">{detail.error.message}</div> : null}
          {researchHome && detail.data ? (
            <>
              <header className="research-desk-header">
                <div>
                  <span className="paper-kicker">Collection intelligence / {detail.data.paper_count} papers</span>
                  <h1>Research desk</h1>
                  <p>{detail.data.description || `Synthesize, compare, and question ${detail.data.name}.`}</p>
                </div>
                <Link className="primary-button" to={`/collections/${collectionId}`}>Manage collection</Link>
              </header>
              <div className={`collection-intelligence-layout ${askFocused ? "is-ask-focus" : ""} ${documentFocused ? "is-document-focus" : ""}`}>
                {documentFocused ? (
                  <main className="collection-document-focus">
                    <ReportsPanel
                      key={detail.data.id}
                      collectionId={detail.data.id}
                      papers={memberPapers}
                      focused
                      initialSelectedId={search.get("report")}
                      onFocusChange={setDocumentFocused}
                    />
                  </main>
                ) : !askFocused ? <main className="collection-intelligence-main">
                  <section className="intelligence-section" aria-labelledby="synthesis-heading">
                    <div className="intelligence-heading">
                      <span>01 / Shared understanding</span>
                      <h2 id="synthesis-heading">Collection intelligence</h2>
                      <p>A source-grounded overview of themes and differences across this reading set.</p>
                    </div>
                    <SynthesisPanel
                      key={detail.data.id}
                      collectionId={detail.data.id}
                      papers={memberPapers}
                      onAsk={askCollection}
                    />
                  </section>
                  <section className="intelligence-section" aria-labelledby="documents-heading">
                    <div className="intelligence-heading">
                      <span>02 / Durable outputs</span>
                      <h2 id="documents-heading">Research documents</h2>
                      <p>Create and revisit literature reviews, comparisons, gap analyses, and custom briefs.</p>
                    </div>
                    <ReportsPanel
                      key={detail.data.id}
                      collectionId={detail.data.id}
                      papers={memberPapers}
                      onFocusChange={setDocumentFocused}
                    />
                  </section>
                </main> : null}
                {!documentFocused ? <aside className="collection-research-assistant" aria-label="Collection assistant">
                  <div className="companion-heading">
                    <div><span>Whole collection</span><strong>Ask</strong></div>
                    <button
                      type="button"
                      onClick={() => setAskFocused(!askFocused)}
                      aria-label={askFocused ? "Back to collection intelligence" : "Expand collection Ask"}
                    >
                      {askFocused ? "Back to intelligence" : "Expand"}
                    </button>
                  </div>
                  <AskPanel
                    scope={{ kind: "collection", collectionId: detail.data.id, papers: memberPapers }}
                    initialQuestion={search.get("question")}
                  />
                </aside> : null}
              </div>
            </>
          ) : null}
          {paperId ? (
            <>
              <nav className="collection-reader-nav" aria-label="Collection reading navigation">
                <Link to={`/collections/${collectionId}`}>Back to {detail.data?.name ?? "collection"}</Link>
                <span>{index >= 0 && detail.data ? `${index + 1} / ${detail.data.papers.length}` : "..."}</span>
                <div>
                  {index > 0 ? <Link to={`/collections/${collectionId}/papers/${detail.data!.papers[index - 1].paper.id}`}>Previous</Link> : <span>Previous</span>}
                  {detail.data && index >= 0 && index < detail.data.papers.length - 1 ? <Link to={`/collections/${collectionId}/papers/${detail.data!.papers[index + 1].paper.id}`}>Next</Link> : <span>Next</span>}
                </div>
              </nav>
              <div className="collection-reader-view is-focus">
                <PaperDetail
                  paper={paper}
                  tags={tags.data ?? []}
                  collections={collections.data ?? []}
                  search={search}
                  pending={detail.isPending}
                  error={detail.error}
                  pdfView={pdfView}
                  askOpen={askOpen}
                  onView={changeView}
                  onToggleAsk={toggleAsk}
                  onReaderOnly={showReaderOnly}
                  onTogglePdf={togglePdf}
                  onOpenPdf={() => undefined}
                  focused
                  onExitFocus={() => void navigate(`/collections/${collectionId}/research`)}
                  paperPath={base}
                  collectionAskScope={{ kind: "collection", collectionId, papers: memberPapers }}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className={`collections-grid ${motionClass}`}>
      <aside className="collections-nav" aria-label="Collections">
        <div className="panel-heading">
          <span className="index-number">01</span>
          <h2>Collections</h2>
        </div>
        <form className="collection-create" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <label>
            <span>New collection</span>
            <input aria-label="New collection" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Research thread..." />
          </label>
          <button type="submit" disabled={!newName.trim() || create.isPending}>Create</button>
          {create.error ? <span className="form-status is-error">{create.error.message}</span> : null}
        </form>
        <div className="collection-list">
          {collections.data?.map((collection) => (
            <Link key={collection.id} to={`/collections/${collection.id}`} className={collection.id === collectionId ? "is-active" : ""}>
              <strong>{collection.name}</strong>
              <span>{collection.paper_count} papers</span>
            </Link>
          ))}
          {collections.data?.length === 0 ? <p>No collections yet.</p> : null}
        </div>
      </aside>

      <section className="collection-workspace" aria-labelledby="collection-heading">
        {!collectionId ? (
          <div className="collection-empty"><span>06</span><h1>Build a reading sequence.</h1><p>Create a collection or select one from the index.</p></div>
        ) : null}
        {detail.isPending ? <div className="panel-message">Opening collection...</div> : null}
        {detail.error ? <div className="panel-message is-error">{detail.error.message}</div> : null}
        {detail.data ? (
          <>
            <header className="collection-header">
              <div>
                <span className="paper-kicker">Ordered collection / {detail.data.paper_count} papers</span>
                <h1 id="collection-heading">{detail.data.name}</h1>
                {detail.data.description ? <p>{detail.data.description}</p> : null}
              </div>
              <div className="collection-header-actions">
                <Link className="secondary-button" to={`/collections/${detail.data.id}/research`}>Open research desk</Link>
                <Link className="primary-button" to={`/?addToCollection=${detail.data.id}`}>Add papers</Link>
              </div>
            </header>
                <form className="collection-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
                  <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
                  <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Purpose, scope, or reading goal..." /></label>
                  <div>
                    <button type="submit" disabled={!name.trim() || save.isPending}>{save.isPending ? "Saving..." : "Save details"}</button>
                    <button className="danger-button" type="button" onClick={() => { if (window.confirm(`Delete ${detail.data!.name}?`)) destroy.mutate(); }}>Delete collection</button>
                  </div>
                  {save.isSuccess ? <span className="form-status is-saved">Saved</span> : null}
                  {save.error ? <span className="form-status is-error">{save.error.message}</span> : null}
                </form>
                <div className="collection-members">
                  <div className="collection-members-heading"><span>Order</span><span>Paper</span><span>Actions</span></div>
                  {detail.data.papers.map((member, index) => (
                    <article
                      className="collection-member"
                      key={member.paper.id}
                      onDoubleClick={(event) => {
                        if (event.target instanceof Element && event.target.closest("a, button")) return;
                        void navigate(`/collections/${detail.data!.id}/papers/${member.paper.id}`);
                      }}
                    >
                      <span className="member-position">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <Link to={`/collections/${detail.data!.id}/papers/${member.paper.id}`}>{member.paper.title ?? member.paper.original_filename}</Link>
                        <p>{member.paper.authors.join(", ") || "Unknown authors"}</p>
                        <div className="member-artifacts">
                          <span className={member.paper.artifacts.summary ? "is-ready" : ""}>Summary</span>
                          <span className={member.paper.artifacts.outline ? "is-ready" : ""}>Outline</span>
                          <span className={member.paper.artifacts.pdf ? "is-ready" : ""}>PDF</span>
                        </div>
                      </div>
                      <div className="member-actions">
                        <Link className="member-open" to={`/collections/${detail.data!.id}/papers/${member.paper.id}`}>Open</Link>
                        <button aria-label={`Move ${member.paper.title} up`} type="button" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>Up</button>
                        <button aria-label={`Move ${member.paper.title} down`} type="button" disabled={index === detail.data!.papers.length - 1 || reorder.isPending} onClick={() => move(index, 1)}>Down</button>
                        <button aria-label={`Remove ${member.paper.title}`} type="button" disabled={remove.isPending} onClick={() => remove.mutate(member.paper.id)}>Remove</button>
                      </div>
                    </article>
                  ))}
                  {detail.data.papers.length === 0 ? <div className="panel-message"><strong>This collection is empty.</strong><span>Add papers from the Library.</span></div> : null}
                  {reorder.error || remove.error ? <span className="form-status is-error">{(reorder.error ?? remove.error)?.message}</span> : null}
                </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function CollectionResearchRail({
  collection,
  selectedPaperId,
  collapsed,
  onCollapsedChange,
}: {
  collection: Collection | undefined;
  selectedPaperId: string | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <aside
      className={`collection-paper-rail ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Collection papers"
    >
      <div className="collection-rail-header">
        {!collapsed ? (
          <>
            <div className="collection-rail-actions">
              <Link to={collection ? `/collections/${collection.id}` : "/collections"}>Back to collection</Link>
              <button type="button" onClick={() => onCollapsedChange(true)} aria-label="Hide collection papers">
                Hide papers
              </button>
            </div>
            <Link
              className="collection-research-home-link"
              to={collection ? `/collections/${collection.id}/research` : "/collections"}
            >
              Research desk
            </Link>
            <h2>{collection?.name ?? "Opening collection..."}</h2>
          </>
        ) : (
          <button type="button" className="collection-rail-expand" onClick={() => onCollapsedChange(false)}>
            Show papers
          </button>
        )}
      </div>
      {collection && !collapsed ? (
        <nav className="collection-research-list">
          {collection.papers.map((member, index) => (
            <Link
              key={member.paper.id}
              className={member.paper.id === selectedPaperId ? "is-active" : ""}
              to={`/collections/${collection.id}/papers/${member.paper.id}`}
              aria-current={member.paper.id === selectedPaperId ? "page" : undefined}
            >
              <span className="member-position">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{member.paper.title ?? member.paper.original_filename}</strong>
                <small>{member.paper.authors.join(", ") || `${member.paper.year ?? "Undated"} paper`}</small>
              </div>
            </Link>
          ))}
        </nav>
      ) : null}
    </aside>
  );
}
