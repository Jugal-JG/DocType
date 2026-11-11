"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateJSON, type JSONContent } from "@tiptap/react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, FileText, LogIn, LogOut, Plus, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { connectSupabase } from "../lib/supabase";
import { DocumentEditor } from "./document-editor";
import { extensions } from "../lib/collaboration";
import { useLiveDocument } from "./use-live-document";
import { fileFormats, formats, type FileFormat } from "../lib/document-formats";
import { FormatMenu } from "./format-menu";
import { DeletionNotice } from "./deletion-notice";

type Summary = { id: string; owner_id: string; title: string; updated_at: string; file_format: FileFormat };
const summaryFields = "id, owner_id, title, updated_at, file_format";
const formatItems = fileFormats.map((value) => ({ value, label: formats[value], detail: value }));

function Brand() {
  return <span className="brand"><span className="brand-icon"><FileText size={19} /></span>DocType</span>;
}

export default function Home() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = connectSupabase();
    setClient(client);
    const url = new URL(location.href);
    const callbackError = url.searchParams.get("error");
    if (callbackError) {
      setError("Google sign-in couldn’t finish. Please try again.");
      for (const key of ["error", "error_code", "error_description"]) url.searchParams.delete(key);
      window.history.replaceState(null, "", url);
    }
    if (!client) { setReady(true); return; }
    const { data } = client.auth.onAuthStateChange((_, session) => {
      setSession(session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithPassword({
        email: String(fields.get("email")).trim(),
        password: String(fields.get("password")),
      });
      if (error) setError(error.message);
    } catch {
      setError("Couldn’t sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/` },
      });
      if (!error) return;
    } catch {
      // Use the same recovery message for network and provider errors.
    }
    setError("Couldn’t start Google sign-in. Check that Google is enabled in Supabase.");
    setBusy(false);
  }

  if (client && session) return <Workspace key={session.user.id} client={client} session={session} />;
  return <main className="login">
    <div className="login-card">
      <Brand />
      <h1>Sign in to DocType</h1>
      <p>Open your workspace to write and share documents.</p>
      {ready && !client ? <p role="alert">Set the Supabase values in .env.local to connect your workspace.</p>
        : <><form onSubmit={signIn}>
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={!ready || busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <button className="mt-3 w-full" disabled={!ready || busy} onClick={() => void signInWithGoogle()}>
          <LogIn size={16} /> Continue with Google
        </button></>}
    </div>
  </main>;
}

