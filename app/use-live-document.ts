"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JSONContent } from "@tiptap/react";
import { Doc } from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { documentContent, encodeDocument, mergeDocument, seedDocument } from "../lib/collaboration";

export type DocumentSnapshot = {
  id: string;
  title: string;
  content: JSONContent;
  revision: number;
  collaboration_state: string | null;
};

type Viewer = { id: string; name: string; typing: boolean };
type Presence = Pick<Viewer, "id" | "name"> & { clientId: number };
const cursorColors = ["#315cce", "#943b94", "#09735e", "#ad4b18"];
const fields = "id, title, content, revision, collaboration_state";
export function useLiveDocument(client: SupabaseClient, id: string, initialTitle: string, userId: string, email: string) {
  const [editorSession, setEditorSession] = useState<{ document: Doc; awareness: Awareness } | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const controls = useRef<{ title: (value: string) => void; save: () => void } | null>(null);

  useEffect(() => {
    const shared = new Doc();
    const awareness = new Awareness(shared);
    const colorIndex = Number.parseInt(userId.slice(0, 2), 16) % cursorColors.length;
    awareness.setLocalStateField("user", { name: email.split("@")[0], color: cursorColors[colorIndex] ?? cursorColors[0] });
    let active = true;
    let ready = false;
    let revision = -1;
    let joined = false;
    let saving = false;
    let edits = 0;
    let savedEdits = 0;
    let draftTitle: string | undefined;
    let remoteTitle = initialTitle;
    let typing = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    const typingClients = new Set<number>();
    let cursorTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = client.channel(`document:${id}`, { config: { private: true } });

    async function read() {
      const result = await client.from("documents").select(fields).eq("id", id).single();
      if (result.error) throw result.error;
      return result.data as DocumentSnapshot;
    }

    function receive(row: DocumentSnapshot) {
      if (!active || row.revision < revision || !row.collaboration_state) return;
      if (row.revision > revision) mergeDocument(shared, row.collaboration_state);
      revision = row.revision;
      remoteTitle = row.title;
      if (draftTitle === undefined) setTitle(remoteTitle);
    }

    async function write(expected: number, values: Partial<DocumentSnapshot>) {
      const result = await client.from("documents").update(values)
        .eq("id", id).eq("revision", expected).select(fields).maybeSingle();
      if (result.error) throw result.error;
      return result.data as DocumentSnapshot | null;
    }

    async function sync() {
      try {
        const row = await read();
        receive(row);
      } catch {
        // The next Realtime event or periodic sync retries a missed read.
      }
    }

    function publishViewers() {
      const online = new Map<string, Viewer>();
      const present = new Set([awareness.clientID]);
      for (const viewer of Object.values(channel.presenceState<Presence>()).flat()) {
        if (typeof viewer.id !== "string" || typeof viewer.name !== "string") continue;
        present.add(viewer.clientId);
        const isTyping = typingClients.has(viewer.clientId) || !!online.get(viewer.id)?.typing;
        online.set(viewer.id, { ...viewer, typing: isTyping });
      }
      for (const id of typingClients) {
        if (!present.has(id)) typingClients.delete(id);
      }
      removeAwarenessStates(awareness, [...awareness.getStates().keys()].filter((id) => !present.has(id)), channel);
      setViewers([...online.values()]);
    }

    function queueCursor() {
      if (!active || !joined || cursorTimer) return;
      cursorTimer = setTimeout(() => {
        cursorTimer = undefined;
        if (!joined) return;
        const cursor = Array.from(encodeAwarenessUpdate(awareness, [awareness.clientID]));
        void channel.send({
          type: "broadcast", event: "cursor", payload: { clientId: awareness.clientID, cursor, typing },
        });
      }, 120);
    }

    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if ([...added, ...updated, ...removed].includes(awareness.clientID)) queueCursor();
    });

    function visibilityChanged() {
      if (window.document.visibilityState === "visible") {
        void sync();
      } else {
        typing = false;
        typingClients.delete(awareness.clientID);
        publishViewers();
        awareness.setLocalStateField("cursor", null);
        queueCursor();
      }
    }

    function scheduleSave(delay = 240) {
      if (saveTimer || saving) return;
      saveTimer = setTimeout(() => {
        saveTimer = undefined;
        void save();
      }, delay);
    }

    function onUpdate(_update: Uint8Array, _origin: unknown, _doc: Doc, transaction: { local: boolean }) {
      if (!ready || !transaction.local) return;
      edits++;
      setPending(true);
      if (!typing) {
        typing = true;
        typingClients.add(awareness.clientID);
        publishViewers();
        queueCursor();
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        typing = false;
        typingClients.delete(awareness.clientID);
        publishViewers();
        queueCursor();
      }, 1400);
      scheduleSave();
    }

    async function save() {
      if (!active || !ready || saving || (edits === savedEdits && draftTitle === undefined)) return;
      saving = true;
      try {
        for (let attempt = 0; active && attempt < 6; attempt++) {
          const cleanTitle = draftTitle?.trim();
          const editCount = edits;
          if (editCount === savedEdits && !cleanTitle) return;
          const row = await write(revision, {
            ...(cleanTitle ? { title: cleanTitle } : {}),
            content: documentContent(shared),
            collaboration_state: encodeDocument(shared),
          });
          if (!active) return;
          if (row) {
            savedEdits = editCount;
            if (cleanTitle && draftTitle?.trim() === cleanTitle) draftTitle = undefined;
            receive(row);
            if (draftTitle === undefined) setTitle(remoteTitle);
            setPending(edits !== savedEdits || draftTitle !== undefined);
            setError("");
            return;
          }
          receive(await read());
        }
        throw new Error("Concurrent save retry limit reached.");
      } catch {
        if (active) setError("Changes are still here. Reconnecting and retrying the save…");
      } finally {
        saving = false;
        if (active && (edits !== savedEdits || draftTitle?.trim())) scheduleSave(900);
      }
    }

    async function start() {
      try {
        let row = await read();
        if (!active) return;
        if (!row.collaboration_state) {
          const seed = seedDocument(row.content);
          const collaboration_state = encodeDocument(seed);
          seed.destroy();
          row = await write(row.revision, { collaboration_state }) ?? await read();
        }
        if (!active) return;
        if (!row.collaboration_state) throw new Error("Missing collaboration state.");
        receive(row);
        ready = true;
        setEditorSession({ document: shared, awareness });
        shared.on("update", onUpdate);

        channel.on("presence", { event: "sync" }, () => {
          if (!active) return;
          publishViewers();
          queueCursor();
        }).on("broadcast", { event: "cursor" }, ({ payload }) => {
          if (!active || !payload) return;
          const { clientId, cursor, typing } = payload;
          const known = Object.values(channel.presenceState<Presence>()).some((entries) =>
            entries.some((viewer) => viewer.clientId === clientId));
          if (!known || clientId === awareness.clientID || !Array.isArray(cursor) || cursor.length > 2048) return;
          try {
            applyAwarenessUpdate(awareness, Uint8Array.from(cursor), channel);
          } catch {
            return;
          }
          if (typing === true) typingClients.add(clientId);
          else typingClients.delete(clientId);
          publishViewers();
        }).on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "documents", filter: `id=eq.${id}`,
        }, ({ new: row }) => {
          if (typeof row.collaboration_state === "string") receive(row as DocumentSnapshot);
          else void sync();
        }).subscribe((status) => {
          if (!active) return;
          joined = status === "SUBSCRIBED";
          setConnected(joined);
          if (joined) {
            void channel.track({ id: userId, name: email, clientId: awareness.clientID });
            awareness.setLocalState(awareness.getLocalState());
            queueCursor();
            void sync();
          }
          else {
            typingClients.clear();
            setViewers([]);
            removeAwarenessStates(awareness, [...awareness.getStates().keys()].filter((id) => id !== awareness.clientID), channel);
          }
        });
      } catch {
        if (active) setError("Live editing couldn’t start. Check the Realtime setup and reopen the document.");
      }
    }

    controls.current = {
      title: (value) => {
        draftTitle = value;
        setTitle(value);
        setPending(true);
        if (value.trim()) scheduleSave(500);
      },
      save: () => void save(),
    };
    void start();
    const refresh = setInterval(() => { if (ready) void sync(); }, 10000);
    window.document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active = false;
      controls.current = null;
      clearTimeout(saveTimer);
      clearTimeout(typingTimer);
      clearTimeout(cursorTimer);
      clearInterval(refresh);
      window.document.removeEventListener("visibilitychange", visibilityChanged);
      void client.removeChannel(channel);
      shared.destroy();
    };
  }, [client, id, userId, email, initialTitle]);

  return {
    editorSession, title, pending, connected, error, viewers,
    setTitle: (value: string) => controls.current?.title(value),
    save: () => controls.current?.save(),
  };
}
