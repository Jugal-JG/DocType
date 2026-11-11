import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { Decoration } from "@tiptap/pm/view";
import { paperSizes, type PaperSize } from "../lib/document-formats";
import { pagesKey } from "./editor-overlays";

const pageGap = 22;
type Line = { top: number; bottom: number; position: number };
type ManualBreak = { top: number; marker: HTMLElement };

function textLines(editor: Editor): Line[] {
  const root = editor.view.dom;
  const lines: Line[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let child = walker.nextNode(); child; child = walker.nextNode()) {
    const node = child as Text;
    if (!node.length || node.parentElement?.closest('[contenteditable="false"]')) continue;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
    rects.forEach((rect, index) => {
      let low = 0;
      let high = index === 0 ? 0 : node.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        range.setStart(node, middle);
        range.setEnd(node, middle + 1);
        if (range.getBoundingClientRect().top < rect.top - 1) low = middle + 1;
        else high = middle;
      }
      lines.push({ top: rect.top, bottom: rect.bottom, position: editor.view.posAtDOM(node, low) });
    });
  }
  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock || node.content.size) return;
    const element = editor.view.nodeDOM(position);
    if (element instanceof HTMLElement) {
      const rect = element.getBoundingClientRect();
      lines.push({ top: rect.top, bottom: rect.bottom, position: position + 1 });
    }
    return false;
  });
  const grouped: Line[] = [];
  for (const line of lines.sort((a, b) => a.top - b.top || a.position - b.position)) {
    const previous = grouped[grouped.length - 1];
    if (previous && line.top < previous.bottom - 3) {
      previous.bottom = Math.max(previous.bottom, line.bottom);
      previous.position = Math.min(previous.position, line.position);
    } else grouped.push(line);
  }
  return grouped;
}

export function usePaperLayout(editor: Editor | null, paper: PaperSize, paged: boolean) {
  useEffect(() => {
    if (!editor || !paged) return;
    const view = editor.view;
    const root = view.dom;
    const size = paperSizes[paper];
    let frame = 0;
    let observedWidth = 0;
    let previousLayout = "";

    function layout() {
      const pageHeight = root.clientWidth * size.height / size.width;
      if (!pageHeight || view.isDestroyed) return;
      const origin = root.getBoundingClientRect().top;
      const padding = Number.parseFloat(getComputedStyle(root).paddingTop);
      root.classList.add("measuring-pages");
      let flow: (Line | ManualBreak)[];
      try {
        flow = [
          ...textLines(editor!),
          ...[...root.querySelectorAll<HTMLElement>("[data-page-break]")].map((marker) => ({
            marker, top: marker.getBoundingClientRect().top,
          })),
        ].sort((a, b) => a.top - b.top || Number("marker" in b) - Number("marker" in a));
      } finally {
        root.classList.remove("measuring-pages");
      }

      let pageTop = 0;
      let offset = 0;
      const breaks: { position: number; space: number }[] = [];
      for (const item of flow) {
        const y = item.top - origin + offset;
        const manual = "marker" in item;
        if (!manual && (item.bottom - origin + offset <= pageTop + pageHeight - padding ||
                        y <= pageTop + padding + 2)) continue;

        const space = Math.max(0, Math.round(pageTop + pageHeight - y));
        if (manual) item.marker.style.setProperty("--end-space", `${space}px`);
        else breaks.push({ position: item.position, space });
        offset += space + pageGap + padding;
        pageTop = y + space + pageGap;
      }
      root.style.setProperty("--paper-height", `${Math.ceil(pageTop + pageHeight)}px`);
      const signature = JSON.stringify(breaks);
      if (signature === previousLayout && pagesKey.getState(view.state)?.find().length === breaks.length) return;
      previousLayout = signature;
      const widgets = breaks.map(({ position, space }) => Decoration.widget(position, () => {
        const marker = document.createElement("span");
        marker.dataset.autoPage = "";
        marker.setAttribute("aria-hidden", "true");
        marker.contentEditable = "false";
        marker.style.setProperty("--end-space", `${space}px`);
        return marker;
      }, { side: -1, key: `${position}:${space}`, ignoreSelection: true }));
      view.dispatch(view.state.tr.setMeta(pagesKey, widgets));
    }

    function queue() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }
    const observer = new ResizeObserver(() => {
      if (observedWidth === root.clientWidth) return;
      observedWidth = root.clientWidth;
      queue();
    });
    observer.observe(root);
    editor.on("update", queue);
    queue();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("update", queue);
    };
  }, [editor, paper, paged]);
}
