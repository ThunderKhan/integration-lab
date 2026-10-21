"use client";

import { useCallback, useEffect, useState, type FormEvent, type SVGProps } from "react";

type Service = "overview" | "whatsapp" | "storage" | "mailgun";
type Mode = "demo" | "live";
type IconName = "grid" | "message" | "cloud" | "mail" | "shield" | "zap" | "chevron" | "arrow" | "check" | "copy" | "external" | "file" | "download" | "refresh" | "lock" | "terminal" | "activity" | "settings" | "info" | "send" | "upload" | "sparkles";
type Provider = "whatsapp" | "s3" | "mailgun";

type Status = {
  liveEnabled: boolean;
  production: boolean;
  providers: Record<Provider, boolean>;
};
type FileItem = { key: string; name: string; size: number; contentType: string; uploadedAt: string };
type ApiResult = { ok: boolean; error?: string; message?: string; id?: string; simulated?: boolean; files?: FileItem[]; file?: FileItem; url?: string; base64?: string; contentType?: string; name?: string };
type Activity = { id: number; service: string; title: string; detail: string; simulated: boolean };

function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    message: <><path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l2.1-5.3A8.5 8.5 0 1 1 21 11.5Z"/><path d="m9 10 2.5 2.5L16 8"/></>,
    cloud: <><path d="M7 18H6a4 4 0 0 1-.4-8 6.5 6.5 0 0 1 12.5-1.1A4.5 4.5 0 0 1 18 18h-1"/><path d="M12 11v10m-4-4 4 4 4-4"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    shield: <><path d="m12 22 7-4V6l-7-3-7 3v12l7 4Z"/><path d="m9 12 2 2 4-4"/></>,
    zap: <path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    external: <><path d="M13 5h6v6m0-6-9 9"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>,
    file: <><path d="M6 2h8l5 5v14H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 13h8M8 17h6"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    terminal: <><rect x="2" y="3" width="20" height="18" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></>,
    activity: <path d="M2 12h4l3-8 6 16 3-8h4"/>,
    settings: <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 17v3h16v-3"/></>,
    sparkles: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...shared} {...props}>{shapes[name]}</svg>;
}

const menus: { id: Service; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "whatsapp", label: "WhatsApp API", icon: "message" },
  { id: "storage", label: "AWS S3 Storage", icon: "cloud" },
  { id: "mailgun", label: "Mailgun Email", icon: "mail" },
];
const serviceInfo: Record<Provider, { label: string; icon: IconName; color: string; description: string; endpoint: string; service: Service }> = {
  whatsapp: { label: "WhatsApp", icon: "message", color: "green", description: "Send a template message via Meta Cloud API", endpoint: "POST /api/whatsapp/send", service: "whatsapp" },
  s3: { label: "Amazon S3", icon: "cloud", color: "blue", description: "Upload, browse and securely download files", endpoint: "POST /api/storage/upload", service: "storage" },
  mailgun: { label: "Mailgun", icon: "mail", color: "orange", description: "Send transactional emails via Mailgun", endpoint: "POST /api/mailgun/send", service: "mailgun" },
};

