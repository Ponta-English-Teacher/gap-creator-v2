/**
 * "Make the Best Choice": building, checking and solving the two decision formats.
 *
 *   Choose One            two students with different circumstances agree on one option
 *   Build a Combination   two students put together an order or list for a group, within a budget
 *
 * The AI writes the situation, the options and the conditions. Every condition is a rule the app can
 * check, so the app decides what is possible: it validates each generated activity before a teacher
 * sees it, sets the budget of a combination itself, and works out the answers shown in the Answer Key.
 */
import type { ChoiceCondition, ChoiceData, ChoiceReviewText, ChoiceWordingCheck, ChooseOneData, ChooseOnePlan, CombinationData, CombinationPlan, MealCondition } from "./activitySchemas";
import type { CefrLevel, Difficulty, Holder, LanguageSupport, Role } from "./types";

export type ChoiceFormat = "choose-one" | "combination";

export const isChooseOne = (data: ChoiceData): data is ChooseOneData => "format" in data && data.format === "choose-one";
export const isCombination = (data: ChoiceData): data is CombinationData => "format" in data && data.format === "combination";

/** Choose One activities where students submit a choice with reasons and then read its Decision Review. */
export const hasDecisionReview = (data: ChoiceData): data is ChooseOneData & { reviews: ChoiceReviewText[] } => isChooseOne(data) && Array.isArray(data.reviews);

export type DecisionFormat = "individual" | "shared";

/**
 * How the decision is made. Individual: after exchanging information, each student chooses for themselves,
 * and different choices are fine. Shared: the two students must end with the same option.
 * Activities made before the two formats existed were all shared decisions.
 */
export const decisionOf = (data: ChooseOneData): DecisionFormat => (data.decision === "individual" ? "individual" : "shared");

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "dish" -> "dishes", "activity" -> "activities", "apartment" -> "apartments". */
export function plural(noun: string): string {
  if (/[^aeiou]y$/i.test(noun)) return noun.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(noun)) return noun + "es";
  return noun + "s";
}
const number = (n: number) => n.toLocaleString("en-US");

// ====================================================================================
// Choose One
// ====================================================================================

type Attribute = ChooseOneData["attributes"][number];

/** A value as students read it: "¥65,000 a month", "20 minutes", "Yes". */
export function formatValue(attribute: Attribute, value: { number: number; yes: boolean }): string {
  if (attribute.kind === "yesno") return value.yes ? "Yes" : "No";
  // Money that is not a whole amount is written the way prices are: $3.50, not $3.5.
  const amount = attribute.currency && !Number.isInteger(value.number) ? value.number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : number(value.number);
  return `${attribute.currency}${amount}${attribute.unit ? ` ${attribute.unit}` : ""}`;
}

/** A condition in words, built from its rule so the words and the rule can never disagree. */
export function conditionText(c: ChoiceCondition, data: ChooseOneData, withReason = true): { text: string; ja: string } {
  const a = data.attributes.find((x) => same(x.name, c.attribute));
  if (!a) return { text: c.attribute, ja: c.attribute };
  const value = { number: c.amount, yes: c.rule === "yes" };
  const rule =
    c.rule === "low" ? "lower is better" : c.rule === "high" ? "higher is better" : c.rule === "at most" ? `${formatValue(a, value)} or less` : c.rule === "at least" ? `${formatValue(a, value)} or more` : c.rule === "yes" ? "yes" : "no";
  const ruleJa =
    c.rule === "low" ? "低いほどよい" : c.rule === "high" ? "高いほどよい" : c.rule === "at most" ? `${number(c.amount)}${a.unitJa}以下` : c.rule === "at least" ? `${number(c.amount)}${a.unitJa}以上` : c.rule === "yes" ? "あり" : "なし";
  if (!withReason) return { text: `${a.name}: ${rule}`, ja: `${a.nameJa || a.name}：${ruleJa}` };
  return {
    text: `${a.name}: ${rule}${c.reason ? ` (${c.reason})` : ""}`,
    ja: `${a.nameJa || a.name}：${ruleJa}${c.reasonJa ? `（${c.reasonJa}）` : ""}`,
  };
}

/** A priority ("the lower the better"), as opposed to a limit or a yes/no wish. It is weighed, never simply met or failed. */
export const isPriority = (c: ChoiceCondition) => c.rule === "low" || c.rule === "high";

/**
 * A condition as the student reads it. Newer activities give every condition a sentence in the student's own
 * terms ("You do not want to wait long, because ..."); a limit also shows its rule, so the words and the check
 * can be compared. Older activities have only the rule.
 */
export function wishText(c: ChoiceCondition, data: ChooseOneData): { text: string; ja: string } {
  const wish = c.wish?.trim();
  if (!wish) return conditionText(c, data);
  const ja = c.wishJa?.trim() || wish;
  // Only a limit needs its figure repeated; a wish reads better as the sentence alone.
  if (c.kind === "soft") return { text: wish, ja };
  const rule = conditionText(c, data, false);
  return { text: `${wish} (${rule.text})`, ja: `${ja}（${rule.ja}）` };
}

type Option = ChooseOneData["options"][number];

function meets(c: ChoiceCondition, option: Option, data: ChooseOneData): boolean {
  const i = data.attributes.findIndex((x) => same(x.name, c.attribute));
  const v = option.values[i];
  if (i < 0 || !v) return false;
  if (isPriority(c)) return true;
  if (c.rule === "at most") return v.number <= c.amount;
  if (c.rule === "at least") return v.number >= c.amount;
  return v.yes === (c.rule === "yes");
}

/** How well an option does on one condition, higher being better. A priority uses the value itself; anything else is met (1) or not (0). */
function score(c: ChoiceCondition, option: Option, data: ChooseOneData): number {
  if (!isPriority(c)) return meets(c, option, data) ? 1 : 0;
  const v = option.values[data.attributes.findIndex((x) => same(x.name, c.attribute))];
  return v ? (c.rule === "low" ? -v.number : v.number) : 0;
}

export type Fit = "best" | "middle" | "worst";

/** Where an option stands among all the options on one wish. A yes/no wish or a limit is either "best" (met) or "worst". */
export function fitOf(c: ChoiceCondition, option: Option, data: ChooseOneData): Fit {
  const all = data.options.map((o) => score(c, o, data));
  const mine = score(c, option, data);
  if (!isPriority(c)) return mine ? "best" : "worst";
  return mine === Math.max(...all) ? "best" : mine === Math.min(...all) ? "worst" : "middle";
}

export type Owner = "shared" | Role;
export interface OwnedCondition {
  owner: Owner;
  condition: ChoiceCondition;
}

/** Every condition of the activity with whose it is. */
export function allConditions(data: ChooseOneData): OwnedCondition[] {
  return [
    ...data.shared.map((condition) => ({ owner: "shared" as Owner, condition })),
    ...data.students.A.conditions.map((condition) => ({ owner: "A" as Owner, condition })),
    ...data.students.B.conditions.map((condition) => ({ owner: "B" as Owner, condition })),
  ];
}

export interface OptionReport {
  name: string;
  /** Meets every hard condition (shared, Student A's and Student B's). */
  possible: boolean;
  failed: OwnedCondition[];
  /** Wishes this option is the best for (or simply grants), the worst for (or does not grant), and in between. */
  wishesMet: OwnedCondition[];
  wishesMissed: OwnedCondition[];
  wishesPartly: OwnedCondition[];
  /** Possible options that are at least as good on every wish and better on one. */
  beatenBy: string[];
  /** Possible, and no other possible option is at least as good on every wish and better on one. */
  defensible: boolean;
}

/**
 * Checks every option against the conditions. This is the answer the Answer Key shows.
 * Without `role`: every condition (a shared decision). With `role`: the shared conditions and that
 * student's own (an individual decision, where the partner's wishes do not bind them).
 */
export function evaluateOptions(data: ChooseOneData, role?: Role): OptionReport[] {
  const conditions = allConditions(data).filter((c) => !role || c.owner === "shared" || c.owner === role);
  const hard = conditions.filter((c) => c.condition.kind === "hard");
  const soft = conditions.filter((c) => c.condition.kind === "soft");
  const reports: OptionReport[] = data.options.map((option) => {
    const failed = hard.filter((c) => !meets(c.condition, option, data));
    const at = (fit: Fit) => soft.filter((c) => fitOf(c.condition, option, data) === fit);
    return { name: option.name, possible: failed.length === 0, failed, wishesMet: at("best"), wishesMissed: at("worst"), wishesPartly: at("middle"), beatenBy: [], defensible: false };
  });
  const better = (p: number, r: number) => {
    // Shared decisions made before priorities existed compared how many wishes each student was granted.
    if (!role && !soft.some((c) => isPriority(c.condition))) {
      const count = (i: number, owner: Owner) => reports[i].wishesMet.filter((c) => c.owner === owner).length;
      const owners: Owner[] = ["A", "B", "shared"];
      return owners.every((o) => count(p, o) >= count(r, o)) && owners.some((o) => count(p, o) > count(r, o));
    }
    const diff = soft.map((c) => score(c.condition, data.options[p], data) - score(c.condition, data.options[r], data));
    return diff.every((d) => d >= 0) && diff.some((d) => d > 0);
  };
  reports.forEach((r, i) => {
    r.beatenBy = reports.filter((p, k) => k !== i && p.possible && better(k, i)).map((p) => p.name);
    r.defensible = r.possible && !r.beatenBy.length;
  });
  return reports;
}

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2"];
const STEPS: Difficulty[] = ["Easy", "Intermediate", "Challenging"];

