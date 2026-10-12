import { pictureData } from "@/lib/activitySchemas";
import { describeError, generateOptionPictures, generatePicturePair } from "@/lib/openai";

export const maxDuration = 300;

/**
 * Redraws pictures from an existing specification:
 *   { data }                the two Spot the Differences pictures (same differences)
 *   { looks, people }       the option pictures of a Make the Best Choice activity (up to 6)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (Array.isArray(body.looks)) {
      const looks = (body.looks as unknown[]).filter((l): l is string => typeof l === "string" && l.trim().length > 0).map((l) => l.slice(0, 600));
      if (!looks.length || looks.length > 6 || looks.length !== body.looks.length) return Response.json({ error: "The picture descriptions are missing." }, { status: 400 });
      return Response.json(await generateOptionPictures(looks, body.people === true));
    }
    const parsed = pictureData.safeParse(body.data);
    if (!parsed.success) return Response.json({ error: "The picture specification is missing." }, { status: 400 });
    const images = await generatePicturePair(parsed.data);
    return Response.json({ images });
  } catch (err) {
    console.error("[images]", err);
    const { status, ...body } = describeError(err);
    return Response.json(body, { status });
  }
}