function prettySize(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`; }

export default function Dashboard() {
  const [active, setActive] = useState<Service>("overview");
  const [mode, setMode] = useState<Mode>("demo");
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Integration Lab test email");
  const [message, setMessage] = useState("Hello! This is a test email sent using the Mailgun API Integration Lab.");
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ liveEnabled: false, production: false, providers: { whatsapp: false, mailgun: false, s3: false } }));
  }, []);

  const headers = useCallback((): HeadersInit => ({ ...(token ? { "x-lab-token": token } : {}) }), [token]);

  const loadFiles = useCallback(async (requestedMode: Mode = mode) => {
    setListLoading(true);
    setListError("");
    try {
      const response = await fetch(`/api/storage/list?mode=${requestedMode}`, { headers: headers(), cache: "no-store" });
      const data: ApiResult = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load files.");
      setFiles(data.files || []);
    } catch (error) { setListError(error instanceof Error ? error.message : "Could not load files."); }
    finally { setListLoading(false); }
  }, [mode, headers]);

  function record(service: string, title: string, detail: string, simulated: boolean) {
    setHistory((items) => [{ id: Date.now() + Math.random(), service, title, detail, simulated }, ...items].slice(0, 5));
  }

  async function requestJson(path: string, payload: Record<string, unknown>): Promise<ApiResult> {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ ...payload, mode }) });
    const data: ApiResult = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function feedback(error: unknown) {
    setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request failed. Please try again." });
  }

  async function sendWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("whatsapp"); setNotice(null);
    try {
      const result = await requestJson("/api/whatsapp/send", { to: phone });
      setNotice({ kind: "success", text: result.message || "Request accepted." });
      record("WhatsApp", "Template request accepted", result.id || "No message ID", Boolean(result.simulated));
    } catch (error) { feedback(error); } finally { setBusy(""); }
  }

  async function sendMailgun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("mailgun"); setNotice(null);
    try {
      const result = await requestJson("/api/mailgun/send", { to: email, subject, message });
      setNotice({ kind: "success", text: result.message || "Request accepted." });
      record("Mailgun", "Email request accepted", result.id || "No message ID", Boolean(result.simulated));
    } catch (error) { feedback(error); } finally { setBusy(""); }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    setBusy("upload"); setNotice(null);
    try {
      const form = new FormData(); form.set("mode", mode); form.set("file", file);
      const response = await fetch("/api/storage/upload", { method: "POST", headers: headers(), body: form });
      const result: ApiResult = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Upload failed.");
      setNotice({ kind: "success", text: result.message || "Upload accepted." });
      record("S3 Storage", `Uploaded ${file.name}`, prettySize(file.size), Boolean(result.simulated));
      setFile(null);
      const field = document.getElementById("file-input") as HTMLInputElement | null;
      if (field) field.value = "";
      await loadFiles();
    } catch (error) { feedback(error); } finally { setBusy(""); }
  }

  async function downloadFile(item: FileItem) {
    setBusy(item.key); setNotice(null);
    try {
      const result = await requestJson("/api/storage/download", { key: item.key });
      if (result.url) {
        // Presigned URLs expire after 60 seconds; download immediately.
        window.location.assign(result.url);
      } else if (result.base64) {
        const binary = atob(result.base64);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: result.contentType || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = result.name || item.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else throw new Error("No download was returned.");
      record("S3 Storage", `Downloaded ${item.name}`, prettySize(item.size), mode === "demo");
    } catch (error) { feedback(error); } finally { setBusy(""); }
  }

  function navigate(service: Service) {
    setActive(service);
    setNotice(null);
    if (service === "storage") void loadFiles();
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    if (active === "storage") void loadFiles(nextMode);
  }
  const configured = status?.providers;
  const liveReady = Boolean(status?.liveEnabled);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-logo"><Icon name="terminal" size={23}/></div><div><div className="brand-name">integration<span>lab</span></div><div className="brand-tagline">DEVELOPER WORKSPACE</div></div></div>
        <div className="nav-heading">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {menus.map((item) => <button key={item.id} className={`nav-item ${active === item.id ? "selected" : ""}`} onClick={() => navigate(item.id)} aria-current={active === item.id ? "page" : undefined}><Icon name={item.icon} size={19}/><span>{item.label}</span>{active === item.id && <span className="nav-active-dot"/>}</button>)}
        </nav>
        <div className="nav-heading tools-heading">TOOLS & RESOURCES</div>
        <div className="nav-extras"><a href="https://developers.facebook.com/docs/whatsapp/cloud-api/" target="_blank" rel="noreferrer"><Icon name="external" size={17}/>Meta documentation</a><a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" target="_blank" rel="noreferrer"><Icon name="external" size={17}/>AWS S3 docs</a><a href="https://documentation.mailgun.com/" target="_blank" rel="noreferrer"><Icon name="external" size={17}/>Mailgun docs</a></div>
        <div className="sidebar-bottom"><div className="sidebar-secure"><Icon name="shield" size={19}/><div><strong>Security first</strong><span>Credentials stay on the server</span></div></div><div className="sidebar-footer">Integration Lab <span>v1.0</span></div></div>
      </aside>
      <div className="main-area">
        <header className="topbar"><div className="breadcrumbs">Workspace <Icon name="chevron" size={13}/> <span>{active === "overview" ? "Overview" : serviceInfo[active === "storage" ? "s3" : active].label}</span></div><div className="topbar-right"><span className="environment-label"><span className="online-dot"/> Local environment</span><button className="settings-btn" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} aria-label="API access settings"><Icon name="settings" size={19}/></button><div className="avatar">IL</div></div></header>
        <main className="content">
          <div className="page-intro"><div><div className="eyebrow"><Icon name="sparkles" size={14}/> API PLAYGROUND / {active.toUpperCase()}</div><h1>{active === "overview" ? "Your integrations, simplified." : active === "whatsapp" ? "WhatsApp messaging" : active === "storage" ? "Cloud storage" : "Transactional email"}</h1><p>{active === "overview" ? "Connect, test, and explore powerful APIs—all from one developer workspace." : active === "whatsapp" ? "Test Meta's official WhatsApp Cloud API using a template message." : active === "storage" ? "Upload and retrieve private files using an S3-compatible interface." : "Send transactional emails through Mailgun's HTTP API."}</p></div><div className="intro-symbol"><Icon name={active === "overview" ? "zap" : active === "whatsapp" ? "message" : active === "storage" ? "cloud" : "mail"} size={33}/></div></div>
          <div className="mode-banner"><div className="mode-banner-copy"><span className={`status-pulse ${mode === "live" ? "pulse-live" : ""}`}/><div><strong>{mode === "demo" ? "Demo environment" : "Live provider requests"}</strong><span>{mode === "demo" ? "Safe simulation. No real messages, uploads, or provider costs." : "Real operations may incur provider charges. Use only test accounts."}</span></div></div><div className="mode-toggle" role="group" aria-label="Execution mode"><button className={mode === "demo" ? "active" : ""} onClick={() => changeMode("demo")}>Demo</button><button className={mode === "live" ? "active" : ""} disabled={!liveReady} title={!liveReady ? "Set ENABLE_LIVE_INTEGRATIONS=true in .env.local" : "Send real provider requests"} onClick={() => changeMode("live")}>Live</button></div></div>
          {showSettings && <section className="settings-panel"><div><h3>Request authorization</h3><p>Live requests require <code>INTEGRATION_LAB_ADMIN_TOKEN</code>. This value stays in browser memory and is never committed.</p></div><label htmlFor="admin-token" className="sr-only">Admin token</label><input id="admin-token" type="password" placeholder="Paste your local admin token" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}/><button className="text-button" onClick={() => setToken("")}>Clear</button></section>}
          {notice && <div className={`notice ${notice.kind}`} role="status"><Icon name={notice.kind === "success" ? "check" : "info"} size={19}/><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}

          {active === "overview" && <>
            <div className="section-title"><div><h2>Available integrations</h2><p>Choose a service to explore its endpoints.</p></div><span className="count-chip">3 SERVICES</span></div>
            <div className="service-grid">{(["whatsapp", "s3", "mailgun"] as Provider[]).map((provider) => { const item = serviceInfo[provider]; const isReady = Boolean(configured?.[provider]); return <button className="service-card" key={provider} onClick={() => navigate(item.service)}><span className={`service-icon ${item.color}`}><Icon name={item.icon} size={24}/></span><div className="service-name-row"><h3>{item.label}</h3><Icon name="arrow" size={17}/></div><p>{item.description}</p><div className="service-card-bottom"><span className={`small-dot ${isReady ? "connected" : ""}`}/>{isReady ? "Credentials configured" : "Awaiting credentials"}</div></button>; })}</div>
            <div className="overview-bottom"><section className="surface getting-started"><div className="surface-title"><span className="surface-icon"><Icon name="zap" size={18}/></span><h2>Get started in minutes</h2></div><div className="steps"><div><span>01</span><div><h4>Explore demo mode</h4><p>Test every integration locally without API keys or cloud charges.</p></div></div><div><span>02</span><div><h4>Configure your credentials</h4><p>Add provider secrets to <code>.env.local</code>; never expose them to the browser.</p></div></div><div><span>03</span><div><h4>Enable live integration</h4><p>Set the explicit live flag and admin token, then test with approved recipients.</p></div></div></div></section><section className="surface activity-panel"><div className="surface-title"><span className="surface-icon"><Icon name="activity" size={18}/></span><h2>Recent activity</h2></div>{history.length ? <div className="activity-list">{history.map((item) => <div className="activity-item" key={item.id}><span className="activity-success"><Icon name="check" size={15}/></span><div><strong>{item.title}</strong><span>{item.service} · {item.simulated ? "Simulated" : "Live"}</span></div></div>)}</div> : <div className="empty-activity"><Icon name="activity" size={29}/><strong>No activity yet</strong><span>Your recent integration tests will show here.</span></div>}</section></div>
          </>}

          {active === "whatsapp" && <div className="detail-grid"><section className="surface form-panel"><div className="surface-title"><span className="surface-icon green"><Icon name="message" size={19}/></span><div><h2>Send a template message</h2><p>WhatsApp Cloud API / Messages</p></div></div><form onSubmit={sendWhatsApp}><div className="input-group"><label htmlFor="phone">Recipient phone number</label><input id="phone" placeholder="919876543210" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required/><span className="input-hint">Country code + number, digits only. Live mode requires a Meta-approved test recipient.</span></div><div className="input-group"><label>Message template</label><div className="readonly-field"><Icon name="file" size={17}/> hello_world <span>Pre-approved</span></div><span className="input-hint">Template messages work outside the 24-hour customer service window.</span></div><button className="primary-btn" type="submit" disabled={Boolean(busy)}><Icon name="send" size={18}/>{busy === "whatsapp" ? "Sending…" : mode === "demo" ? "Simulate message" : "Send live template"}<Icon name="arrow" size={17}/></button></form></section><ServiceGuide provider="whatsapp" configured={Boolean(configured?.whatsapp)} mode={mode}/></div>}

          {active === "mailgun" && <div className="detail-grid"><section className="surface form-panel"><div className="surface-title"><span className="surface-icon orange"><Icon name="mail" size={19}/></span><div><h2>Send a transactional email</h2><p>Mailgun / Messages API</p></div></div><form onSubmit={sendMailgun}><div className="input-group"><label htmlFor="recipient">Recipient email</label><input id="recipient" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required/><span className="input-hint">Sandbox domains can send only to authorized recipients.</span></div><div className="input-group"><label htmlFor="subject">Subject</label><input id="subject" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} required/></div><div className="input-group"><label htmlFor="message">Message body</label><textarea id="message" value={message} maxLength={5000} rows={5} onChange={(e) => setMessage(e.target.value)} required/></div><button className="primary-btn" type="submit" disabled={Boolean(busy)}><Icon name="send" size={18}/>{busy === "mailgun" ? "Sending…" : mode === "demo" ? "Simulate email" : "Send live email"}<Icon name="arrow" size={17}/></button></form></section><ServiceGuide provider="mailgun" configured={Boolean(configured?.mailgun)} mode={mode}/></div>}

          {active === "storage" && <><div className="detail-grid"><section className="surface form-panel"><div className="surface-title"><span className="surface-icon blue"><Icon name="cloud" size={19}/></span><div><h2>Upload a file</h2><p>Amazon S3 / PutObject</p></div></div><form onSubmit={uploadFile}><label className="dropzone" htmlFor="file-input"><Icon name="upload" size={29}/><strong>{file ? file.name : "Choose a file to upload"}</strong><span>{file ? prettySize(file.size) : "PNG, JPEG, WebP, PDF or TXT · Max 5 MB"}</span><input id="file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label><div className="upload-info"><Icon name="lock" size={16}/>{mode === "demo" ? "Stored in temporary server memory (cleared on restart)." : "Stored privately in S3 under the configured prefix."}</div><button className="primary-btn" type="submit" disabled={!file || Boolean(busy)}><Icon name="upload" size={18}/>{busy === "upload" ? "Uploading…" : mode === "demo" ? "Simulate upload" : "Upload to S3"}<Icon name="arrow" size={17}/></button></form></section><ServiceGuide provider="s3" configured={Boolean(configured?.s3)} mode={mode}/></div><section className="surface files-section"><div className="files-header"><div><h2>Your files</h2><p>{mode === "demo" ? "Temporary demo objects" : "Private objects in your configured S3 prefix"}</p></div><button className="outline-btn" onClick={() => void loadFiles()} disabled={listLoading}><Icon name="refresh" size={16}/> Refresh</button></div>{listError && <div className="inline-error" role="alert">{listError}</div>}{listLoading ? <div className="file-placeholder">Loading files…</div> : files.length === 0 ? <div className="file-placeholder"><Icon name="file" size={29}/><strong>No files yet</strong><span>Upload a file to see it appear here.</span></div> : <div className="file-list">{files.map((item) => <div className="file-row" key={item.key}><div className="file-icon"><Icon name="file" size={19}/></div><div className="file-name"><strong title={item.name}>{item.name}</strong><span>{prettySize(item.size)}{item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleDateString()}` : ""}</span></div><button className="download-btn" disabled={Boolean(busy)} onClick={() => void downloadFile(item)} aria-label={`Download ${item.name}`}><Icon name="download" size={18}/></button></div>)}</div>}</section></>}
          <footer className="content-footer"><span><Icon name="shield" size={15}/> Secure by design · No secrets in the client bundle</span><span>Built for testing, not public deployment</span></footer>
        </main>
      </div>
    </div>
  );
}

