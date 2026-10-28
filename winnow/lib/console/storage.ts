/**
 * Where uploaded files live. Production: a private Vercel Blob store (CVs are
 * personal data, never public). Local development: .data/files.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { del, get, put } from "@vercel/blob";

const blob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const storageConfigured = () => blob() || !process.env.VERCEL;

export async function putFile(key: string, data: Buffer, contentType: string): Promise<string> {
  if (blob()) {
    const r = await put(key, data, { access: "private", contentType, addRandomSuffix: true });
    return r.url;
  }
  if (process.env.VERCEL) throw new Error("File storage is not set up yet (BLOB_READ_WRITE_TOKEN).");
  const path = join(".data/files", key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return `local:${key}`;
}

export async function readStoredFile(url: string): Promise<Buffer> {
  if (url.startsWith("local:")) return readFileSync(join(".data/files", url.slice(6)));
  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error("The file could not be found in storage.");
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

export async function deleteStoredFile(url: string) {
  if (url.startsWith("local:")) rmSync(join(".data/files", url.slice(6)), { force: true });
  else await del(url);
}
