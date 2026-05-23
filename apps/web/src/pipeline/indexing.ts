import {
  listActiveImages,
  listImages,
  storeArtifact,
  updateImageIndex,
} from "@/db/repository";
import { downloadBlobBytes, putTextArtifact } from "@/storage/blob";
import { dimensions, sha256 } from "@/storage/image";

export async function indexImages(runId: string) {
  const uploaded = await listImages(runId);
  if (uploaded.length === 0) throw new Error("No uploaded images found");

  const seen = new Map<string, string>();
  let activeIndex = 0;

  for (const image of uploaded) {
    const bytes = await downloadBlobBytes(image.pathname);
    const digest = sha256(bytes);
    const size = dimensions(bytes);
    const duplicateOfImageId = seen.get(digest) ?? null;
    const imageId = duplicateOfImageId
      ? null
      : `img_${String(++activeIndex).padStart(4, "0")}`;
    if (imageId) seen.set(digest, imageId);
    await updateImageIndex({
      rowId: image.id,
      imageId,
      sha256: digest,
      width: size.width,
      height: size.height,
      isDuplicate: Boolean(duplicateOfImageId),
      duplicateOfImageId,
    });
  }

  const active = await listActiveImages(runId);
  const rows = active.map((image) =>
    JSON.stringify({
      id: image.imageId,
      path: image.pathname,
      basename: image.basename,
      sha256: image.sha256,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    }),
  );
  const content = `${rows.join("\n")}${rows.length ? "\n" : ""}`;
  const stored = await putTextArtifact(`runs/${runId}/01-corpus/images.jsonl`, content);
  await storeArtifact({
    runId,
    type: "corpus_index",
    pathname: stored.pathname,
    blobUrl: stored.blobUrl,
    content,
    bytes: stored.bytes,
  });
  return active;
}
