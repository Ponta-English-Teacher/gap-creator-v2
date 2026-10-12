/**
 * The Decision Review of one option of "Make the Best Choice" (Choose One).
 * Shown to students after they submit their choice, and for every option in the Answer Key.
 * Everything under "Checked by the app" comes from the facts (lib/choice.ts); "What might happen"
 * and the balanced view are the AI's, checked against the same facts.
 */
import type { ReasonFeedback } from "@/lib/activitySchemas";
import type { DecisionReview } from "@/lib/choice";

export default function DecisionReviewView({ review, ja, compact }: { review: DecisionReview; ja?: boolean; compact?: boolean }) {
  const state = !review.possible ? "out" : review.defensible ? "good" : "possible";
  return (
    <div className={`review review-${state}`}>
      <div className="review-head">
        {review.picture && (
          // eslint-disable-next-line @next/next/no-img-element -- generated or stored option picture
          <img className="review-picture" src={review.picture} alt={review.option} />
        )}
        <div>
          <h5 className="review-option">{review.option}</h5>
          {review.description && <p className="muted">{review.description}</p>}
          <p className="review-verdict">{review.verdict}</p>
        </div>
      </div>

      {review.other && <p className="review-group">Facts, checked by the app</p>}
      {review.requirements.length > 0 && (
        <div className="review-part">
          <p className="review-label">“Must” conditions</p>
          <ul className="review-checks">
            {review.requirements.map((r) => (
              <li key={r.text} className={r.met ? "check-met" : "check-missed"}>
                <span aria-hidden>{r.met ? "✓" : "✗"}</span> {r.text}
                <span className="muted">
                  {" "}
                  — this choice: {r.value} ({r.met ? "met" : "not met"})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="review-columns">
        <div className="review-part">
          <p className="review-label">What this choice offers</p>
          {review.advantages.length ? (
            <ul>
              {review.advantages.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">This choice is not the best for any of the things that were wanted.</p>
          )}
        </div>
        <div className="review-part">
          <p className="review-label">What you give up</p>
          {review.disadvantages.length ? (
            <ul>
              {review.disadvantages.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">This choice is not the worst for anything that was wanted.</p>
          )}
        </div>
      </div>

      {(review.mixed?.length ?? 0) > 0 && (
        <div className="review-part">
          <p className="review-label">In between</p>
          <ul>
            {review.mixed!.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {(review.other?.length ?? 0) > 0 && (
        <div className="review-part">
          <p className="review-label">Other facts</p>
          <ul>
            {review.other!.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {review.other && (review.personal?.length || review.consequences.length > 0 || review.overall) && <p className="review-group">Opinions and possibilities</p>}
      {(review.personal?.length ?? 0) > 0 && (
        <div className="review-part">
          <p className="review-label">For you to judge</p>
          <ul>
            {review.personal!.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="muted">
            {review.interests ? `About you: ${review.interests} ` : ""}Only you can say if these are good or bad for you. There is no right or wrong here.
          </p>
        </div>
      )}

      {review.consequences.length > 0 && (
        <div className="review-part">
          <p className="review-label">What might happen</p>
          <ul>
            {review.consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {review.overall && (
        <div className="review-part review-overall">
          <p className="review-label">Overall</p>
          <p>{review.overall}</p>
          {ja && review.overallJa && (
            <details className="ja">
              <summary>日本語</summary>
              <div lang="ja">{review.overallJa}</div>
            </details>
          )}
        </div>
      )}

      {!compact && (
        <details className="review-facts">
          <summary>All the facts about {review.option}</summary>
          <dl>
            {review.facts.map((f) => (
              <div key={f.name} className="profile-row">
                <dt>{f.name}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <p className="route-assumptions">Everything under “Facts” is checked by the app. “For you to judge”, “What might happen” and “Overall” are opinions and possibilities, not facts.</p>
    </div>
  );
}

function Ja({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <details className="ja">
      <summary>日本語</summary>
      <div lang="ja">{text}</div>
    </details>
  );
}

/**
 * What a student reads first after submitting: their choice, one or two points that matter to them, one thing to
 * think about, and their own sentence in natural English. With AI feedback it answers what the student wrote;
 * without it, the same card is filled from the app's checks. Preferences are never marked as wrong.
 */
export function StudentFeedback({ review, feedback, ja }: { review: DecisionReview; feedback: (ReasonFeedback & { englishWithheld?: boolean }) | null; ja?: boolean }) {
  const good = feedback?.goodPoints.length ? feedback.goodPoints : (review.simple?.good ?? []).slice(0, 2);
  const think = feedback ? feedback.thinkAbout : (review.simple?.think ?? []).slice(0, 1);
  return (
    <div className="reason-feedback">
      <div className="feedback-head">
        {review.picture && (
          // eslint-disable-next-line @next/next/no-img-element -- generated or stored option picture
          <img className="review-picture" src={review.picture} alt={review.option} />
        )}
        <div>
          <p className="review-label">Your choice</p>
          <p className="feedback-choice">{feedback?.yourChoice || `You chose ${review.option}.`}</p>
          {ja && <Ja text={feedback?.yourChoiceJa} />}
        </div>
      </div>

      {good.length > 0 && (
        <>
          <p className="review-label">Good points</p>
          <ul>
            {good.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}

      {(think.length > 0 || (feedback?.factChecks.length ?? 0) > 0) && (
        <>
          <p className="review-label">Think about</p>
          <ul>
            {think.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {feedback?.factChecks.map((f) => (
              <li key={f.said}>
                You wrote “{f.said}”. {f.fact}
              </li>
            ))}
          </ul>
        </>
      )}

      {feedback?.assessment && (
        <>
          <p className="review-label">Your reasoning</p>
          <p>{feedback.assessment}</p>
        </>
      )}

      {feedback && !feedback.englishWithheld && (feedback.yourEnglish || !feedback.factChecks.length) && (
        <div className="feedback-english">
          <p className="review-label">Your English</p>
          {feedback.yourEnglish ? (
            <>
              <p className="feedback-sentence">“{feedback.yourEnglish}”</p>
              {ja && <Ja text={feedback.yourEnglishJa} />}
            </>
          ) : (
            <p>Your English is clear. Well done!</p>
          )}
        </div>
      )}
      <p className="route-assumptions">
        {feedback ? "“Your choice” and “Your English” were written by AI from your words. " : ""}What you like is your own opinion: it is not right or wrong.
      </p>
    </div>
  );
}
