import {
  Document, HeadingLevel, LevelFormat, PageBreak, Packer, Paragraph, TextRun,
  type INumberingOptions, type IParagraphOptions, type ParagraphChild,
} from "docx";
import type { JSONContent } from "@tiptap/react";
import { paperSizes, type PaperSize } from "./document-formats";

const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function inline(node: JSONContent): ParagraphChild[] {
  if (node.type === "pageBreak") return [new PageBreak()];
  if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
  if (node.type !== "text") return [];
  const marks = new Set(node.marks?.map((mark) => mark.type));
  return [new TextRun({
    text: node.text ?? "",
    bold: marks.has("bold"),
    italics: marks.has("italic"),
    strike: marks.has("strike"),
    underline: marks.has("underline") ? {} : undefined,
    font: marks.has("code") ? "Consolas" : undefined,
  })];
}

export function exportWord(content: JSONContent, size: PaperSize) {
  const numbering: INumberingOptions["config"][number][] = [];

  function blocks(nodes: JSONContent[], depth = 0): Paragraph[] {
    return nodes.flatMap((node) => {
      if (node.type === "bulletList" || node.type === "orderedList") {
        const level = Math.min(depth, 8);
        const reference = `list-${numbering.length}`;
        if (node.type === "orderedList") {
          numbering.push({ reference, levels: [{ level, format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`, start: Number(node.attrs?.start) || 1,
            style: { paragraph: { indent: { left: (level + 1) * 360, hanging: 260 } } },
          }] });
        }
        const list: IParagraphOptions = node.type === "orderedList"
          ? { numbering: { reference, level } } : { bullet: { level } };
        return (node.content ?? []).flatMap((item) => {
          const [first, ...rest] = item.content ?? [];
          return [new Paragraph({ ...list, children: first?.content?.flatMap(inline) }),
            ...blocks(rest, depth + 1)];
        });
      }
      if (node.type === "blockquote") return blocks(node.content ?? [], depth);
      if (node.type === "horizontalRule") return [new Paragraph({ thematicBreak: true })];
      const heading = node.type === "heading" ? headings[Number(node.attrs?.level) - 1] : undefined;
      return [new Paragraph({ heading, children: node.content?.flatMap(inline) })];
    });
  }

  const children = blocks(content.content ?? []);
  return Packer.toBlob(new Document({
    numbering: { config: numbering },
    sections: [{ properties: { page: { size: paperSizes[size] } }, children }],
  }));
}
