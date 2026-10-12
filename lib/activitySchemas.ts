/**
 * JSON schemas for the OpenAI structured output.
 *
 * The AI returns ONE complete set of source information per activity.
 * The app (lib/gapLogic.ts) decides who sees what, so Student A and Student B
 * are always derived from the same data.
 *
 * Structured-output rules: every field is required, so use empty strings/arrays
 * instead of optional fields.
 */
import { z } from "zod";
import { ENVIRONMENT_IDS } from "./mapEnvironments";
import type { EnvironmentId } from "./mapEnvironments";

const teacherGuide = z.object({
  whatStudentsDo: z.string().describe("2-3 sentences for the teacher."),
  explanationScript: z.string().describe("Short script the teacher can say aloud in class, at the students' level."),
  procedure: z.array(z.string()).describe("Numbered classroom steps, 5-8 items."),
  demoExchange: z.array(z.string()).describe('A short model exchange using the real content, lines like "A: ..." / "B: ...". Follow the exact A/B split: the student who asks must be the one who does NOT know the answer. Never reveal the solution to the final task.'),
  tips: z.array(z.string()).describe("2-4 practical tips (early finishers, common errors, checking)."),
});

const usefulLanguage = z.array(
  z.object({
    purpose: z.string().describe('e.g. "Asking", "Answering", "Checking", "Agreeing"'),
    expressions: z.array(z.string()),
  }),
);

export const sharedOutput = z.object({
  title: z.string(),
  communicationGoal: z.string(),
  targetExpressions: z.array(z.string()),
  studentInstructionsA: z.string().describe("What Student A must do, 1-3 short sentences, at the CEFR level."),
  studentInstructionsB: z.string().describe("What Student B must do, 1-3 short sentences, at the CEFR level."),
  finalTask: z.string().describe("The shared task after exchanging information. Empty string if none."),
  usefulLanguage,
  teacherGuide,
});
export type SharedOutput = z.infer<typeof sharedOutput>;

// ---------- Picture Gap ----------
export const pictureData = z.object({
  sceneDescription: z.string(),
  commonElements: z.array(z.string()).describe("Objects that are identical in both pictures, with positions."),
  differences: z.array(
    z.object({
      item: z.string(),
      differenceType: z.string(),
      studentA: z.string().describe("Exactly what is in Student A's picture."),
      studentB: z.string().describe("Exactly what is in Student B's picture."),
      exampleQuestion: z.string(),
    }),
  ),
  imagePromptA: z
    .string()
    .describe("Complete, precise image prompt for Student A's picture: layout left/centre/right, every important object, colours, counts."),
});
export type PictureData = z.infer<typeof pictureData>;

// ---------- Text Gap ----------
export const textData = z.object({
  subjects: z.array(z.string()).describe("Column headings, usually 2 people or things."),
  rows: z.array(
    z.object({
      item: z.string().describe("Row heading, e.g. 'pizza' or 'age'."),
      cells: z
        .array(
          z.object({
            answer: z.string().describe("Short value written in the table."),
            question: z.string().describe("Natural question a student asks to get this value."),
            fullAnswer: z.string().describe("Natural full answer."),
          }),
        )
        .describe("Exactly one cell per subject, in the same order as subjects."),
    }),
  ),
});
export type TextData = z.infer<typeof textData>;

// ---------- Schedule Gap ----------
export const scheduleData = z.object({
  columns: z.array(z.string()).describe("Days or dates, left to right."),
  timeSlots: z.array(z.string()).describe("Rows, top to bottom."),
  sections: z.array(
    z.object({
      heading: z.string().describe("e.g. \"Ken's week\" or \"Main Hall\"."),
      cells: z.array(
        z.object({
          column: z.string(),
          timeSlot: z.string(),
          text: z.string().describe('What happens. Use "Free" for free time.'),
          knownBy: z.enum(["A", "B", "both"]),
        }),
      ),
    }),
  ),
  solution: z.string().describe("The answer to the final task and why."),
});
export type ScheduleData = z.infer<typeof scheduleData>;

