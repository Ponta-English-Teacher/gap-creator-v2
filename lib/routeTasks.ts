/**
 * Route challenges for "How Do I Get There?": what difficulty adds on top of finding places.
 *
 *   Easy          no route challenge: find the places and give directions
 *   Intermediate  compare: find two routes to a place and say which is shorter or faster
 *   Challenging   detour: the direct route is closed, and only the traveller's map shows it
 *
 * Every challenge sends a student to a place that only their partner can see, so the
 * partner has to give directions. Road works are drawn only on the traveller's own map,
 * so the traveller has to check those directions. All answers are calculated by the app.
 */
import type { MapClosure, MapData, MapPlace, MapPlan, RouteTask } from "./activitySchemas";
import { mapPlaceHolders, normalizeMap } from "./gapLogic";
import { environmentFor } from "./mapEnvironments";
import { aboutMeters, aboutMinutes, buildingOf, describeRoute, mapDemoExchange, mapFeaturesOf, routeTo, segmentLabel, WALK } from "./townMap";
import type { Route } from "./townMap";
import type { CefrLevel, CommonSettings, Difficulty, LanguageSupport, MapSettings, Role } from "./types";

const ROLES: Role[] = ["A", "B"];
const other = (r: Role): Role => (r === "A" ? "B" : "A");

function route(place: MapPlace, data: MapData, mode: "shortest" | "fastest", closed: Iterable<string>): Route | null {
  const b = buildingOf(place, data);
  return b ? routeTo(b, { mode, closed: new Set(closed), features: mapFeaturesOf(data) }) : null;
}

/** The best route that leaves out one of the streets the given route uses: a genuinely different way. */
function anotherRoute(place: MapPlace, data: MapData, base: Route, closed: Iterable<string>): Route | null {
  let best: Route | null = null;
  for (const segment of base.legs.flatMap((l) => l.segments)) {
    const r = route(place, data, "shortest", [...closed, segment]);
    if (r && r.path !== base.path && (!best || r.meters < best.meters - 1e-9 || (Math.abs(r.meters - best.meters) < 1e-9 && r.turns < best.turns))) best = r;
  }
  return best;
}

/**
 * Chooses the route challenges (and, at the hardest level, the road works) for a finished map.
 * A challenge is only set where the map really supports it; otherwise that student gets a simpler one or none.
 */
export function planRouteTasks(data: MapData, difficulty: Difficulty): { closures: MapClosure[]; routeTasks: RouteTask[] } {
  if (difficulty === "Easy") return { closures: [], routeTasks: [] };
  const holders = mapPlaceHolders(data.places);
  const special = (p: MapPlace) => {
    const b = buildingOf(p, data);
    return b && (b.corner || b.entrance.street.startsWith("V")) ? 1 : 0;
  };
  // Streets that a named place opens onto stay open, so every place can still be reached.
  const entranceSegments = new Set(
    data.places.flatMap((p) => {
      const r = route(p, data, "shortest", []);
      return r ? [r.last.segment] : [];
    }),
  );
  const closures: MapClosure[] = [];
  const routeTasks: RouteTask[] = [];
  const closedNow = () => closures.map((c) => c.segment);
  const allReachable = (closed: string[]) => data.places.every((p) => route(p, data, "shortest", closed));

  for (const role of ROLES) {
    // Destinations: places only the partner can see, not already used by the other challenge.
    const candidates = data.places.filter((p, i) => holders[i] === other(role) && !routeTasks.some((t) => t.place === p.name));
    let chosen: { task: RouteTask; closure?: MapClosure; score: number } | null = null;

    if (difficulty === "Challenging") {
      for (const place of candidates) {
        const base = route(place, data, "shortest", closedNow());
        if (!base) continue;
        for (const segment of base.legs.flatMap((l) => l.segments)) {
          if (entranceSegments.has(segment) || closedNow().includes(segment)) continue;
          const closed = [...closedNow(), segment];
          const detour = route(place, data, "shortest", closed);
          if (!detour || !allReachable(closed)) continue;
          // With this closure added, every challenge (this one and earlier ones) must still be a real detour:
          // the partner's likely route is blocked by road works only the traveller can see, and an open route exists.
          const task: RouteTask = { for: role, place: place.name, kind: "detour" };
          const trial: MapData = { ...data, closures: [...closures, { segment, knownBy: role }], routeTasks: [...routeTasks, task] };
          if (!trial.routeTasks!.every((t) => t.kind !== "detour" || solveRouteTask(t, trial)?.closure)) continue;
          const extra = detour.meters - base.meters;
          // A detour that costs real distance is the clearest; one that only adds turns still counts.
          const score = (extra > 1 ? 100 + Math.min(extra, 300) : detour.turns > base.turns ? 50 : 0) + special(place);
          if (score >= 50 && (!chosen || score > chosen.score)) chosen = { task, closure: { segment, knownBy: role }, score };
        }
      }
    }
    if (!chosen) {
      // Compare: best where shortest and fastest really differ, otherwise where a second route exists.
      for (const place of candidates) {
        const shortest = route(place, data, "shortest", closedNow());
        const fastest = route(place, data, "fastest", closedNow());
        if (!shortest || !fastest) continue;
        const differs = shortest.path !== fastest.path;
        if (!differs && !anotherRoute(place, data, shortest, closedNow())) continue;
        const score = (differs ? 10 : 1) + special(place);
        if (!chosen || score > chosen.score) chosen = { task: { for: role, place: place.name, kind: "compare" }, score };
      }
    }
    if (chosen) {
      routeTasks.push(chosen.task);
      if (chosen.closure) closures.push(chosen.closure);
    }
  }
  return { closures, routeTasks };
}