export interface ChooseOneShape {
  options: number;
  /** Facts every option has, in the same table. Kept few: the rest of what there is to say is in each option's own details. */
  attributes: number;
  /** Things that are true of one option only, told to one student each. */
  details: number;
  /** The most real limits ("Must") a student may have. They are never required: a limit belongs only where the situation has one. */
  hardEach: number;
  /** Things each student cares about. */
  softEach: number;
  /** One option must suit Student A better and another Student B better. */
  competing: boolean;
  /** How many different attributes the conditions must concern. */
  usedAttributes: number;
}

/**
 * What a Choose One activity looks like. The CEFR level sets how much there is to read and compare;
 * the task difficulty sets how hard the decision is. The choice is about what people care about at every level,
 * so the table of facts stays small and no level needs a limit.
 * The prompt asks for this shape and the checks enforce it.
 */
export function chooseOneShape(cefr: CefrLevel, difficulty: Difficulty, decision: DecisionFormat = "shared"): ChooseOneShape {
  const level = Math.max(0, LEVELS.indexOf(cefr));
  const step = Math.max(0, STEPS.indexOf(difficulty));
  // Choosing for yourself needs two wishes of your own, or the one wish simply picks the answer.
  const softEach = level === 0 ? (step === 0 && decision === "shared" ? 1 : 2) : level === 3 && step > 0 ? 3 : 2;
  const attributes = level === 0 ? (softEach === 1 ? 2 : 3) : level === 1 ? 3 : level === 2 ? (step === 2 ? 4 : 3) : 4;
  return {
    options: level === 0 || (level === 1 && step === 0) ? 3 : 4,
    attributes,
    details: level === 0 ? 1 : 2,
    hardEach: level === 0 ? 0 : level === 3 && step === 2 ? 2 : 1,
    softEach,
    competing: decision === "shared" && (level >= 2 || step >= 1),
    usedAttributes: Math.min(attributes, level === 0 ? 2 : 3),
  };
}

/**
 * Turns the AI's plan into a stored activity and lists everything that is wrong with it.
 * An empty list means the activity is logically sound: it is possible, the students have different wishes,
 * and at least two options can be defended, so the decision is theirs to make and explain.
 */
export function buildChooseOne(plan: ChooseOnePlan, difficulty: Difficulty, cefr: CefrLevel = "B1", teacherDecision?: DecisionFormat): { data: ChooseOneData; problems: string[] } {
  const { sharedConditions, studentA, studentB, ...rest } = plan;
  // The teacher's choice of decision format wins; otherwise the AI's recommendation for this scenario is used.
  const decision: DecisionFormat = teacherDecision ?? (plan.decision === "individual" ? "individual" : "shared");
  const data: ChooseOneData = { ...rest, decision, format: "choose-one", shared: sharedConditions, students: { A: studentA, B: studentB } };
  const problems: string[] = [];
  const shape = chooseOneShape(cefr, difficulty, decision);
  const roles: Role[] = ["A", "B"];
  if (teacherDecision && plan.decision !== teacherDecision) problems.push(`The teacher chose a${teacherDecision === "individual" ? "n individual" : " shared"} decision, but "decision" says "${plan.decision}". Write the whole activity for a${teacherDecision === "individual" ? "n individual" : " shared"} decision.`);

  // Structure.
  if (data.attributes.length < 2) problems.push(`There are only ${data.attributes.length} attributes; at least 2 are needed.`);
  if (data.attributes.length > shape.attributes + 1) problems.push(`There are ${data.attributes.length} attributes. Use ${shape.attributes}: keep the table small, and put what is special about each option in its "details".`);
  if (data.options.length < 2) problems.push("There must be at least 2 options.");
  if (data.options.length > shape.options + 1) problems.push(`There are ${data.options.length} options; use ${shape.options} at this level.`);
  if (new Set(data.options.map((o) => o.name.toLowerCase())).size !== data.options.length) problems.push("Two options have the same name.");
  if (new Set(data.attributes.map((a) => a.name.toLowerCase())).size !== data.attributes.length) problems.push("Two attributes have the same name.");
  for (const o of data.options) {
    if (o.values.length !== data.attributes.length) problems.push(`${o.name} has ${o.values.length} values but there are ${data.attributes.length} attributes.`);
    o.values.forEach((v, i) => data.attributes[i]?.kind === "number" && !Number.isFinite(v.number) && problems.push(`${o.name}: "${data.attributes[i].name}" is not a number.`));
    // People say "45 minutes", not "0.75 hours". Money may have cents, and a half is natural ("1.5 hours").
    o.values.forEach((v, i) => {
      const a = data.attributes[i];
      if (a?.kind === "number" && !a.currency && Number.isFinite(v.number) && !Number.isInteger(v.number * 2)) problems.push(`${o.name}: "${a.name}" is ${v.number}${a.unit ? ` ${a.unit}` : ""}. Use a smaller unit so the values are whole numbers (minutes instead of parts of an hour).`);
    });
    if (!o.look?.trim()) problems.push(`${o.name} has no "look", so its picture cannot be drawn.`);
    const details = (o.details ?? []).filter((d) => d.text.trim());
    if (details.length < shape.details || details.length > 3) problems.push(`${o.name} has ${details.length} detail(s) of its own; give every option exactly ${shape.details}.`);
    if (new Set(details.map((d) => d.text.trim().toLowerCase())).size !== details.length) problems.push(`${o.name} gives the same detail twice.`);
  }
  for (const a of data.attributes) {
    if (/\b(servings?|portions?|helpings?)\b/i.test(`${a.name} ${a.unit}`)) problems.push(`"${a.name}" counts servings or portions, which is not how people describe one person's choice. Use a natural fact (price, waiting time, size in a normal unit, what is included).`);
    // The app uses these to compare options in natural words ("has the shortest wait"), so they must be usable.
    if (a.kind === "number") {
      const phrase = /^(is|has) \S/i;
      if (!phrase.test(a.lowest?.trim() ?? "") || !phrase.test(a.highest?.trim() ?? "")) problems.push(`"${a.name}" needs "lowest" and "highest": how to say an option has the lowest / highest value, beginning with "is" or "has" (e.g. "is the cheapest", "has the longest wait").`);
      else if (same(a.lowest, a.highest)) problems.push(`"${a.name}" has the same words for "lowest" and "highest".`);
    }
    const numeric = a.better === "lower" || a.better === "higher";
    if (a.better !== "none" && (a.kind === "number") !== numeric) problems.push(`"${a.name}" is a ${a.kind === "number" ? "number" : "yes/no"} attribute, so "better" cannot be "${a.better}".`);
  }
  const conditions = allConditions(data);
  for (const { owner, condition: c } of conditions) {
    const a = data.attributes.find((x) => same(x.name, c.attribute));
    const who = owner === "shared" ? "A shared condition" : `A condition of Student ${owner}`;
    if (!a) problems.push(`${who} is about "${c.attribute}", which is not one of the attributes.`);
    else if ((a.kind === "number") !== (c.rule !== "yes" && c.rule !== "no")) problems.push(`${who} uses the rule "${c.rule}" on "${a.name}", which is a ${a.kind === "number" ? "number" : "yes/no"} attribute.`);
    // People care about things; they rarely have an exact figure in mind.
    if (c.kind === "soft" && (c.rule === "at most" || c.rule === "at least")) problems.push(`${who} is a wish with an exact figure ("${c.attribute}" ${c.rule} ${c.amount}). A wish is a priority: use the rule "low" or "high" and say why it matters to the student. Only a hard limit has a number.`);
    if (c.kind === "hard" && isPriority(c)) problems.push(`${who} is hard but uses the rule "${c.rule}". A hard condition is a limit ("at most" / "at least" with an amount, or "yes" / "no").`);
    if (!c.wish?.trim()) problems.push(`${who} about "${c.attribute}" has no "wish" sentence for the student to read.`);
    else if (isPriority(c) && /\d/.test(c.wish)) problems.push(`The wish "${c.wish}" contains a number. A priority is said in words ("You do not want to wait long"), with its reason.`);
  }
  for (const role of roles) {
    const own = data.students[role].conditions;
    const soft = own.filter((c) => c.kind === "soft").length;
    if (!soft) problems.push(`Student ${role} has no wish ("soft" condition), so they have nothing of their own to say.`);
    if (soft > shape.softEach + 1) problems.push(`Student ${role} has ${soft} wishes. Give them ${shape.softEach}: a few things they really care about, not a checklist.`);
    if (own.length - soft > shape.hardEach) problems.push(`Student ${role} has ${own.length - soft} hard limit(s). ${shape.hardEach ? `At most ${shape.hardEach} is allowed at this level, and only when their situation really has one.` : "At this level the choice is about what they like: use no hard limits for the students."}`);
    if (new Set(own.filter((c) => c.kind === "soft").map((c) => c.attribute.toLowerCase())).size !== soft) problems.push(`Student ${role} has two wishes about the same attribute. Each wish is about a different one.`);
    if (!data.students[role].interests?.trim()) problems.push(`Student ${role} has no "interests": a taste or worry of their own that the options' details speak to.`);
  }
  if (data.shared.some((c) => c.kind === "soft")) problems.push("A shared condition is a wish. Shared conditions are only limits that come from the situation; wishes belong to one student.");
  if (data.shared.length > 1) problems.push(`There are ${data.shared.length} shared conditions. Use at most one, and only if the situation itself sets a limit.`);
  if (same(data.students.A.role, data.students.B.role)) problems.push(`Both students have the role "${data.students.A.role}". Give each a role that describes their own circumstances.`);
  // Two different people: different tastes, and at most one wish in common.
  if (same(data.students.A.interests ?? "", data.students.B.interests ?? "")) problems.push("Student A and Student B have the same interests. Give them different tastes.");
  const wishes = (role: Role) => data.students[role].conditions.filter((c) => c.kind === "soft").map((c) => `${c.attribute.toLowerCase()}|${c.rule}`);
  const common = wishes("A").filter((w) => wishes("B").includes(w));
  if (common.length > 1) problems.push(`Student A and Student B share ${common.length} identical wishes (${common.map((w) => w.split("|")[0]).join(", ")}). They may have at most one wish in common; the rest must come from their different circumstances.`);
  const hard = conditions.filter((c) => c.condition.kind === "hard");
  if (problems.length) return { data, problems };

  // Logic: possible, something to weigh up, and more than one choice that can be defended.
  const used = new Set(conditions.map((c) => c.condition.attribute.toLowerCase()));
  if (used.size < shape.usedAttributes) problems.push(`The conditions only concern ${used.size} attribute(s); students could decide by checking very few facts. Use at least ${shape.usedAttributes}.`);
  const everything = (r: OptionReport, wishes: number) => wishes > 0 && r.wishesMet.length === wishes;
  if (decision === "individual") {
    // Each student decides for themselves, so each needs a real choice of their own.
    const wishKey = (role: Role) => data.students[role].conditions.map((c) => `${c.kind}|${c.attribute.toLowerCase()}|${c.rule}|${c.amount}`).sort().join(";");
    if (wishKey("A") === wishKey("B")) problems.push("Student A and Student B have the same conditions. Give them different circumstances, so they have different things to say.");
    for (const role of roles) {
      const own = data.students[role].conditions.filter((c) => c.kind === "soft");
      if (own.length < 2) problems.push(`Student ${role} chooses for themselves and has only ${own.length} wish. With one wish the answer is automatic; give them two that pull towards different options.`);
      const reports = evaluateOptions(data, role);
      const possible = reports.filter((r) => r.possible);
      const musts = conditions.filter((c) => c.condition.kind === "hard" && (c.owner === "shared" || c.owner === role)).length;
      if (!possible.length) problems.push(`No option meets every hard condition that applies to Student ${role}, so their task is impossible.`);
      else if (possible.length < 2) problems.push(`Only ${possible[0].name} is possible for Student ${role}, so their answer is found by elimination. At least two options must be possible for each student.`);
      if (musts && possible.length === reports.length) problems.push(`Every option meets Student ${role}'s hard conditions, so they rule nothing out. Remove them or make one of them matter.`);
      const perfect = possible.find((r) => everything(r, own.length));
      if (perfect) problems.push(`${perfect.name} is the best option for everything Student ${role} cares about, so they have nothing to weigh up. The option that is best for one of their wishes must not be best for the other.`);
      if (possible.length >= 2 && reports.filter((r) => r.defensible).length < 2) problems.push(`Student ${role} has only one option worth choosing. Change the values or wishes so that at least two options are each better for them in some way.`);
    }
    // If the same options suit both, the two students would say the same things about them.
    const worth = (role: Role) => evaluateOptions(data, role).filter((r) => r.defensible).map((r) => r.name).join("|");
    if (!problems.length && worth("A") === worth("B")) problems.push(`The same options (${worth("A").split("|").join(", ")}) are the ones worth choosing for Student A and for Student B, so their wishes make no real difference between them. Change the wishes or values so that at least one option is worth choosing for one student and not for the other.`);
  } else {
    const reports = evaluateOptions(data);
    const possible = reports.filter((r) => r.possible);
    const softCount = conditions.length - hard.length;
    if (!possible.length) problems.push("No option meets every hard condition, so the task is impossible. " + reports.map((r) => `${r.name} fails ${r.failed.length}`).join("; ") + ".");
    else if (possible.length < 2) problems.push(`Only one option is possible (${possible[0].name}), so the answer is found by elimination and there is no decision left to discuss. At least two options must meet every hard condition.`);
    if (hard.length && possible.length === reports.length) problems.push("Every option meets every hard condition, so the hard conditions rule nothing out. Remove them or make one of them matter.");
    const perfect = possible.find((r) => everything(r, softCount));
    if (perfect) problems.push(`${perfect.name} is the best option for everything both students care about, so there is nothing to discuss.`);
    const defensible = reports.filter((r) => r.defensible);
    if (possible.length >= 2 && defensible.length < 2)
      problems.push(`Only ${defensible[0]?.name ?? "one option"} can be defended: it is at least as good as every other possible option on every wish. Change the values or wishes so that at least two options are each better in some way.`);
    if (shape.competing && possible.length >= 2) {
      // How well an option serves one student: for each of their wishes, how many options it is better than.
      const suits = (r: OptionReport, role: Role) => {
        const option = data.options[reports.indexOf(r)];
        const own = data.students[role].conditions.filter((c) => c.kind === "soft");
        return own.reduce((sum, c) => sum + data.options.filter((o) => score(c, o, data) < score(c, option, data)).length, 0);
      };
      const competing = possible.some((p) => possible.some((q) => suits(p, "A") > suits(q, "A") && suits(q, "B") > suits(p, "B")));
      if (!competing) problems.push("Among the possible options, none is better for Student A while another is better for Student B, so the students have nothing to trade off.");
    }
  }
  // Every wish must be able to tell options apart, or it is decoration.
  for (const c of conditions.filter((x) => x.condition.kind === "soft")) {
    const fits = new Set(data.options.map((o) => score(c.condition, o, data)));
    if (fits.size < 2) problems.push(`The wish about "${c.condition.attribute}" (${c.condition.rule}) cannot affect the choice: every option is the same for it.`);
  }
  return { data, problems };
}

