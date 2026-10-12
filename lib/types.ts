import type {
  ChoiceData,
  MapData,
  PictureData,
  ScheduleData,
  SharedOutput,
  StoryData,
  TextData,
} from "./activitySchemas";

export type ActivityType = "picture" | "text" | "schedule" | "map" | "profile" | "story";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const DIFFICULTIES = ["Easy", "Intermediate", "Challenging"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SUPPORT_LEVELS = ["None", "Minimal", "Useful expressions", "Strong support"] as const;
export type LanguageSupport = (typeof SUPPORT_LEVELS)[number];

/**
 * Version of the activity data the generator produces. The teacher page checks it, so a page
 * that was left open across an app update asks for a reload instead of misreading new data.
 * Raise it whenever generated data changes shape (2 = maps made of buildings with entrances;
 * 3 = maps with an environment, route challenges and road works; 4 = Make the Best Choice formats;
 * 5 = Choose One with pictures, a submitted decision and a Decision Review;
 * 6 = Choose One as an individual or a shared decision).
 */
export const DATA_FORMAT = 6;

/** Who can see a piece of information. */
export type Holder = "A" | "B" | "both";
export type Role = "A" | "B";

export interface CommonSettings {
  cefr: CefrLevel;
  topic: string;
  goal: string;
  expressions: string;
  difficulty: Difficulty;
  support: LanguageSupport;
  /** Number of student pairs in the class. The app decides how many unique versions to make. */
  pairs: number;
}

/**
 * What the teacher generates and shares: a few unique versions of one activity.
 * Classroom pair p uses version versionForPair(p) (see lib/gapLogic.ts).
 */
export interface ActivitySet {
  pairCount: number;
  versions: Activity[];
}

export interface PictureSettings {
  differences: number;
  differenceTypes: string[];
  /** Students may open both pictures (and the list of differences) after the activity. */
  allowSelfCheck: boolean;
}
export interface TextSettings {
  contentType: string;
  itemCount: number;
  mainTask: string;
}
export interface ScheduleSettings {
  eventCount: number;
  finalTask: string;
}
export interface MapSettings {
  locationCount: number;
  /** Extra features the teacher wants on the map (names from MAP_FEATURE_OPTIONS), on top of the environment's own. */
  features: string[];
  /** Students may open the complete map after the activity. */
  allowSelfCheck: boolean;
}
export interface ProfileSettings {
  /** Choose One: agree on one option. Combination: build an order or list for a group within a budget. */
  format: "choose-one" | "combination";
  /** Offer Japanese translations of the situation and the student's own information (tap to show). */
  translations: boolean;
  /** Build a Combination: students may see every option and the possible choices after the activity. */
  allowSelfCheck: boolean;
  /** Choose One: who decides. "auto" (or missing) = the AI recommends individual or shared from the scenario. */
  decision?: "auto" | "individual" | "shared";
  /** Choose One: the lesson topic the teacher is teaching (e.g. "Food"). The scenario itself is the common topic. */
  lessonTopic?: string;
  /** Choose One: lesson vocabulary, one word or phrase per line. */
  vocabulary?: string;
  /** Choose One: grammar focus, free text. Empty = none. */
  grammar?: string;
  /** Choose One: after students submit, the AI also comments on the reasons they wrote (one AI request per submission). */
  reasonFeedback?: boolean;
}
export interface StorySettings {
  /** Students may open the whole timeline (and the explanation) after the activity. */
  allowSelfCheck: boolean;
  eventCount: number;
  finalTask: "reconstruct the story" | "put events in order" | "explain why something happened";
}

/** Type-specific settings, kept per type so switching type does not lose the teacher's input. */
export interface TypeSettings {
  picture: PictureSettings;
  text: TextSettings;
  schedule: ScheduleSettings;
  map: MapSettings;
  profile: ProfileSettings;
  story: StorySettings;
}

export interface GenerateRequest {
  type: ActivityType;
  common: CommonSettings;
  settings: TypeSettings[ActivityType];
}

type WithMeta<T extends ActivityType, D> = SharedOutput & {
  type: T;
  cefr: CefrLevel;
  support: LanguageSupport;
  data: D;
  /** Problems the app noticed and corrected (or could not correct) in the AI output. */
  notes: string[];
  /**
   * Students may check their answers after the activity (activities that have a self-check: see selfCheckAllowed).
   * Missing on activities shared before the option existed; treated as allowed.
   */
  allowSelfCheck?: boolean;
  /** Make the Best Choice: offer tap-to-show Japanese for the situation and the student's own information. */
  translations?: boolean;
  /** Make the Best Choice (Choose One): the AI comments on the reasons students submit. */
  reasonFeedback?: boolean;
  /** Make the Best Choice (Choose One): why some option pictures could not be drawn. */
  pictureError?: string;
};

export type Activity =
  | (WithMeta<"picture", PictureData> & { images: { a: string; b: string } | null; imageError?: string })
  | WithMeta<"text", TextData>
  | WithMeta<"schedule", ScheduleData>
  | WithMeta<"map", MapData>
  | WithMeta<"profile", ChoiceData>
  | WithMeta<"story", StoryData>;

export type ActivityOf<T extends ActivityType> = Extract<Activity, { type: T }>;
