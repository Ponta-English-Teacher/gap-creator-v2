"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { ApiError, postJson } from "@/lib/postJson";
import type { ActivitySet } from "@/lib/types";
import ErrorBox from "./ErrorBox";

interface Shared {
  set: ActivitySet; // the exact versions that were shared
  url: string;
  qrSvg: string;
  days: number;
}

/** Stores the approved activity (all versions) and shows one student link + QR code. */
export default function SharePanel({ set }: { set: ActivitySet }) {
  const [shared, setShared] = useState<Shared | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState(false);

  // A new or redrawn activity needs a new link.
  const current = shared?.set === set ? shared : null;
  const onLocalhost = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const missing = set.versions.findIndex((a) => a.type === "picture" && !a.images);
  const multiPair = set.pairCount > 1;

  async function share() {
    setLoading(true);
    setError(null);
    try {
      const { id, days, publicBaseUrl } = await postJson<{ id: string; days: number; publicBaseUrl: string | null }>("/api/share", {
        set,
      });
      const url = `${publicBaseUrl ?? window.location.origin}/activity/${id}`;
      const qrSvg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
      setShared({ set, url, qrSvg, days });
      setCopied(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card share">
      <h2>Share with Students</h2>
      {!current ? (
        <>
          <p>
            When you are happy with this activity, create one link and QR code for the whole class.{" "}
            {multiPair
              ? `On their phones, students choose their Pair number (1–${set.pairCount}), then Student A or Student B. Tell partners to choose the same Pair number.`
              : "Students choose Student A or Student B on their own phone."}
          </p>
          <button className="button button-primary button-large" disabled={loading || missing >= 0} onClick={share}>
            {loading ? "Creating link…" : "Create Student Link"}
          </button>
          {missing >= 0 && (
            <p className="notice notice-warning">
              Draw the pictures{set.versions.length > 1 ? ` for version ${missing + 1}` : ""} before sharing.
            </p>
          )}
          {error && <ErrorBox error={error} />}
        </>
      ) : (
        <div className="share-result">
          {/* The SVG comes from the qrcode library, not from user input. */}
          <div className="qr" aria-label="QR code for the student link" dangerouslySetInnerHTML={{ __html: current.qrSvg }} />
          <div className="share-details">
            <p className="share-url">
              <a href={current.url} target="_blank" rel="noreferrer">
                {current.url}
              </a>
            </p>
            <button
              className="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(current.url).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? "Copied ✓" : "Copy Link"}
            </button>
            <p>This link works for {current.days} days. If you change or regenerate the activity, create a new link.</p>
            {onLocalhost && (
              <p className="notice notice-warning">
                You opened this app at <strong>localhost</strong>, so students’ phones cannot open this link. Open the app using
                your computer’s network address instead (shown as “Network:” when the app starts, e.g.
                http://192.168.1.20:3000), then create the link again.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
