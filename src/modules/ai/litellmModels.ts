import { invoke } from "@tauri-apps/api/core";

export type LiteLLMModel = {
  id: string;
  label: string;
};

type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: number[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ids: string[]; fetchedAt: number }>();

function cacheKey(baseURL: string, apiKey: string | null | undefined): string {
  return `${baseURL.trim()}\0${apiKey?.trim() ?? ""}`;
}

/** OpenAI-compatible `{baseURL}/models` — accepts base with or without `/v1`. */
export function litellmModelsListUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("empty base url");
  if (trimmed.endsWith("/v1")) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

export function parseLiteLLMModelsResponse(body: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("models response is not valid JSON");
  }
  if (!json || typeof json !== "object") {
    throw new Error("models response has unexpected shape");
  }
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new Error("models response missing data array");
  }
  const ids: string[] = [];
  for (const item of data) {
    if (item && typeof item === "object" && "id" in item) {
      const id = (item as { id: unknown }).id;
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function litellmModelsForPicker(
  modelIds: readonly string[],
  currentModelId: string,
): LiteLLMModel[] {
  const id = currentModelId.trim();
  const sorted = [...modelIds].sort((a, b) => a.localeCompare(b));
  const toModel = (mid: string): LiteLLMModel => ({ id: mid, label: mid });
  if (!id) return sorted.map(toModel);
  if (sorted.includes(id)) return sorted.map(toModel);
  return [toModel(id), ...sorted.map(toModel)];
}

export function invalidateLiteLLMModelCache(
  baseURL?: string,
  apiKey?: string | null,
): void {
  if (!baseURL?.trim()) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(baseURL, apiKey));
}

export async function fetchLiteLLMModelIds(
  baseURL: string,
  apiKey?: string | null,
  opts?: { signal?: AbortSignal; allowPrivateNetwork?: boolean; force?: boolean },
): Promise<string[]> {
  const trimmed = baseURL.trim();
  if (!trimmed) return [];

  const key = cacheKey(trimmed, apiKey);
  if (!opts?.force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return hit.ids;
    }
  }

  if (opts?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const url = litellmModelsListUrl(trimmed);
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = apiKey?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await invoke<HttpResponse>("ai_http_request", {
    url,
    method: "GET",
    headers,
    allowPrivateNetwork: opts?.allowPrivateNetwork ?? true,
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`models request failed: HTTP ${resp.status}`);
  }

  const text = new TextDecoder().decode(Uint8Array.from(resp.body));
  const ids = parseLiteLLMModelsResponse(text);
  cache.set(key, { ids, fetchedAt: Date.now() });
  return ids;
}
