/** Names, explanations, scenarios, grammar options and difficulty presets for each activity (used by the teacher page). */
import { ENVIRONMENT_CHOICES, ENVIRONMENTS } from "./mapEnvironments";
import type { ActivityType, Difficulty, LanguageSupport, TypeSettings } from "./types";

/** A question pattern the teacher can tick. Ticking it adds these lines to the target expressions. */
export interface GrammarOption {
  label: string;
  expressions: string[];
}

export interface ActivityTypeInfo {
  type: ActivityType;
  name: string;
  group: string;
  summary: string;
  /**
   * Not part of the current release: still being developed. The activity stays usable and links already
   * shared keep opening; the teacher is told it is not finished.
   */
  inDevelopment?: boolean;
  /** Shown before generating, so the teacher knows what the activity is. */
  about: {
    studentA: string;
    studentB: string;
    why: string;
    finish: string;
    practises: string;
    dialogue: string[];
    /** Honest limits of the current version. */
    note?: string;
  };
  scenarioLabel: string;
  /** The first scenario is the default. */
  scenarios: string[];
  /** The first option is ticked by default. */
  grammar: GrammarOption[];
  goalExample: string;
  /** What each difficulty changes. Must match DIFFICULTY_PRESETS and the difficulty guide in lib/activityPrompts.ts. */
  difficulty: Record<Difficulty, string>;
  /** What "Strong support" adds on the student screen, besides more phrases. */
  strongSupportExtra: string;
  /** The app chooses the students' language support from the level, so no target expressions are filled in by default. */
  appLanguage?: boolean;
}

/** Make the Best Choice (Choose One): lesson topics offered to the teacher. The first is the default. */
export const LESSON_TOPICS = ["Food", "Weather", "Free-time activities", "Clothes", "Travel", "School life", "Shopping", "Homes", "Jobs"];

/** Make the Best Choice: scenarios offered for each decision format. The first is the default. */
export const CHOICE_SCENARIOS = {
  "choose-one": [
    "Two students choose an apartment to share",
    "Two managers choose a new employee for a café",
    "Two teachers choose a hotel for a school trip",
    "Two club members choose a new club leader",
  ],
  combination: [
    "Order fast food for a family",
    "Buy food and drinks for a class party",
    "Make a shopping list for a camping trip",
  ],
};

export const ACTIVITY_GROUPS = ["Describe and find", "Decide together", "Compare and choose", "Work it out", "Ask and guess", "More"];

