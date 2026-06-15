import type { Page, Stroke, TextItem } from "@/core/types";

export interface SnapshotData {
  v: 1;
  name: string;
  background: Page["background"];
  width: number;
  height: number;
  strokes: Stroke[];
  texts: TextItem[];
}

function toBase64Url(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(pad));
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeSnapshot(
  page: Page,
  strokes: Stroke[],
  texts: TextItem[],
): Promise<string> {
  const data: SnapshotData = {
    v: 1,
    name: page.name,
    background: page.background,
    width: page.width,
    height: page.height,
    strokes,
    texts,
  };

  const json = JSON.stringify(data);
  const encoded = new TextEncoder().encode(json);

  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(encoded);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return toBase64Url(merged.buffer);
  }

  return toBase64Url(encoded.buffer);
}

export async function decodeSnapshot(encoded: string): Promise<SnapshotData> {
  const bytes = fromBase64Url(encoded);

  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      let totalLen = 0;
      for (const c of chunks) totalLen += c.length;
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const json = new TextDecoder().decode(merged);
      return JSON.parse(json) as SnapshotData;
    } catch {
      // Fall through to uncompressed path
    }
  }

  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as SnapshotData;
}