// ---------- Map Gap ----------
export const MAP_ROWS = 3;
export const MAP_COLS = 4;
export const MAP_LOTS = (() => {
  const lots: string[] = [];
  for (let r = 1; r <= MAP_ROWS; r++)
    for (let c = 1; c <= MAP_COLS; c++) for (const side of ["n", "s"]) lots.push(`r${r}c${c}${side}`);
  return lots as [string, ...string[]];
})();

const MAP_INTERSECTIONS = ["H0", "H1", "H2", "H3"].flatMap((h) => ["V1", "V2", "V3"].map((v) => `${h}-${v}`)) as [string, ...string[]];
/** A street segment: H{k}-c{col} = street Hk alongside column col; V{j}-r{row} = street Vj alongside row. */
export const MAP_SEGMENTS = [
  ...["H0", "H1", "H2", "H3"].flatMap((h) => [1, 2, 3, 4].map((c) => `${h}-c${c}`)),
  ...["V1", "V2", "V3"].flatMap((v) => [1, 2, 3].map((r) => `${v}-r${r}`)),
] as [string, ...string[]];
const MAP_BLOCKS = [1, 2, 3].flatMap((r) => [1, 2, 3, 4].map((c) => `r${r}c${c}`)) as [string, ...string[]];

export const mapFeatures = z.object({
  river: z.boolean().describe("River band just north of H1 (replaces the south lots of row 1). Every V street crosses it on a bridge."),
  riverName: z.string(),
  railway: z.boolean().describe("Railway band just north of H3 (replaces the north lots of row 3)."),
  railwayCrossings: z
    .array(z.object({ street: z.enum(["V1", "V2", "V3"]), kind: z.enum(["railway crossing", "tunnel"]) }))
    .describe("How each V street crosses the railway. Empty if no railway."),
  trafficLights: z.array(z.enum(MAP_INTERSECTIONS)),
  roundabouts: z.array(z.enum(MAP_INTERSECTIONS)),
  pedestrianCrossings: z.array(
    z.object({ segment: z.enum(MAP_SEGMENTS), kind: z.enum(["zebra crossing", "pedestrian underpass", "pedestrian overpass"]) }),
  ),
  roadsideStops: z.array(
    z.object({
      segment: z.enum(MAP_SEGMENTS),
      side: z.enum(["north", "south", "east", "west"]).describe("north/south for H segments, east/west for V segments"),
      kind: z.enum(["bus stop", "taxi stand", "station entrance", "subway entrance"]),
    }),
  ),
  parks: z.array(z.object({ block: z.enum(MAP_BLOCKS), name: z.string() })).describe("A park fills a whole block."),
});
export type MapFeatures = z.infer<typeof mapFeatures>;

/** What the AI supplies for a map: names and features only. The app decides where everything goes (lib/townMap.ts). */
export const mapPlan = z.object({
  environment: z.enum(ENVIRONMENT_IDS).describe("The kind of place the teacher's setting describes."),
  horizontalStreets: z.array(z.string()).describe("Exactly 4 street names, H0 (top) to H3 (bottom)."),
  verticalStreets: z.array(z.string()).describe("Exactly 3 street names, V1 (left) to V3 (right)."),
  places: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["building", "parking lot", "police box"]),
      size: z.enum(["small", "medium", "large"]).describe("small = a shop; medium = an ordinary building; large = fills a whole block (school, hospital, shopping centre)."),
      shared: z.boolean().describe("true = landmark labelled on both maps."),
      description: z.string().describe("One short phrase about the place, e.g. 'big supermarket'."),
    }),
  ),
  features: mapFeatures,
});
export type MapPlan = z.infer<typeof mapPlan>;

export type Side = "north" | "south" | "east" | "west";