function Workspace({ client, session }: { client: SupabaseClient; session: Session }) {
  const [id, setId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Summary[] | null>(null);
  const [doc, setDoc] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [deletions, setDeletions] = useState<Summary[]>([]);
  const [deleting, setDeleting] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function readLocation() {
      setError("");
      setDoc(null);
      setId(new URLSearchParams(location.search).get("doc"));
    }
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);

  useEffect(() => {
    let active = true;
    if (id) {
      client.from("documents").select(summaryFields).eq("id", id).maybeSingle().then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setError("This document is unavailable.");
        else setDoc(data as Summary);
      });
    } else {
      client.from("documents").select(summaryFields).order("updated_at", { ascending: false }).then(({ data, error }) => {
        if (!active) return;
        if (error) setError("Couldn’t load your documents.");
        else setDocuments(data);
      });
    }
    return () => { active = false; };
  }, [client, id]);

  function navigate(next: string | null) {
    setError("");
    setDoc(null);
    setId(next);
    window.history.pushState(null, "", next ? `/?doc=${next}` : "/");
  }

  async function create(format?: FileFormat, file?: File) {
    setError("");
    setBusy(file ? "Importing…" : "Creating…");
    try {
      let title = "Untitled document";
      let content: JSONContent | undefined;
      if (file) {
        const suffix = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
        const extension = fileFormats.find((value) => value === suffix);
        if (!extension) throw new Error("Choose a .txt, .md, or .docx file.");
        format = extension;
        if (file.size > 1024 * 1024) throw new Error("Choose a file up to 1 MB.");
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "x-file-extension": extension },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Couldn’t import this file.");
        content = typeof result.text === "string"
          ? { type: "doc", content: (result.text as string).split(/\r\n?|\n/).map((line) => ({
            type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}),
          })) }
          : generateJSON(result.html, extensions);
        title = file.name.slice(0, -(extension.length + 1)).trim().slice(0, 120) || title;
      }
      const { data, error } = await client.from("documents")
        .insert({ title, file_format: format, ...(content ? { content } : {}) }).select("id").single();
      if (error) throw new Error("Couldn’t create the document. Try again or choose a smaller file.");
      navigate(data.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  async function deleteDocument(document: Summary) {
    setError("");
    setDeleting((current) => [...current, document.id]);
    const { error } = await client.rpc("set_document_deleted", { target_document: document.id, undo: false });
    setDeleting((current) => current.filter((value) => value !== document.id));
    if (error) { setError("Couldn’t delete the document."); return; }
    setDocuments((current) => current?.filter((item) => item.id !== document.id) ?? null);
    setDeletions((current) => [...current, document]);
    if (new URLSearchParams(location.search).get("doc") === document.id) navigate(null);
  }

  async function undoDelete(document: Summary) {
    const { error } = await client.rpc("set_document_deleted", { target_document: document.id, undo: true });
    if (error) return false;
    const { data } = await client.from("documents").select(summaryFields).eq("id", document.id).maybeSingle();
    setDocuments((current) => [data ?? document, ...(current ?? []).filter((item) => item.id !== document.id)]);
    return true;
  }

  return <>
  {id ? doc?.id === id
    ? <OpenDocument key={id} doc={doc} client={client} session={session}
      owner={doc.owner_id === session.user.id} onBack={() => navigate(null)}
      deleteError={error} onDelete={deleting.includes(id) ? undefined : () => void deleteDocument(doc)} />
    : <main className="workspace"><button onClick={() => navigate(null)}><ArrowLeft size={16} /> Documents</button>
      <p role={error ? "alert" : "status"}>{error || "Opening document…"}</p></main>
  : <>
    <header className="topbar"><Brand /><div className="account">
      <span>{session.user.email}</span>
      <button className="icon" title="Sign out" aria-label="Sign out" onClick={async () => {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) setError("Couldn’t sign out. Try again.");
      }}><LogOut size={18} /></button>
    </div></header>
    <main className="workspace">
      <div className="workspace-heading flex flex-wrap items-end justify-between gap-4">
        <h1>Documents</h1>
        <div className="actions">
          <button disabled={!!busy} onClick={() => picker.current?.click()}><Upload size={16} /> Import</button>
          <FormatMenu label="New document" primary disabled={!!busy} items={formatItems}
            onSelect={(value) => void create(value as FileFormat)}><Plus size={18} /> New document</FormatMenu>
          <input hidden ref={picker} type="file" accept=".txt,.md,.docx" aria-label="Choose a document to import"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file && !busy) void create(undefined, file);
            }} />
        </div>
      </div>
      <p className="hint">Import .txt, .md, or .docx files up to 1 MB.</p>
      {busy && <p role="status">{busy}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {documents ? [true, false].map((owned) => {
        const list = documents.filter((item) => (item.owner_id === session.user.id) === owned);
        const Icon = owned ? FileText : Users;
        return <section className="document-group" key={String(owned)}>
          <h2><Icon size={17} /> {owned ? "Owned by me" : "Shared with me"}</h2>
          {list.length ? <ul>{list.map((item) => <li key={item.id} className="document-row">
            <a href={`/?doc=${item.id}`} onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(item.id);
            }}><span className="document-icon grid size-9 place-items-center"><FileText size={17} /></span>
              <span className="document-name flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span>{item.title}</span><span className="file-type">.{item.file_format}</span>
              </span>
              <time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", year: "numeric",
              })}</time>
            </a>
            {owned && <button className="icon delete-button" aria-label={`Delete ${item.title}`}
              title="Delete document" disabled={deleting.includes(item.id)} onClick={() => void deleteDocument(item)}>
              <Trash2 size={16} />
            </button>}
          </li>)}</ul> : <p className="empty">{owned ? "Create or import a document to get started." : "Documents others share with you will appear here."}</p>}
        </section>;
      }) : !error && <p role="status">Loading documents…</p>}
    </main>
  </>}
  <div className="delete-notices">
    {deletions.map((document) => <DeletionNotice key={document.id} title={document.title}
      undo={() => undoDelete(document)}
      dismiss={() => setDeletions((current) => current.filter((item) => item.id !== document.id))} />)}
  </div>
  </>;
}