const placeNamed = (data: MapData, name: string) => data.places.find((p) => p.name === name);

// ---------- Answers ----------

export interface RouteOption {
  label: string;
  directions: string;
  meters: number;
  minutes: number;
  turns: number;
  /** Traffic lights and railway crossings waited at. */
  waits: number;
  /** Not usable: it goes along a closed road. Shown so the teacher can see what students will try first. */
  blocked?: boolean;
}
export interface RouteSolution {
  task: RouteTask;
  /** The road works that affect this challenge, in words, and who can see them. */
  closure?: { label: string; knownBy: Role };
  options: RouteOption[];
  /** What the comparison shows, stated only as far as the numbers support. */
  verdict: string;
}

const option = (label: string, r: Route, place: MapPlace, data: MapData, blocked = false): RouteOption => ({
  label,
  directions: describeRoute(r, place, data),
  meters: r.meters,
  minutes: r.minutes,
  turns: r.turns,
  waits: r.lights + r.railwayCrossings,
  blocked,
});

const waitWords = (r: Route) => {
  const parts = [r.lights ? `${r.lights} traffic light${r.lights > 1 ? "s" : ""}` : "", r.railwayCrossings ? `${r.railwayCrossings} railway crossing${r.railwayCrossings > 1 ? "s" : ""}` : ""].filter(Boolean);
  return parts.length ? parts.join(" and ") : "no waiting";
};

/** Compares two open routes honestly: says they are equal when they are. */
function compare(a: Route, b: Route, aName: string, bName: string): string {
  const dMeters = Math.round(b.meters - a.meters);
  const dMinutes = Math.round((a.minutes - b.minutes) * 10) / 10;
  const distance =
    Math.abs(dMeters) < 5
      ? `Both routes are the same distance (${aboutMeters(a.meters)}).`
      : `${dMeters > 0 ? aName : bName} is shorter (${aboutMeters(Math.min(a.meters, b.meters))} against ${aboutMeters(Math.max(a.meters, b.meters))}).`;
  const time =
    Math.abs(dMinutes) < 0.25
      ? "They take about the same time."
      : `${dMinutes > 0 ? bName : aName} is faster by ${aboutMinutes(Math.abs(dMinutes))} (${aName}: ${waitWords(a)}; ${bName}: ${waitWords(b)}).`;
  const turns = a.turns === b.turns ? "" : ` ${a.turns < b.turns ? aName : bName} has fewer turns, so it is easier to explain.`;
  return `${distance} ${time}${turns}`;
}