function ServiceGuide({ provider, configured, mode }: { provider: Provider; configured: boolean; mode: Mode }) {
  const item = serviceInfo[provider];
  const env: Record<Provider, string[]> = {
    whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    mailgun: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM_EMAIL"],
    s3: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"],
  };
  return <aside className="guide-panel"><div className="guide-top"><span className={`service-icon ${item.color}`}><Icon name={item.icon} size={23}/></span><span className="guide-label">INTEGRATION GUIDE</span></div><h2>{item.label} API</h2><p>{item.description}</p><div className="guide-divider"/><div className="guide-row"><span>Current mode</span><strong className="mode-value">{mode === "demo" ? "Simulated" : "Live"}</strong></div><div className="guide-row"><span>Credentials</span><strong className={configured ? "state-ready" : "state-pending"}>{configured ? "Configured" : "Not configured"}</strong></div><div className="guide-divider"/><div className="guide-caption">API ENDPOINT</div><code className="endpoint-label">{item.endpoint}</code><div className="guide-caption vars-heading">REQUIRED ENVIRONMENT VARIABLES</div><div className="env-list">{env[provider].map((name) => <code key={name}>{name}</code>)}</div><div className="guide-note"><Icon name="info" size={18}/><span>Set credentials in <strong>.env.local</strong>, enable live integrations explicitly, and use a strong admin token.</span></div></aside>;
}
