import { activitySchemas, choiceReviews, choiceWordingCheck, versionPlan } from "@/lib/activitySchemas";
import type { ChooseOneData } from "@/lib/activitySchemas";
import { buildGenerationInput, choiceReviewInput, GENERATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS, versionPlanInput, WORDING_CHECK_INSTRUCTIONS, wordingCheckInput } from "@/lib/activityPrompts";
import {
  MAX_PAIRS,
  normalizeSchedule,
  normalizeStory,
  normalizeText,
  versionCountFor,
} from "@/lib/gapLogic";
import { applyWordingCheck, buildChooseOne, buildCombination, checkReviews, choiceDemoExchange, choiceSteps, choiceUsefulLanguage, generateUntilValid, InvalidActivityError, isChooseOne } from "@/lib/choice";
import { describeError, generateOptionPictures, generatePicturePair, generateStructured, TeacherMessageError } from "@/lib/openai";
import { buildMapActivity } from "@/lib/routeTasks";
import { DATA_FORMAT } from "@/lib/types";
import type { Activity, ActivitySet, GenerateRequest, MapSettings, ProfileSettings, StorySettings, TextSettings } from "@/lib/types";
import type { z } from "zod";

export const maxDuration = 300;

type VersionInfo = { number: number; count: number; brief: string };

/** How many times the app asks the AI again when a Make the Best Choice activity fails its checks. */
const CHOICE_ATTEMPTS = 4;

/**
 * Choose One: the AI's part of the Decision Review of every option, checked against the facts.
 * If it cannot be written correctly, the reviews are kept to what the app works out itself.
 */
async function writeReviews(data: ChooseOneData, cefr: GenerateRequest["common"]["cefr"], notes: string[]) {
  try {
    const { data: reviews } = await generateUntilValid(
      2,
      (feedback) => generateStructured(choiceReviews, "decision_reviews", REVIEW_INSTRUCTIONS, choiceReviewInput(data, cefr) + feedback),
      (o) => ({ data: o.reviews, problems: checkReviews(data, o.reviews) }),
    );
    return reviews;
  } catch (err) {
    console.warn("[generate] decision reviews", err);
    notes.push("The AI's comments for the Decision Reviews could not be checked, so they were left out. Each review still shows the app's own checks, advantages and disadvantages.");
    return [];
  }
}

/**
 * Choose One: after the calculated checks pass, a second reading of the words. A wish sentence that says the
 * opposite of its rule sends the activity back; Japanese that does not match the English is corrected in place.
 * If the reading itself fails, the activity is kept: its logic has already been checked.
 */
async function checkedChooseOne(built: { data: ChooseOneData; problems: string[] }) {
  if (built.problems.length) return built;
  try {
    const check = await generateStructured(choiceWordingCheck, "wording_check", WORDING_CHECK_INSTRUCTIONS, wordingCheckInput(built.data));
    return { data: built.data, problems: applyWordingCheck(built.data, check).problems };
  } catch (err) {
    console.warn("[generate] wording check", err);
    return built;
  }
}

/**
 * Make the Best Choice: generate, check by calculation, and ask again (with the reasons) if the activity
 * is not logically sound. An activity that cannot be made valid is reported, never shown.
 */
async function buildChoice(input: string, common: GenerateRequest["common"], settings: ProfileSettings) {
  const combination = settings.format === "combination";
  try {
    const { out, data, attempt } = combination
      ? await generateUntilValid(
          CHOICE_ATTEMPTS,
          (feedback) => generateStructured(activitySchemas.combination, "best_choice_combination", GENERATION_INSTRUCTIONS, input + feedback),
          (o) => buildCombination(o.data, common.difficulty),
        )
      : await generateUntilValid(
          CHOICE_ATTEMPTS,
          (feedback) => generateStructured(activitySchemas.chooseOne, "best_choice_choose_one", GENERATION_INSTRUCTIONS, input + feedback),
          (o) => checkedChooseOne(buildChooseOne(o.data, common.difficulty, common.cefr, settings.decision === "individual" || settings.decision === "shared" ? settings.decision : undefined)),
        );
    const notes = attempt > 1 ? [`The first ${attempt - 1} attempt(s) failed the app's checks and were replaced. This version passed every check.`] : [];
    let pictureError: string | undefined;
    if (isChooseOne(data)) {
      // The reviews and the pictures both depend only on the checked activity, so they are made together.
      const [reviews, drawn] = await Promise.all([writeReviews(data, common.cefr, notes), generateOptionPictures(data.options.map((o) => o.look), data.optionsArePeople)]);
      data.reviews = reviews;
      data.options = data.options.map((o, i) => ({ ...o, picture: drawn.pictures[i] }));
      pictureError = drawn.error;
    }
    const steps = choiceSteps(data);
    const vocabulary = (settings.vocabulary ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      ...out,
      // Choose One: the model exchange is written from the real split of the facts, so the asker never already knows the answer.
      teacherGuide: isChooseOne(data) ? { ...out.teacherGuide, demoExchange: choiceDemoExchange(data) } : out.teacherGuide,
      data,
      notes,
      pictureError,
      reasonFeedback: isChooseOne(data) && settings.reasonFeedback === true,
      usefulLanguage: choiceUsefulLanguage(common.cefr, data, common.expressions, common.support, vocabulary),
      studentInstructionsA: steps.exchange.join(" "),
      studentInstructionsB: steps.exchange.join(" "),
      finalTask: steps.decide,
    };
  } catch (err) {
    if (!(err instanceof InvalidActivityError)) throw err;
    console.warn("[generate] best choice rejected:", err.problems);
    throw new TeacherMessageError(
      "The app could not make a logically valid activity for this scenario, so nothing was created. Please try again, or change the scenario or difficulty.",
      `After ${err.attempts} attempts the last version still had these problems: ${err.problems.join(" ")}`,
    );
  }
}

