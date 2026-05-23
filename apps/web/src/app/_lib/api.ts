export type RunCredentials = {
  runId: string;
  runSecret: string;
};

// Pre-create client-side guardrails. The server is the source of truth and
// returns its own caps via CreateRunResponse; these only exist so we can
// reject obviously-invalid selections before a round-trip.
export const PRE_CREATE_IMAGE_CAP = 100;
export const PRE_CREATE_IMAGE_BYTES_CAP = 10 * 1024 * 1024;
export const PRE_CREATE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type CreateRunInput = {
  credentialMode?: "openrouter" | "direct";
  expectedImageCount?: number;
};

export type ManualCredentials = {
  mode: "direct";
  openaiApiKey: string;
  anthropicApiKey: string;
};

export type CreateRunResponse = {
  runId: string;
  runSecret: string;
  credentialMode: "openrouter" | "direct";
  maxImages: number;
  maxImageBytes: number;
  acceptedTypes: string[];
};

export type RunStatusName =
  | "uploading"
  | "queued"
  | "indexing"
  | "analyzing"
  | "synthesizing_notes"
  | "extracting_rules"
  | "generating_skill"
  | "complete"
  | "failed"
  | "canceled";

export type RunStatus = {
  id: string;
  status: RunStatusName;
  currentStep: string;
  errorMessage: string | null;
  progressPercent: number;
  counts: {
    images: number;
    rawAnalyses: number;
    rawAnalysisTotal: number;
    synthesizedNotes: number;
    ruleChunks: number;
    ruleChunkTotal: number;
  };
  artifacts: { skillReady: boolean };
  credentials?: {
    mode: string;
    stored: boolean;
  };
};

export type RunEvent = {
  id: number;
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type RunImage = {
  imageId: string;
  blobUrl: string;
  basename: string;
};

export type CredentialStatus = {
  connected: boolean;
  mode: "openrouter" | "direct" | null;
  source: "openrouter_oauth" | "manual" | null;
  label: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  providers: string[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

type RequestOptions<T> = RequestInit & {
  runSecret?: string;
  parse?: (response: Response) => Promise<T>;
};

async function request<T>(url: string, init: RequestOptions<T> = {}): Promise<T> {
  const { runSecret, parse, headers, ...rest } = init;
  const merged: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (runSecret) merged["x-run-secret"] = runSecret;
  if (rest.body && !merged["Content-Type"]) merged["Content-Type"] = "application/json";
  const response = await fetch(url, { ...rest, headers: merged });
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  if (response.status === 204) return undefined as T;
  if (parse) return parse(response);
  return (await response.json()) as T;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      return data.error;
    }
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof data.error.message === "string"
    ) {
      return data.error.message;
    }
  } catch {
    /* fall through */
  }
  return `Request failed (${response.status})`;
}

export async function createRun(input: CreateRunInput): Promise<CreateRunResponse> {
  return request<CreateRunResponse>("/api/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchCredentialStatus(): Promise<CredentialStatus> {
  return request<CredentialStatus>("/api/credentials");
}

export async function connectManualCredentials(
  credentials: ManualCredentials,
): Promise<CredentialStatus> {
  return request<CredentialStatus>("/api/credentials/manual", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function clearCredentials(): Promise<void> {
  await request("/api/credentials", { method: "DELETE" });
}

export async function createOpenRouterConnectUrl(returnTo = "/"): Promise<string> {
  const data = await request<{ url: string }>(
    `/api/credentials/openrouter/start?format=json&returnTo=${encodeURIComponent(returnTo)}`,
  );
  return data.url;
}

export async function startRun(creds: RunCredentials): Promise<void> {
  await request(`/api/runs/${creds.runId}/start`, {
    method: "POST",
    runSecret: creds.runSecret,
  });
}

export async function cancelRun(creds: RunCredentials): Promise<void> {
  await request(`/api/runs/${creds.runId}/cancel`, {
    method: "POST",
    runSecret: creds.runSecret,
  });
}

export async function fetchRunStatus(creds: RunCredentials): Promise<RunStatus> {
  return request<RunStatus>(`/api/runs/${creds.runId}`, { runSecret: creds.runSecret });
}

export async function fetchRunEvents(
  creds: RunCredentials,
  afterId: number,
): Promise<RunEvent[]> {
  const data = await request<{ events: RunEvent[] }>(
    `/api/runs/${creds.runId}/events?after=${afterId}`,
    { runSecret: creds.runSecret },
  );
  return data.events;
}

export async function fetchRunImages(creds: RunCredentials): Promise<RunImage[]> {
  const data = await request<{ images: RunImage[] }>(`/api/runs/${creds.runId}/images`, {
    runSecret: creds.runSecret,
  });
  return data.images;
}

export async function fetchSkill(creds: RunCredentials): Promise<string> {
  return request<string>(`/api/runs/${creds.runId}/skill`, {
    runSecret: creds.runSecret,
    parse: (response) => response.text(),
  });
}

export const TERMINAL_STATUSES: ReadonlySet<RunStatusName> = new Set([
  "complete",
  "failed",
  "canceled",
]);

export function isTerminal(status: RunStatusName): boolean {
  return TERMINAL_STATUSES.has(status);
}