function OpenDocument({ doc, owner, client, session, onBack, deleteError, onDelete }: {
  doc: Summary; owner: boolean; client: SupabaseClient; session: Session; onBack: () => void;
  deleteError: string; onDelete?: () => void;
}) {
  const { editorSession, title, pending, connected, error, viewers, setTitle, save } =
    useLiveDocument(client, doc.id, doc.title, session.user.id, session.user.email ?? "Collaborator");
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState({ message: "", error: false });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!pending) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  async function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email")).trim();
    setSharing(true);
    setShareStatus({ message: "", error: false });
    try {
      const { error } = await client.rpc("share_document", { target_document: doc.id, recipient_email: email });
      setShareStatus(error ? {
        message: error.code === "22023" ? error.message : "Couldn’t share this document.",
        error: true,
      } : { message: `${email} can now edit this document.`, error: false });
      if (!error) form.reset();
    } catch {
      setShareStatus({ message: "Couldn’t share this document. Try again.", error: true });
    } finally {
      setSharing(false);
    }
  }

  function confirmDiscard(action: () => void) {
    if (!pending || window.confirm("Leave with unsaved changes?")) action();
  }

  return <main className="editor-shell">
    <Dialog.Root open={shareOpen} onOpenChange={(open) => {
      setShareOpen(open);
      if (open) setShareStatus({ message: "", error: false });
    }}>
    <header className="topbar editor-topbar">
      <button className="icon" title="Back to documents" aria-label="Back to documents"
        onClick={() => confirmDiscard(onBack)}><ArrowLeft size={20} /></button>
      <input className="title-input" aria-label="Document title" value={title} maxLength={120} disabled={!editorSession}
        onChange={(event) => setTitle(event.target.value)} />
      <span className="file-type">.{doc.file_format}</span>
      <div className="actions">
        <div className="viewers" aria-label="People viewing this document">
          {viewers.map((viewer) => {
            const name = viewer.name.split("@")[0];
            const label = `${name}${viewer.id === session.user.id ? " (you)" : ""}${viewer.typing ? " is typing" : " is viewing"}`;
            return <span key={viewer.id} className="viewer" data-typing={viewer.typing} role="img"
              title={label} aria-label={label}>{name.slice(0, 2).toUpperCase()}</span>;
          })}
        </div>
        <span className="save-status" role="status">{!editorSession ? "Opening…" : pending
          ? !title.trim() ? "Enter a title" : "Saving…" : connected ? "Saved" : "Saved · connecting…"}</span>
        {owner && <Dialog.Trigger>
          <UserPlus size={16} /> Share
        </Dialog.Trigger>}
        <button className="primary" disabled={!editorSession || !pending || !title.trim()} onClick={save}>Save</button>
      </div>
    </header>
    {error && <div className="editor-error" role="alert">{error}</div>}
    {deleteError && <div className="editor-error" role="alert">{deleteError}</div>}
    {editorSession && <DocumentEditor {...editorSession} format={doc.file_format} title={title}
      client={client} id={doc.id} onRestoreTitle={setTitle} canDelete={owner} onDelete={onDelete} />}
    <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-20 bg-black/50" />
    <Dialog.Content className="share-dialog fixed left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="dialog-heading"><Dialog.Title>Share document</Dialog.Title>
        <Dialog.Close>Close</Dialog.Close></div>
      <Dialog.Description>Give an existing user permission to edit.</Dialog.Description>
      <form onSubmit={share}>
        <label>Recipient email<input name="email" type="email" placeholder="name@example.com" required /></label>
        <button className="primary" disabled={sharing}>{sharing ? "Sharing…" : "Grant edit access"}</button>
      </form>
      {shareStatus.message && <p role={shareStatus.error ? "alert" : "status"}
        className={shareStatus.error ? "error" : ""}>{shareStatus.message}</p>}
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  </main>;
}