export const ACTIVITY_TYPES: ActivityTypeInfo[] = [
  {
    type: "picture",
    name: "Spot the Differences",
    group: "Describe and find",
    summary: "Two pictures of the same scene. Students describe them to find the differences.",
    about: {
      studentA: "A picture of the scene.",
      studentB: "The same scene with a few things changed.",
      why: "Neither student can see the other picture, so they must describe theirs and ask questions.",
      finish: "They have found all the differences.",
      practises: "There is / There are, prepositions of place, colours, numbers, actions",
      dialogue: ["A: Is there a lamp on your desk?", "B: Yes, there is. It's red.", "A: Mine is yellow. That's one difference!"],
    },
    scenarioLabel: "Scene",
    scenarios: ["bedroom", "living room", "kitchen", "café", "classroom", "park"],
    grammar: [
      { label: "There is / There are", expressions: ["There is a ... on the ...", "There are two ... in my picture.", "Is there a ... in your picture?"] },
      { label: "Where is …? (prepositions)", expressions: ["Where is the ...?", "It's next to / under / behind the ..."] },
      { label: "What colour …? / How many …?", expressions: ["What colour is the ...?", "How many ... are there?"] },
      { label: "Actions (present continuous)", expressions: ["What is the ... doing?", "He / She is ...ing."] },
    ],
    goalExample: "Students can describe where things are and find differences.",
    difficulty: {
      Easy: "4 differences. An object is missing, or a different object is in its place.",
      Intermediate: "6 differences: colour, position, number and actions.",
      Challenging: "8 differences, mostly about where things are in relation to each other (left or right of, in front of, behind, between).",
    },
    strongSupportExtra: "",
  },
  {
    type: "map",
    name: "How Do I Get There?",
    group: "Describe and find",
    summary: "One map of a realistic place. Each student knows different places, and they guide each other there.",
    about: {
      studentA: "The map with half of the places named, a list of places to find and, at harder levels, a route challenge.",
      studentB: "The same map with the other half named, a different list and a different route challenge.",
      why: "Each place is named on only one student's map. At the hardest level, each map also shows road works the partner cannot see.",
      finish: "Both students have found their places and agreed on a route for each route challenge.",
      practises: "Asking for and giving directions, saying where things are, comparing routes",
      dialogue: [
        "A: Excuse me, how do I get to the bookstore?",
        "B: Go straight along Park Avenue for two blocks and turn left. It's the second building on your right, on the corner.",
        "A: Is there another way? That street is closed on my map.",
      ],
    },
    scenarioLabel: "Environment",
    scenarios: ENVIRONMENT_CHOICES.map((id) => ENVIRONMENTS[id].label),
    grammar: [
      { label: "Giving directions (Go … / Turn …)", expressions: ["Go straight along ...", "Turn left / right at ...", "It's on your left / right."] },
      { label: "Where is …? (next to / opposite / on the corner)", expressions: ["Where is the ...?", "It's next to / opposite the ...", "It's on the corner of ... and ...", "The entrance is on ..."] },
      { label: "Polite questions", expressions: ["Excuse me, how do I get to the ...?", "Could you tell me the way to the ...?"] },
      { label: "Comparing routes", expressions: ["This route is shorter / faster.", "Is there another way?"] },
    ],
    goalExample: "Students can ask for and give directions.",
    difficulty: {
      Easy: "Find places and give simple directions using streets and landmarks. (6 places to find.)",
      Intermediate: "Compare different routes and explain which is shorter or easier. (6 places to find, then one route challenge each. Traffic lights add waiting time.)",
      Challenging:
        "Find the best available route while dealing with construction, closures, or other obstacles. (4 places to find, then one route challenge each. Each map shows a closed road the partner cannot see.)",
    },
    strongSupportExtra: "",
    appLanguage: true,
  },
  {
    type: "schedule",
    inDevelopment: true,
    name: "Make a Plan!",
    group: "Decide together",
    summary: "Each student has their own week. Together they find a time to do something.",
    about: {
      studentA: "Their own schedule for the week.",
      studentB: "Their own, different schedule.",
      why: "Each student can see only their own schedule.",
      finish: "They agree on one day and time that works for both.",
      practises: "Making suggestions, talking about plans, days and times",
      dialogue: [
        "A: Are you free on Tuesday afternoon?",
        "B: Sorry, I have a music lesson. How about Thursday?",
        "A: Thursday at 4:30 is fine. Let's meet then.",
      ],
      note: "For now students negotiate the time. Prices, preferences and other limits are planned for the next update.",
    },
    scenarioLabel: "What are they planning?",
    scenarios: ["Go to a movie together", "Organize a class party", "Plan a day trip", "Meet to work on a group project", "Play a sport together"],
    grammar: [
      { label: "Are you free …? / How about …?", expressions: ["Are you free on ...?", "How about ...?", "Sorry, I'm busy. I have ..."] },
      { label: "have to / can't", expressions: ["I have to ... on ...", "I can't meet on ... because ..."] },
      { label: "Plans (be going to)", expressions: ["What are you doing on ...?", "I'm going to ... on ..."] },
      { label: "Shall we …? / Let's …", expressions: ["Shall we meet on ...?", "Let's meet at ..."] },
    ],
    goalExample: "Students can talk about plans and agree on a time to meet.",
    difficulty: {
      Easy: "3 days. Exactly one time when both are free.",
      Intermediate: "4 days and busier schedules. Exactly one time when both are free.",
      Challenging: "5 days. Two possible times; students choose the better one and say why.",
    },
    strongSupportExtra: "",
  },
  {
    type: "profile",
    name: "Make the Best Choice",
    group: "Compare and choose",
    summary: "Two students look at pictures of the options, exchange what they know, then choose and give their reasons: each for themselves, or one choice together.",
    about: {
      studentA: "A picture of every option, half of the facts about them, and what they themselves want.",
      studentB: "The same pictures, the other half of the facts, and different wishes.",
      why: "Each student has facts the other needs, so nobody can choose well without asking.",
      finish:
        "Individual decision: each student chooses for themselves and writes their own reasons. Shared decision (only when the scenario needs it): they agree on one. Either way they then read a Decision Review, and more than one choice can be a good one.",
      practises: "Asking for details, saying what you want, comparing, giving reasons (and, in a shared decision, compromising)",
      dialogue: [
        "A: How much is the curry set?",
        "B: It's ¥750. How long is the wait for the pasta?",
        "A: Fifteen minutes. Which one do you like?",
        "B: The curry, because it's fast. What about you?",
      ],
    },
    scenarioLabel: "Scenario",
    scenarios: CHOICE_SCENARIOS["choose-one"],
    grammar: [
      { label: "Questions about facts (How much … / Is it … / Does it have …?)", expressions: ["How much is ...?", "Is it ...?", "Does it have ...?"] },
      { label: "Needs (have to / can't / need)", expressions: ["I need ...", "I can't ...", "It has to ..."] },
      { label: "Comparing (-er than / the best)", expressions: ["... is cheaper than ...", "... is the best because ..."] },
      { label: "Opinions and agreeing", expressions: ["I think ... because ...", "How about ...?", "OK, I agree."] },
    ],
    goalExample: "Students can explain what they need and agree on a choice.",
    difficulty: {
      Easy: "A simple decision: few things to compare and clear wishes. More than one choice can be a good one.",
      Intermediate: "No option gives a student everything they want, so they have to compare and decide what matters most.",
      Challenging: "More conditions that pull in different directions. Students weigh them up and justify what they give up.",
    },
    strongSupportExtra: "a suggested question beside each missing fact",
    appLanguage: true,
  },
  {
    type: "story",
    inDevelopment: true,
    name: "What Happened?",
    group: "Work it out",
    summary: "One incident. Each student knows different parts, and together they explain what happened.",
    about: {
      studentA: "A timeline with some of the events.",
      studentB: "The same timeline with the other events.",
      why: "Each student is missing events that only their partner has.",
      finish: "Together they can explain why it happened.",
      practises: "Past simple questions and answers, because / so, sequencing",
      dialogue: [
        "A: What happened at 7:40?",
        "B: She went back home because she forgot her student ID.",
        "A: I see. Then at 7:50 she found it on the kitchen table.",
      ],
      note: "The student timeline still prints a question for each missing event. The next update removes these so they cannot give answers away.",
    },
    scenarioLabel: "The incident",
    scenarios: [
      "A student arrived late for an exam.",
      "A tourist lost her bag.",
      "The school festival almost went wrong.",
      "Someone missed the last train.",
      "A birthday surprise went wrong.",
    ],
    grammar: [
      { label: "Past simple questions", expressions: ["What happened at ...?", "Why did he / she ...?", "Where did ... go?"] },
      { label: "because / so", expressions: ["Because ...", "..., so ..."] },
      { label: "Sequencing (first / then / after that)", expressions: ["First, ...", "After that, ...", "In the end, ..."] },
      { label: "Past continuous", expressions: ["What was ... doing when ...?", "While ... was ...ing, ..."] },
    ],
    goalExample: "Students can ask about past events and explain why something happened.",
    difficulty: {
      Easy: "6 events. Short, simple facts and one clear cause.",
      Intermediate: "8 events. Two causes that combine.",
      Challenging: "10 events. A longer chain of causes, with one detail that turns out not to matter.",
    },
    strongSupportExtra: "",
  },
  {
    type: "text",
    inDevelopment: true,
    name: "Complete the Table",
    group: "More",
    summary: "Each student has half of a table and asks for the rest. The guessing games will replace this activity.",
    about: {
      studentA: "A table with half of the cells filled in.",
      studentB: "The same table with the other half filled in.",
      why: "Each missing cell is on the partner's screen.",
      finish: "They have asked about every missing cell and done the final task.",
      practises: "Simple questions and short answers",
      dialogue: ["A: Does Steve like pizza?", "B: No, he doesn't.", "B: Does John like soccer?", "A: Yes, he does."],
    },
    scenarioLabel: "Topic",
    scenarios: ["What John and Steve like and don't like", "Two classmates' personal information", "Facts about two cities"],
    grammar: [
      { label: "Does he / she like …?", expressions: ["Does he like ...?", "Yes, he does. / No, he doesn't.", "He likes ... / He doesn't like ..."] },
      { label: "Wh- questions", expressions: ["What is ...'s ...?", "Where does ... live?"] },
    ],
    goalExample: "Students can ask and answer about likes and dislikes.",
    difficulty: {
      Easy: "6 rows of short, simple facts.",
      Intermediate: "8 rows.",
      Challenging: "10 rows with more detailed answers.",
    },
    strongSupportExtra: "a suggested question beside each missing cell",
  },
];