/** One building: a footprint inside a block, with the one street its entrance opens onto. */
export interface TownBuilding {
  id: string;
  /** "r2c3" = row 2, column 3. */
  block: string;
  /** Footprint as fractions of the block (0-1), from its north-west corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Roughly where in the block it stands. */
  position: Side | "north-west" | "north-east" | "south-west" | "south-east" | "whole";
  /** side = the side of the block the door is on; street = the street it opens onto; at = how far along that side (0-1, from the west or north end). */
  entrance: { side: Side; street: string; at: number };
  /** The two streets it stands on the corner of, if it is a corner building. */
  corner: string[] | null;
}

export interface MapPlace {
  name: string;
  kind: "building" | "parking lot" | "police box";
  shared: boolean;
  description: string;
  /** The building it is in. */
  building?: string;
  /** Landmarks both students can see that are next to or opposite it. */
  near?: string[];
  /** Maps made before buildings existed: a half-block lot such as "r2c3n". */
  lot?: string;
}

/** A stored map. `buildings` is missing on maps made before buildings existed (see townBuildings in lib/townMap.ts). */
export interface MapData {
  horizontalStreets: string[];
  verticalStreets: string[];
  places: MapPlace[];
  features: MapFeatures;
  buildings?: TownBuilding[];
  /** The kind of place (decides how the map looks). Missing on maps made before environments existed. */
  environment?: EnvironmentId;
  /** Road works: street segments that cannot be used. Each one is drawn on only one student's map. */
  closures?: MapClosure[];
  /** One route challenge for each student (none at the easiest difficulty). */
  routeTasks?: RouteTask[];
}

export interface MapClosure {
  /** "H1-c2" = street H1 beside column 2; "V3-r1" = avenue V3 beside row 1. */
  segment: string;
  knownBy: "A" | "B";
}

export interface RouteTask {
  /** The student who has to make the journey. */
  for: "A" | "B";
  /** Name of the destination: a place only their partner can see. */
  place: string;
  /** compare = find two routes and compare them; detour = the direct route is closed. */
  kind: "compare" | "detour";
}

// ---------- Profile Gap ----------
export const profileData = z.object({
  categories: z.array(z.string()),
  profiles: z.array(
    z.object({
      name: z.string(),
      details: z
        .array(
          z.object({
            category: z.string(),
            value: z.string(),
            question: z.string().describe("Natural question to ask about this detail."),
          }),
        )
        .describe("One detail per category, in the same order as categories."),
    }),
  ),
  finalTaskAnswer: z.string().describe("Possible answer / discussion points for the final task."),
});
export type ProfileData = z.infer<typeof profileData>;

// ---------- Make the Best Choice ----------
// Two formats. In both, every condition is a rule the app can check, so the app (not the AI)
// decides which choices are possible. The stored activity is built in lib/choice.ts.

const reason = {
  reason: z.string().describe('Why, in a few simple words at the CEFR level, e.g. "you do not have much money". Empty if obvious.'),
  reasonJa: z.string().describe("The reason in natural Japanese. Empty if reason is empty."),
};

/** A condition on one attribute of the options. */
const choiceCondition = z.object({
  kind: z.enum(["hard", "soft"]).describe("soft = something this student cares about; it can be given up. hard = a real limit that every acceptable choice MUST meet (rare)."),
  attribute: z.string().describe("Exactly the name of one attribute."),
  rule: z
    .enum(["low", "high", "at most", "at least", "yes", "no"])
    .describe('soft: "low" (the lower the better for this student) or "high" for a number attribute, "yes" / "no" for a yes-no attribute. hard: "at most" / "at least" with a limit for a number attribute, "yes" / "no" for a yes-no attribute.'),
  amount: z.number().describe("The limit for at most / at least. 0 for every other rule."),
  wish: z
    .string()
    .describe(
      'What the student reads: ONE natural sentence to them at the CEFR level that gives the wish together with its motivation, e.g. "You do not want to wait long, because your next class starts soon." For "low" / "high" it contains NO number. For a hard limit it states the limit in words that match the rule, e.g. "You cannot pay more than ¥70,000 a month."',
    ),
  wishJa: z.string().describe("The same sentence in natural Japanese."),
  ...reason,
});

