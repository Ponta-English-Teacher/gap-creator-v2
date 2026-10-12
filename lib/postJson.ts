/** Browser-side helper for calling our own API routes. */

export class ApiError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) {
    throw new ApiError("Could not reach the server. Is the app still running?", String(err));
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new ApiError(json?.error ?? `The server returned an error (${res.status}).`, json?.detail);
  }
  return json as T;
}
