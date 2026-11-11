import mammoth from "mammoth";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { fromBuffer } from "yauzl";
import { fileFormats } from "./document-formats";

export const maxFileBytes = 1024 * 1024;
export const supportedExtensions = fileFormats;
export type ImportExtension = typeof supportedExtensions[number];

function checkWordArchive(buffer: Buffer) {
  return new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      let size = 0;
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        size += entry.uncompressedSize;
        if (size > 8 * maxFileBytes || zip.entryCount > 500) {
          zip.close();
          reject(new Error("Word archive is too large."));
          return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    });
  });
}

export async function importDocument(buffer: Buffer, extension: ImportExtension) {
  if (extension === "txt") return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer) };

  let html: string;
  if (extension === "docx") {
    await checkWordArchive(buffer);
    const result = await mammoth.convertToHtml({ buffer }, {
      externalFileAccess: false,
      ignoreEmptyParagraphs: false,
      styleMap: ["u => u", "br[type='page'] => br[data-page-break='true']:fresh"],
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    });
    html = result.value;
  } else {
    html = await marked.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  }
  return { html: sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b",
        "em", "i", "u", "s", "del", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "span"],
    allowedAttributes: { ol: ["start"], br: ["data-page-break"], span: ["data-page-break"] },
  }) };
}
