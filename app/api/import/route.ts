import { importDocument, maxFileBytes, supportedExtensions } from "../../../lib/import-document";
import { connectSupabase } from "../../../lib/supabase";

export async function POST(request: Request) {
  const supabase = connectSupabase(false);
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const signedIn = token && (await supabase.auth.getUser(token)).data.user;
  if (!signedIn) return Response.json({ error: "Sign in to import a document." }, { status: 401 });

  const extension = supportedExtensions.find((value) => value === request.headers.get("x-file-extension"));
  if (!extension) return Response.json({ error: "Choose a .txt, .md, or .docx file." }, { status: 415 });

  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxFileBytes) {
        await reader.cancel();
        return Response.json({ error: "Choose a file up to 1 MB." }, { status: 413 });
      }
      chunks.push(value);
    }
    return Response.json(await importDocument(Buffer.concat(chunks), extension));
  } catch {
    return Response.json({ error: "This file couldn’t be read. Check its format and try again." }, { status: 422 });
  }
}
