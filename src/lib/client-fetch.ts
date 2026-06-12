const inflightGetRequests = new Map<string, Promise<Response>>();

function requestKey(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  try {
    const options = {
      ...init,
      credentials: init?.credentials ?? "same-origin",
    } satisfies RequestInit;
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    if (method !== "GET" || init?.signal) {
      return await fetch(input, options);
    }

    const key = requestKey(input);
    const existing = inflightGetRequests.get(key);
    if (existing) {
      return (await existing).clone();
    }

    const request = fetch(input, options);
    inflightGetRequests.set(key, request);
    try {
      return (await request).clone();
    } finally {
      if (inflightGetRequests.get(key) === request) {
        inflightGetRequests.delete(key);
      }
    }
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