const chooser = z.object({
  role: z.string().describe('Who this student is in the situation, 2-4 words, e.g. "business student", "hotel manager".'),
  about: z.string().describe('1-2 short sentences to the student ("You ...") giving the circumstances that explain their conditions. Nothing that does not affect the choice.'),
  aboutJa: z.string().describe("The same in natural Japanese."),
  interests: z
    .string()
    .describe(
      '1-2 short sentences to the student ("You ...") about a taste, interest or worry of theirs that is NOT one of the conditions and that some options\' details or descriptions speak to, e.g. "You love live music. You do not like crowded places." A matter of opinion: the app never checks it.',
    ),
  interestsJa: z.string().describe("The same in natural Japanese."),
  conditions: z.array(choiceCondition),
});

export const chooseOnePlan = z.object({
  decision: z
    .enum(["individual", "shared"])
    .describe('"individual" = after exchanging information each student chooses for themselves, and may choose differently (own lunch, own outfit, own club). "shared" = the scenario really requires one common choice (one flat to share, one person to hire, one dish to share).'),
  decisionWhy: z.string().describe("One short sentence for the teacher on why this scenario is an individual or a shared decision."),
  situation: z
    .string()
    .describe("2-3 short sentences to both students: who they are and what they are choosing. Individual: say that each of them chooses for themselves. Shared: say why they must end with ONE choice together. No numbers."),
  situationJa: z.string().describe("The same in natural Japanese."),
  optionNoun: z.string().describe('What one option is, singular, lower case, e.g. "apartment", "applicant", "hotel".'),
  attributes: z.array(
    z.object({
      name: z.string().describe('Short label, e.g. "Rent", "Minutes to campus", "Furnished".'),
      nameJa: z.string(),
      kind: z.enum(["number", "yesno"]),
      currency: z.string().describe('Currency symbol for money ("¥", "$", "€", "£"), otherwise empty.'),
      unit: z.string().describe('Words after the number, e.g. "a month", "minutes", "years". Empty for yes-no attributes or when none.'),
      unitJa: z.string().describe('Japanese unit written after the number, e.g. "円/月", "分", "年". Empty if none.'),
      question: z.string().describe('The question a student asks about one option, with ... for its name, e.g. "How much is the rent for ...?"'),
      lowest: z
        .string()
        .describe(
          'Number attributes only: how to say naturally that an option has the LOWEST value of all, as words that follow the option\'s name and begin with "is" or "has": "is the cheapest", "has the shortest wait", "is the nearest to campus", "has the fewest rooms". Empty for yes-no attributes.',
        ),
      highest: z.string().describe('The same for the HIGHEST value: "is the most expensive", "has the longest wait", "is the farthest from campus". Empty for yes-no attributes.'),
      better: z
        .enum(["lower", "higher", "yes", "no", "none"])
        .describe('Which value most people would call better: "lower" / "higher" for a number (a price is better lower), "yes" / "no" for a yes-no attribute, "none" when it depends on the person.'),
    }),
  ),
  optionsArePeople: z.boolean().describe("true when each option is a person (an applicant, a candidate, a host). The app then draws a neutral folder, never a face."),
  options: z.array(
    z.object({
      name: z.string(),
      description: z.string().describe("One short phrase both students read under the picture, at the CEFR level, saying what the option is. No fact from the attributes and no opinion."),
      look: z
        .string()
        .describe(
          "What the picture of this option shows, for an illustrator: 1-2 sentences, concrete and visible. It must agree with every fact of this option and must not show any attribute value. When the options are people: only that person's closed application folder on a desk, in its own plain colour, and no person.",
        ),
      values: z
        .array(z.object({ number: z.number().describe("The value for a number attribute; 0 for a yes-no attribute."), yes: z.boolean().describe("The value for a yes-no attribute; false for a number attribute.") }))
        .describe("Exactly one value per attribute, in the same order as attributes."),
      details: z
        .array(z.object({ text: z.string().describe('One short sentence at the CEFR level, e.g. "There is live music on Fridays."'), textJa: z.string() }))
        .describe(
          "Things that are true of THIS option only and that a real person would mention: something special about it, a small drawback, what people say about it. Not a value of an attribute, not visible in the picture, and not in the description. Each student is told only some of them.",
        ),
    }),
  ),
  sharedConditions: z.array(choiceCondition).describe("Conditions both students know from the start."),
  studentA: chooser,
  studentB: chooser,
});
export type ChooseOnePlan = z.infer<typeof chooseOnePlan>;