// ====================================================================================
// Decision Review
// ====================================================================================

export interface DecisionReview {
  option: string;
  description: string;
  picture?: string;
  /** Checked by the app. */
  possible: boolean;
  defensible: boolean;
  requirements: { owner: Owner; text: string; met: boolean; value: string }[];
  advantages: string[];
  disadvantages: string[];
  /** Wishes for which this option is neither the best nor the worst. Missing on reviews made before priorities existed. */
  mixed?: string[];
  /**
   * The same checks in very short sentences, only the ones that concern what the reader cares about:
   * what a beginner sees first. Missing on reviews made before wishes were written as sentences.
   */
  simple?: { good: string[]; think: string[] };
  /** Facts of this option that nobody reading the review said they care about: stated, not judged. */
  other?: string[];
  /** What is true of this option only. Whether it is good or bad is the students' own judgement, so the app does not sort it. */
  personal?: string[];
  /** Individual decision: the student's own tastes, to read beside `personal`. */
  interests?: string;
  /** Every fact of the option, including the ones only the partner knew. */
  facts: { name: string; value: string }[];
  /** One sentence written by the app from its checks. */
  verdict: string;
  /** Written by the AI and checked against the facts: what might happen, and a balanced view. Empty if it could not be written. */
  consequences: string[];
  overall: string;
  overallJa: string;
}

const whose = (owner: Owner) => (owner === "shared" ? "Both of you" : `Student ${owner}`);

/** The Decision Review of one option. Everything except `consequences` and `overall` is worked out here from the facts. */
/**
 * In an individual decision pass the student's `role`: the review then weighs the option against the shared
 * conditions and that student's own wishes only, and speaks to them alone.
 */