/** One text request builds one version; Picture Gap then draws its two pictures. */
async function buildActivity({ type, common, settings }: GenerateRequest, version?: VersionInfo): Promise<Activity> {
  const input = buildGenerationInput(type, common, settings, version);
  const ask = <S extends z.ZodType>(schema: S) =>
    generateStructured(schema, `${type}_gap_activity`, GENERATION_INSTRUCTIONS, input);
  // Only some activities have the option; the others never show a self-check.
  const allowSelfCheck = (settings as { allowSelfCheck?: boolean }).allowSelfCheck ?? true;
  const meta = { cefr: common.cefr, support: common.support, notes: [] as string[], allowSelfCheck };

  switch (type) {
    case "picture": {
      const out = await ask(activitySchemas.picture);
      const activity: Activity = { ...meta, ...out, type, images: null };
      try {
        activity.images = await generatePicturePair(out.data);
      } catch (err) {
        // Keep the text specification so the teacher can retry only the pictures.
        console.error("[generate] images", err);
        const e = describeError(err);
        activity.imageError = e.detail ? `${e.error} (${e.detail})` : e.error;
      }
      return activity;
    }
    case "text": {
      const out = await ask(activitySchemas.text);
      return { ...meta, ...out, type, ...normalizeText(out.data, (settings as TextSettings).itemCount) };
    }
    case "schedule": {
      const out = await ask(activitySchemas.schedule);
      return { ...meta, ...out, type, ...normalizeSchedule(out.data) };
    }
    case "map": {
      const out = await ask(activitySchemas.map);
      // The app builds the town and writes everything that depends on it: routes, challenges, language support.
      const map = buildMapActivity(out.data, settings as MapSettings, common);
      const teacherGuide = { ...out.teacherGuide, demoExchange: map.demoExchange };
      return { ...meta, ...out, type, teacherGuide, usefulLanguage: map.usefulLanguage, finalTask: map.finalTask, data: map.data, notes: map.notes };
    }
    case "profile": {
      const translations = (settings as ProfileSettings).translations ?? true;
      return { ...meta, translations, ...(await buildChoice(input, common, settings as ProfileSettings)), type };
    }
    case "story": {
      const out = await ask(activitySchemas.story);
      return { ...meta, ...out, type, ...normalizeStory(out.data, (settings as StorySettings).eventCount) };
    }
    default:
      throw new Error(`Unknown activity type: ${type}`);
  }
}

/**
 * Builds a small number of unique versions for the class (1 for a single pair).
 * A short planning call first makes the versions clearly different; the versions
 * are then generated in parallel. Pair-to-version mapping happens in lib/gapLogic.ts.
 */
async function buildActivitySet(request: GenerateRequest): Promise<ActivitySet> {
  const pairCount = Math.max(1, Math.min(MAX_PAIRS, Math.round(request.common.pairs) || 1));
  const count = versionCountFor(pairCount);
  if (count === 1) return { pairCount, versions: [await buildActivity(request)] };

  const plan = await generateStructured(
    versionPlan,
    "version_plan",
    GENERATION_INSTRUCTIONS,
    versionPlanInput(request.type, request.common, count),
  );
  const briefs = Array.from({ length: count }, (_, i) => plan.briefs[i] || `Version ${i + 1}: use clearly different content from the other versions.`);
  const versions = await Promise.all(briefs.map((brief, i) => buildActivity(request, { number: i + 1, count, brief })));
  return { pairCount, versions };
}

export async function POST(request: Request) {
  try {
    const set = await buildActivitySet((await request.json()) as GenerateRequest);
    return Response.json({ set, format: DATA_FORMAT });
  } catch (err) {
    console.error("[generate]", err);
    const { status, ...body } = describeError(err);
    return Response.json(body, { status });
  }
}
