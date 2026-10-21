"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type SVGProps } from "react";

type Status = "submitted" | "in_review" | "needs_changes" | "approved" | "archived";
type Mode = "demo" | "live";
type Revision = { id: string; storageKey?: string; name: string; contentType: string; size: number; uploadedAt: string };
type Audit = { id: string; timestamp: string; action: string; description: string; actor: string };
type Document = { id: string; client: string; financialYear: string; category: string; source: "manual" | "whatsapp_demo"; status: Status; assignedTo: string; uploadedAt: string; updatedAt: string; revisions: Revision[]; events: Audit[] };
type ApiResponse = { ok: boolean; error?: string; documents?: Document[]; document?: Document; url?: string; base64?: string; name?: string; contentType?: string };
const CATEGORIES = ["ITR", "Form 16", "GST", "Invoice", "Bank Statement", "Contract", "Other"];
const STATUSES: Status[] = ["submitted", "in_review", "needs_changes", "approved", "archived"];
const STATUS_LABELS: Record<Status, string> = { submitted: "Submitted", in_review: "In review", needs_changes: "Needs changes", approved: "Approved", archived: "Archived" };
const YEARS = Array.from({ length: 5 }, (_, i) => { const year = 2026 - i; return `${year}-${String((year + 1) % 100).padStart(2, "0")}`; });
const prettySize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
const prettyDate = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