export function reviewOption(data: ChooseOneData, index: number, role?: Role): DecisionReview {
  const option = data.options[index];
  const own = decisionOf(data) === "individual" ? role : undefined;
  const reports = evaluateOptions(data, own);
  const report = reports[index];
  const applies = (c: OwnedCondition) => !own || c.owner === "shared" || c.owner === own;
  const nouns = plural(data.optionNoun);
  const value = (i: number) => formatValue(data.attributes[i], option.values[i]);
  const valueFor = (c: ChoiceCondition) => {
    const i = data.attributes.findIndex((a) => same(a.name, c.attribute));
    return i < 0 ? "" : value(i);
  };
  const wish = (c: OwnedCondition, met: boolean) => {
    const text = conditionText(c.condition, data, false).text;
    const numeric = c.condition.rule === "at most" || c.condition.rule === "at least";
    const who = c.owner === "shared" ? "Both of you wanted" : own ? "You wanted" : `Student ${c.owner} wanted`;
    return `${who} “${text}”. ${met ? "This choice gives that" : "This choice does not"}${numeric ? ` (${valueFor(c.condition)})` : ""}.`;
  };
  const count = `the ${data.options.length} ${nouns}`;
  // "is the cheapest" / "has the longest wait": the attribute's own words when it has them; "are" / "have" for several options.
  const extreme = (a: Attribute, lowest: boolean, several = false) => {
    const words = (lowest ? a.lowest : a.highest)?.trim();
    if (!words) return null;
    return several ? words.replace(/^is /i, "are ").replace(/^has /i, "have ") : words;
  };
  // A priority is weighed, not passed or failed: where this option stands among all of them, with the facts.
  const priority = (c: OwnedCondition, fit: Fit) => {
    const i = data.attributes.findIndex((a) => same(a.name, c.condition.attribute));
    const a = data.attributes[i];
    const low = c.condition.rule === "low";
    const who = c.owner === "shared" ? "Both of you care" : own ? "You care" : `Student ${c.owner} cares`;
    const numbers = data.options.map((o) => o.values[i].number);
    const top = low ? Math.min(...numbers) : Math.max(...numbers);
    const others = data.options.filter((o) => o !== option && o.values[i].number === top).map((o) => o.name);
    const topValue = formatValue(a, { number: top, yes: false });
    const natural = extreme(a, fit === "worst" ? !low : low, fit === "middle" && others.length > 1);
    if (natural) {
      const lead = `${who} about “${a.name}”.`;
      if (fit === "middle") return `${lead} This choice: ${value(i)}. ${others.join(" and ")} ${natural} (${topValue}).`;
      return `${lead} This choice ${natural} of ${count}: ${value(i)}${fit === "best" && others.length ? ` (the same as ${others.join(" and ")})` : ""}.`;
    }
    const lead = `${who} about “${a.name}” (${low ? "lower" : "higher"} is better). This choice: ${value(i)}`;
    if (fit === "best") return `${lead}, the ${low ? "lowest" : "highest"} of ${count}${others.length ? ` (the same as ${others.join(" and ")})` : ""}.`;
    if (fit === "worst") return `${lead}, the ${low ? "highest" : "lowest"} of ${count}.`;
    return `${lead}. That is in the middle: ${others.join(" and ")} ${others.length > 1 ? "have" : "has"} ${topValue}.`;
  };
  // A yes/no wish in plain words: "You wanted “Drink included”. This choice has it."
  const yesNo = (c: OwnedCondition) => {
    const i = data.attributes.findIndex((a) => same(a.name, c.condition.attribute));
    const wanted = c.condition.rule === "yes";
    const who = c.owner === "shared" ? "Both of you" : own ? "You" : `Student ${c.owner}`;
    return `${who} ${wanted ? "wanted" : "did not want"} “${data.attributes[i].name}”. This choice ${option.values[i].yes ? "has it" : "does not have it"}.`;
  };
  const plain = (c: OwnedCondition) => !!c.condition.wish?.trim() && (c.condition.rule === "yes" || c.condition.rule === "no");
  const line = (c: OwnedCondition, fit: Fit) => (isPriority(c.condition) ? priority(c, fit) : plain(c) ? yesNo(c) : wish(c, fit === "best"));
  const advantages = report.wishesMet.map((c) => line(c, "best"));
  const disadvantages = report.wishesMissed.map((c) => line(c, "worst"));
  const mixed = report.wishesPartly.map((c) => line(c, "middle"));
  const worded = allConditions(data).some((c) => c.condition.wish?.trim());
  const other: string[] = [];
  // "Lowest price" is only a good point when nobody in this activity wants the opposite.
  const opposed = (name: string, better: string) =>
    allConditions(data).filter(applies).some(({ condition: c }) => same(c.attribute, name) && ((better === "lower" && c.rule === "at least") || (better === "higher" && c.rule === "at most") || (better === "yes" && c.rule === "no") || (better === "no" && c.rule === "yes")));
  data.attributes.forEach((a, i) => {
    const concerns = allConditions(data).filter(applies).some(({ condition: c }) => same(c.attribute, a.name));
    if (worded) {
      // What the reader did not say they care about is a fact, not a good or bad point: it is stated and left to them.
      if (concerns) return;
      const all = data.options.map((o) => o.values[i].number);
      const mine = option.values[i].number;
      const alone = a.kind === "number" && all.filter((n) => n === mine).length === 1;
      const words = alone && mine === Math.min(...all) ? extreme(a, true) : alone && mine === Math.max(...all) ? extreme(a, false) : null;
      other.push(`${a.name}: ${value(i)}.${words ? ` This choice ${words} of ${count}.` : ""}`);
      return;
    }
    const better = opposed(a.name, a.better ?? "none") ? "none" : (a.better ?? "none");
    if (a.kind === "number" && (better === "lower" || better === "higher")) {
      const all = data.options.map((o) => o.values[i].number);
      const mine = option.values[i].number;
      const sign = better === "lower" ? -1 : 1;
      const best = Math.max(...all.map((n) => n * sign));
      const worst = Math.min(...all.map((n) => n * sign));
      if (best === worst) return;
      const only = (n: number) => all.filter((x) => x === n).length === 1;
      const word = (top: boolean) => ((better === "lower") === top ? "lowest" : "highest");
      if (mine * sign === best && only(mine)) advantages.push(`${a.name}: ${value(i)}. That is the ${word(true)} of ${count}.`);
      if (mine * sign === worst && only(mine)) disadvantages.push(`${a.name}: ${value(i)}. That is the ${word(false)} of ${count}.`);
    }
    // A yes/no fact that is already listed as somebody's wish is not repeated.
    if (a.kind === "yesno" && !concerns && (better === "yes" || better === "no")) {
      const good = option.values[i].yes === (better === "yes");
      const others = data.options.filter((o) => (o.values[i].yes === (better === "yes")) !== good).length;
      if (!others) return;
      (good ? advantages : disadvantages).push(`${a.name}: ${value(i)}.`);
    }
  });
  // For beginners: "It is the cheapest (¥650)." / "Drink included: no."
  const short = (c: OwnedCondition, fit: Fit) => {
    const i = data.attributes.findIndex((a) => same(a.name, c.condition.attribute));
    const a = data.attributes[i];
    // In a shared decision the two students may want opposite things, so the line says whose wish it is.
    if (!isPriority(c.condition)) return `${a.name}: ${value(i).toLowerCase()}.${own || c.owner === "shared" ? "" : fit === "best" ? ` Student ${c.owner} wanted this.` : ` Student ${c.owner} wanted “${c.condition.rule}”.`}`;
    const words = extreme(a, (c.condition.rule === "low") === (fit === "best"));
    return words ? `It ${words} (${value(i)}).` : `${a.name}: ${value(i)}.`;
  };
  const simple = worded
    ? {
        good: report.wishesMet.map((c) => short(c, "best")),
        think: [...report.failed.map((c) => `It does not meet a “Must”: ${conditionText(c.condition, data, false).text} (${valueFor(c.condition)}).`), ...report.wishesMissed.map((c) => short(c, "worst"))],
      }
    : undefined;
  const rivals = reports.filter((r) => r.defensible && r.name !== option.name).map((r) => r.name);
  const musts = allConditions(data).filter((c) => applies(c) && c.condition.kind === "hard");
  // Activities made before priorities existed keep the sentences their stored reviews were written beside.
  const legacy = !report.possible
    ? ""
    : report.defensible
      ? `This is a choice you can defend${musts.length ? ": it meets every “Must” condition" : ""}. ${rivals.length ? `${rivals.join(" and ")} can also be defended, so your reasons matter.` : ""}`.trim()
      : `This choice is possible, but ${rivals.join(" or ")} gives ${own ? "you more" : "both of you at least as much"} of what you wanted. It is a fair choice if you have another reason, such as how it looks.`;
  const cared = own ? "you care about" : "the two of you care about";
  const stronger = reports.filter((r) => r.defensible && report.beatenBy.includes(r.name)).map((r) => r.name);
  const verdict = !report.possible
    ? `This choice does not meet ${report.failed.length === 1 ? "one “Must” condition" : `${report.failed.length} “Must” conditions`}. It only works if ${report.failed.length === 1 ? "that condition" : "those conditions"} can change.`
    : !worded
      ? legacy
      : report.defensible
        ? `This is a reasonable choice${musts.length ? ": it meets every “Must” condition" : ""}. ${rivals.length ? `No ${data.optionNoun} is the best for everything ${cared}, so it depends on what matters most to you.` : ""}`.trim()
        : `This choice is possible. For the things ${cared}, ${stronger.join(" or ")} is as good or better each time. It can still be a good choice if there is something else you like about it: that is for you to say.`;
  // Reviews written before the two formats existed have no "student" and are for both.
  const text = data.reviews?.find((r) => same(r.option, option.name) && (own ? r.student === own : (r.student ?? "both") === "both"));
  return {
    option: option.name,
    description: option.description ?? "",
    picture: option.picture,
    possible: report.possible,
    defensible: report.defensible,
    requirements: musts.map((c) => ({ owner: c.owner, text: `${own && c.owner === own ? "You" : whose(c.owner)}: ${conditionText(c.condition, data, false).text}`, met: meets(c.condition, option, data), value: valueFor(c.condition) })),
    advantages,
    disadvantages,
    mixed,
    simple,
    other,
    personal: (option.details ?? []).map((d) => d.text).filter(Boolean),
    interests: own ? (data.students[own].interests ?? "") : "",
    facts: data.attributes.map((a, i) => ({ name: a.name, value: value(i) })),
    verdict,
    consequences: text?.consequences ?? [],
    overall: text?.overall ?? "",
    overallJa: text?.overallJa ?? "",
  };
}

