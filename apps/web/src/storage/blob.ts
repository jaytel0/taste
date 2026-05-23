import { del, get, put } from "@vercel/blob";

import { env } from "@/config";

export async function putTextArtifact(pathname: string, content: string) {
  const blob = await put(pathname, content, {
    access: "private",
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return {
    blobUrl: blob.url,
    pathname: blob.pathname,
    bytes: Buffer.byteLength(content, "utf8"),
  };
}

export async function downloadBlobBytes(pathname: string, maxBytes = env().MAX_IMAGE_BYTES): Promise<Uint8Array> {
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    throw new Error("Blob downloads must use stored pathnames, not arbitrary URLs.");
  }
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Blob not found");
  }
  if (result.blob.size > maxBytes) {
    throw new Error(`Blob exceeds ${maxBytes} bytes`);
  }
  return readStream(result.stream, maxBytes);
}

export async function deleteBlobPathnames(pathnames: string[]) {
  if (pathnames.length === 0) return;
  await del(pathnames);
}

async function readStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Blob exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
