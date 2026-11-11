import { getSchema, Node, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { applyUpdate, encodeStateAsUpdate, type Doc } from "yjs";

const PageBreak = Node.create({
  name: "pageBreak",
  inline: true,
  group: "inline",
  atom: true,
  parseHTML: () => [{ tag: "span[data-page-break]" }, { tag: "br[data-page-break]", priority: 60 }],
  renderHTML: () => ["span", { "data-page-break": "", role: "separator", "aria-label": "Page break", contenteditable: "false" }],
  renderMarkdown: () => "\n\n",
});

export const extensions = [StarterKit.configure({ link: false, undoRedo: false }), PageBreak];
export const documentField = "prosemirror";

export function seedDocument(content: JSONContent) {
  return prosemirrorJSONToYDoc(getSchema(extensions), content, documentField);
}

export function documentContent(document: Doc) {
  return yDocToProsemirrorJSON(document, documentField);
}

export function encodeDocument(document: Doc) {
  const bytes = encodeStateAsUpdate(document);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function mergeDocument(document: Doc, state: string) {
  applyUpdate(document, Uint8Array.from(atob(state), (char) => char.charCodeAt(0)));
}