/** The part of a Decision Review the AI writes. Everything that can be checked is worked out by the app (lib/choice.ts). */
export const choiceReviews = z.object({
  reviews: z
    .array(
      z.object({
        option: z.string().describe("Exactly the name of one option."),
        student: z
          .enum(["A", "B", "both"])
          .describe('Who this review is for. Shared decision: always "both". Individual decision: "A" or "B", the student who chose this option for themselves.'),
        consequences: z
          .array(z.string())
          .describe('1-2 things that might happen in practice if the students choose this option, each ONE sentence that uses "might", "may", "could" or "maybe". Possibilities, not facts.'),
        overall: z
          .string()
          .describe("1-2 sentences naming the real trade-off of this option (what it offers, what is given up) and what a person would have to care about most for it to be a good choice. No counting of wishes, and no verdict on taste. It must agree with the app's checks."),
        overallJa: z.string().describe("The overall view in natural Japanese."),
      }),
    )
    .describe("Shared decision: exactly one review for every option. Individual decision: exactly two for every option, one for Student A and one for Student B."),
});
export type ChoiceReviewText = z.infer<typeof choiceReviews>["reviews"][number];

/**
 * A second reading of a generated activity, by a model that did not write it: what each wish sentence actually
 * says, and whether the Japanese says the same as the English. The app compares the answers with the rules.
 */
export const choiceWordingCheck = z.object({
  wishes: z.array(
    z.object({
      number: z.number().describe("The number of the wish sentence in the list."),
      says: z
        .enum(["wants it lower", "wants it higher", "wants it", "does not want it", "unclear"])
        .describe('What the sentence says the person wants for the named fact. For a number: "wants it lower" (less, cheaper, shorter, nearer, a maximum) or "wants it higher" (more, longer, bigger, a minimum). For a yes/no fact: "wants it" or "does not want it".'),
    }),
  ),
  superlatives: z.array(
    z.object({
      number: z.number().describe("The number of the phrase in the list."),
      means: z.enum(["lowest", "highest", "unclear"]).describe("Whether the phrase describes the option with the LOWEST or the HIGHEST number for that fact."),
    }),
  ),
  conflicts: z
    .array(z.object({ option: z.string().describe("The option's name."), problem: z.string().describe("One sentence: which text contradicts or gives away which fact.") }))
    .describe("Only clear cases where an option's description, picture or details contradict one of its facts, or state the value of one of its facts. Empty if there are none."),
  japanese: z.array(
    z.object({
      number: z.number().describe("The number of the English / Japanese pair in the list."),
      ok: z.boolean().describe("true if the Japanese is natural and says the same as the English, with nothing added, missing or changed."),
      better: z.string().describe("If not ok: corrected natural Japanese that says exactly what the English says. Empty if ok."),
    }),
  ),
});
export type ChoiceWordingCheck = z.infer<typeof choiceWordingCheck>;

/**
 * Feedback on what ONE student wrote: what they chose and why (in their own meaning), the points of the choice
 * that matter to them, and their own sentence in natural English. How much there is depends on the CEFR level.
 */