export const TYPE_INFO = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.type, t])) as Record<ActivityType, ActivityTypeInfo>;

/** Activities shown in the selector that cannot be made yet. */
export const UPCOMING_ACTIVITIES: { name: string; group: string; summary: string }[] = [
  { name: "Who Am I?", group: "Ask and guess", summary: "Each student has a secret identity. Ask yes/no questions to find out who your partner is." },
  { name: "What's in My Bag?", group: "Ask and guess", summary: "Each student has a secret bag. Ask questions to find out what is inside." },
  { name: "Guess My Weekend!", group: "Ask and guess", summary: "Each student had a secret weekend. Ask past-tense questions to find out what they did." },
  { name: "Guess the Rules!", group: "Ask and guess", summary: "Each student is in a secret place. Ask about the rules there to find out where." },
  { name: "Create Your Own Activity", group: "More", summary: "Start from a blank page and write your own Student A and Student B information." },
];

/** The default target expressions of an activity: its first grammar option. */
export function defaultExpressions(type: ActivityType): string {
  return TYPE_INFO[type].appLanguage ? "" : TYPE_INFO[type].grammar[0].expressions.join("\n");
}

/** What students see for each language support level. */
export function supportDescription(type: ActivityType, support: LanguageSupport): string {
  const extra = TYPE_INFO[type].strongSupportExtra;
  switch (support) {
    case "None":
      return "Students see no language help.";
    case "Minimal":
      return "Students see a very short list of key phrases under the task.";
    case "Useful expressions":
      return "Students see a list of useful phrases under the task.";
    case "Strong support":
      return `Students see more phrases, written as sentence frames with gaps${extra ? `, and ${extra}` : ""}.`;
  }
}

