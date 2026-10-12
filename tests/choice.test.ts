/**
 * Checks for "Make the Best Choice": the app's validation of generated activities and its calculated answers.
 * Run with `npm test`. No AI calls.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChoiceCondition, ChooseOnePlan, CombinationPlan, MealCondition } from "../lib/activitySchemas";
import { applyWordingCheck, checkReviews, falseSuperlatives, choiceDemoExchange, chooseOneShape, decisionOf, generateUntilValid, guardFeedback, hasDecisionReview, InvalidActivityError, plural, reviewOption } from "../lib/choice";
import { buildChooseOne, buildCombination, choiceSteps, choiceUsefulLanguage, conditionText, detailHolder, evaluateOptions, formatValue, mealConditionText, personHolder, priceHolder, solveOrder, wishText, wordingItems } from "../lib/choice";
import { profileDetailHolder, selfCheckAllowed } from "../lib/gapLogic";
import type { Activity } from "../lib/types";
import { CEFR_LEVELS } from "../lib/types";

// ---------- Choose One: two students choosing an apartment ----------

const cond = (kind: "hard" | "soft", attribute: string, rule: ChoiceCondition["rule"], amount = 0): ChoiceCondition => ({
  kind,
  attribute,
  rule,
  amount,
  wish: `You care about ${attribute.toLowerCase()}, because of your day.`,
  wishJa: "",
  reason: "",
  reasonJa: "",
});
const num = (n: number) => ({ number: n, yes: false });
const yes = (y: boolean) => ({ number: 0, yes: y });
type Better = ChooseOnePlan["attributes"][number]["better"];
const WORDS: Record<string, [string, string]> = { Rent: ["is the cheapest", "is the most expensive"], Price: ["is the cheapest", "is the most expensive"], "Minutes to campus": ["is the nearest to campus", "is the farthest from campus"], "Minutes to wait": ["has the shortest wait", "has the longest wait"] };
const attr = (name: string, kind: "number" | "yesno", currency = "", unit = "", better: Better = "none") => ({
  name,
  nameJa: name,
  kind,
  currency,
  unit,
  unitJa: unit,
  question: `What about ${name.toLowerCase()} for ...?`,
  lowest: kind === "number" ? (WORDS[name]?.[0] ?? `has the fewest ${name.toLowerCase()}`) : "",
  highest: kind === "number" ? (WORDS[name]?.[1] ?? `has the most ${name.toLowerCase()}`) : "",
  better,
});
const option = (name: string, values: { number: number; yes: boolean }[]) => ({
  name,
  description: `${name} (described)`,
  look: `A picture of ${name}.`,
  values,
  details: [{ text: `People say ${name} is special.`, textJa: "" }, { text: `Some people do not like ${name}.`, textJa: "" }],
});
const person = (role: string, about: string, conditions: ChoiceCondition[]) => ({ role, about, aboutJa: "", interests: `You love quiet places, like any ${role}.`, interestsJa: "", conditions });

function apartments(change: (p: ChooseOnePlan) => void = () => {}): ChooseOnePlan {
  const p: ChooseOnePlan = {
    decision: "shared",
    decisionWhy: "They will live in the same apartment.",
    situation: "You are two students who want to share one apartment.",
    situationJa: "",
    optionNoun: "apartment",
    attributes: [attr("Rent", "number", "¥", "a month", "lower"), attr("Minutes to campus", "number", "", "minutes", "lower"), attr("Bedrooms", "number"), attr("Bike parking", "yesno", "", "", "yes")],
    optionsArePeople: false,
    options: [
      option("Oak House", [num(70000), num(10), num(2), yes(false)]), // possible; nearer, which A cares about
      option("Pine Court", [num(64000), num(25), num(2), yes(true)]), // possible; cheaper and with bike parking, which B cares about
      option("River View", [num(90000), num(5), num(2), yes(true)]), // too expensive
      option("Hill Flat", [num(60000), num(30), num(1), yes(false)]), // one bedroom
    ],
    sharedConditions: [cond("hard", "Bedrooms", "at least", 2)],
    studentA: person("business student", "You work in the evening.", [cond("hard", "Rent", "at most", 80000), cond("soft", "Minutes to campus", "low")]),
    studentB: person("art student", "You cycle everywhere.", [cond("hard", "Rent", "at most", 75000), cond("soft", "Bike parking", "yes"), cond("soft", "Rent", "low")]),
  };
  change(p);
  return p;
}

test("a sound Choose One activity passes, and the app works out which options are possible", () => {
  const { data, problems } = buildChooseOne(apartments(), "Intermediate");
  assert.deepEqual(problems, []);
  const reports = evaluateOptions(data);
  assert.deepEqual(reports.map((r) => [r.name, r.possible]), [["Oak House", true], ["Pine Court", true], ["River View", false], ["Hill Flat", false]]);
  assert.deepEqual(reports.find((r) => r.name === "River View")!.failed.map((c) => c.owner), ["A", "B"]); // over both budgets
  assert.equal(reports.find((r) => r.name === "Hill Flat")!.failed[0].owner, "shared"); // one bedroom
  // Both possible apartments are defensible: one suits A, the other suits B.
  assert.deepEqual(reports.filter((r) => r.defensible).map((r) => r.name), ["Oak House", "Pine Court"]);
});

test("conditions are written from their rules, so the words always match what is checked", () => {
  const { data } = buildChooseOne(apartments(), "Intermediate");
  assert.equal(conditionText(data.students.A.conditions[0], data).text, "Rent: ¥80,000 a month or less");
  assert.equal(conditionText(data.shared[0], data).text, "Bedrooms: 2 or more");
  assert.equal(conditionText(data.students.B.conditions[1], data).text, "Bike parking: yes");
  // A priority has no figure. The student reads it as a sentence; a limit also shows its rule beside the sentence.
  assert.equal(conditionText(data.students.A.conditions[1], data).text, "Minutes to campus: lower is better");
  assert.equal(wishText(data.students.A.conditions[1], data).text, "You care about minutes to campus, because of your day.");
  assert.equal(wishText(data.students.A.conditions[0], data).text, "You care about rent, because of your day. (Rent: ¥80,000 a month or less)");
  assert.equal(formatValue(data.attributes[0], num(64000)), "¥64,000 a month");
  assert.equal(formatValue(data.attributes[3], yes(false)), "No");
});

test("an impossible activity is rejected: no option meets every hard condition", () => {
  const { problems } = buildChooseOne(apartments((p) => (p.studentB.conditions[0] = cond("hard", "Rent", "at most", 50000))), "Intermediate");
  assert.ok(problems.some((x) => /impossible/.test(x)), problems.join(" | "));
});

test("an activity with nothing to negotiate is rejected", () => {
  // One apartment meets every condition and every wish of both students.
  const perfect = buildChooseOne(apartments((p) => (p.options[1] = option("Pine Court", [num(59000), num(4), num(2), yes(true)]))), "Intermediate");
  assert.ok(perfect.problems.some((x) => /nothing to discuss/.test(x)), perfect.problems.join(" | "));
  // Only one apartment is possible.
  const single = buildChooseOne(apartments((p) => (p.options[1].values[0] = num(79000))), "Intermediate");
  assert.ok(single.problems.some((x) => /Only one option is possible/.test(x)), single.problems.join(" | "));
  // Hard conditions that rule nothing out.
  const loose = buildChooseOne(apartments((p) => ((p.sharedConditions = []), (p.studentA.conditions[0].amount = 999999), (p.studentB.conditions[0].amount = 999999))), "Easy");
  assert.ok(loose.problems.some((x) => /rule nothing out/.test(x)), loose.problems.join(" | "));
  // Both students want the same thing: no trade-off between them.
  const agree = buildChooseOne(apartments((p) => (p.studentB.conditions = [cond("hard", "Rent", "at most", 75000), cond("soft", "Minutes to campus", "low")])), "Intermediate");
  assert.ok(agree.problems.some((x) => /nothing to trade off/.test(x)), agree.problems.join(" | "));
});

test("badly formed conditions are rejected", () => {
  const wrongRule = buildChooseOne(apartments((p) => (p.studentA.conditions[1] = cond("soft", "Bike parking", "low"))), "Intermediate");
  assert.ok(wrongRule.problems.some((x) => /yes\/no attribute/.test(x)));
  const unknown = buildChooseOne(apartments((p) => (p.studentA.conditions[1] = cond("soft", "Garden", "yes"))), "Intermediate");
  assert.ok(unknown.problems.some((x) => /not one of the attributes/.test(x)));
});

test("the option facts are split so each student holds about half of every option", () => {
  const { data } = buildChooseOne(apartments(), "Intermediate");
  data.options.forEach((_, o) => {
    const a = data.attributes.filter((_, i) => profileDetailHolder(o, i) === "A").length;
    assert.equal(a, 2, `option ${o}: Student A holds ${a} of 4 facts`);
    // What is special about an option is told to one student each, so both have something to tell.
    assert.deepEqual([detailHolder(o, 0), detailHolder(o, 1)].sort(), ["A", "B"]);
    assert.notEqual(detailHolder(o, 0), profileDetailHolder(o, 0));
  });
});

// ---------- Choose One at A1: a choice about preferences, with pictures and a Decision Review ----------

function lunches(change: (p: ChooseOnePlan) => void = () => {}): ChooseOnePlan {
  const p: ChooseOnePlan = {
    decision: "shared",
    decisionWhy: "They share one dish.",
    situation: "You are two friends. You want one lunch to share.",
    situationJa: "",
    optionNoun: "dish",
    attributes: [attr("Price", "number", "¥", "", "lower"), attr("Minutes to wait", "number", "", "minutes", "lower"), attr("Comes with a drink", "yesno", "", "", "yes")],
    optionsArePeople: false,
    options: [
      option("Pasta", [num(800), num(15), yes(false)]), // cheap: A's wish
      option("Curry", [num(950), num(5), yes(true)]), // fast, with a drink: B's wish
      option("Pizza", [num(1200), num(20), yes(true)]), // B's wish, but slow and dear
    ],
    sharedConditions: [],
    studentA: person("hungry friend", "You do not have much money.", [cond("soft", "Price", "low")]),
    studentB: person("thirsty friend", "You want a drink.", [cond("soft", "Comes with a drink", "yes")]),
  };
  change(p);
  return p;
}

test("an A1 activity is a choice about preferences: no hard conditions, and more than one good choice", () => {
  assert.equal(chooseOneShape("A1", "Easy").hardEach, 0);
  // Higher levels are harder because there is more to weigh up and say, not because the table grows.
  for (const cefr of CEFR_LEVELS) for (const d of ["Easy", "Intermediate", "Challenging"] as const) assert.ok(chooseOneShape(cefr, d).attributes <= 4 && chooseOneShape(cefr, d).details >= 1, `${cefr} ${d}`);
  assert.ok(chooseOneShape("A1", "Easy").options <= 3);
  const { data, problems } = buildChooseOne(lunches(), "Easy", "A1");
  assert.deepEqual(problems, []);
  const reports = evaluateOptions(data);
  assert.ok(reports.every((r) => r.possible), "nothing is ruled out at A1");
  assert.ok(reports.filter((r) => r.defensible).length >= 2, "at least two choices can be defended");
});

test("an A1 activity may not be an elimination puzzle", () => {
  const puzzle = buildChooseOne(lunches((p) => (p.sharedConditions = [cond("hard", "Price", "at most", 1000), cond("hard", "Minutes to wait", "at most", 10)])), "Easy", "A1");
  assert.ok(puzzle.problems.some((x) => /Use at most one/.test(x)), puzzle.problems.join(" | "));
  const ownLimit = buildChooseOne(lunches((p) => p.studentA.conditions.push(cond("hard", "Minutes to wait", "at most", 10))), "Easy", "A1");
  assert.ok(ownLimit.problems.some((x) => /no hard limits for the students/.test(x)), ownLimit.problems.join(" | "));
  // One simple shared limit is allowed, as long as two options are still possible.
  const limit = buildChooseOne(lunches((p) => (p.sharedConditions = [cond("hard", "Price", "at most", 1000)])), "Easy", "A1");
  assert.deepEqual(limit.problems, []);
  const single = buildChooseOne(lunches((p) => (p.sharedConditions = [cond("hard", "Price", "at most", 850)])), "Easy", "A1");
  assert.ok(single.problems.some((x) => /by elimination/.test(x)), single.problems.join(" | "));
});

test("wishes are priorities with a reason, not figures, and no level needs a limit", () => {
  // B1 without any "Must" condition is a sound activity.
  const noLimit = buildChooseOne(apartments((p) => ((p.sharedConditions = []), (p.studentA.conditions = p.studentA.conditions.slice(1)), (p.studentB.conditions = p.studentB.conditions.slice(1)))), "Intermediate", "B1");
  assert.deepEqual(noLimit.problems, []);
  const figure = buildChooseOne(lunches((p) => (p.studentA.conditions = [cond("soft", "Minutes to wait", "at most", 22)])), "Easy", "A1");
  assert.ok(figure.problems.some((x) => /wish with an exact figure/.test(x)), figure.problems.join(" | "));
  const numbered = buildChooseOne(lunches((p) => (p.studentA.conditions[0].wish = "You want to pay 900 yen or less.")), "Easy", "A1");
  assert.ok(numbered.problems.some((x) => /contains a number/.test(x)), numbered.problems.join(" | "));
  const unworded = buildChooseOne(lunches((p) => (p.studentA.conditions[0].wish = "")), "Easy", "A1");
  assert.ok(unworded.problems.some((x) => /no "wish" sentence/.test(x)), unworded.problems.join(" | "));
  const flat = buildChooseOne(lunches((p) => p.options.forEach((o) => (o.values[0] = num(800)))), "Easy", "A1");
  assert.ok(flat.problems.some((x) => /cannot affect the choice/.test(x)), flat.problems.join(" | "));
  const noPicture = buildChooseOne(lunches((p) => (p.options[1].look = "")), "Easy", "A1");
  assert.ok(noPicture.problems.some((x) => /picture cannot be drawn/.test(x)));
});

test("every option has details of its own and every student has tastes the app does not check", () => {
  const bare = buildChooseOne(lunches((p) => (p.options[2].details = [])), "Easy", "A1");
  assert.ok(bare.problems.some((x) => /Pizza has 0 detail/.test(x)), bare.problems.join(" | "));
  const wide = buildChooseOne(lunches((p) => (["Calories", "Size", "Stars"].forEach((n) => p.attributes.push(attr(n, "number"))), p.options.forEach((o) => o.values.push(num(1), num(2), num(3))))), "Easy", "A1");
  assert.ok(wide.problems.some((x) => /keep the table small/.test(x)), wide.problems.join(" | "));
  const dull = buildChooseOne(lunches((p) => (p.studentB.interests = "")), "Easy", "A1");
  assert.ok(dull.problems.some((x) => /Student B has no "interests"/.test(x)), dull.problems.join(" | "));
  const { data } = buildChooseOne(lunches(), "Easy", "A1");
  data.reviews = [];
  // The review lists them without sorting them into good and bad: that judgement is the student's.
  const review = reviewOption(data, 1);
  assert.deepEqual(review.personal, ["People say Curry is special.", "Some people do not like Curry."]);
  assert.ok(![...review.advantages, ...review.disadvantages].some((x) => /special|do not like/.test(x)));
  // The steps ask for opinions, not only facts.
  assert.ok(choiceSteps(data).exchange.some((x) => /Say which dish you like and why/.test(x)));
  assert.ok(choiceUsefulLanguage("A1", data, "", "Useful expressions").some((g) => g.purpose === "Opinions"));
});

test("every option gets a Decision Review worked out from the facts", () => {
  const { data } = buildChooseOne(apartments(), "Intermediate", "B1");
  const reviews = data.options.map((_, i) => reviewOption(data, i));
  assert.equal(reviews.length, 4);
  for (const r of reviews) {
    assert.equal(r.requirements.length, 3, "every Must condition is checked for every option");
    assert.equal(r.facts.length, data.attributes.length);
    assert.ok(r.verdict.length > 0);
  }
  const [oak, pine, river, hill] = reviews;
  assert.ok(oak.possible && oak.defensible && oak.requirements.every((x) => x.met));
  // The verdict weighs; it does not count wishes or name a winner.
  assert.match(oak.verdict, /reasonable choice: it meets every “Must” condition\. No apartment is the best for everything the two of you care about/);
  for (const r of reviews) assert.ok(!/\d+ of \d+|more of what you wanted/.test([r.verdict, ...r.advantages, ...r.disadvantages, ...(r.mixed ?? [])].join(" ")), r.option);
  // Comparisons use the attribute's own words, not "lowest" and "highest".
  assert.ok(oak.mixed!.some((a) => a === "Student A cares about “Minutes to campus”. This choice: 10 minutes. River View is the nearest to campus (5 minutes)."), oak.mixed!.join(" | "));
  // A fact nobody has a wish about is stated, not counted for or against the choice.
  assert.deepEqual(oak.other, []);
  assert.ok(![...oak.advantages, ...oak.disadvantages].some((x) => /Bedrooms/.test(x)));
  assert.ok(oak.disadvantages.some((d) => d === "Student B wanted “Bike parking”. This choice does not have it."), oak.disadvantages.join(" | "));
  // The review never calls a failed condition met.
  assert.equal(river.possible, false);
  assert.deepEqual(river.requirements.filter((x) => !x.met).map((x) => x.owner), ["A", "B"]);
  assert.match(river.verdict, /does not meet 2 “Must” conditions/);
  assert.ok(river.advantages.some((a) => a === "Student A cares about “Minutes to campus”. This choice is the nearest to campus of the 4 apartments: 5 minutes."), river.advantages.join(" | "));
  assert.ok(river.disadvantages.some((d) => d === "Student B cares about “Rent”. This choice is the most expensive of the 4 apartments: ¥90,000 a month."), river.disadvantages.join(" | "));
  assert.match(hill.verdict, /does not meet one “Must” condition/);
  assert.ok(hill.advantages.some((a) => /This choice is the cheapest of the 4 apartments: ¥60,000 a month\./.test(a)));
  // A fact that is weighed as a priority is not listed a second time.
  assert.equal(hill.advantages.filter((a) => /Rent/.test(a)).length, 1);
  assert.ok(pine.possible);
});

test("the AI's part of the reviews is checked: one per option, possibilities only, no invented numbers", () => {
  const { data } = buildChooseOne(lunches(), "Easy", "A1");
  const text = (o: string, consequences = ["Maybe you are still hungry."], overall = `${o} is cheap. It is good for Student A.`, student: "A" | "B" | "both" = "both") => ({ option: o, student, consequences, overall, overallJa: "" });
  assert.deepEqual(checkReviews(data, [text("Pasta"), text("Curry"), text("Pizza")]), []);
  // Numbers that are facts (or the difference between two facts) are allowed.
  assert.deepEqual(checkReviews(data, [text("Pasta", ["You could save ¥150."], "It is ¥800."), text("Curry"), text("Pizza")]), []);
  assert.ok(checkReviews(data, [text("Pasta"), text("Curry")]).some((x) => /no review of Pizza/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta"), text("Curry"), text("Pizza"), text("Sushi")]).some((x) => /not an option/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta", ["You will be hungry."]), text("Curry"), text("Pizza")]).some((x) => /stated as a fact/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta", undefined, "It has 650 calories."), text("Curry"), text("Pizza")]).some((x) => /650/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta", undefined, ""), text("Curry"), text("Pizza")]).some((x) => /no overall view/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta", undefined, "It gives you one of the two wishes."), text("Curry", undefined, "It is fast."), text("Pizza", undefined, "It is big.")]).some((x) => /counts wishes/.test(x)));
  assert.ok(checkReviews(data, [text("Pasta", undefined, "It is big."), text("Curry"), text("Pizza", undefined, "It is big.")]).some((x) => /word for word the same as that of Pasta/.test(x)));
});

test("an individual decision needs a review of every option for each student, written to that student alone", () => {
  const { data } = buildChooseOne(ownLunches(), "Easy", "A1");
  const one = (option: string, student: "A" | "B" | "both", overall = `${option} is fast. Maybe you like it, ${student}.`) => ({ option, student, consequences: ["You may wait."], overall, overallJa: "" });
  const all = data.options.flatMap((o) => [one(o.name, "A"), one(o.name, "B")]);
  assert.deepEqual(checkReviews(data, all), []);
  assert.ok(checkReviews(data, all.filter((r) => !(r.option === "Curry" && r.student === "B"))).some((x) => /no review of Curry for Student B/.test(x)));
  assert.ok(checkReviews(data, data.options.map((o) => one(o.name, "both"))).length >= 8, "reviews for both do not count");
  const mixed = all.map((r) => (r.option === "Pasta" && r.student === "A" ? one("Pasta", "A", "Student B may wait. You save money.") : r));
  assert.ok(checkReviews(data, mixed).some((x) => /speak only to that one student/.test(x)));
  // Each student gets their own text.
  data.reviews = all.map((r) => ({ ...r, overall: `For ${r.student}.` }));
  assert.equal(reviewOption(data, 1, "A").overall, "For A.");
  assert.equal(reviewOption(data, 1, "B").overall, "For B.");
});

test("students see reviews only by submitting: no Check Answers page for a reviewed activity", () => {
  const { data } = buildChooseOne(lunches(), "Easy", "A1");
  const activity = { type: "profile", data, allowSelfCheck: true } as unknown as Activity;
  assert.equal(hasDecisionReview(data), false);
  assert.equal(selfCheckAllowed(activity), true, "activities made before reviews keep their self-check");
  data.reviews = [];
  assert.equal(hasDecisionReview(data), true);
  assert.equal(selfCheckAllowed(activity), false);
  // The steps name no option and ask for a choice and reasons.
  const steps = choiceSteps(data);
  assert.match(steps.decide, /agree on ONE dish/);
  assert.match(steps.decide, /more than one good choice/);
  for (const o of data.options) assert.ok(![...steps.exchange, steps.decide].some((line) => line.includes(o.name)));
});

test("the AI's comment cannot overturn the app's check of the Must conditions", () => {
  const feedback = { comment: "", factChecks: [{ said: "he meets every requirement", fact: "He misses a wish." }, { said: "it costs ¥50", fact: "It costs ¥800." }] };
  assert.deepEqual(guardFeedback(feedback, { possible: true }).factChecks.map((f) => f.said), ["it costs ¥50"]);
  // If the choice really fails a Must condition, the correction stays.
  assert.equal(guardFeedback(feedback, { possible: false }).factChecks.length, 2);
});

test("beginners first see a short card: only what they care about, in very short sentences", () => {
  const { data } = buildChooseOne(ownLunches(), "Easy", "A1");
  data.reviews = [];
  // Student A cares about price and a drink. Waiting time is not on the card.
  assert.deepEqual(reviewOption(data, 0, "A").simple, { good: ["It is the cheapest (¥500)."], think: ["Comes with a drink: no."] });
  assert.deepEqual(reviewOption(data, 2, "A").simple, { good: ["Comes with a drink: yes."], think: ["It is the most expensive (¥800)."] });
  assert.deepEqual(reviewOption(data, 3, "B").simple, { good: ["It has the shortest wait (3 minutes)."], think: [] });
  // A failed "Must" condition is always something to think about.
  const flats = buildChooseOne(apartments(), "Intermediate").data;
  assert.deepEqual(reviewOption(flats, 0).simple!.think, ["Bike parking: no. Student B wanted “yes”."]);
  assert.match(reviewOption(flats, 2).simple!.think[0], /^It does not meet a “Must”: Rent: ¥80,000 a month or less \(¥90,000 a month\)\.$/);
});

test("AI feedback keeps to the facts: no invented numbers, and a failed Must is always said", () => {
  const flats = buildChooseOne(apartments(), "Intermediate").data;
  const feedback = { goodPoints: ["It is near campus.", "It is only ¥55,000."], thinkAbout: ["It is expensive."], factChecks: [{ said: "“it is the cheapest”", fact: "Hill Flat is cheaper." }, { said: "it is big", fact: "It has 120 rooms." }] };
  const river = reviewOption(flats, 2);
  const guarded = guardFeedback(feedback, river, flats);
  assert.deepEqual(guarded.goodPoints, ["It is near campus."]);
  assert.equal(guarded.thinkAbout.length, 2);
  assert.ok(guarded.thinkAbout.every((x) => /does not meet a “Must” condition/.test(x)), guarded.thinkAbout.join(" | "));
  // The quotation marks are the page's, not the AI's.
  assert.deepEqual(guarded.factChecks, [{ said: "it is the cheapest", fact: "Hill Flat is cheaper." }]);
  // What a correction already says is not listed again under "Think about".
  const twice = guardFeedback({ goodPoints: [], thinkAbout: ["It is the most expensive apartment.", "It has no bike parking."], factChecks: [{ said: "it is cheap", fact: "Oak House is not cheap: River View is the only more expensive apartment." }] }, reviewOption(flats, 0), flats);
  assert.deepEqual(twice.thinkAbout, ["It has no bike parking."]);
  const oak = guardFeedback(feedback, reviewOption(flats, 0), flats);
  assert.deepEqual(oak.thinkAbout, ["It is expensive."]);
});

test("a suggested sentence may not repeat a comparison the facts contradict", () => {
  const { data } = buildChooseOne(ownLunches(), "Easy", "A1");
  // Pizza (index 2) is the most expensive lunch and has the longest wait.
  assert.deepEqual(falseSuperlatives(data, 2, "I choose pizza because it is the cheapest, and I like cheese."), ["cheapest"]);
  assert.deepEqual(falseSuperlatives(data, 2, "I think it has the shortest wait."), ["shortest"]);
  // True claims, opinions, negated claims and claims about another lunch are all fine.
  assert.deepEqual(falseSuperlatives(data, 0, "I choose pasta because it is the cheapest."), []);
  assert.deepEqual(falseSuperlatives(data, 2, "I choose pizza because it looks delicious and I love cheese."), []);
  assert.deepEqual(falseSuperlatives(data, 2, "It is not the cheapest, but I like cheese."), []);
  assert.deepEqual(falseSuperlatives(data, 2, "Pasta is the cheapest. I choose pizza because I like cheese."), []);
  assert.deepEqual(falseSuperlatives(data, 2, "It is the most expensive, but I love it."), []);
});

// ---------- Individual decision: each student chooses their own lunch ----------

function ownLunches(change: (p: ChooseOnePlan) => void = () => {}): ChooseOnePlan {
  const p: ChooseOnePlan = {
    decision: "individual",
    decisionWhy: "Each student eats their own lunch.",
    situation: "You are classmates in the cafeteria. Each of you chooses a lunch.",
    situationJa: "",
    optionNoun: "lunch",
    attributes: [attr("Price", "number", "¥", "", "lower"), attr("Minutes to wait", "number", "", "minutes", "lower"), attr("Comes with a drink", "yesno", "", "", "yes")],
    optionsArePeople: false,
    options: [
      option("Pasta", [num(500), num(15), yes(false)]), // A: cheap, no drink.   B: neither
      option("Curry", [num(650), num(5), yes(true)]), //   A: drink, not cheap.  B: fast and a drink
      option("Pizza", [num(800), num(20), yes(true)]), //  A: drink, not cheap.  B: drink only
      option("Noodles", [num(700), num(3), yes(false)]), // A: neither.          B: the fastest
    ],
    sharedConditions: [],
    studentA: person("student with little money", "You do not have much money. You are thirsty.", [cond("soft", "Price", "low"), cond("soft", "Comes with a drink", "yes")]),
    studentB: person("student in a hurry", "You have a club meeting soon.", [cond("soft", "Minutes to wait", "low"), cond("soft", "Price", "low")]),
  };
  change(p);
  return p;
}

test("an individual decision is checked for each student separately", () => {
  const { data, problems } = buildChooseOne(ownLunches(), "Easy", "A1");
  assert.deepEqual(problems, []);
  assert.equal(decisionOf(data), "individual");
  // Each student is weighed against their own wishes only: B's wishes do not count against A's choice.
  const a = evaluateOptions(data, "A");
  const b = evaluateOptions(data, "B");
  assert.ok(a.every((r) => [...r.wishesMet, ...r.wishesPartly, ...r.wishesMissed].every((c) => c.owner === "A")));
  // Pizza costs more than Curry and offers Student A nothing more; Noodles is slower to pay off than Pasta. Both stay possible.
  assert.deepEqual(a.filter((r) => r.defensible).map((r) => r.name), ["Pasta", "Curry"]);
  assert.deepEqual(a[2].beatenBy, ["Curry"]);
  // Different options are worth choosing for each student: Noodles is the fastest, which only Student B cares about.
  assert.deepEqual(b.filter((r) => r.defensible).map((r) => r.name), ["Pasta", "Curry", "Noodles"]);
  assert.ok(a.every((r) => r.possible) && b.every((r) => r.possible));
});

test("an individual decision is rejected when a student has nothing to weigh up", () => {
  const oneWish = buildChooseOne(ownLunches((p) => (p.studentA.conditions = [cond("soft", "Price", "low")])), "Easy", "A1");
  assert.ok(oneWish.problems.some((x) => /only 1 wish/.test(x)), oneWish.problems.join(" | "));
  // Curry now gives Student A everything: cheap and with a drink.
  const perfect = buildChooseOne(ownLunches((p) => (p.options[1].values[0] = num(450))), "Easy", "A1");
  assert.ok(perfect.problems.some((x) => /Curry is the best option for everything Student A cares about/.test(x)), perfect.problems.join(" | "));
  const same = buildChooseOne(ownLunches((p) => (p.studentB.conditions = p.studentA.conditions.map((c) => ({ ...c })))), "Easy", "A1");
  assert.ok(same.problems.some((x) => /identical wishes/.test(x)), same.problems.join(" | "));
  const blocked = buildChooseOne(ownLunches((p) => p.studentB.conditions.push(cond("hard", "Price", "at most", 520))), "Easy", "A2");
  assert.ok(blocked.problems.some((x) => /Only Pasta is possible for Student B/.test(x)), blocked.problems.join(" | "));
});

test("the teacher's decision format overrides the AI's, and a mismatch is sent back", () => {
  const forced = buildChooseOne(ownLunches(), "Easy", "A1", "shared");
  assert.equal(decisionOf(forced.data), "shared");
  assert.ok(forced.problems.some((x) => /teacher chose a shared decision/.test(x)), forced.problems.join(" | "));
  assert.equal(decisionOf(buildChooseOne(lunches(), "Easy", "A1", "shared").data), "shared");
  // Activities saved before the formats existed were shared decisions.
  const old = buildChooseOne(lunches(), "Easy", "A1").data;
  delete old.decision;
  assert.equal(decisionOf(old), "shared");
});

test("in an individual decision the review, steps and language speak to one student and never say 'we'", () => {
  const { data } = buildChooseOne(ownLunches(), "Easy", "A1");
  data.reviews = [];
  const curryA = reviewOption(data, 1, "A");
  const curryB = reviewOption(data, 1, "B");
  // The same option is reviewed differently for each student.
  assert.ok(curryA.advantages.some((x) => x === "You wanted “Comes with a drink”. This choice has it."), curryA.advantages.join(" | "));
  assert.ok(curryA.mixed!.some((x) => x === "You care about “Price”. This choice: ¥650. Pasta is the cheapest (¥500)."), curryA.mixed!.join(" | "));
  assert.ok(curryB.mixed!.some((x) => x === "You care about “Minutes to wait”. This choice: 5 minutes. Noodles has the shortest wait (3 minutes)."), curryB.mixed!.join(" | "));
  assert.ok(reviewOption(data, 3, "B").advantages.some((x) => x === "You care about “Minutes to wait”. This choice has the shortest wait of the 4 lunches: 3 minutes."));
  assert.match(curryA.interests!, /^You love quiet places/);
  // What this student has no wish about is listed as a plain fact, for and against nothing.
  assert.deepEqual(curryA.other, ["Minutes to wait: 5 minutes."]);
  assert.deepEqual(reviewOption(data, 2, "A").other, ["Minutes to wait: 20 minutes. This choice has the longest wait of the 4 lunches."]);
  assert.deepEqual(curryB.other, ["Comes with a drink: Yes."]);
  // A choice that another one beats on the checked facts is still the student's to make.
  assert.match(reviewOption(data, 2, "A").verdict, /Curry is as good or better each time\. It can still be a good choice if there is something else you like about it/);
  const everything = [
    ...data.options.flatMap((_, i) => (["A", "B"] as const).flatMap((role) => { const r = reviewOption(data, i, role); return [r.verdict, ...r.advantages, ...r.disadvantages, ...(r.mixed ?? []), ...(r.other ?? []), ...r.requirements.map((q) => q.text)]; })),
    ...choiceSteps(data).exchange,
    choiceSteps(data).decide,
    ...CEFR_LEVELS.flatMap((cefr) => choiceUsefulLanguage(cefr, data, "", "Useful expressions").flatMap((g) => [g.purpose, ...g.expressions])),
  ].join("\n");
  assert.ok(!/\b(we|our|us|both of you|agree|together|Student [AB] wanted)\b/i.test(everything), everything.match(/.*\b(we|our|us|both of you|agree|together|Student [AB] wanted)\b.*/i)?.[0]);
  assert.match(choiceSteps(data).decide, /for yourself/);
  assert.match(choiceSteps(data).decide, /can choose a different one/);
  // A shared decision keeps the pair's language.
  const shared = buildChooseOne(lunches(), "Easy", "A1").data;
  shared.reviews = [];
  assert.match(choiceSteps(shared).decide, /agree on ONE dish/);
  assert.ok(choiceUsefulLanguage("A2", shared, "", "Useful expressions").some((g) => g.expressions.some((e) => /^We chose/.test(e))));
});