export const reasonFeedback = z.object({
  yourChoice: z
    .string()
    .describe('ONE sentence to the student that says what they chose and the reason THEY gave, in correct simple English: "You chose the veggie sandwich because it looks big and filling." Only their reasons; add none.'),
  yourChoiceJa: z.string().describe("The same in natural Japanese."),
  goodPoints: z
    .array(z.string())
    .describe("Advantages of this choice that are relevant to what the student wrote or to what they care about, each one short sentence at the level. Only the facts and checks you are given. A1-A2: 1-2. B1-B2: up to 3."),
  thinkAbout: z
    .array(z.string())
    .describe("A real disadvantage of this choice for this student, from the facts and checks you are given, worded gently (\"You may need to wait 10 minutes.\"). A1: at most 1. Others: at most 2. Empty if there is none worth saying."),
  factChecks: z
    .array(z.object({ said: z.string().describe("What the student wrote, quoted briefly, without quotation marks."), fact: z.string().describe("The fact from the activity that it disagrees with, in one short, gentle sentence.") }))
    .describe("ONLY statements that contradict a listed fact. Opinions and preferences are never listed here. Empty if none."),
  assessment: z
    .string()
    .describe("B1: 1-2 sentences on the strengths and weaknesses of the choice in relation to the student's priorities. B2: 2-3 sentences weighing their reasoning, the trade-off and a possible consequence. A1-A2: empty."),
  yourEnglish: z
    .string()
    .describe("The student's own meaning in natural English at their level. A1: ONE sentence. A2: one or two simple sentences. B1: a clearer, more precise version in 1-2 sentences. B2: a more nuanced version in 1-3 sentences. Empty if what they wrote is already natural and correct."),
  yourEnglishJa: z.string().describe("yourEnglish in natural Japanese. Empty if yourEnglish is empty."),
});
export type ReasonFeedback = z.infer<typeof reasonFeedback>;

/** A condition on what one person in the group gets. */
const mealCondition = z.object({
  kind: z.enum(["hard", "soft"]),
  rule: z
    .enum(["has", "avoid", "needs category"])
    .describe('"has" = at least one of their items has this tag. "avoid" = none of their items has this tag. "needs category" = they must also get an item from this (optional) category.'),
  tag: z.string().describe("Exactly one tag name, for has / avoid. Empty for needs category."),
  category: z.string().describe("Exactly one category name, for needs category. Empty otherwise."),
  ...reason,
});

export const combinationPlan = z.object({
  situation: z.string().describe("2-3 short sentences to both students: who they are, who they are choosing for, and that they must agree on ONE order or list together. Do not state the budget (the app sets it)."),
  situationJa: z.string(),
  currency: z.string().describe('"¥" or "$" etc.'),
  categories: z.array(
    z.object({ name: z.string().describe('e.g. "Main", "Drink", "Side".'), nameJa: z.string(), required: z.boolean().describe("true = every person gets exactly one item from it. false = optional, at most one.") }),
  ),
  tags: z.array(z.object({ name: z.string().describe('One or two lower-case words describing items, e.g. "cheese", "meat", "spicy", "light", "large".'), nameJa: z.string() })),
  items: z.array(
    z.object({
      name: z.string(),
      category: z.string().describe("Exactly one category name."),
      price: z.number().describe("A whole number."),
      tags: z.array(z.string()).describe("Tag names that are true of this item. May be empty."),
    }),
  ),
  people: z.array(
    z.object({
      name: z.string().describe('e.g. "Dad", "Mum", "Ken (14)".'),
      about: z.string().describe("One short sentence about what this person needs or likes, matching their conditions."),
      aboutJa: z.string(),
      conditions: z.array(mealCondition),
    }),
  ),
});
export type CombinationPlan = z.infer<typeof combinationPlan>;

export type ChoiceCondition = z.infer<typeof choiceCondition>;
export type MealCondition = z.infer<typeof mealCondition>;

/** Stored "Choose One" activity. Student A and B each have their own circumstances; option values are split between them. */
export interface ChooseOneData extends Omit<ChooseOnePlan, "sharedConditions" | "studentA" | "studentB" | "options" | "decision" | "decisionWhy"> {
  format: "choose-one";
  /** How the decision is made (see decisionOf in lib/choice.ts). Missing on older activities, which were all shared decisions. */
  decision?: "individual" | "shared";
  /** Why the AI recommended that format for this scenario, for the teacher. */
  decisionWhy?: string;
  shared: ChoiceCondition[];
  students: Record<"A" | "B", z.infer<typeof chooser>>;
  /**
   * `picture` is drawn after the activity passes its checks: a data URL on the teacher page, a picture address once shared.
   * Missing when drawing failed. Activities made before pictures existed have no description, look or picture.
   */
  options: (ChooseOnePlan["options"][number] & { picture?: string })[];
  /**
   * The AI's part of the Decision Review of every option. Present on activities where students submit a choice
   * and their reasons; activities made before that have none and keep the older "Check Answers" page.
   */
  reviews?: ChoiceReviewText[];
}

