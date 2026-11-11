import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import { createRelativePositionFromJSON, relativePositionToJSON } from "yjs";

export const pagesKey = new PluginKey<DecorationSet>("paperPages");
const commentsKey = new PluginKey<DecorationSet>("commentHighlight");

export const editorOverlays = Extension.create({
  name: "editorOverlays",
  addProseMirrorPlugins() {
    return [pagesKey, commentsKey].map((key) => new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply: (transaction, previous) => {
          const next = transaction.getMeta(key) as Decoration[] | undefined;
          return next ? DecorationSet.create(transaction.doc, next) : previous.map(transaction.mapping, transaction.doc);
        },
      },
      props: { decorations: (state) => key.getState(state) },
    }));
  },
});

export type CommentAnchor = { start: unknown; end: unknown };

export function captureCommentSelection(editor: Editor) {
  const { from, to } = editor.state.selection;
  const quote = editor.state.doc.textBetween(from, to, " ").slice(0, 400);
  const sync = ySyncPluginKey.getState(editor.state);
  if (!quote.trim() || !sync || from === to) return { quote, anchor: null };
  const relative = (position: number) => relativePositionToJSON(
    absolutePositionToRelativePosition(position, sync.type, sync.binding.mapping),
  );
  return { quote, anchor: { start: relative(from), end: relative(to) } };
}

export function highlightComment(editor: Editor, anchor: CommentAnchor | null, quote = "", scroll = false) {
  const sync = ySyncPluginKey.getState(editor.state);
  let range: { from: number; to: number } | undefined;
  if (anchor && sync) {
    try {
      const resolve = (value: unknown) => relativePositionToAbsolutePosition(
        sync.doc, sync.type, createRelativePositionFromJSON(value), sync.binding.mapping,
      );
      const from = resolve(anchor.start);
      const to = resolve(anchor.end);
      if (from !== null && to !== null && from < to && to <= editor.state.doc.content.size) range = { from, to };
    } catch {
      // Invalid or obsolete anchors have no corresponding text.
    }
  } else if (quote) {
    const matches: NonNullable<typeof range>[] = [];
    editor.state.doc.descendants((node, position) => {
      if (!node.isTextblock) return;
      const content = node.textBetween(0, node.content.size, "", "\ufffc");
      const match = content.indexOf(quote);
      if (match >= 0) {
        matches.push({ from: position + 1 + match, to: position + 1 + match + quote.length });
        if (content.indexOf(quote, match + 1) >= 0) matches.push(matches[matches.length - 1]);
      }
      return false;
    });
    if (matches.length === 1) range = matches[0];
  }
  const decoration = range ? [Decoration.inline(range.from, range.to, { class: "comment-highlight" })] : [];
  editor.view.dispatch(editor.state.tr.setMeta(commentsKey, decoration));
  if (range && scroll) {
    editor.view.dom.querySelector(".comment-highlight")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return !!range;
}