/** Works out the answer to a route challenge from the stored map. */
export function solveRouteTask(task: RouteTask, data: MapData): RouteSolution | null {
  const place = placeNamed(data, task.place);
  if (!place) return null;
  const allClosed = (data.closures ?? []).map((c) => c.segment);
  const shortest = route(place, data, "shortest", allClosed);
  const fastest = route(place, data, "fastest", allClosed);
  if (!shortest || !fastest) return null;
  const options: RouteOption[] = [];
  let verdict: string;
  let closure: RouteSolution["closure"];

  if (task.kind === "detour") {
    // What the partner is likely to suggest: the best route on THEIR map, which does not show the traveller's road works.
    const own = (data.closures ?? []).filter((c) => c.knownBy === task.for);
    const partnerSees = (data.closures ?? []).filter((c) => c.knownBy !== task.for).map((c) => c.segment);
    const direct = route(place, data, "shortest", partnerSees);
    const hit = direct ? own.find((c) => direct.legs.some((l) => l.segments.includes(c.segment))) : undefined;
    if (direct && hit) {
      closure = { label: segmentLabel(hit.segment, data), knownBy: hit.knownBy };
      options.push(option("Direct route (closed)", direct, place, data, true));
    }
    options.push(option(fastest.path === shortest.path ? "Best open route" : "Shortest open route", shortest, place, data));
    if (fastest.path !== shortest.path) options.push(option("Fastest open route", fastest, place, data));
    const extra = direct ? Math.round(shortest.meters - direct.meters) : 0;
    verdict = closure
      ? `The direct route uses ${closure.label}, which is closed. Only Student ${closure.knownBy}'s map shows this, so Student ${closure.knownBy} must say so. ` +
        (extra > 5 ? `The best open route is ${aboutMeters(extra)} longer.` : `The best open route is the same distance but ${shortest.turns > (direct?.turns ?? 0) ? "has more turns" : "goes a different way"}.`) +
        (fastest.path !== shortest.path ? ` ${compare(shortest, fastest, "The shortest open route", "The fastest open route")}` : "")
      : "The road works on this map do not block the direct route to this place.";
  } else if (shortest.path !== fastest.path) {
    options.push(option("Shortest route", shortest, place, data), option("Fastest route", fastest, place, data));
    verdict = compare(shortest, fastest, "The shortest route", "The fastest route");
  } else {
    options.push(option("Shortest route (also the fastest)", shortest, place, data));
    const second = anotherRoute(place, data, shortest, allClosed);
    if (second) {
      options.push(option("Another route", second, place, data));
      verdict = `The shortest route is also the fastest. ${compare(shortest, second, "The first route", "The other route")}`;
    } else verdict = "The shortest route is also the fastest, and there is no other sensible route to compare.";
  }
  return { task, closure, options, verdict };
}

/** Answers for every route challenge on a map. */
export function routeSolutions(data: MapData): RouteSolution[] {
  return (data.routeTasks ?? []).flatMap((t) => solveRouteTask(t, data) ?? []);
}

// ---------- What students read ----------

/** The waiting times students need for comparing routes; only what is on this map. */
export function waitingRules(data: MapData): string {
  const f = mapFeaturesOf(data);
  const rules = [
    f.trafficLights.length ? `Each traffic light adds about ${WALK.lightsWait} minute.` : "",
    f.railway && f.railwayCrossings.some((c) => c.kind === "railway crossing") ? `A railway crossing adds about ${WALK.railwayWait} minutes.` : "",
  ].filter(Boolean);
  return rules.join(" ");
}

/** The route challenge as the student reads it. It never says where the place is or which road is closed. */
export function routeTaskText(task: RouteTask, data: MapData): string {
  if (task.kind === "detour")
    return `You need to walk from START to the ${task.place}. Ask your partner for directions. Your map shows road works that your partner cannot see, so check their route on your map. Then agree on the best route that is open.`;
  const rules = waitingRules(data);
  return `You need to walk from START to the ${task.place}. Ask your partner where it is. Then find two different routes together. Which is shorter? Which is faster?${rules ? ` (${rules})` : ""}`;
}

/** The shared final task, written by the app so it always matches what the map can do. */
export function mapFinalTask(difficulty: Difficulty, data: MapData): string {
  const tasks = data.routeTasks ?? [];
  if (!tasks.length) return "Take turns. Choose a place your partner found and give directions to it from START.";
  if (tasks.some((t) => t.kind === "detour")) return "Do both route challenges. For each one, agree on the best route that is open, and be ready to explain why you chose it.";
  return "Do both route challenges. For each one, choose a route and be ready to explain why it is shorter, faster or easier.";
}

// ---------- Language support ----------

type Phrases = { purpose: string; expressions: string[] }[];

/**
 * Useful language chosen by the app for the level. Higher levels do more with the language
 * (checking, comparing, suggesting), not just longer sentences. Phrases use gaps, so they
 * cannot name a hidden place or a closed road.
 */
const DIRECTIONS_LANGUAGE: Record<CefrLevel, Phrases> = {
  A1: [
    { purpose: "Asking", expressions: ["Where is the ...?", "Is it on ... Street?"] },
    { purpose: "Giving directions", expressions: ["Go straight.", "Turn left.", "Turn right.", "It's on your left."] },
    { purpose: "Saying where", expressions: ["It's next to the ...", "It's on ... Street."] },
  ],
  A2: [
    { purpose: "Asking", expressions: ["Excuse me, how do I get to the ...?", "Where is the ...?", "Is it far?"] },
    { purpose: "Giving directions", expressions: ["Go straight.", "Turn right at the ...", "Go past the ...", "It's the second building on your left."] },
    { purpose: "Saying where", expressions: ["It's next to the ...", "It's on the corner.", "It's opposite the ..."] },
    { purpose: "Checking", expressions: ["Sorry, can you say that again?", "Left or right?"] },
  ],
  B1: [
    { purpose: "Asking", expressions: ["Could you tell me how to get to the ...?", "Which street is the entrance on?"] },
    { purpose: "Giving directions", expressions: ["Go past the ... and turn left at the second intersection.", "Keep going until you reach ...", "The entrance is on ..."] },
    { purpose: "Saying where", expressions: ["It's on the corner of ... and ...", "It's between ... and ...", "It's opposite the ..."] },
    { purpose: "Checking", expressions: ["So I turn left at ..., is that right?", "Sorry, which street was that?"] },
  ],
  B2: [
    { purpose: "Asking", expressions: ["What's the best way to get to the ...?", "Which side of the block is the entrance on?"] },
    { purpose: "Giving directions", expressions: ["Head along ... as far as ..., then turn left.", "You'll see it on the corner; the entrance is round the side on ..."] },
    { purpose: "Checking", expressions: ["Let me check that I've understood your directions.", "So you're saying I should ...?"] },
  ],
};