test("both formats keep a real information gap: each student lacks facts their own wishes depend on", () => {
  for (const plan of [ownLunches(), lunches(), apartments()]) {
    const { data } = buildChooseOne(plan, "Easy", "A1");
    for (const role of ["A", "B"] as const) {
      const needed = data.students[role].conditions.map((c) => data.attributes.findIndex((a) => a.name === c.attribute));
      const hidden = needed.filter((ai) => data.options.some((_, oi) => profileDetailHolder(oi, ai) !== role));
      assert.equal(hidden.length, needed.length, `${data.optionNoun}: Student ${role} can decide without asking`);
      // And for every option there is something only their partner was told.
      for (const [oi, o] of data.options.entries()) assert.ok(o.details.some((_, k) => detailHolder(oi, k) !== role), `${o.name}: Student ${role} was told everything`);
    }
  }
});

test("the model exchange follows the real split: the student who asks cannot see the answer", () => {
  for (const plan of [ownLunches(), apartments()]) {
    const { data } = buildChooseOne(plan, "Easy", "A1");
    const all = choiceDemoExchange(data);
    // After the facts: something only one student was told, then opinions.
    const more = all.findIndex((l) => /What else do you know about/.test(l));
    assert.ok(more >= 4);
    const told = data.options.findIndex((o) => all[more].includes(o.name));
    const which = data.options[told].details.findIndex((d) => all[more + 1].endsWith(d.text));
    assert.equal(detailHolder(told, which), all[more + 1][0]);
    assert.notEqual(all[more][0], all[more + 1][0]);
    assert.deepEqual(all.slice(more + 2), ["A: Which one do you like?", "B: I like ... because ... What about you?"]);
    const lines = all.slice(0, more);
    for (let i = 0; i < lines.length; i += 2) {
      const asker = lines[i][0] as "A" | "B";
      assert.notEqual(lines[i + 1][0], asker);
      const oi = data.options.findIndex((o) => lines[i].includes(o.name));
      const ai = data.attributes.findIndex((a) => lines[i] === `${asker}: ${a.question.replace("...", data.options[oi].name)}`);
      assert.ok(oi >= 0 && ai >= 0, lines[i]);
      assert.notEqual(profileDetailHolder(oi, ai), asker, `${lines[i]} is asked by the student who already knows`);
      assert.ok(lines[i + 1].includes(formatValue(data.attributes[ai], data.options[oi].values[ai])));
    }
  }
});

