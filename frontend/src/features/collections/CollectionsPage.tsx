import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

const WORKSPACE_TABS = ["papers", "synthesis", "reports", "ask"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

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

  if (paperId && collectionId) {
    const index = detail.data?.papers.findIndex((member) => member.paper.id === paperId) ?? -1;
    const paper = index >= 0 ? detail.data?.papers[index].paper : undefined;
    const base = `/collections/${collectionId}/papers/${paperId}`;
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
      <div className="collection-reader-view is-focus">
        <nav className="collection-reader-nav" aria-label="Collection reading navigation">
          <Link to={`/collections/${collectionId}`}>Back to {detail.data?.name ?? "collection"}</Link>
          <span>{index >= 0 && detail.data ? `${index + 1} / ${detail.data.papers.length}` : "..."}</span>
          <div>
            {index > 0 ? <Link to={`/collections/${collectionId}/papers/${detail.data!.papers[index - 1].paper.id}`}>Previous</Link> : <span>Previous</span>}
            {detail.data && index >= 0 && index < detail.data.papers.length - 1 ? <Link to={`/collections/${collectionId}/papers/${detail.data!.papers[index + 1].paper.id}`}>Next</Link> : <span>Next</span>}
          </div>
        </nav>
        <PaperDetail
          paper={paper}
          tags={tags.data ?? []}
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
          onExitFocus={() => void navigate(`/collections/${collectionId}`)}
          paperPath={base}
        />
      </div>
    );
  }

  const currentTab = search.get("tab");
  const tab: WorkspaceTab = (WORKSPACE_TABS as readonly string[]).includes(currentTab ?? "")
    ? (currentTab as WorkspaceTab)
    : "papers";
  const memberPapers =
    detail.data?.papers.map((member) => ({ id: member.paper.id, title: member.paper.title })) ?? [];

  function selectTab(option: WorkspaceTab) {
    const next = new URLSearchParams(search);
    if (option === "papers") next.delete("tab");
    else next.set("tab", option);
    setSearch(next);
  }

  return (
    <div className="collections-grid">
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
              </div>
              <Link className="primary-button" to={`/?addToCollection=${detail.data.id}`}>Add papers</Link>
            </header>
            <div className="abstract-version-toggle collection-tabs" role="tablist" aria-label="Collection workspace">
              {WORKSPACE_TABS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={tab === option}
                  onClick={() => selectTab(option)}
                >
                  {option === "ask" ? "Ask" : option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
            {tab === "synthesis" ? (
              <SynthesisPanel collectionId={detail.data.id} papers={memberPapers} />
            ) : null}
            {tab === "reports" ? (
              <ReportsPanel collectionId={detail.data.id} papers={memberPapers} />
            ) : null}
            {tab === "ask" ? (
              <AskPanel
                scope={{ kind: "collection", collectionId: detail.data.id, papers: memberPapers }}
              />
            ) : null}
            {tab === "papers" ? (
              <>
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
                    <article className="collection-member" key={member.paper.id}>
                      <span className="member-position">{String(index + 1).padStart(2, "0")}</span>
                      <div><Link to={`/collections/${detail.data!.id}/papers/${member.paper.id}`}>{member.paper.title ?? member.paper.original_filename}</Link><p>{member.paper.authors.join(", ") || "Unknown authors"}</p></div>
                      <div className="member-actions">
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
          </>
        ) : null}
      </section>
    </div>
  );
}
