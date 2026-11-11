"use client";

import { EditorContent, Extension, useEditor, useEditorState } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Markdown } from "@tiptap/markdown";
import { yCursorPlugin } from "@tiptap/y-tiptap";
import * as Toolbar from "@radix-ui/react-toolbar";
import { useEffect, useState, type CSSProperties } from "react";
import type { Awareness } from "y-protocols/awareness";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Doc } from "yjs";
import { Bold, Italic, Underline, List, ListOrdered, Undo2, Redo2, Download, FilePlus2, Scan, Trash2, History, MessageSquare } from "lucide-react";
import { documentField, extensions } from "../lib/collaboration";
import { defaultPaperSize, downloadName, fileFormats, formats, paperSizes, type FileFormat, type PaperSize } from "../lib/document-formats";
import { FormatMenu } from "./format-menu";
import { DocumentActivity } from "./document-activity";
import { usePaperLayout } from "./use-paper-layout";
import { editorOverlays } from "./editor-overlays";

export function DocumentEditor({ document, awareness, format, title, client, id, onRestoreTitle, canDelete, onDelete }: {
  document: Doc; awareness: Awareness; format: FileFormat; title: string;
  client: SupabaseClient; id: string; onRestoreTitle: (title: string) => void;
  canDelete: boolean; onDelete?: () => void;
}) {
  const [paper, setPaper] = useState<PaperSize>(defaultPaperSize);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [panel, setPanel] = useState<"comments" | "history" | null>(null);
  const settings = document.getMap<string>("page-setup");

  useEffect(() => {
    function syncPaper() {
      const value = settings.get("paper");
      setPaper(value && Object.hasOwn(paperSizes, value) ? value as PaperSize : defaultPaperSize);
    }
    syncPaper();
    settings.observe(syncPaper);
    return () => settings.unobserve(syncPaper);
  }, [settings]);

  const editor = useEditor({
    extensions: [
      ...extensions,
      Markdown,
      Collaboration.configure({ document, field: documentField }),
      editorOverlays,
      Extension.create({ name: "remoteCursors", addProseMirrorPlugins: () => [yCursorPlugin(awareness)] }),
    ],
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": "Document content", role: "textbox", "aria-multiline": "true" } },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      heading: [1, 2, 3, 4, 5, 6].find((level) => editor?.isActive("heading", { level })) ?? 0,
      marks: ["bold", "italic", "underline", "bulletList", "orderedList"].map((mark) => editor?.isActive(mark) ?? false),
      undo: editor?.can().undo(),
      redo: editor?.can().redo(),
    }),
  });
  usePaperLayout(editor, paper, format === "docx");
  if (!editor || !state) return null;

  function printPdf() {
    const page = paperSizes[paper];
    const style = window.document.createElement("style");
    style.textContent = `@page { size: ${page.width / 1440}in ${page.height / 1440}in; margin: 0.75in; }`;
    window.document.head.append(style);
    const previousTitle = window.document.title;
    window.document.title = downloadName(title, "docx").slice(0, -5);
    try {
      window.print();
    } finally {
      window.document.title = previousTitle;
      style.remove();
    }
  }

  async function download(target: FileFormat) {
    if (!editor) return;
    setExporting(true);
    setExportError("");
    try {
      let file: Blob;
      if (target === "docx") {
        const content = editor.getJSON();
        const { exportWord } = await import("../lib/export-word");
        file = await exportWord(content, paper);
      } else {
        const text = target === "md" ? editor.getMarkdown() : editor.getText({
          blockSeparator: "\n", textSerializers: { pageBreak: () => "\n\n" },
        });
        file = new Blob([text], { type: target === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
      }
      const url = URL.createObjectURL(file);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = downloadName(title, target);
      window.document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("Couldn’t download the document. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const buttons = [
    { label: "Bold", Icon: Bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", Icon: Italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Underline", Icon: Underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Bulleted list", Icon: List, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", Icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  return <>
    <div className="editor-tools flex flex-wrap items-center justify-center gap-2 px-3 py-2">
    <Toolbar.Root className="toolbar flex flex-wrap items-center justify-center gap-1" aria-label="Formatting">
      <select aria-label="Paragraph style" value={state.heading} onChange={(event) => {
        const level = Number(event.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        const chain = editor.chain().focus();
        if (level) chain.setHeading({ level }).run();
        else chain.setParagraph().run();
      }}>
        <option value={0}>Normal text</option>
        {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Heading {level}</option>)}
      </select>
      <span className="divider" />
      {buttons.map(({ label, Icon, run }, i) => <Toolbar.Button className="icon" key={label} type="button"
        aria-pressed={state.marks[i]} aria-label={label} title={label} onClick={run}><Icon size={17} /></Toolbar.Button>)}
      <span className="divider" />
      <Toolbar.Button className="icon" aria-label="Undo" title="Undo" disabled={!state.undo}
        onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></Toolbar.Button>
      <Toolbar.Button className="icon" aria-label="Redo" title="Redo" disabled={!state.redo}
        onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></Toolbar.Button>
      {format === "docx" && <Toolbar.Button className="icon" aria-label="Insert page break" title="Insert page break"
        onClick={() => editor.chain().focus().insertContent({ type: "pageBreak" }).run()}>
        <FilePlus2 size={17} />
      </Toolbar.Button>}
    </Toolbar.Root>
    <div className="flex flex-wrap items-center justify-center gap-2">
      {format === "docx" && <FormatMenu label="Paper size" items={Object.keys(paperSizes).map((size) => ({
        value: size, label: size, selected: size === paper,
      }))} onSelect={(value) => settings.set("paper", value)}>
        <Scan size={16} /> {paper}
      </FormatMenu>}
      <button className="icon" aria-label="Comments" title="Comments" aria-expanded={panel === "comments"}
        onClick={() => setPanel(panel === "comments" ? null : "comments")}><MessageSquare size={17} /></button>
      <button className="icon" aria-label="Version history" title="Version history" aria-expanded={panel === "history"}
        onClick={() => setPanel(panel === "history" ? null : "history")}><History size={17} /></button>
      <FormatMenu label="Download document" disabled={exporting}
        items={[...[format, ...fileFormats.filter((value) => value !== format)].map((value) => ({
          value, label: formats[value], detail: value,
        })), { value: "pdf", label: "Save as PDF", detail: "pdf" }]}
        onSelect={(value) => {
          if (value === "pdf") setTimeout(printPdf, 0);
          else void download(value as FileFormat);
        }}>
        <Download size={16} /> {exporting ? "Exporting…" : "Download"}
      </FormatMenu>
      {canDelete && <button className="icon delete-button" disabled={!onDelete} onClick={onDelete}
        title="Delete document" aria-label="Delete document"><Trash2 size={17} /></button>}
    </div>
    </div>
    {exportError && <p className="editor-error" role="alert">{exportError}</p>}
    <div className={panel ? "editor-workspace with-activity" : "editor-workspace"}>
    <div className="writing-area" style={format === "docx" ? {
      "--sheet-width": `${paperSizes[paper].width / 1440}in`,
      "--sheet-height": `${paperSizes[paper].height / 1440}in`,
    } as CSSProperties : undefined}><EditorContent editor={editor} className="paper" /></div>
    {panel && <DocumentActivity key={panel} mode={panel} client={client} id={id} editor={editor}
      onRestoreTitle={onRestoreTitle} onClose={() => setPanel(null)} />}
    </div>
  </>;
}
