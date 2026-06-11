/** fetch آمن من الواجهة — يمنع تعطل الصفحة عند انقطاع الشبكة أو إضافات المتصفح */
export async function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  try {
    return await fetch(input, {
      ...init,
      credentials: init?.credentials ?? "same-origin",
    });
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