type GlyphName = "archive" | "upload" | "search" | "check" | "shield" | "file" | "download" | "refresh" | "arrow" | "clock" | "users" | "cloud" | "history" | "folder" | "message" | "lock" | "plus" | "x";
function Glyph({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: GlyphName; size?: number }) {
  const paths: Record<GlyphName, React.ReactNode> = {
    archive: <><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 14h4"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="m12 2 9 4v6c0 5-3 8-9 10-6-2-9-5-9-10V6l9-4Z"/><path d="m9 12 2 2 4-4"/></>,
    file: <><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 13h8m-8 4h6"/></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2m0 8a8 8 0 0 1-14 2"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 0 0-6m1 10a5 5 0 0 1 3 5"/></>,
    cloud: <><path d="M6 19a5 5 0 0 1 0-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11H6Z"/></>,
    history: <><path d="M3 11a9 9 0 1 1 2 6M3 5v6h6M12 7v5l4 2"/></>,
    folder: <path d="M3 7h7l2 3h9v10H3V7Zm0 0V4h7l2 3"/>,
    message: <path d="M21 11a8 8 0 0 1-12 7l-6 3 2-6A8 8 0 1 1 21 11Z"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    x: <path d="M5 5l14 14M19 5 5 19"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function saveBrowserFile(payload: ApiResponse) {
  if (payload.url) { window.location.assign(payload.url); return; }
  if (!payload.base64) throw new Error("Download response had no content.");
  const buffer = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));
  const data = new Blob([buffer], { type: payload.contentType || "application/octet-stream" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a"); link.href = url; link.download = payload.name || "document";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Vault() {
  const [mode, setMode] = useState<Mode>("demo");
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [client, setClient] = useState("");
  const [year, setYear] = useState("2025-26");
  const [category, setCategory] = useState("Form 16");
  const [assignee, setAssignee] = useState("Unassigned");
  const [source, setSource] = useState<"manual" | "whatsapp_demo">("manual");
  const [file, setFile] = useState<File | null>(null);
  const [reviewStatus, setReviewStatus] = useState<Status>("submitted");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAssignee, setReviewAssignee] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const headers = useCallback((): Record<string, string> => token ? { "x-lab-token": token } : {}, [token]);
  const refresh = useCallback(async (nextMode: Mode = mode) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounting/documents?mode=${nextMode}`, { headers: headers(), cache: "no-store" });
      const payload: ApiResponse = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Cannot load document records.");
      setDocuments(payload.documents || []);
    } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to load records" }); }
    finally { setLoading(false); }
  }, [mode, headers]);

  useEffect(() => {
    // Run asynchronous network synchronization; never set React state synchronously from an effect.
    void fetch("/api/status", { cache: "no-store" }).then(r => r.json()).then(data => setLiveEnabled(Boolean(data.liveEnabled))).catch(() => setLiveEnabled(false));
    void fetch("/api/accounting/documents?mode=demo", { cache: "no-store" })
      .then(async r => { const data: ApiResponse = await r.json(); if (!r.ok || !data.ok) throw new Error(data.error || "Cannot load records"); return data; })
      .then(data => setDocuments(data.documents || []))
      .catch(error => setNotice({ kind: "error", message: error instanceof Error ? error.message : "Cannot load records" }))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => documents.filter(d => {
    const latest = d.revisions.at(-1);
    return (!filterCategory || d.category === filterCategory) && (!filterStatus || d.status === filterStatus) && (!filterYear || d.financialYear === filterYear) &&
      (!query || `${d.client} ${d.category} ${d.assignedTo} ${latest?.name || ""}`.toLowerCase().includes(query.toLowerCase()));
  }), [documents, filterCategory, filterStatus, filterYear, query]);
  const selected = documents.find(d => d.id === selectedId) || null;
  const counts = { total: documents.length, clients: new Set(documents.map(d => d.client.toLowerCase())).size, review: documents.filter(d => d.status === "in_review" || d.status === "needs_changes").length, approved: documents.filter(d => d.status === "approved").length };

  function messageError(error: unknown) { setNotice({ kind: "error", message: error instanceof Error ? error.message : "Request failed." }); }
  async function request(url: string, method: "POST" | "PATCH", body: FormData | Record<string, unknown>) {
    const isForm = body instanceof FormData;
    const response = await fetch(url, { method, headers: { ...headers(), ...(!isForm ? { "Content-Type": "application/json" } : {}) }, body: isForm ? body : JSON.stringify(body) });
    const result: ApiResponse = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Request failed.");
    return result;
  }
  function updateDocument(document: Document) { setDocuments(items => [document, ...items.filter(item => item.id !== document.id)]); }
  function openDocument(document: Document) { setSelectedId(document.id); setReviewStatus(document.status); setReviewAssignee(document.assignedTo); setReviewNote(""); setReplaceFile(null); }
  async function changeMode(next: Mode) { setMode(next); setSelectedId(null); setNotice(null); await refresh(next); }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    setBusy("upload"); setNotice(null);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ mode, client, financialYear: year, category, assignedTo: assignee, source })) form.set(key, value);
      form.set("file", file);
      const result = await request("/api/accounting/documents", "POST", form);
      if (result.document) updateDocument(result.document);
      setShowUpload(false); setFile(null); setClient("");
      setNotice({ kind: "success", message: mode === "demo" ? "Saved locally. No AWS charges." : "Uploaded to private S3 storage." });
    } catch (error) { messageError(error); } finally { setBusy(""); }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy("review"); setNotice(null);
    try {
      const result = await request(`/api/accounting/documents/${selected.id}`, "PATCH", { mode, status: reviewStatus, assignedTo: reviewAssignee, note: reviewNote });
      if (result.document) updateDocument(result.document);
      setReviewNote(""); setNotice({ kind: "success", message: "Document review updated and recorded in history." });
    } catch (error) { messageError(error); } finally { setBusy(""); }
  }

  async function replace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !replaceFile) return;
    setBusy("replace"); setNotice(null);
    try {
      const form = new FormData(); form.set("mode", mode); form.set("file", replaceFile);
      const result = await request(`/api/accounting/documents/${selected.id}/replace`, "POST", form);
      if (result.document) { updateDocument(result.document); setReviewStatus(result.document.status); }
      setReplaceFile(null); setNotice({ kind: "success", message: "New revision stored. Original file retained." });
    } catch (error) { messageError(error); } finally { setBusy(""); }
  }

  async function download(document: Document, revisionId?: string) {
    setBusy(`download:${revisionId || document.id}`); setNotice(null);
    try {
      const result = await request(`/api/accounting/documents/${document.id}/download`, "POST", { mode, revisionId });
      saveBrowserFile(result);
    } catch (error) { messageError(error); } finally { setBusy(""); }
  }

  return <div className="vault-page">
    <aside className="vault-sidebar">
      <a className="vault-home" href="/"><span className="vault-mark"><Glyph name="cloud" size={22}/></span><span><strong>integration<span>lab</span></strong><small>ACCOUNTING MODULE</small></span></a>
      <div className="vault-nav-label">WORKSPACE</div>
      <div className="vault-nav-entry active"><Glyph name="folder"/> Document Vault</div>
      <a className="vault-nav-entry" href="/"><Glyph name="arrow"/> API Playground</a>
      <div className="vault-nav-label vault-sidebar-section">CAPABILITIES</div>
      <div className="vault-nav-entry muted"><Glyph name="shield"/> Private S3 objects</div>
      <div className="vault-nav-entry muted"><Glyph name="history"/> Revision history</div>
      <div className="vault-nav-entry muted"><Glyph name="message"/> WhatsApp imports*</div>
      <div className="vault-sidebar-bottom"><Glyph name="lock" size={17}/><span>Developer prototype. Synthetic data only.</span></div>
    </aside>
    <div className="vault-body">
      <header className="vault-toolbar"><div><span>Workspace</span><span className="vault-breadcrumb">/</span><strong>Document Vault</strong></div><div className="vault-toolbar-right"><span className="vault-local-indicator"/><span>Local development</span><span className="vault-user">AV</span></div></header>
      <main className="vault-main">
        <div className="vault-heading"><div><div className="vault-eyebrow">ACCOUNTING / DOCUMENT MANAGEMENT</div><h1>Document Vault<span>.</span></h1><p>Organize financial records, manage reviews, and retain every revision in one place.</p></div><button className="vault-primary" onClick={() => setShowUpload(true)}><Glyph name="plus" size={17}/> Upload document</button></div>
        <div className="vault-notice-line"><span className="vault-mode-label"><Glyph name="shield" size={17}/>{mode === "demo" ? "Local demo · No AWS charges" : "Live S3 or local Moto · Provider calls enabled"}</span><div className="vault-mode-control"><button className={mode === "demo" ? "selected" : ""} onClick={() => { void changeMode("demo"); }}>Demo</button><button className={mode === "live" ? "selected" : ""} disabled={!liveEnabled} title={liveEnabled ? "Uses configured S3 endpoint" : "Enable live integrations in .env.local"} onClick={() => { void changeMode("live"); }}>Live S3</button></div></div>
        {mode === "live" && <div className="vault-token-row"><label htmlFor="vault-token">Admin token</label><input type="password" id="vault-token" value={token} onChange={e => setToken(e.target.value)} placeholder="Enter local admin token" autoComplete="off"/><button className="vault-button" onClick={() => void refresh()}>Connect / refresh</button></div>}
        {notice && <div role="status" className={`vault-alert ${notice.kind}`}><Glyph name={notice.kind === "success" ? "check" : "shield"} size={18}/><span>{notice.message}</span><button title="Dismiss" onClick={() => setNotice(null)}><Glyph name="x" size={16}/></button></div>}
        <div className="vault-stats">
          <div className="vault-stat"><span className="vault-stat-icon navy"><Glyph name="file"/></span><div><strong>{counts.total}</strong><span>Total documents</span></div></div>
          <div className="vault-stat"><span className="vault-stat-icon blue"><Glyph name="users"/></span><div><strong>{counts.clients}</strong><span>Client records</span></div></div>
          <div className="vault-stat"><span className="vault-stat-icon amber"><Glyph name="clock"/></span><div><strong>{counts.review}</strong><span>Needs attention</span></div></div>
          <div className="vault-stat"><span className="vault-stat-icon green"><Glyph name="check"/></span><div><strong>{counts.approved}</strong><span>Approved</span></div></div>
        </div>
        <section className="vault-panel"><div className="vault-section-heading"><div><h2>Document library</h2><p>Search and filter documents across clients and financial years.</p></div><button className="vault-button" disabled={loading} onClick={() => void refresh()}><Glyph name="refresh" size={16}/> Refresh</button></div>
          <div className="vault-filters"><label className="vault-search"><Glyph name="search" size={18}/><input aria-label="Search documents" placeholder="Search clients, documents, or accountants" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filter category" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter year" value={filterYear} onChange={e => setFilterYear(e.target.value)}><option value="">All years</option>{YEARS.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map(item => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></div>
          <div className="vault-table-scroll"><table className="vault-table"><thead><tr><th>DOCUMENT</th><th>CLIENT / FINANCIAL YEAR</th><th>CATEGORY</th><th>STATUS</th><th>ASSIGNED</th><th></th></tr></thead><tbody>{visible.map(doc => { const latest = doc.revisions.at(-1); return <tr key={doc.id}><td><div className="vault-document-cell"><span className="vault-file-icon"><Glyph name="file" size={19}/></span><div><strong>{latest?.name}</strong><small>{latest ? prettySize(latest.size) : ""} · v{doc.revisions.length}{doc.source === "whatsapp_demo" ? " · WA demo" : ""}</small></div></div></td><td><strong>{doc.client}</strong><small>FY {doc.financialYear}</small></td><td>{doc.category}</td><td><span className={`vault-pill ${doc.status}`}>{STATUS_LABELS[doc.status]}</span></td><td>{doc.assignedTo}</td><td><button className="vault-row-action" onClick={() => openDocument(doc)}>Details <Glyph name="arrow" size={15}/></button></td></tr>; })}</tbody></table></div>
          {loading ? <div className="vault-empty"><Glyph name="refresh" size={27}/><strong>Loading your documents...</strong></div> : visible.length === 0 ? <div className="vault-empty"><span className="vault-empty-icon"><Glyph name="folder" size={33}/></span><strong>{documents.length ? "No documents match these filters" : "Your document vault is ready"}</strong><p>{documents.length ? "Try clearing your search or filters." : "Upload a synthetic PDF, image, Word, or Excel file to start testing the complete workflow."}</p><button className="vault-button" onClick={() => { setQuery(""); setFilterCategory(""); setFilterStatus(""); setFilterYear(""); if (!documents.length) setShowUpload(true); }}>{documents.length ? "Clear filters" : "Upload first document"}</button></div> : null}
          <div className="vault-panel-footer">Showing {visible.length} of {documents.length} records · prototype list capped at 250 documents</div>
        </section>
        <div className="vault-bottom-grid"><div className="vault-help-panel"><Glyph name="shield" size={22}/><div><strong>Built for financial document workflows</strong><p>Private storage, immutable revision keys, status tracking, and short-lived download links. Use only fictional records until production authentication and compliance controls are implemented.</p></div></div><div className="vault-help-panel warm"><Glyph name="message" size={22}/><div><strong>WhatsApp attachment workflow</strong><p>Choose “Simulated WhatsApp” when uploading to test imported-attachment categorization. Automatic Meta webhook ingestion is a separate integration.</p></div></div></div>
        <div className="vault-footer">Accounting Vault · Proof of concept · No real client information</div>
      </main>
    </div>
    {showUpload && <div className="vault-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowUpload(false); }}><section className="vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-upload-title"><header className="vault-dialog-header"><div><span className="vault-eyebrow">NEW DOCUMENT</span><h2 id="vault-upload-title">Upload accounting document</h2></div><button className="vault-icon-button" onClick={() => setShowUpload(false)} aria-label="Close"><Glyph name="x"/></button></header><form onSubmit={upload}><div className="vault-form-grid"><label>Client or employee name<input required maxLength={80} value={client} onChange={e => setClient(e.target.value)} placeholder="Example: Atlas Traders (fictional)"/></label><label>Financial year<select value={year} onChange={e => setYear(e.target.value)}>{YEARS.map(item => <option key={item}>{item}</option>)}</select></label><label>Document category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label><label>Assigned accountant<input required maxLength={60} value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Unassigned"/></label><label className="wide">Document source<select value={source} onChange={e => setSource(e.target.value as typeof source)}><option value="manual">Manual upload</option><option value="whatsapp_demo">Simulated WhatsApp attachment</option></select></label><label className="vault-droparea wide"><Glyph name="upload" size={24}/><strong>{file?.name || "Choose a document"}</strong><span>{file ? prettySize(file.size) : "PDF, PNG, JPG, WebP, TXT, DOCX, XLSX · up to 8 MiB"}</span><input type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] || null)}/></label></div><div className="vault-modal-actions"><span>Only synthetic test data.</span><button type="button" className="vault-button" onClick={() => setShowUpload(false)}>Cancel</button><button className="vault-primary" disabled={!file || Boolean(busy)}><Glyph name="upload" size={16}/>{busy === "upload" ? "Uploading..." : "Save document"}</button></div></form></section></div>}
    {selected && <div className="vault-overlay vault-detail-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}><section className="vault-detail" role="dialog" aria-modal="true" aria-labelledby="vault-detail-title"><header className="vault-dialog-header"><div><span className="vault-eyebrow">DOCUMENT RECORD</span><h2 id="vault-detail-title">{selected.revisions.at(-1)?.name}</h2><p>{selected.client} · FY {selected.financialYear} · {selected.category}</p></div><button className="vault-icon-button" onClick={() => setSelectedId(null)} aria-label="Close"><Glyph name="x"/></button></header><div className="vault-detail-scroll"><div className="vault-detail-summary"><span className={`vault-pill ${selected.status}`}>{STATUS_LABELS[selected.status]}</span><span>{selected.source === "whatsapp_demo" ? "WhatsApp simulation" : "Manual upload"}</span><span>{selected.revisions.length} revision(s)</span></div><div className="vault-detail-card"><h3><Glyph name="download" size={18}/> File revisions</h3><div className="vault-revision-list">{[...selected.revisions].reverse().map((revision, index) => <div className="vault-revision" key={revision.id}><div><strong>Version {selected.revisions.length - index}</strong><small>{revision.name} · {prettySize(revision.size)} · {prettyDate(revision.uploadedAt)}</small></div><button className="vault-button" disabled={Boolean(busy)} onClick={() => void download(selected, revision.id)}><Glyph name="download" size={15}/> Download</button></div>)}</div><form className="vault-replace-form" onSubmit={replace}><label>Upload a revised document<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx" onChange={e => setReplaceFile(e.target.files?.[0] || null)}/></label><button className="vault-button" disabled={selected.status === "archived" || !replaceFile || Boolean(busy)}>{busy === "replace" ? "Saving..." : "Add revision"}</button></form></div><div className="vault-detail-card"><h3><Glyph name="check" size={18}/> Review workflow</h3><form className="vault-review-form" onSubmit={review}><label>Status<select value={reviewStatus} onChange={e => setReviewStatus(e.target.value as Status)}>{STATUSES.map(item => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</select></label><label>Assigned to<input maxLength={60} value={reviewAssignee} onChange={e => setReviewAssignee(e.target.value)}/></label><label className="wide">Review note (optional)<textarea maxLength={240} rows={2} value={reviewNote} placeholder="Example: Details checked against the submitted Form 16" onChange={e => setReviewNote(e.target.value)}/></label><button disabled={Boolean(busy)} className="vault-primary">{busy === "review" ? "Saving..." : "Save review update"}</button></form></div><div className="vault-detail-card"><h3><Glyph name="history" size={18}/> Activity history</h3><div className="vault-timeline">{[...selected.events].reverse().map(item => <div className="vault-timeline-item" key={item.id}><div className="vault-timeline-dot"/><div><strong>{item.action}</strong><span>{prettyDate(item.timestamp)} · {item.actor}</span><p>{item.description}</p></div></div>)}</div></div></div></section></div>}
  </div>;
}