const COMPARING_LANGUAGE: Record<CefrLevel, Phrases[number]> = {
  A1: { purpose: "Comparing routes", expressions: ["This way is short.", "This way is fast."] },
  A2: { purpose: "Comparing routes", expressions: ["This route is shorter.", "That way is faster.", "Which way is better?"] },
  B1: { purpose: "Comparing routes", expressions: ["Is there another way?", "This route is shorter, but that one is faster.", "I think we should go along ... because ..."] },
  B2: { purpose: "Comparing routes", expressions: ["Would it be quicker to go around the ...?", "That route is shorter, but there are more traffic lights.", "On balance, I'd go via ..."] },
};

const PROBLEM_LANGUAGE: Record<CefrLevel, Phrases[number]> = {
  A1: { purpose: "Problems", expressions: ["This road is closed.", "We can't go this way."] },
  A2: { purpose: "Problems", expressions: ["Sorry, that road is closed.", "We can't go that way.", "Is there another way?"] },
  B1: { purpose: "Problems", expressions: ["There are road works on ..., so we can't go that way.", "We need to go around.", "What if we take ... instead?"] },
  B2: { purpose: "Problems", expressions: ["That route is shorter, but the road is closed.", "We'll have to make a detour via ...", "Is that way definitely open on your map?"] },
};

/**
 * Language support for the map, without any AI: chosen for the level, extended by the difficulty,
 * with the teacher's own target expressions first. "Minimal" keeps two phrases from each group.
 */
export function mapUsefulLanguage(cefr: CefrLevel, data: MapData, teacherExpressions: string, support: LanguageSupport): Phrases {
  const tasks = data.routeTasks ?? [];
  const groups: Phrases = [...(DIRECTIONS_LANGUAGE[cefr] ?? DIRECTIONS_LANGUAGE.A2)];
  if (tasks.length) groups.push(COMPARING_LANGUAGE[cefr] ?? COMPARING_LANGUAGE.A2);
  if (tasks.some((t) => t.kind === "detour")) groups.push(PROBLEM_LANGUAGE[cefr] ?? PROBLEM_LANGUAGE.A2);
  const own = teacherExpressions.split("\n").map((l) => l.trim()).filter(Boolean);
  const all = own.length ? [{ purpose: "Today's expressions", expressions: own }, ...groups] : groups;
  return support === "Minimal" ? all.map((g) => ({ ...g, expressions: g.expressions.slice(0, 2) })) : all;
}

// ---------- Putting a map activity together ----------

/**
 * Turns the AI's plan (names and features) into the finished map activity: the town, the route
 * challenges and road works, and the parts the app writes itself so they always match the map.
 */
export function buildMapActivity(plan: MapPlan, settings: MapSettings, common: CommonSettings, random: () => number = Math.random) {
  // The teacher's setting decides the environment; the AI only chooses when the teacher's own words do not say.
  const environment = environmentFor(common.topic) ?? plan.environment ?? "town";
  const map = normalizeMap(plan, settings, common.difficulty, environment, random);
  const data: MapData = { ...map.data, ...planRouteTasks(map.data, common.difficulty) };
  const notes = [...map.notes];
  if (common.difficulty !== "Easy") {
    const tasks = data.routeTasks ?? [];
    for (const role of ROLES) if (!tasks.some((t) => t.for === role)) notes.push(`The app could not set a route challenge for Student ${role} on this map. Regenerate if you want one.`);
    if (common.difficulty === "Challenging")
      for (const t of tasks) if (t.kind !== "detour") notes.push(`No road closure gave Student ${t.for} a real detour on this map, so their challenge is to compare routes. Regenerate if you want a closure.`);
  }
  return {
    data,
    notes,
    usefulLanguage: mapUsefulLanguage(common.cefr, data, common.expressions, common.support),
    finalTask: mapFinalTask(common.difficulty, data),
    demoExchange: mapDemoExchange(data),
  };
}
