"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Lets a student open the self-check page after confirming they have finished.
 * The partner's information is only sent by the server once that page is opened.
 */
export default function CheckAnswers({ href, reveals }: { href: string; reveals: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="check-answers">
      {!asking ? (
        <button type="button" className="button button-large" onClick={() => setAsking(true)}>
          Check Answers
        </button>
      ) : (
        <div className="check-confirm" role="alertdialog" aria-labelledby="check-confirm-title">
          <p id="check-confirm-title" className="check-confirm-title">
            Have you and your partner finished?
          </p>
          <p>You will see {reveals}. Do this only after you have finished speaking.</p>
          <div className="check-confirm-buttons">
            <Link className="button button-primary" href={href}>
              Yes, show {reveals}
            </Link>
            <button type="button" className="button" onClick={() => setAsking(false)}>
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
