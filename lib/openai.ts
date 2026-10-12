/**
 * The only place the app talks to OpenAI. Server-side only.
 */
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { PictureData } from "./activitySchemas";
import { optionPicturePrompt, pictureAPrompt, pictureBPrompt } from "./activityPrompts";

export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

/** Landscape pictures read well on a projector and on a phone turned sideways. */
const IMAGE_SIZE = "1536x1024";
const IMAGE_QUALITY = "medium";

/** A problem the teacher should be told about in these words (e.g. an activity that could not be made valid). */
export class TeacherMessageError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.");
  }
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new MissingApiKeyError();
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 5 * 60 * 1000 });
  return client;
}

/** One text request that returns JSON validated against the given zod schema. */
export async function generateStructured<S extends z.ZodType>(
  schema: S,
  name: string,
  instructions: string,
  input: string,
): Promise<z.infer<S>> {
  const response = await getClient().responses.parse({
    model: TEXT_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(schema, name) },
  });
  if (!response.output_parsed) {
    throw new Error(`The model returned no usable JSON (status: ${response.status}).`);
  }
  return response.output_parsed as z.infer<S>;
}

function toDataUrl(b64: string | undefined): string {
  if (!b64) throw new Error("The image API returned no image data.");
  return `data:image/jpeg;base64,${b64}`;
}

/** Generates a new picture. Returns a data URL. `small` = a square, low-cost picture for an option card. */
export async function generateImage(prompt: string, small = false): Promise<string> {
  const result = await getClient().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: small ? "1024x1024" : IMAGE_SIZE,
    quality: small ? "low" : IMAGE_QUALITY,
    output_format: "jpeg",
    output_compression: small ? 60 : 85,
  });
  return toDataUrl(result.data?.[0]?.b64_json);
}

/** Edits an existing picture (a data URL) so the base scene stays as similar as possible. */
export async function editImage(imageDataUrl: string, prompt: string): Promise<string> {
  const bytes = Buffer.from(imageDataUrl.split(",")[1] ?? "", "base64");
  const result = await getClient().images.edit({
    model: IMAGE_MODEL,
    image: await toFile(bytes, "student-a.jpg", { type: "image/jpeg" }),
    prompt,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
    output_format: "jpeg",
    output_compression: 85,
  });
  return toDataUrl(result.data?.[0]?.b64_json);
}

/**
 * Picture Gap: draw Student A's picture from the specification, then EDIT that
 * picture to make Student B's, so the base scene stays as similar as the API allows.
 */
export async function generatePicturePair(data: PictureData): Promise<{ a: string; b: string }> {
  const a = await generateImage(pictureAPrompt(data.imagePromptA));
  const b = await editImage(a, pictureBPrompt(data.differences));
  return { a, b };
}

/**
 * Make the Best Choice: one small picture per option, drawn at the same time.
 * A picture that fails is left out (the card is shown without one); `error` says why.
 */
export async function generateOptionPictures(looks: string[], people: boolean): Promise<{ pictures: (string | undefined)[]; error?: string }> {
  const results = await Promise.allSettled(looks.map((look) => generateImage(optionPicturePrompt(look, people), true)));
  const failed = results.find((r) => r.status === "rejected");
  if (failed) console.error("[option pictures]", (failed as PromiseRejectedResult).reason);
  const e = failed ? describeError((failed as PromiseRejectedResult).reason) : null;
  return { pictures: results.map((r) => (r.status === "fulfilled" ? r.value : undefined)), error: e ? (e.detail ? `${e.error} (${e.detail})` : e.error) : undefined };
}

/** Turns any error into a short message for teachers plus detail for developers. */
export function describeError(error: unknown): { error: string; detail?: string; status: number } {
  const detail = error instanceof Error ? error.message : String(error);
  const dev = process.env.NODE_ENV !== "production";
  if (error instanceof TeacherMessageError) return { error: error.message, detail: error.detail, status: 422 };
  if (error instanceof MissingApiKeyError) {
    return { error: "The OpenAI API key is not set up yet.", detail, status: 500 };
  }
  let message = "Something went wrong while talking to the AI. Please try again.";
  let status = 500;
  if (error instanceof OpenAI.APIError) {
    status = error.status ?? 500;
    if (status === 401) message = "The OpenAI API key was rejected. Please check OPENAI_API_KEY.";
    else if (status === 429) message = "The AI service is busy or the account has reached its limit. Please wait and try again.";
    else if (status === 400 && /safety|moderation/i.test(detail))
      message = "The AI refused this request. Try changing the topic wording.";
    else if (status === 404 || (status === 400 && /model/i.test(detail)))
      message = "The configured AI model is not available for this API key.";
  }
  return { error: message, detail: dev ? detail : undefined, status: status >= 400 ? status : 500 };
}
