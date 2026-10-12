import { MAX_PAIRS } from "@/lib/gapLogic";
import { saveSharedSet, SHARE_DAYS } from "@/lib/shareStore";
import type { ActivitySet } from "@/lib/types";

const TYPES = ["picture", "text", "schedule", "map", "profile", "story"];

/** Stores an already-generated activity set so students can open it. No AI calls. */
export async function POST(request: Request) {
  try {
    const { set } = (await request.json()) as { set: ActivitySet };
    const valid =
      set &&
      Array.isArray(set.versions) &&
      set.versions.length > 0 &&
      set.versions.every((a) => a && TYPES.includes(a.type) && a.data) &&
      Number.isInteger(set.pairCount) &&
      set.pairCount >= 1 &&
      set.pairCount <= MAX_PAIRS;
    if (!valid) return Response.json({ error: "There is no activity to share." }, { status: 400 });
    const id = await saveSharedSet(set);
    // On Vercel, student links always use the public production domain (deployment/preview URLs
    // require a Vercel login). Locally this is null and the teacher page's own address is used.
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const publicBaseUrl = productionHost ? `https://${productionHost}` : null;
    return Response.json({ id, days: SHARE_DAYS, publicBaseUrl });
  } catch (err) {
    console.error("[share]", err);
    const detail = err instanceof Error ? err.message : String(err);
    // A missing Blob store is a setup problem the teacher/admin needs to see, even in production.
    // Missing pictures are something the teacher can fix, so say so plainly.
    const setup = detail.startsWith("No Vercel Blob store") || detail.startsWith("Draw the pictures");
    return Response.json(
      {
        error: setup ? detail : "The activity could not be shared. Please try again.",
        detail: process.env.NODE_ENV !== "production" ? detail : undefined,
      },
      { status: 500 },
    );
  }
}