/**
 * Keeps the AI's comment on students' reasons inside the app's checks: when the chosen option meets every
 * "Must" condition, a student who says so is right, so any "fact check" of such a statement is removed.
 */
export function guardFeedback<F extends { factChecks: { said: string; fact: string }[]; goodPoints?: string[]; thinkAbout?: string[] }>(
  feedback: F,
  review: Pick<DecisionReview, "possible"> & Partial<Pick<DecisionReview, "requirements">>,
  data?: ChooseOneData,
): F {
  const quoted = feedback.factChecks.map((f) => ({ ...f, said: f.said.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, "") }));
  const out = { ...feedback, factChecks: review.possible ? quoted.filter((f) => !/\b(requirements?|musts?|must-haves?|needs?|conditions?|essentials?)\b/i.test(f.said)) : quoted };
  if (!data) return out;
  // A point with a number that is not a fact of the activity is dropped rather than shown.
  const known = knownNumbers(data);
  const real = (items?: string[]) => (items ?? []).filter((x) => x.trim() && !strangeNumbers(x, known).length);
  const failed = (review.requirements ?? []).filter((r) => !r.met).map((r) => `This choice does not meet a “Must” condition: ${r.text.replace(/^[^:]+: /, "")} (this choice: ${r.value}).`);
  // A failed "Must" condition is always said, whatever the AI chose to mention.
  const factChecks = out.factChecks.filter((f) => !strangeNumbers(f.fact, known).length);
  // A correction already says it: the same point is not listed a second time.
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const corrected = factChecks.map((f) => words(f.fact));
  const repeats = (text: string) => corrected.some((fact) => [...words(text)].filter((w) => fact.has(w)).length >= 2);
  return { ...out, goodPoints: real(feedback.goodPoints), thinkAbout: [...failed, ...real(feedback.thinkAbout).filter((x) => !repeats(x))].slice(0, Math.max(2, failed.length)), factChecks };
}

/**
 * Claims in a sentence that the facts contradict: "the cheapest" said of a choice that is not the cheapest.
 * It reads the same words the app itself uses for each fact, so it only catches these comparisons; a sentence
 * that names another option ("Rice Bowl is the cheapest, but ...") is taken to be about that one.
 */
export function falseSuperlatives(data: ChooseOneData, index: number, text: string): string[] {
  const option = data.options[index];
  const others = data.options.filter((o) => o !== option).flatMap((o) => o.name.toLowerCase().split(/\s+/)).filter((w) => w.length > 3 && !option.name.toLowerCase().includes(w));
  const key = (words: string) => {
    const rest = words.trim().toLowerCase().replace(/^(is|has)\s+(the\s+)?/, "").split(/\s+/);
    return /^(most|least)$/.test(rest[0]) ? rest.slice(0, 2).join(" ") : rest[0];
  };
  const found: string[] = [];
  for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
    const lower = sentence.toLowerCase();
    if (others.some((w) => lower.includes(w))) continue;
    const claims = new Map<string, boolean>();
    data.attributes.forEach((a, i) => {
      if (a.kind !== "number") return;
      const all = data.options.map((o) => o.values[i].number);
      for (const [words, extreme] of [[a.lowest, Math.min(...all)], [a.highest, Math.max(...all)]] as const) {
        if (!words?.trim()) continue;
        const k = key(words);
        if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower) && !/\b(not|n't|isn't|never)\b/.test(lower)) claims.set(k, (claims.get(k) ?? false) || option.values[i].number === extreme);
      }
    });
    for (const [k, isTrue] of claims) if (!isTrue) found.push(k);
  }
  return found;
}

const HEDGE = /\b(might|may|could|maybe|perhaps|possibly|probably|can)\b/i;

/**
 * Checks the AI's part of the reviews: one for every option, consequences worded as possibilities,
 * and no number that is not a fact of the activity. An empty list means the reviews can be shown.
 */
/** Every number a text about this activity may contain: its values, the differences between them, and what students have read. */
function knownNumbers(data: ChooseOneData): Set<number> {
  const known = new Set<number>([data.options.length]);
  data.attributes.forEach((a, i) => {
    if (a.kind !== "number") return;
    const values = data.options.map((o) => o.values[i].number);
    for (const v of values) {
      known.add(v);
      for (const w of values) known.add(Math.abs(v - w));
    }
  });
  for (const c of allConditions(data)) known.add(c.condition.amount);
  // Numbers the students have already read (in a detail, a description or a wish) are facts too.
  const read = [...data.options.flatMap((o) => [o.description ?? "", ...(o.details ?? []).map((d) => d.text)]), ...allConditions(data).map((c) => c.condition.wish ?? "")];
  for (const found of read.join(" ").match(/\d[\d,]*(\.\d+)?/g) ?? []) known.add(Number(found.replace(/,/g, "")));
  return known;
}

/** The numbers in a text that are not facts of the activity (small counts are let through). */
function strangeNumbers(text: string, known: Set<number>): string[] {
  return (text.match(/\d[\d,]*(\.\d+)?/g) ?? []).filter((found) => {
    const n = Number(found.replace(/,/g, ""));
    return n > 10 && !known.has(n);
  });
}

export function checkReviews(data: ChooseOneData, reviews: ChoiceReviewText[]): string[] {
  const problems: string[] = [];
  const known = knownNumbers(data);
  const COUNTING = /\b(\d+|one|two|three|four|five|most|none) (of|out of) (your |the |their |our )?(\w+ )?(wishes|preferences|priorities|conditions)\b/i;
  // An individual decision needs a review of every option for each student; a shared one, a single review for both.
  const individual = decisionOf(data) === "individual";
  const readers: ("A" | "B" | "both")[] = individual ? ["A", "B"] : ["both"];
  for (const option of data.options)
    for (const reader of readers) {
      const what = individual ? `${option.name} for Student ${reader}` : option.name;
      const matching = reviews.filter((r) => same(r.option, option.name) && r.student === reader);
      if (matching.length !== 1) {
        problems.push(matching.length ? `${what} has ${matching.length} reviews; write exactly one.` : `There is no review of ${what}${individual ? ` (student: "${reader}")` : ' (student: "both")'}. Every option needs one.`);
        continue;
      }
      const r = matching[0];
      if (!r.overall.trim()) problems.push(`The review of ${what} has no overall view.`);
      if (!r.consequences.some((c) => c.trim())) problems.push(`The review of ${what} has no possible consequence.`);
      if ([...r.consequences, r.overall].some((text) => COUNTING.test(text))) problems.push(`The review of ${what} counts wishes. Do not count: say what this choice offers and what it gives up.`);
      for (const c of r.consequences) if (c.trim() && !HEDGE.test(c)) problems.push(`A consequence of ${what} is stated as a fact ("${c}"). Say it might, may or could happen.`);
      for (const text of [...r.consequences, r.overall, r.overallJa]) {
        for (const found of text.match(/\d[\d,]*(\.\d+)?/g) ?? []) {
          const n = Number(found.replace(/,/g, ""));
          if (n > 10 && !known.has(n)) problems.push(`The review of ${what} gives the number ${found}, which is not a fact of the activity. Use only the given facts, and do no calculations.`);
        }
        // One student's own choice: the review speaks to that student and leaves the partner out of it.
        if (individual && /\b(we|our|both of you|the pair|together|Student [AB])\b/i.test(text)) problems.push(`The review of ${what} must speak only to that one student as "you": it says "${text.match(/\b(we|our|both of you|the pair|together|Student [AB])\b/i)![0]}".`);
      }
    }
  for (const r of reviews) if (!data.options.some((o) => same(o.name, r.option))) problems.push(`There is a review for "${r.option}", which is not an option.`);
  // Each review is about one choice (and one reader): the same sentence twice means one of them says nothing of its own.
  const seen = new Map<string, string>();
  for (const r of reviews) {
    const key = r.overall.trim().toLowerCase();
    const what = `${r.option}${r.student === "both" ? "" : ` for Student ${r.student}`}`;
    if (key && seen.has(key)) problems.push(`The overall view of ${what} is word for word the same as that of ${seen.get(key)}. Each must be about that choice${individual ? " and that student" : ""}: use what is true of that option only.`);
    else seen.set(key, what);
  }
  return problems;
}

// ====================================================================================
// A second reading of the wording
// ====================================================================================

/**
 * What a second reader is asked about a generated activity: every wish sentence (with the fact it is about),
 * every "lowest" / "highest" phrase, and every English / Japanese pair. Numbered from 1, in this order.
 */
