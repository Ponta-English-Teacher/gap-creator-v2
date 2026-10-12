"use client";

import { catchError, type ErrorInfo } from "next/error";

/**
 * Keeps a display problem inside one part of the page, so the teacher does not lose the
 * generated activity (it only lives in this browser tab) and can still share it or read the rest.
 */
function Fallback(props: { what: string }, { error, retry }: ErrorInfo) {
  return (
    <div className="notice notice-error" role="alert">
      <strong>{props.what} could not be shown.</strong>
      <p>
        The rest of the activity is not affected. If the app was updated while this page was open, reload the page and generate the
        activity again.
      </p>
      <button type="button" className="button button-small" onClick={() => retry()}>
        Try again
      </button>
      <details>
        <summary>Technical details</summary>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </details>
    </div>
  );
}

export default catchError(Fallback);