test("activities saved before priorities existed keep their conditions, checks and wording", () => {
  const { data } = buildChooseOne(apartments(), "Intermediate");
  const old = (kind: "hard" | "soft", attribute: string, rule: ChoiceCondition["rule"], amount = 0) => ({ kind, attribute, rule, amount, reason: "", reasonJa: "" }) as unknown as ChoiceCondition;
  data.shared = [old("hard", "Bedrooms", "at least", 2)];
  data.students.A.conditions = [old("hard", "Rent", "at most", 80000), old("soft", "Minutes to campus", "at most", 15)];
  data.students.B.conditions = [old("hard", "Rent", "at most", 75000), old("soft", "Bike parking", "yes"), old("soft", "Rent", "at most", 65000)];
  for (const o of data.options) delete (o as { details?: unknown }).details;
  for (const role of ["A", "B"] as const) delete (data.students[role] as { interests?: unknown }).interests;
  data.reviews = [];
  assert.equal(wishText(data.students.A.conditions[1], data).text, "Minutes to campus: 15 minutes or less");
  assert.deepEqual(evaluateOptions(data).filter((r) => r.defensible).map((r) => r.name), ["Oak House", "Pine Court"]);
  const oak = reviewOption(data, 0);
  assert.match(oak.verdict, /Pine Court can also be defended/);
  assert.ok(oak.advantages.some((a) => /Student A wanted “Minutes to campus: 15 minutes or less”\. This choice gives that \(10 minutes\)/.test(a)), oak.advantages.join(" | "));
  assert.deepEqual([oak.mixed, oak.personal, oak.other], [[], [], []]);
  assert.ok(reviewOption(data, 3).advantages.some((a) => /Rent: ¥60,000 a month\. That is the lowest of the 4 apartments\./.test(a)));
  assert.equal(choiceSteps(data).exchange.length, 2);
  assert.ok(!choiceUsefulLanguage("B1", data, "", "Useful expressions").some((g) => g.purpose === "Opinions"));
  assert.ok(!choiceDemoExchange(data).some((l) => /What else|Which one do you like/.test(l)));
});