export function wordingItems(data: ChooseOneData) {
  const wishes = allConditions(data).map((c) => ({ ...c, fact: data.attributes.find((a) => same(a.name, c.condition.attribute)) }));
  const superlatives = data.attributes.filter((a) => a.kind === "number").flatMap((a) => [{ attribute: a, lowest: true, words: a.lowest }, { attribute: a, lowest: false, words: a.highest }]);
  const pairs: { en: string; ja: string; set: (ja: string) => void }[] = [];
  const pair = <T, E extends keyof T, J extends keyof T>(o: T, en: E, ja: J) => {
    if (typeof o[en] === "string" && (o[en] as string).trim()) pairs.push({ en: o[en] as string, ja: (o[ja] as string) ?? "", set: (text) => ((o[ja] as string) = text) });
  };
  pair(data, "situation", "situationJa");
  for (const role of ["A", "B"] as Role[]) {
    pair(data.students[role], "about", "aboutJa");
    pair(data.students[role], "interests", "interestsJa");
  }
  for (const c of allConditions(data)) pair(c.condition, "wish", "wishJa");
  for (const o of data.options) for (const d of o.details ?? []) pair(d, "text", "textJa");
  return { wishes, superlatives, pairs };
}

/**
 * Compares the second reader's answers with the rules. A wish sentence that says the opposite of its rule, or a
 * "lowest" phrase that means the highest, is a problem (the activity is asked for again). Japanese that does not
 * say what the English says is replaced with the reader's correction.
 */
