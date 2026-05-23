import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { LabSession } from "./types";

const LAB_DIR_NAME = ".taste-lab";

export async function readLabSession(sessionId: string): Promise<LabSession> {
  const file = sessionFile(sessionId);
  const content = await readFile(file, "utf8");
  return JSON.parse(content) as LabSession;
}

export async function writeLabSession(session: LabSession): Promise<void> {
  await mkdir(labRoot(), { recursive: true });
  await writeFile(sessionFile(session.id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function sessionFile(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error("Invalid lab session id.");
  }
  return path.join(labRoot(), `${sessionId}.json`);
}

function labRoot(): string {
  return process.env.TASTE_LAB_DIR ?? path.join(process.cwd(), LAB_DIR_NAME);
}
