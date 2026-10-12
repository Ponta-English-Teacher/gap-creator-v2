"use client";

import { useState } from "react";
import type { ReasonFeedback } from "@/lib/activitySchemas";
import type { DecisionReview } from "@/lib/choice";
import { ApiError, postJson } from "@/lib/postJson";
import type { CefrLevel, Role } from "@/lib/types";
import DecisionReviewView, { StudentFeedback } from "./DecisionReview";
import ErrorBox from "./ErrorBox";

interface Props {
  optionNoun: string;
  options: { name: string; picture?: string }[];
  cefr: CefrLevel;
  /** Individual: this student's own choice. Shared: the one choice the pair agreed on. */
  decision: "individual" | "shared";
  role: Role;
  ja: boolean;
  /** The teacher turned on the AI comment on students' reasons. */
  feedbackOn: boolean;
  /** On a student's phone: the shared activity. The review is fetched only when the student submits. */
  shared?: { id: string; pair?: number };
  /** On the teacher's preview: the reviews this student would get, already in the page. */
  preview?: DecisionReview[];
}

const STARTERS: Record<"individual" | "shared", Record<CefrLevel, string>> = {
  shared: {
    A1: "We choose the ... It looks ... It's ...",
    A2: "We chose the ... because ... It looks ... It's ...er than ...",
    B1: "We chose ... because ... It isn't the ...est, but ...",
    B2: "We went for ... because ... Even though ..., ...",
  },
  individual: {
    A1: "I choose the ... It looks ... It's ...",
    A2: "I chose the ... because ... It looks ... It's ...er than ...",
    B1: "I chose ... because ... It isn't the ...est, but ...",
    B2: "I went for ... because ... Even though ..., ...",
  },
};

/**
 * The end of the activity: ONE option and the reasons for it, in the student's own words.
 * Individual decision: each student submits their own choice. Shared decision: the choice the pair agreed on.
 * The app only ever sees what this one student typed, so it never says that both students agreed.
 * Nothing about the options is revealed until the student confirms and submits.
 */
export default function DecisionForm({ optionNoun, options, cefr, decision, role, ja, feedbackOn, shared, preview }: Props) {
  const own = decision === "individual";
  const [choice, setChoice] = useState<string | null>(null);
  const [reasons, setReasons] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ review: DecisionReview; feedback: (ReasonFeedback & { englishWithheld?: boolean }) | null } | null>(null);

  const words = reasons.trim().split(/\s+/).filter(Boolean).length;
  const ready = choice !== null && words >= 2;

  async function submit() {
    if (!choice) return;
    setError(null);
    if (!shared) {
      const review = preview?.find((r) => r.option === choice);
      if (review) setResult({ review, feedback: null });
      setConfirming(false);
      return;
    }
    setLoading(true);
    try {
      setResult(await postJson("/api/review", { id: shared.id, pair: shared.pair, role, option: choice, reasons }));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }

  if (result)
    return (
      <section className="decision decision-done">
        <h4>Decision Review</h4>
        <div className="decision-yours">
          <p>
            <strong>{own ? "You chose:" : "The choice you sent:"}</strong> {result.review.option}
          </p>
          <p>
            <strong>{own ? "Your reasons:" : "The reasons you sent:"}</strong> {reasons}
          </p>
        </div>
        {(result.feedback || result.review.simple) && <StudentFeedback review={result.review} feedback={result.feedback} ja={ja} />}
        {!shared && feedbackOn && (
          <p className="self-check-note">On students’ phones the card above is written by AI from the student’s own words, and adds “Your English”: their sentence in natural English.</p>
        )}
        {result.review.simple && (cefr === "A1" || cefr === "A2") ? (
          // Beginners read the short card; the full comparison is there for those who want it.
          <details className="review-more">
            <summary>More about this choice</summary>
            <DecisionReviewView review={result.review} ja={ja} />
          </details>
        ) : (
          <DecisionReviewView review={result.review} ja={ja} />
        )}
        <p className="decision-talk">
          {own ? "Now tell your partner what you chose and why. Ask what they chose. Did you choose the same one?" : "Read this with your partner. Do you both still agree with your choice? Why?"}
        </p>
        <button type="button" className="link-button" onClick={() => setResult(null)}>
          {own ? "← Change my choice or reasons" : "← Change our choice or reasons"}
        </button>
      </section>
    );

  return (
    <section className="decision">
      <h4>{own ? "My decision" : "Our decision"}</h4>
      <p>
        {own
          ? "Do this after you have asked your partner all your questions. Choose for yourself: your partner can choose a different one."
          : "Do this after you and your partner have talked and agreed. Both of you enter the same choice."}
      </p>
      <p className="decision-step">
        1. {own ? "I choose" : "We choose"} this {optionNoun}:
      </p>
      <div className="decision-options" role="radiogroup" aria-label={`Your ${optionNoun}`}>
        {options.map((o) => (
          <button key={o.name} type="button" role="radio" aria-checked={choice === o.name} className={choice === o.name ? "selected" : ""} onClick={() => setChoice(o.name)}>
            {o.picture && (
              // eslint-disable-next-line @next/next/no-img-element -- generated or stored option picture
              <img src={o.picture} alt="" />
            )}
            <span>{o.name}</span>
          </button>
        ))}
      </div>
      <label className="decision-step" htmlFor="reasons">
        2. {own ? "My reasons:" : "Our reasons:"}
      </label>
      <textarea id="reasons" className="input textarea" rows={4} maxLength={600} value={reasons} placeholder={STARTERS[decision][cefr] ?? STARTERS[decision].A2} onChange={(e) => setReasons(e.target.value)} />
      <p className="field-hint">{cefr === "A1" || cefr === "A2" ? "Write in your own words. Short sentences are fine." : "Write in your own words. Say what you gained and what you gave up."}</p>

      {!confirming ? (
        <button type="button" className="button button-primary button-large" disabled={!ready} onClick={() => setConfirming(true)}>
          {own ? "Finish and see my Decision Review" : "Finish and see our Decision Review"}
        </button>
      ) : (
        <div className="check-confirm" role="alertdialog" aria-labelledby="decision-confirm-title">
          <p id="decision-confirm-title" className="check-confirm-title">
            {own ? `Is ${choice} your final choice?` : `Have you and your partner agreed on ${choice}?`}
          </p>
          <p>{own ? "You will see a review of your choice. Do this only after you have asked your partner all your questions." : "You will see a review of your choice. Do this only after you have finished talking."}</p>
          <div className="check-confirm-buttons">
            <button type="button" className="button button-primary" disabled={loading} onClick={submit}>
              {loading ? "Checking…" : own ? "Yes, show my review" : "Yes, show our review"}
            </button>
            <button type="button" className="button" disabled={loading} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      )}
      {!ready && <p className="field-hint">Choose one {optionNoun} and write your reasons to continue.</p>}
      {error && <ErrorBox error={error} />}
    </section>
  );
}
