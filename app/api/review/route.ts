import { reasonFeedback } from "@/lib/activitySchemas";
import type { ReasonFeedback } from "@/lib/activitySchemas";
import { FEEDBACK_INSTRUCTIONS, reasonFeedbackInput } from "@/lib/activityPrompts";
import { decisionOf, falseSuperlatives, guardFeedback, hasDecisionReview, reviewOption } from "@/lib/choice";
import { versionForPair } from "@/lib/gapLogic";
import { generateStructured } from "@/lib/openai";
import { loadSharedSet } from "@/lib/shareStore";

export const maxDuration = 60;

/** The longest reasons a pair can submit. */
const MAX_REASONS = 600;
/**
 * AI comments allowed per shared activity. Counted in this server's memory, so it is a brake on
 * runaway use rather than an exact limit. Past it, students still get the full Decision Review.
 */
const MAX_COMMENTS = 200;
const comments = new Map<string, number>();

/**
 * Make the Best Choice: a student submits ONE option and their reasons (their own choice in an individual
 * decision, the pair's choice in a shared one), and gets back the Decision Review of that option.
 * In an individual decision the review is for that student's own wishes, so their role is needed. The review is read from the stored activity (no AI). If the teacher turned it on,
 * the AI also comments on the reasons; it is given the app's checks and cannot change them.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown; pair?: unknown; role?: unknown; option?: unknown; reasons?: unknown };
    const role = body.role === "A" || body.role === "B" ? body.role : undefined;
    const reasons = typeof body.reasons === "string" ? body.reasons.trim().slice(0, MAX_REASONS) : "";
    const shared = typeof body.id === "string" ? await loadSharedSet(body.id) : null;
    if (!shared) return Response.json({ error: "This activity is not available. Ask your teacher for a new link." }, { status: 404 });
    const { set } = shared;
    const pair = Number.isInteger(body.pair) && (body.pair as number) >= 1 && (body.pair as number) <= set.pairCount ? (body.pair as number) : 1;
    const activity = set.versions[versionForPair(pair, set.versions.length) - 1];
    if (activity.type !== "profile" || !hasDecisionReview(activity.data)) return Response.json({ error: "This activity has no Decision Review." }, { status: 400 });
    const data = activity.data;
    const index = data.options.findIndex((o) => o.name === body.option);
    if (index < 0) return Response.json({ error: "Choose one option first." }, { status: 400 });
    if (reasons.split(/\s+/).filter(Boolean).length < 2) return Response.json({ error: "Write your reasons first." }, { status: 400 });

    if (decisionOf(data) === "individual" && !role) return Response.json({ error: "Choose Student A or Student B first." }, { status: 400 });
    const review = reviewOption(data, index, role);
    let feedback: (ReasonFeedback & { englishWithheld?: boolean }) | null = null;
    const used = comments.get(body.id as string) ?? 0;
    if (activity.reasonFeedback && used < MAX_COMMENTS) {
      comments.set(body.id as string, used + 1);
      try {
        const input = reasonFeedbackInput(data, index, reasons, activity.cefr, role);
        const ask = async (note = "") => guardFeedback(await generateStructured(reasonFeedback, "reason_feedback", FEEDBACK_INSTRUCTIONS, input + note), review, data);
        feedback = await ask();
        // "Your English" may not repeat a claim the facts contradict. Asked again once; if it still does, it is not shown.
        // It must also be the student's own voice ("I ..."), not a sentence about them.
        const problems = (english: string) => [
          ...falseSuperlatives(data, index, english).map((w) => `It said "${w}" about ${review.option}, which the facts contradict: write it without that claim, or with the true fact, and list the claim in factChecks.`),
          ...(/^\s*you\b/i.test(english) ? ['It began with "You": write it as the student would say it, with "I" or "We".'] : []),
        ];
        let wrong = problems(feedback.yourEnglish);
        if (wrong.length) {
          feedback = await ask(`\n\nYour previous yourEnglish was not usable. ${wrong.join(" ")} Keep the student's opinions and other reasons.`);
          wrong = problems(feedback.yourEnglish);
          if (wrong.length) feedback = { ...feedback, yourEnglish: "", yourEnglishJa: "", englishWithheld: true };
        }
      } catch (err) {
        // The review does not depend on the comment, so a failure here is not shown as an error.
        console.error("[review] feedback", err);
      }
    }
    return Response.json({ review, feedback });
  } catch (err) {
    console.error("[review]", err);
    return Response.json({ error: "Your choice could not be checked. Please try again." }, { status: 500 });
  }
}