export function applyWordingCheck(data: ChooseOneData, check: ChoiceWordingCheck): { problems: string[]; corrected: number } {
  const { wishes, superlatives, pairs } = wordingItems(data);
  const problems: string[] = [];
  const expected = { low: "wants it lower", "at most": "wants it lower", high: "wants it higher", "at least": "wants it higher", yes: "wants it", no: "does not want it" } as const;
  for (const answer of check.wishes) {
    const w = wishes[answer.number - 1];
    if (!w || answer.says === "unclear" || answer.says === expected[w.condition.rule]) continue;
    problems.push(`${w.owner === "shared" ? "The shared condition" : `Student ${w.owner}'s condition`} about "${w.condition.attribute}" has the rule "${w.condition.rule}", but its sentence ("${w.condition.wish}") says the student ${answer.says}. Make the sentence and the rule say the same thing.`);
  }
  for (const answer of check.superlatives) {
    const s = superlatives[answer.number - 1];
    if (s && answer.means !== "unclear" && (answer.means === "lowest") !== s.lowest) problems.push(`For "${s.attribute.name}", "${s.lowest ? "lowest" : "highest"}" is "${s.words}", which describes the ${answer.means} value. Swap or rewrite the two phrases.`);
  }
  for (const c of check.conflicts ?? []) if (data.options.some((o) => same(o.name, c.option)) && c.problem.trim()) problems.push(`${c.option}: ${c.problem.trim()} The description, picture and details must agree with the facts and must not state any of them.`);
  let corrected = 0;
  for (const answer of check.japanese) {
    const p = pairs[answer.number - 1];
    if (!p || answer.ok || !answer.better.trim() || answer.better.trim() === p.ja.trim()) continue;
    p.set(answer.better.trim());
    corrected++;
  }
  return { problems, corrected };
}

// ====================================================================================
// Build a Combination
// ====================================================================================

type Item = CombinationData["items"][number];
type Person = CombinationData["people"][number];

export const money = (data: Pick<CombinationData, "currency">, amount: number) => `${data.currency}${number(amount)}`;

/** A person's condition in words, built from its rule. */
export function mealConditionText(c: MealCondition, data: CombinationPlan): { text: string; ja: string } {
  const tag = data.tags.find((t) => same(t.name, c.tag));
  const category = data.categories.find((t) => same(t.name, c.category));
  const hard = c.kind === "hard";
  let text: string;
  let ja: string;
  if (c.rule === "needs category") {
    text = `${hard ? "Must also have" : "Would also like"}: a ${(category?.name ?? c.category).toLowerCase()}`;
    ja = `${category?.nameJa || c.category}${hard ? "も必要" : "もあるとうれしい"}`;
  } else if (c.rule === "has") {
    text = `${hard ? "Must have" : "Would like"}: ${tag?.name ?? c.tag}`;
    ja = `${hard ? "必須" : "できれば"}：${tag?.nameJa || c.tag}`;
  } else {
    text = `${hard ? "Cannot have" : "Would rather not have"}: ${tag?.name ?? c.tag}`;
    ja = `${hard ? "不可" : "できれば避けたい"}：${tag?.nameJa || c.tag}`;
  }
  return { text: `${text}${c.reason ? ` (${c.reason})` : ""}`, ja: `${ja}${c.reasonJa ? `（${c.reasonJa}）` : ""}` };
}

/** Does a set of items satisfy one condition of the person they are for? */
function mealMeets(c: MealCondition, items: Item[]): boolean {
  if (c.rule === "needs category") return items.some((i) => same(i.category, c.category));
  const has = items.some((i) => i.tags.some((t) => same(t, c.tag)));
  return c.rule === "has" ? has : !has;
}

interface Meal {
  items: Item[];
  cost: number;
  wishes: number;
}

/** Every set of items one person could get that meets all their hard conditions: one from each required category, at most one from each optional one. */
function mealsFor(person: Person, data: CombinationPlan): Meal[] {
  let sets: Item[][] = [[]];
  for (const category of data.categories) {
    const choices = data.items.filter((i) => same(i.category, category.name));
    sets = sets.flatMap((s) => [...(category.required ? [] : [s]), ...choices.map((i) => [...s, i])]);
  }
  const hard = person.conditions.filter((c) => c.kind === "hard");
  const soft = person.conditions.filter((c) => c.kind === "soft");
  return sets
    .filter((s) => hard.every((c) => mealMeets(c, s)))
    .map((items) => ({ items, cost: items.reduce((sum, i) => sum + i.price, 0), wishes: soft.filter((c) => mealMeets(c, items)).length }));
}

export interface Order {
  /** What each person gets, in the order of data.people. */
  meals: { person: string; items: string[]; cost: number; wishesMet: string[]; wishesMissed: string[] }[];
  total: number;
  wishesMet: number;
  wishesTotal: number;
  /** The whole order as quantities: "2 × Cheeseburger". */
  lines: { quantity: number; item: string; price: number }[];
}

function toOrder(meals: Meal[], data: CombinationPlan): Order {
  const lines = new Map<string, { quantity: number; item: string; price: number }>();
  for (const m of meals) for (const i of m.items) lines.set(i.name, { quantity: (lines.get(i.name)?.quantity ?? 0) + 1, item: i.name, price: i.price });
  const soft = (p: Person) => p.conditions.filter((c) => c.kind === "soft");
  return {
    meals: meals.map((m, k) => ({
      person: data.people[k].name,
      items: m.items.map((i) => i.name),
      cost: m.cost,
      wishesMet: soft(data.people[k]).filter((c) => mealMeets(c, m.items)).map((c) => mealConditionText(c, data).text),
      wishesMissed: soft(data.people[k]).filter((c) => !mealMeets(c, m.items)).map((c) => mealConditionText(c, data).text),
    })),
    total: meals.reduce((s, m) => s + m.cost, 0),
    wishesMet: meals.reduce((s, m) => s + m.wishes, 0),
    wishesTotal: data.people.reduce((s, p) => s + soft(p).length, 0),
    lines: [...lines.values()],
  };
}

export interface OrderSolution {
  /** The least the group can spend while meeting every hard condition. */
  cheapest: Order;
  /** The order within the budget that grants the most wishes (the cheapest such order). */
  best: Order;
  /** The cheapest order that grants every wish that can be granted. Usually over the budget: that is the trade-off. */
  ideal: Order;
}

/**
 * Works out the orders that matter, by exact search over every person's possible meals.
 * `budget` may be omitted to find the cheapest and ideal orders before a budget exists.
 * Returns null when some person has no meal that meets their hard conditions.
 */
export function solveOrder(data: CombinationPlan, budget = Infinity): OrderSolution | null {
  const perPerson = data.people.map((p) => mealsFor(p, data));
  if (perPerson.some((m) => m.length === 0)) return null;
  const cheapestOf = (meals: Meal[]) => meals.reduce((a, b) => (b.cost < a.cost ? b : a));
  const cheapest = perPerson.map(cheapestOf);
  const ideal = perPerson.map((meals) => {
    const top = Math.max(...meals.map((m) => m.wishes));
    return cheapestOf(meals.filter((m) => m.wishes === top));
  });
  // Best within the budget: for each total cost, the most wishes that can be granted (and how).
  let states = new Map<number, { wishes: number; meals: Meal[] }>([[0, { wishes: 0, meals: [] }]]);
  for (const meals of perPerson) {
    const next = new Map<number, { wishes: number; meals: Meal[] }>();
    for (const [cost, state] of states)
      for (const m of meals) {
        const total = cost + m.cost;
        if (total > budget) continue;
        const known = next.get(total);
        if (!known || state.wishes + m.wishes > known.wishes) next.set(total, { wishes: state.wishes + m.wishes, meals: [...state.meals, m] });
      }
    states = next;
  }
  let best: { cost: number; wishes: number; meals: Meal[] } | null = null;
  for (const [cost, state] of states) if (!best || state.wishes > best.wishes || (state.wishes === best.wishes && cost < best.cost)) best = { cost, ...state };
  return { cheapest: toOrder(cheapest, data), ideal: toOrder(ideal, data), best: toOrder(best ? best.meals : cheapest, data) };
}

/** What each difficulty asks of a combination. `squeeze` = how far the budget sits between the cheapest valid order (0) and the ideal one (1). */
export const COMBINATION_SHAPE: Record<Difficulty, { people: number; categories: string; itemsEach: string; conditionsEach: string; squeeze: number }> = {
  Easy: { people: 3, categories: "2 categories, both required", itemsEach: "3", conditionsEach: "1", squeeze: 0.75 },
  Intermediate: { people: 4, categories: "3 categories: 2 required and 1 optional", itemsEach: "3 or 4", conditionsEach: "1 or 2", squeeze: 0.5 },
  Challenging: { people: 4, categories: "3 categories: 2 required and 1 optional", itemsEach: "4", conditionsEach: "2", squeeze: 0.3 },
};

/**
 * Turns the AI's plan into a stored activity, sets the budget, and lists everything that is wrong.
 * The budget is chosen by the app so that a valid order always exists but not every wish can be afforded.
 */
export function buildCombination(plan: CombinationPlan, difficulty: Difficulty): { data: CombinationData; problems: string[] } {
  const data: CombinationData = { ...plan, format: "combination", budget: 0 };
  const problems: string[] = [];
  const shape = COMBINATION_SHAPE[difficulty] ?? COMBINATION_SHAPE.Intermediate;

  if (data.categories.length < 2) problems.push("There must be at least 2 categories.");
  if (!data.categories.some((c) => c.required)) problems.push("At least one category must be required.");
  if (data.people.length < 2) problems.push("There must be at least 2 people to choose for.");
  if (new Set(data.items.map((i) => i.name.toLowerCase())).size !== data.items.length) problems.push("Two items have the same name.");
  for (const c of data.categories) if (data.items.filter((i) => same(i.category, c.name)).length < 2) problems.push(`The category "${c.name}" needs at least 2 items.`);
  for (const i of data.items) {
    if (!data.categories.some((c) => same(c.name, i.category))) problems.push(`${i.name} is in "${i.category}", which is not a category.`);
    if (!Number.isInteger(i.price) || i.price <= 0) problems.push(`${i.name} has the price ${i.price}; prices must be whole numbers above 0.`);
    for (const t of i.tags) if (!data.tags.some((x) => same(x.name, t))) problems.push(`${i.name} has the tag "${t}", which is not in the tag list.`);
  }
  for (const p of data.people)
    for (const c of p.conditions) {
      if (c.rule === "needs category") {
        const category = data.categories.find((x) => same(x.name, c.category));
        if (!category) problems.push(`${p.name} needs "${c.category}", which is not a category.`);
        else if (category.required) problems.push(`${p.name} "needs" ${category.name}, but everyone already gets one; use an optional category.`);
      } else if (!data.tags.some((x) => same(x.name, c.tag))) problems.push(`${p.name} has a condition about "${c.tag}", which is not in the tag list.`);
      else if (!data.items.some((i) => i.tags.some((t) => same(t, c.tag)))) problems.push(`${p.name} has a condition about "${c.tag}", but no item has that tag.`);
    }
  const conditions = data.people.flatMap((p) => p.conditions);
  if (!conditions.some((c) => c.kind === "hard")) problems.push("Nobody has a hard condition.");
  if (conditions.filter((c) => c.kind === "soft").length < 2) problems.push("At least two soft preferences are needed, so there is something to give up.");
  if (problems.length) return { data, problems };

  const solution = solveOrder(data);
  if (!solution) {
    for (const p of data.people) if (mealsFor(p, data).length === 0) problems.push(`Nothing on the list meets all of ${p.name}'s hard conditions, so the task is impossible.`);
    return { data, problems };
  }
  // Budget: enough for every hard condition, not enough for every wish.
  const low = solution.cheapest.total;
  const high = solution.ideal.total;
  const step = low >= 1000 ? 100 : low >= 100 ? 10 : 1;
  const budget = Math.floor((low + shape.squeeze * (high - low)) / step) * step;
  if (high - low < 2 * step || budget < low || budget >= high) {
    problems.push(
      `Granting everyone's wishes costs ${money(data, high)} and the cheapest valid order costs ${money(data, low)}: too close for any budget to force a real choice. Make the items people prefer clearly more expensive than the alternatives.`,
    );
    return { data, problems };
  }
  data.budget = budget;
  const within = solveOrder(data, budget)!;
  if (within.best.total > budget) problems.push("No order fits the budget.");
  if (within.best.wishesMet === within.best.wishesTotal) problems.push("Every wish fits within the budget, so nothing has to be given up.");
  return { data, problems };
}

// ====================================================================================
// Who knows what
// ====================================================================================

/**
 * Choose One: what is special about each option is told to one student only, the opposite way round from
 * the first row of the table, so nobody is told everything about any option.
 */
export const detailHolder = (optionIndex: number, detailIndex: number): Holder => ((optionIndex + detailIndex) % 2 === 0 ? "B" : "A");
/** The open question a student asks to hear what their partner was told about an option. */
export const ASK_MORE = "What else do you know about ...?";

/** Combination: item prices are split between the students (names and descriptions are on both menus). */
export const priceHolder = (itemIndex: number): Holder => (itemIndex % 2 === 0 ? "A" : "B");
/** Combination: each student knows about half of the people they are choosing for. */
export const personHolder = (personIndex: number): Holder => (personIndex % 2 === 0 ? "A" : "B");

// ====================================================================================
// What the app writes for students
// ====================================================================================

/** The steps students follow, written by the app so they always match the materials. */
export function choiceSteps(data: ChooseOneData | CombinationData): { exchange: string[]; decide: string } {
  if (isChooseOne(data)) {
    const must = allConditions(data).some((c) => c.condition.kind === "hard");
    const pictures = data.options.some((o) => o.picture);
    const ask = `${pictures ? "Look at the pictures. " : ""}Ask your partner about every "?" on your ${data.optionNoun} cards, and answer their questions.`;
    // Activities with worded wishes are a conversation about what people like, not only an exchange of facts.
    const talk = allConditions(data).some((c) => c.condition.wish?.trim());
    if (decisionOf(data) === "individual")
      return {
        exchange: [
          ask,
          talk ? "You and your partner care about different things. Say what is important to you and why, and ask your partner the same." : "You and your partner want different things. Tell your partner what you would like, and ask what they would like.",
          ...(talk ? [`Say which ${data.optionNoun} you like and why. Ask what your partner thinks of it.`] : []),
        ],
        decide: `Now choose ONE ${data.optionNoun} for yourself.${must ? ' It should meet every "Must" condition that you have.' : ""} Your partner chooses too, and can choose a different one. Then write your choice and your reasons.`,
      };
    return {
      exchange: [
        ask,
        talk ? "Say what is important to you and why. Ask your partner what is important to them." : must ? "Tell your partner what you need and what you would like. Ask about theirs." : "Tell your partner what you would like. Ask what they would like.",
        ...(talk ? [`Say which ${data.optionNoun} you like and why. If your partner likes a different one, ask why, and look for one you can both accept.`] : []),
      ],
      decide: hasDecisionReview(data)
        ? `Talk together and agree on ONE ${data.optionNoun} for both of you.${must ? ' It should meet every "Must" condition, yours and your partner\'s.' : ""} There can be more than one good choice. Then write your choice and your reasons.`
        : `Together, choose ONE ${data.optionNoun}. It must meet every "Must" condition, yours and your partner's. Then find the best one for both of you, and be ready to say why.`,
    };
  }
  return {
    exchange: ['Ask your partner for every price marked "?", and tell them the prices you know.', "Tell your partner about the people on your list. Ask about the people on theirs."],
    decide: `Together, choose something for every person. Everyone's "Must" conditions have to be met, and the total cannot be more than ${money(data, data.budget)}. Try to give people what they would like. Be ready to explain your choices.`,
  };
}

/**
 * A model exchange for the teacher, written from the real split of the facts: whoever asks is the student
 * who cannot see that fact, and whoever answers is the one who can. It says nothing about which option to choose.
 */
export function choiceDemoExchange(data: ChooseOneData): string[] {
  const lines: string[] = [];
  const used = new Set<number>();
  for (const asker of ["A", "B", "A", "B"] as Role[]) {
    const answerer: Role = asker === "A" ? "B" : "A";
    // Checkerboard split (profileDetailHolder in lib/gapLogic.ts): Student A holds the cells where option + attribute is even.
    const holder = (o: number, a: number): Role => ((o + a) % 2 === 0 ? "A" : "B");
    let found: [number, number] | null = null;
    // A new attribute each time, and a new option when there is one.
    const fresh = (o: number, a: number, newOption: boolean) => holder(o, a) === answerer && ![...used].some((u) => Math.floor(u / 100) === a || (newOption && u % 100 === o));
    for (const newOption of [true, false]) for (let a = 0; a < data.attributes.length && !found; a++) for (let o = 0; o < data.options.length && !found; o++) if (fresh(o, a, newOption)) found = [o, a];
    if (!found) continue;
    const [o, a] = found;
    used.add(a * 100 + o);
    const attribute = data.attributes[a];
    const value = formatValue(attribute, data.options[o].values[a]);
    lines.push(`${asker}: ${attribute.question.replace("...", data.options[o].name)}`, `${answerer}: ${attribute.kind === "yesno" ? `${value}.` : `It's ${value}.`}`);
  }
  // Something only one student was told about an option, then opinions: the model shows that facts lead to talk.
  const special = data.options.flatMap((o, oi) => (o.details ?? []).map((d, k) => ({ option: o.name, text: d.text, holder: detailHolder(oi, k) }))).find((d) => d.text.trim() && d.holder !== "both");
  if (special) {
    const knower = special.holder as Role;
    lines.push(`${knower === "A" ? "B" : "A"}: ${ASK_MORE.replace("...", special.option)}`, `${knower}: ${special.text}`);
  }
  if (allConditions(data).some((c) => c.condition.wish?.trim())) lines.push("A: Which one do you like?", "B: I like ... because ... What about you?");
  return lines;
}

type Phrases = { purpose: string; expressions: string[] }[];

const NEGOTIATION: Record<CefrLevel, Phrases> = {
  A1: [
    { purpose: "Saying what you need", expressions: ["I need ...", "I want ...", "I can't ..."] },
    { purpose: "Deciding", expressions: ["I like this one.", "This one is good.", "OK. Let's choose ..."] },
  ],
  A2: [
    { purpose: "Saying what you need", expressions: ["I need ...", "I'd like ...", "I can't pay more than ..."] },
    { purpose: "Giving opinions", expressions: ["I think ... is better because ...", "... is too expensive.", "What do you think?"] },
    { purpose: "Deciding", expressions: ["How about ...?", "OK, I agree.", "Let's choose ..."] },
  ],
  B1: [
    { purpose: "Saying what you need", expressions: ["It has to ..., because ...", "I'd prefer ..., but it's not essential.", "What's most important for you?"] },
    { purpose: "Comparing", expressions: ["... is cheaper than ..., but ...", "The problem with ... is that ...", "... would suit both of us."] },
    { purpose: "Agreeing on a choice", expressions: ["I see your point, but ...", "Could you live with ...?", "So we both agree on ..."] },
  ],
  B2: [
    { purpose: "Priorities", expressions: ["That's a deal-breaker for me, because ...", "I could do without ..., as long as ...", "How flexible are you on ...?"] },
    { purpose: "Weighing options", expressions: ["On the one hand ..., but on the other ...", "... makes up for ...", "It comes down to whether ... matters more than ..."] },
    { purpose: "Reaching a compromise", expressions: ["I'm prepared to accept ... if ...", "What if we went for ... instead?", "On balance, I think ... is our best option."] },
  ],
};

/**
 * Language support written by the app: question frames taken from the activity's own attributes
 * (which name no option and give no value), then negotiation language for the level.
 */
/** Individual decisions: nobody has to agree, so the language is about your own choice and asking about theirs. */
const OWN_CHOICE: Record<CefrLevel, Phrases> = {
  A1: [
    { purpose: "Saying what you want", expressions: ["I want ...", "I like ...", "I don't like ..."] },
    { purpose: "Talking about your choice", expressions: ["I like this one.", "Which one do you like?", "Why?"] },
  ],
  A2: [
    { purpose: "Saying what you want", expressions: ["I'd like ...", "I don't want to ...", "... is important for me."] },
    { purpose: "Talking about your choice", expressions: ["I think I'll choose ... because ...", "Which one are you going to choose?", "Why do you like that one?"] },
  ],
  B1: [
    { purpose: "Saying what matters to you", expressions: ["What matters most to me is ...", "I'd prefer ..., but it's not essential.", "What's most important for you?"] },
    { purpose: "Comparing", expressions: ["... is cheaper than ..., but ...", "The problem with ... is that ...", "... would suit me better because ..."] },
    { purpose: "Talking about your choice", expressions: ["I've decided on ... because ...", "Which one are you going for?", "That makes sense for you, but I ..."] },
  ],
  B2: [
    { purpose: "Priorities", expressions: ["That's a deal-breaker for me, because ...", "I could do without ..., as long as ...", "What are you prioritising?"] },
    { purpose: "Weighing options", expressions: ["On the one hand ..., but on the other ...", "... makes up for ...", "It comes down to whether ... matters more to me than ..."] },
    { purpose: "Talking about your choice", expressions: ["On balance, I'd go for ...", "I can see why you'd choose ..., but for me ...", "What tipped it for you?"] },
  ],
};

const OWN_REASONS: Record<CefrLevel, string[]> = {
  A1: ["I choose ...", "It looks ...", "It's cheap. / It's healthy. / It's fun."],
  A2: ["I chose ... because ...", "It looks ...", "It's ...er than ..."],
  B1: ["I chose ... because ...", "It isn't the ...est, but ...", "The main reason is ..."],
  B2: ["I went for ... because ...", "Even though ..., it ...", "What decided it for me was ..."],
};

const REASONS: Record<CefrLevel, string[]> = {
  A1: ["We choose ...", "It looks ...", "It's cheap. / It's healthy. / It's fun."],
  A2: ["We chose ... because ...", "It looks ...", "It's ...er than ..."],
  B1: ["We chose ... because ...", "It isn't the ...est, but ...", "The main reason is ..."],
  B2: ["We went for ... because ...", "Even though ..., it ...", "What decided it for us was ..."],
};

/** Opinions and preferences, for both formats: the facts are there to be talked about. */
const OPINIONS: Record<CefrLevel, string[]> = {
  A1: ["I like ... because ...", "Which one do you like?", "Me too. / Not me."],
  A2: ["I think ... looks good because ...", "What do you think of ...?", "I prefer ... to ..."],
  B1: ["What I like about ... is ...", "I'm not sure about ..., because ...", "Why do you prefer ...?"],
  B2: ["What appeals to me about ... is ...", "I take your point, but ...", "I'm not convinced ... is worth ..."],
};

export function choiceUsefulLanguage(cefr: CefrLevel, data: ChooseOneData | CombinationData, teacherExpressions: string, support: LanguageSupport, vocabulary: string[] = []): Phrases {
  const asking = isChooseOne(data)
    ? data.attributes.map((a) => a.question).filter(Boolean)
    : ["How much is the ...?", "What does ... want?", "Can ... eat ...?", cefr === "A1" || cefr === "A2" ? "How much is that?" : "How much does that come to altogether?"];
  const individual = isChooseOne(data) && decisionOf(data) === "individual";
  const groups: Phrases = [{ purpose: "Asking", expressions: asking }, ...((individual ? OWN_CHOICE : NEGOTIATION)[cefr] ?? NEGOTIATION.A2)];
  if (isChooseOne(data) && data.options.some((o) => o.details?.length)) {
    groups[0].expressions = [...asking, ASK_MORE];
    groups.splice(1, 0, { purpose: "Opinions", expressions: OPINIONS[cefr] ?? OPINIONS.A2 });
  }
  if (isChooseOne(data)) groups.push({ purpose: "Giving your reasons", expressions: (individual ? OWN_REASONS : REASONS)[cefr] ?? REASONS.A2 });
  const own = teacherExpressions.split("\n").map((l) => l.trim()).filter(Boolean);
  const all = own.length ? [{ purpose: "Today's expressions", expressions: own }, ...groups] : groups;
  const cut = support === "Minimal" ? all.map((g) => ({ ...g, expressions: g.expressions.slice(0, 2) })) : all;
  // The lesson words are the point of the lesson, so they are never shortened.
  return vocabulary.length ? [{ purpose: "Today's words", expressions: vocabulary }, ...cut] : cut;
}

// ====================================================================================
// Generate, check, and ask again
// ====================================================================================

/** Thrown when no attempt produced an activity that passes the checks. Carries the last attempt's problems. */
export class InvalidActivityError extends Error {
  constructor(
    public attempts: number,
    public problems: string[],
  ) {
    super(`No valid activity after ${attempts} attempts: ${problems.join(" ")}`);
  }
}

/**
 * Asks for an activity until one passes the checks, at most `attempts` times. Each new request is told
 * exactly what was wrong with the previous answer. An invalid activity is never returned.
 */
export async function generateUntilValid<Out, Data>(
  attempts: number,
  generate: (feedback: string) => Promise<Out>,
  build: (out: Out) => { data: Data; problems: string[] } | Promise<{ data: Data; problems: string[] }>,
): Promise<{ out: Out; data: Data; attempt: number }> {
  let feedback = "";
  let problems: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const out = await generate(feedback);
    const built = await build(out);
    if (!built.problems.length) return { out, data: built.data, attempt };
    problems = built.problems;
    feedback = `\n\nYour previous answer was rejected by the app's checks for these reasons. Fix every one of them and check your new answer by calculation:\n- ${problems.join("\n- ")}`;
  }
  throw new InvalidActivityError(attempts, problems);
}