/** Stored "Build a Combination" activity. The budget is set by the app from the prices and conditions. */
export interface CombinationData extends CombinationPlan {
  format: "combination";
  budget: number;
}

/** What a "Make the Best Choice" activity holds: one of the two formats, or the older profile table. */
export type ChoiceData = ProfileData | ChooseOneData | CombinationData;

// ---------- Story Gap ----------
export const storyData = z.object({
  background: z.string().describe("Short shared context both students read first."),
  events: z.array(
    z.object({
      time: z.string(),
      fact: z.string().describe("What happened, one or two sentences."),
      question: z.string().describe("The question a student asks to learn this fact, e.g. 'Why did he go back home?'"),
    }),
  ),
  explanation: z.string().describe("The full story in a few sentences, answering the final task."),
});
export type StoryData = z.infer<typeof storyData>;

export const activitySchemas = {
  picture: sharedOutput.extend({ data: pictureData }),
  text: sharedOutput.extend({ data: textData }),
  schedule: sharedOutput.extend({ data: scheduleData }),
  map: sharedOutput.extend({ data: mapPlan }),
  profile: sharedOutput.extend({ data: profileData }),
  chooseOne: sharedOutput.extend({ data: chooseOnePlan }),
  combination: sharedOutput.extend({ data: combinationPlan }),
  story: sharedOutput.extend({ data: storyData }),
};

/** Short plan that makes the parallel versions of one activity clearly different. */
export const versionPlan = z.object({
  briefs: z.array(z.string()).describe("One 1-2 sentence brief per version, in order."),
});

// ---------- AI Assist ----------
export const goalSuggestions = z.object({
  suggestions: z.array(z.string()).describe("2-3 alternative communication goals."),
});

/** Ideas for a Make the Best Choice activity, from a level and a lesson topic. Suggestions only. */
export const choiceSetupAssist = z.object({
  scenarios: z
    .array(
      z.object({
        scenario: z.string().describe('One line, e.g. "Two classmates each choose a lunch in the school cafeteria" or "Two flatmates choose one sofa for their living room".'),
        why: z.string().describe("A few words on why it suits this level and topic."),
        decision: z.enum(["individual", "shared"]).describe('"individual" if each person would naturally choose their own; "shared" only if they really must end with one common choice.'),
      }),
    )
    .describe("3 different situations where two people compare the same options and choose. The first is the one you recommend."),
  vocabulary: z.array(z.string()).describe("8-12 words or short phrases from the lesson topic that students would really need in these situations."),
  expressions: z.array(z.string()).describe("6-8 useful expressions, one per item: questions, opinions, comparisons and reasons, with ... for gaps."),
  grammar: z.array(z.string()).describe('1-3 grammar points that the task naturally uses, each with a tiny example, e.g. "comparatives: cheaper than ...". Empty if none is worth naming.'),
});
export type ChoiceSetupAssist = z.infer<typeof choiceSetupAssist>;

export const expressionAssist = z.object({
  corrections: z.array(
    z.object({
      original: z.string(),
      suggestion: z.string(),
      reason: z.string(),
    }),
  ),
  levelCheck: z.string().describe("Short comment on whether the expressions fit the CEFR level."),
  usefulAdditions: z.array(z.string()),
  simplerAlternatives: z.array(z.string()),
  challengingAlternatives: z.array(z.string()).describe("Empty if not appropriate for the level."),
  revisedList: z.array(z.string()).describe("The teacher's list with corrections applied, one expression per item."),
});
export type ExpressionAssist = z.infer<typeof expressionAssist>;
