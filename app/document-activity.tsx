"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, type Editor, type JSONContent } from "@tiptap/react";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { extensions } from "../lib/collaboration";
import { captureCommentSelection, highlightComment, type CommentAnchor } from "./editor-overlays";

type Comment = { id: string; author_name: string; body: string; quote: string | null; created_at: string; anchor: CommentAnchor | null };
const commentFields = "id, author_name, body, quote, created_at, anchor";
type Version = { bucket: number; revision: number; title: string; saved_at: string };

export function DocumentActivity({ mode, client, id, editor, onRestoreTitle, onClose }: {
  mode: "comments" | "history"; client: SupabaseClient; id: string; editor: Editor;
  onRestoreTitle: (title: string) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<(Version & { content: JSONContent }) | null>(null);
  const [draft, setDraft] = useState(() => captureCommentSelection(editor));
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const isComments = mode === "comments";
  const label = isComments ? "Comments" : "Version history";

  useEffect(() => {
    if (!isComments) return;
    highlightComment(editor, draft.anchor, draft.quote);
    return () => { if (!editor.isDestroyed) highlightComment(editor, null); };
  }, [draft, editor, isComments]);

  useEffect(() => {
    let active = true;
    async function load() {
      const result = isComments
        ? await client.from("document_comments").select(commentFields)
          .eq("document_id", id).order("created_at", { ascending: false }).limit(50)
        : await client.from("document_versions").select("bucket, revision, title, saved_at")
          .eq("document_id", id).order("revision", { ascending: false }).limit(50);
      if (!active) return;
      setLoading(false);
      if (result.error) setMessage(`Couldn’t load ${label.toLowerCase()}.`);
      else if (isComments) setComments(result.data as Comment[]);
      else {
        const versions = result.data as Version[];
        setVersions(versions.filter((version, index) => index === 0 || versions[index - 1].revision !== version.revision));
      }
    }
    void load();
    const refresh = isComments ? setInterval(() => void load(), 5000) : undefined;
    return () => { active = false; clearInterval(refresh); };
  }, [client, id, isComments, label]);

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("comment")).trim();
    if (!body || posting) return;
    setPosting(true);
    setMessage("");
    const { data, error } = await client.from("document_comments").insert({
      document_id: id, body, quote: draft.quote || null, anchor: draft.anchor,
    }).select(commentFields).single();
    setPosting(false);
    if (error) setMessage("Couldn’t post the comment.");
    else {
      setComments((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setDraft({ quote: "", anchor: null });
      form.reset();
    }
  }

  async function previewVersion(version: Version) {
    setMessage("");
    const { data, error } = await client.from("document_versions").select("content, revision")
      .eq("document_id", id).eq("bucket", version.bucket).eq("revision", version.revision).maybeSingle();
    if (error || !data) setMessage("That checkpoint changed. Reopen version history and try again.");
    else setPreview({ ...version, content: data.content });
  }

  async function restoreVersion() {
    if (!preview || posting || !window.confirm("Restore this version as the current document?")) return;
    setPosting(true);
    setMessage("");
    try {
      const { error } = await client.rpc("checkpoint_document", { target_document: id });
      if (error || !editor.commands.setContent(preview.content, { errorOnInvalidContent: true })) {
        throw new Error("Could not restore checkpoint.");
      }
      onRestoreTitle(preview.title);
      onClose();
    } catch {
      setMessage("Couldn’t restore this version.");
    } finally {
      setPosting(false);
    }
  }

  return <aside className="activity-panel" aria-label={label}>
        <div className="dialog-heading"><h2>{label}</h2>
          <button className="icon" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><X size={17} /></button>
        </div>
        {message && <p role="alert" className="error">{message}</p>}
        {isComments && <form onSubmit={post}>
          {draft.quote && <blockquote className="comment-quote">{draft.quote}</blockquote>}
          <label>Comment<textarea name="comment" rows={3} required maxLength={2000} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => {
              setSelected(null);
              setDraft(captureCommentSelection(editor));
            }}>Use selected text</button>
            <button className="primary" disabled={posting}>Post comment</button>
          </div>
        </form>}
        {loading ? <p role="status">Loading…</p> : isComments
          ? <ul className="activity-list">
            {comments.map((item) => <li key={item.id}>
              <strong>{item.author_name}</strong>
              {item.quote && <button className="comment-quote comment-link" aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setMessage(highlightComment(editor, item.anchor, item.quote ?? "", true)
                    ? "" : "That passage is no longer available in the document.");
                }}>{item.quote}</button>}
              <p className="whitespace-pre-wrap break-words">{item.body}</p>
            </li>)}
            {!comments.length && <li>No comments yet.</li>}
          </ul>
          : <div className="activity-list">
            {versions.map((version) => <button key={version.bucket} className="version-row" onClick={() => void previewVersion(version)}>
              <span>{version.title}</span><time dateTime={version.saved_at}>{new Date(version.saved_at).toLocaleString()}</time>
            </button>)}
            {!versions.length && <p>No versions yet.</p>}
            {preview && <div className="version-preview">
              <pre>{generateText(preview.content, extensions)}</pre>
              <button className="primary" disabled={posting} onClick={() => void restoreVersion()}>Restore this version</button>
            </div>}
          </div>}
  </aside>;
}