// ---------- Settings and difficulty ----------

/** Settings that difficulty does not touch. */
const BASE_SETTINGS: TypeSettings = {
  picture: { differences: 6, differenceTypes: [], allowSelfCheck: true },
  text: { contentType: "", itemCount: 8, mainTask: "" },
  schedule: { eventCount: 12, finalTask: "find a time when both are free" },
  map: { locationCount: 6, features: [], allowSelfCheck: true },
  profile: { format: "choose-one", translations: true, allowSelfCheck: true, decision: "auto", lessonTopic: LESSON_TOPICS[0], vocabulary: "", grammar: "", reasonFeedback: true },
  story: { eventCount: 8, finalTask: "explain why something happened", allowSelfCheck: true },
};

/**
 * What each difficulty sets for each activity.
 * Schedule: the number of events is chosen so that the grid in the difficulty guide can have the required free times.
 */
const DIFFICULTY_PRESETS: Record<Difficulty, { [T in ActivityType]: Partial<TypeSettings[T]> }> = {
  Easy: {
    picture: { differences: 4, differenceTypes: ["object"] },
    text: { itemCount: 6 },
    schedule: { eventCount: 8 },
    map: { locationCount: 6 },
    profile: {},
    story: { eventCount: 6 },
  },
  Intermediate: {
    picture: { differences: 6, differenceTypes: ["color", "position", "number", "action"] },
    text: { itemCount: 8 },
    schedule: { eventCount: 12 },
    map: { locationCount: 6 },
    profile: {},
    story: { eventCount: 8 },
  },
  Challenging: {
    picture: { differences: 8, differenceTypes: ["position"] },
    text: { itemCount: 10 },
    schedule: { eventCount: 16 },
    map: { locationCount: 4 },
    profile: {},
    story: { eventCount: 10 },
  },
};

const TYPES = Object.keys(BASE_SETTINGS) as ActivityType[];

/** Applies a difficulty to every activity's settings, keeping what difficulty does not control. */
export function applyDifficulty(settings: TypeSettings, difficulty: Difficulty): TypeSettings {
  const preset = DIFFICULTY_PRESETS[difficulty];
  return Object.fromEntries(TYPES.map((t) => [t, { ...settings[t], ...preset[t] }])) as unknown as TypeSettings;
}

/** True while the settings still match what the difficulty description promises. */
export function matchesDifficulty(type: ActivityType, settings: TypeSettings[ActivityType], difficulty: Difficulty): boolean {
  return JSON.stringify({ ...settings, ...DIFFICULTY_PRESETS[difficulty][type] }) === JSON.stringify(settings);
}

export const DEFAULT_DIFFICULTY: Difficulty = "Intermediate";
export const DEFAULT_TYPE_SETTINGS: TypeSettings = applyDifficulty(BASE_SETTINGS, DEFAULT_DIFFICULTY);

/** Extra map features the teacher can add to the ones the environment already has. */
export const MAP_FEATURE_OPTIONS = {
  "Route features": [
    "Traffic lights",
    "Pedestrian crossing / zebra crossing",
    "Bridge",
    "Railway crossing",
    "Pedestrian underpass",
    "Pedestrian overpass",
    "Tunnel",
    "Roundabout",
  ],
  Landmarks: ["River", "Railway", "Park", "Bus stop", "Taxi stand", "Station entrance", "Subway entrance", "Convenience store", "Police box", "Parking lot"],
};
