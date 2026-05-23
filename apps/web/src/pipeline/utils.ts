import { redactSecrets } from "@/credentials/redact";
import { getRun } from "@/db/repository";

export async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const limit = Math.max(1, Math.min(items.length, concurrency));
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}

export class AdaptiveLimiter {
  private active = 0;
  private limit: number;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxLimit: number) {
    this.limit = Math.max(1, maxLimit);
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const result = await operation();
      this.limit = Math.min(this.maxLimit, this.limit + 1);
      return result;
    } catch (error) {
      if (isThrottleLike(error)) {
        this.limit = Math.max(1, Math.floor(this.limit / 2));
      }
      throw error;
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

export function createRunAbortWatcher(runId: string) {
  const controller = new AbortController();
  const interval = setInterval(async () => {
    try {
      const run = await getRun(runId);
      if (!run || run.status === "canceled") controller.abort();
    } catch {
      controller.abort();
    }
  }, 2000);
  interval.unref?.();
  return {
    signal: controller.signal,
    dispose: () => clearInterval(interval),
  };
}

export function withFrontmatter(metadata: Record<string, unknown>, body: string): string {
  return [
    "---",
    ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
}

export function providerFromModel(model: string): string {
  if (model.startsWith("anthropic/")) return "anthropic";
  if (model.startsWith("openai/")) return "openai";
  return model.split("/")[0] ?? "unknown";
}

export function softFailedGenerationResult(message: string, error: unknown, evidence = "") {
  const errorText = errorMessage(error);
  return {
    text: [
      message,
      "",
      "This is a soft-failure artifact. The pipeline should continue, but downstream synthesis should treat this as lower-confidence evidence and prefer successful model outputs.",
      "",
      `Error: ${errorText}`,
      evidence ? `\nRaw evidence:\n${evidence.slice(0, 12_000)}` : "",
    ].join("\n").trim(),
    model: "soft-failure",
    usage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
  };
}

export function errorMessage(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error));
}

function isThrottleLike(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}
