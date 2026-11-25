import type { TokenPair } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean;
};

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    return "/api";
  }
  return configured.replace(/\/+$/, "");
}

function buildUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { detail?: unknown; message?: unknown; error?: unknown };
      if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0] as { msg?: string };
        if (typeof first?.msg === "string") return first.msg;
      }
      if (typeof data.message === "string" && data.message.trim()) return data.message;
      if (typeof data.error === "string" && data.error.trim()) return data.error;
    }
    const text = await response.text();
    if (text.trim()) return text.trim().slice(0, 200);
  } catch {
    // ignore body parsing failure
  }
  return `Request failed with status ${response.status}`;
}

let refreshPromise: Promise<TokenPair | null> | null = null;

async function refreshSession(): Promise<TokenPair | null> {
  const { refreshToken, setSession, clearSession } = useAuthStore.getState();
  if (!refreshToken) {
    clearSession();
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(buildUrl("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
          clearSession();
          return null;
        }
        const pair = (await res.json()) as TokenPair;
        setSession(pair);
        return pair;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

function buildHeaders(initHeaders: HeadersInit | undefined, body: BodyInit | null | undefined, token: string | null): Headers {
  const headers = new Headers(initHeaders);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuth = false, headers: initHeaders, ...rest } = options;
  const { accessToken } = useAuthStore.getState();

  const url = buildUrl(path);
  let response = await fetch(url, {
    ...rest,
    headers: buildHeaders(initHeaders, rest.body, skipAuth ? null : accessToken),
  });

  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshSession();
    if (refreshed?.access_token) {
      response = await fetch(url, {
        ...rest,
        headers: buildHeaders(initHeaders, rest.body, refreshed.access_token),
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export async function downloadWithAuth(path: string, fallbackFilename: string): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  const url = buildUrl(path);
  let response = await fetch(url, {
    headers: buildHeaders(undefined, undefined, accessToken),
  });

  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed?.access_token) {
      response = await fetch(url, {
        headers: buildHeaders(undefined, undefined, refreshed.access_token),
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