test("the two students must be different people", () => {
  const twins = buildChooseOne(ownLunches((p) => (p.studentB.conditions = [cond("soft", "Price", "low"), cond("soft", "Comes with a drink", "yes"), cond("soft", "Minutes to wait", "low")])), "Easy", "A1");
  assert.ok(twins.problems.some((x) => /share 2 identical wishes/.test(x)), twins.problems.join(" | "));
  const sameTaste = buildChooseOne(ownLunches((p) => (p.studentB.interests = p.studentA.interests)), "Easy", "A1");
  assert.ok(sameTaste.problems.some((x) => /same interests/.test(x)), sameTaste.problems.join(" | "));
  // With Noodles no faster than Curry, the same two lunches are worth choosing for both students.
  const sameChoices = buildChooseOne(ownLunches((p) => (p.options[3].values[1] = num(5))), "Easy", "A1");
  assert.ok(sameChoices.problems.some((x) => /make no real difference between them/.test(x)), sameChoices.problems.join(" | "));
});

test("a second reading catches a wish that says the opposite of its rule, and corrects Japanese", () => {
  const { data } = buildChooseOne(ownLunches((p) => ((p.studentA.aboutJa = "まちがい"), (p.attributes[0].lowest = "costs little"))), "Easy", "A1");
  const items = wordingItems(data);
  assert.equal(items.wishes.length, 4);
  assert.equal(items.superlatives.length, 4);
  const aboutA = items.pairs.findIndex((p) => p.en === data.students.A.about) + 1;
  const agree = { wishes: [{ number: 1, says: "wants it lower" as const }, { number: 2, says: "wants it" as const }, { number: 3, says: "unclear" as const }], superlatives: [{ number: 1, means: "lowest" as const }, { number: 2, means: "highest" as const }], japanese: [{ number: aboutA, ok: false, better: "お金があまりありません。" }, { number: 1, ok: true, better: "" }], conflicts: [] };
  assert.deepEqual(applyWordingCheck(data, agree), { problems: [], corrected: 1 });
  assert.equal(data.students.A.aboutJa, "お金があまりありません。");
  const disagree = applyWordingCheck(data, { wishes: [{ number: 1, says: "wants it higher" }, { number: 2, says: "does not want it" }], superlatives: [{ number: 3, means: "highest" }], japanese: [], conflicts: [] });
  assert.equal(disagree.problems.length, 3);
  assert.match(disagree.problems[0], /Student A's condition about "Price" has the rule "low", but its sentence .* says the student wants it higher/);
  assert.match(disagree.problems[2], /"Minutes to wait", "lowest" is "has the shortest wait", which describes the highest value/);
  const conflict = applyWordingCheck(data, { wishes: [], superlatives: [], japanese: [], conflicts: [{ option: "Curry", problem: "The description says it comes with a drink." }, { option: "Sushi", problem: "Not an option." }] });
  assert.deepEqual(conflict.problems.length, 1);
  assert.ok(buildChooseOne(ownLunches((p) => (p.options[0].values[1] = num(0.75))), "Easy", "A1").problems.some((x) => /Use a smaller unit/.test(x)));
  // The comparison phrases themselves must be usable.
  assert.ok(buildChooseOne(ownLunches((p) => (p.attributes[0].lowest = "cheap")), "Easy", "A1").problems.some((x) => /needs "lowest" and "highest"/.test(x)));
});

test("unnatural food quantities are rejected", () => {
  const servings = buildChooseOne(ownLunches((p) => (p.attributes[1] = attr("Servings", "number", "", "servings", "higher"))), "Easy", "A1");
  assert.ok(servings.problems.some((x) => /servings or portions/.test(x)), servings.problems.join(" | "));
});

test("option nouns are made plural correctly", () => {
  assert.deepEqual(["dish", "apartment", "activity", "holiday", "box", "lunch", "bus"].map(plural), ["dishes", "apartments", "activities", "holidays", "boxes", "lunches", "buses"]);
});

// ---------- Build a Combination: a fast-food order for a family ----------

const meal = (kind: "hard" | "soft", rule: MealCondition["rule"], tag = "", category = ""): MealCondition => ({ kind, rule, tag, category, reason: "", reasonJa: "" });

function family(change: (p: CombinationPlan) => void = () => {}): CombinationPlan {
  const p: CombinationPlan = {
    situation: "You are ordering dinner for the Sato family.",
    situationJa: "",
    currency: "¥",
    categories: [{ name: "Main", nameJa: "メイン", required: true }, { name: "Drink", nameJa: "飲み物", required: true }, { name: "Side", nameJa: "サイド", required: false }],
    tags: ["cheese", "meat", "large", "hot"].map((name) => ({ name, nameJa: name })),
    items: [
      { name: "Hamburger", category: "Main", price: 300, tags: ["meat"] },
      { name: "Cheeseburger", category: "Main", price: 450, tags: ["meat", "cheese"] },
      { name: "Veggie Burger", category: "Main", price: 400, tags: [] },
      { name: "Big Burger", category: "Main", price: 650, tags: ["meat", "cheese", "large"] },
      { name: "Water", category: "Drink", price: 100, tags: [] },
      { name: "Cola", category: "Drink", price: 200, tags: [] },
      { name: "Coffee", category: "Drink", price: 250, tags: ["hot"] },
      { name: "Fries", category: "Side", price: 250, tags: [] },
      { name: "Salad", category: "Side", price: 300, tags: [] },
    ],
    people: [
      { name: "Dad", about: "He is very hungry.", aboutJa: "", conditions: [meal("hard", "needs category", "", "Side"), meal("soft", "has", "large")] },
      { name: "Mum", about: "She does not eat meat.", aboutJa: "", conditions: [meal("hard", "avoid", "meat"), meal("soft", "has", "hot")] },
      { name: "Ken", about: "He loves cheese.", aboutJa: "", conditions: [meal("soft", "has", "cheese")] },
      { name: "Yuki", about: "She likes fries.", aboutJa: "", conditions: [meal("soft", "needs category", "", "Side")] },
    ],
  };
  change(p);
  return p;
}

/** Every possible order, counted the slow and obvious way, to check the app's answers against. */
function bruteForce(p: CombinationPlan, budget: number) {
  const by = (c: string) => p.items.filter((i) => i.category === c);
  const sets = by("Main").flatMap((m) => by("Drink").flatMap((d) => [[m, d], ...by("Side").map((s) => [m, d, s])]));
  const ok = (person: CombinationPlan["people"][number], items: typeof p.items, kind: "hard" | "soft") =>
    person.conditions.filter((c) => c.kind === kind).filter((c) => (c.rule === "needs category" ? items.some((i) => i.category === c.category) : items.some((i) => i.tags.includes(c.tag)) === (c.rule === "has")));
  const perPerson = p.people.map((person) =>
    sets.filter((s) => ok(person, s, "hard").length === person.conditions.filter((c) => c.kind === "hard").length).map((s) => ({ cost: s.reduce((t, i) => t + i.price, 0), wishes: ok(person, s, "soft").length })),
  );
  let cheapest = Infinity;
  let bestWishes = -1;
  let bestCost = Infinity;
  const walk = (k: number, cost: number, wishes: number) => {
    if (k === perPerson.length) {
      cheapest = Math.min(cheapest, cost);
      if (cost <= budget && (wishes > bestWishes || (wishes === bestWishes && cost < bestCost))) [bestWishes, bestCost] = [wishes, cost];
      return;
    }
    for (const m of perPerson[k]) walk(k + 1, cost + m.cost, wishes + m.wishes);
  };
  walk(0, 0, 0);
  return { cheapest, bestWishes, bestCost };
}

test("the app sets a budget that every hard condition fits but not every wish, and its totals are right", () => {
  for (const difficulty of ["Easy", "Intermediate", "Challenging"] as const) {
    const { data, problems } = buildCombination(family(), difficulty);
    assert.deepEqual(problems, [], difficulty);
    const solution = solveOrder(data, data.budget)!;
    const truth = bruteForce(family(), data.budget);
    assert.equal(solution.cheapest.total, truth.cheapest, `${difficulty}: cheapest valid order`);
    assert.equal(solution.best.wishesMet, truth.bestWishes, `${difficulty}: most wishes within the budget`);
    assert.equal(solution.best.total, truth.bestCost, `${difficulty}: cost of the best order`);
    assert.ok(solution.cheapest.total <= data.budget, `${difficulty}: a valid order fits the budget`);
    assert.ok(solution.ideal.total > data.budget, `${difficulty}: everyone's wishes do not fit the budget`);
    assert.ok(solution.best.wishesMet < solution.best.wishesTotal, `${difficulty}: something has to be given up`);
    // Every order adds up, line by line and person by person.
    for (const order of [solution.cheapest, solution.best, solution.ideal]) {
      assert.equal(order.lines.reduce((t, l) => t + l.quantity * l.price, 0), order.total);
      assert.equal(order.meals.reduce((t, m) => t + m.cost, 0), order.total);
    }
  }
  // A harder activity has a tighter budget.
  assert.ok(buildCombination(family(), "Challenging").data.budget < buildCombination(family(), "Easy").data.budget);
});

test("hard conditions are always met in the app's orders", () => {
  const { data } = buildCombination(family(), "Intermediate");
  const { best, cheapest } = solveOrder(data, data.budget)!;
  for (const order of [best, cheapest]) {
    const of = (name: string) => order.meals.find((m) => m.person === name)!.items;
    assert.ok(of("Dad").some((i) => ["Fries", "Salad"].includes(i)), "Dad gets a side");
    assert.ok(!of("Mum").some((i) => ["Hamburger", "Cheeseburger", "Big Burger"].includes(i)), "Mum gets no meat");
  }
});

test("impossible or pointless combinations are rejected", () => {
  // Nothing on the menu suits Mum.
  const impossible = buildCombination(family((p) => (p.items = p.items.filter((i) => i.name !== "Veggie Burger"))), "Intermediate");
  assert.ok(impossible.problems.some((x) => /Mum.*impossible/.test(x)), impossible.problems.join(" | "));
  // Wishes cost nothing extra, so no budget can force a choice.
  const flat = buildCombination(family((p) => p.items.forEach((i) => (i.price = i.category === "Main" ? 400 : i.category === "Drink" ? 150 : 5))), "Intermediate");
  assert.ok(flat.problems.some((x) => /too close/.test(x)), flat.problems.join(" | "));
  const badTag = buildCombination(family((p) => (p.people[2].conditions = [meal("soft", "has", "spicy")])), "Intermediate");
  assert.ok(badTag.problems.some((x) => /not in the tag list/.test(x)));
  const badPrice = buildCombination(family((p) => (p.items[0].price = 0)), "Intermediate");
  assert.ok(badPrice.problems.some((x) => /whole numbers above 0/.test(x)));
});

test("prices and people are split between the two students", () => {
  const { data } = buildCombination(family(), "Intermediate");
  assert.deepEqual(data.people.map((_, i) => personHolder(i)), ["A", "B", "A", "B"]);
  const a = data.items.filter((_, i) => priceHolder(i) === "A").length;
  assert.ok(Math.abs(a - (data.items.length - a)) <= 1);
  assert.equal(mealConditionText(data.people[1].conditions[0], data).text, "Cannot have: meat");
  assert.equal(mealConditionText(data.people[0].conditions[0], data).text, "Must also have: a side");
});

test("what the app writes for students gives nothing away", () => {
  const one = buildChooseOne(apartments(), "Intermediate").data;
  const combo = buildCombination(family(), "Intermediate").data;
  for (const cefr of CEFR_LEVELS) {
    const text = [...choiceUsefulLanguage(cefr, one, "", "Useful expressions"), ...choiceUsefulLanguage(cefr, combo, "", "Useful expressions")].flatMap((g) => g.expressions).join(" ");
    for (const name of [...one.options.map((o) => o.name), ...combo.items.map((i) => i.name), ...combo.people.map((p) => p.name)]) assert.ok(!text.includes(name), `${cefr}: language support names ${name}`);
    assert.ok(!/\d{3}/.test(text), `${cefr}: language support contains a number`);
  }
  assert.match(choiceSteps(combo).decide, new RegExp(`¥${combo.budget.toLocaleString("en-US")}`));
  assert.ok(!choiceSteps(one).decide.includes("Oak House"));
});

// ---------- Generate, check, ask again ----------

const impossible = () => apartments((p) => (p.studentB.conditions[0] = cond("hard", "Rent", "at most", 50000)));

test("a failed attempt is replaced, and the next request is told what was wrong", async () => {
  const feedbacks: string[] = [];
  const answers = [impossible(), apartments()];
  const result = await generateUntilValid(
    3,
    async (feedback) => (feedbacks.push(feedback), answers[feedbacks.length - 1]),
    (plan) => buildChooseOne(plan, "Intermediate"),
  );
  assert.equal(result.attempt, 2);
  assert.equal(feedbacks[0], "");
  assert.match(feedbacks[1], /rejected by the app's checks/);
  assert.match(feedbacks[1], /impossible/);
  assert.deepEqual(buildChooseOne(result.out, "Intermediate").problems, []);
});

test("an activity that never passes is reported, never returned", async () => {
  let calls = 0;
  await assert.rejects(
    generateUntilValid(3, async () => (calls++, impossible()), (plan) => buildChooseOne(plan, "Intermediate")),
    (err: unknown) => err instanceof InvalidActivityError && err.attempts === 3 && err.problems.some((x) => /impossible/.test(x)),
  );
  assert.equal(calls, 3); // bounded: it stops asking
});
