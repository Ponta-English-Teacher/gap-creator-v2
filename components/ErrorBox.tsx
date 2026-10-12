import type { ApiError } from "@/lib/postJson";

/** Friendly message for teachers; technical detail (development only) behind a toggle. */
export default function ErrorBox({ error }: { error: ApiError | { message: string; detail?: string } }) {
  return (
    <div className="notice notice-error" role="alert">
      <strong>{error.message}</strong>
      {error.detail && (
        <details>
          <summary>Technical details</summary>
          <pre>{error.detail}</pre>
        </details>
      )}
    </div>
  );
}
