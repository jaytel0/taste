#!/usr/bin/env node

import { put } from "@vercel/blob";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.TASTE_BASE_URL ?? "https://taste.jaytel.com";
const referenceDir = resolve(
  process.env.TASTE_REFERENCE_DIR ?? "../../pipeline/taste/01-corpus/reference-images",
);
const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map((file) => resolve(file))
  : await referenceImages(referenceDir);

if (files.length === 0) throw new Error(`No reference images found in ${referenceDir}`);
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required for production E2E uploads");
}
if (!process.env.INTERNAL_API_SECRET) {
  throw new Error("INTERNAL_API_SECRET is required for production E2E upload registration");
}
if (!process.env.TASTE_E2E_OPENAI_API_KEY || !process.env.TASTE_E2E_ANTHROPIC_API_KEY) {
  throw new Error("TASTE_E2E_OPENAI_API_KEY and TASTE_E2E_ANTHROPIC_API_KEY are required");
}

const cookies = [];

await api("/api/credentials/manual", {
  method: "POST",
  body: JSON.stringify({
    mode: "direct",
    openaiApiKey: process.env.TASTE_E2E_OPENAI_API_KEY,
    anthropicApiKey: process.env.TASTE_E2E_ANTHROPIC_API_KEY,
  }),
});

const run = await api("/api/runs", {
  method: "POST",
  body: JSON.stringify({ expectedImageCount: files.length }),
});
console.log(JSON.stringify({ phase: "created", runId: run.runId, maxImages: run.maxImages }));

let order = 0;
for (const file of files) {
  const bytes = await readFile(file);
  const info = await stat(file);
  const name = basename(file);
  const pathname = uploadPathname(run.runId, order, name);
  const blob = await put(pathname, bytes, {
    access: "private",
    contentType: contentTypeFor(file),
    addRandomSuffix: false,
  });
  await api(`/api/runs/${run.runId}/images/complete`, {
    method: "POST",
    headers: {
      "x-run-secret": run.runSecret,
      "x-internal-secret": process.env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify({
      uploadOrder: order,
      basename: name,
      blobUrl: blob.url,
      downloadUrl: "downloadUrl" in blob ? blob.downloadUrl : null,
      pathname: blob.pathname,
      contentType: contentTypeFor(file),
      bytes: info.size,
    }),
  });
  order += 1;
  console.log(JSON.stringify({ phase: "uploaded", order, name }));
}

await api(`/api/runs/${run.runId}/start`, {
  method: "POST",
  headers: { "x-run-secret": run.runSecret },
});
console.log(JSON.stringify({ phase: "started", runId: run.runId }));

let lastStatus = "";
let lastEvent = 0;
const startedAt = Date.now();
while (Date.now() - startedAt < 45 * 60 * 1000) {
  const status = await api(`/api/runs/${run.runId}`, {
    headers: { "x-run-secret": run.runSecret },
  });
  const events = await api(`/api/runs/${run.runId}/events?after=${lastEvent}`, {
    headers: { "x-run-secret": run.runSecret },
  });
  if (events.events?.length) {
    lastEvent = Math.max(lastEvent, ...events.events.map((event) => event.id));
  }
  const line = JSON.stringify({
    phase: "poll",
    runId: run.runId,
    status: status.status,
    progress: status.progressPercent,
    currentStep: status.currentStep,
    counts: status.counts,
    newEvents: events.events?.map((event) => event.message).slice(-5) ?? [],
  });
  if (line !== lastStatus) {
    console.log(line);
    lastStatus = line;
  }
  if (status.status === "complete" && status.artifacts.skillReady) {
    const skillResponse = await fetch(`${base}/api/runs/${run.runId}/skill`, {
      headers: { "x-run-secret": run.runSecret },
    });
    if (!skillResponse.ok) {
      throw new Error(`skill fetch failed ${skillResponse.status}: ${await skillResponse.text()}`);
    }
    const skill = await skillResponse.text();
    if (!skill.includes("---") || skill.length < 1000) {
      throw new Error(`skill output looked invalid, length=${skill.length}`);
    }
    console.log(JSON.stringify({ phase: "complete", runId: run.runId, skillLength: skill.length }));
    process.exit(0);
  }
  if (status.status === "failed" || status.status === "canceled") {
    throw new Error(`Run ended ${status.status}: ${status.errorMessage || status.currentStep}`);
  }
  await sleep(5000);
}

throw new Error(`Timed out waiting for run ${run.runId}`);

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookies.length > 0 ? { Cookie: cookies.join("; ") } : {}),
      ...(init.headers || {}),
    },
  });
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    cookies.push(cookie.split(";")[0]);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} ${response.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function referenceImages(dir) {
  const names = await readdir(dir);
  return names
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => join(dir, name));
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function uploadPathname(runId, uploadOrder, fileName) {
  const paddedOrder = String(uploadOrder + 1).padStart(4, "0");
  const safeName = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `runs/${runId}/${paddedOrder}-${safeName || `image-${paddedOrder}`}`;
}
