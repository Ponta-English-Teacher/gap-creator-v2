/**
 * Deterministic rules that divide ONE complete set of information between
 * Student A and Student B, plus clean-up of the AI output.
 *
 * Previews call the holder functions, so Student A, Student B and the answer
 * key are always views of the same data.
 */
import type { MapData, MapFeatures, MapPlan, ProfileData, ScheduleData, StoryData, TextData } from "./activitySchemas";
import { ENVIRONMENTS } from "./mapEnvironments";
import type { EnvironmentId } from "./mapEnvironments";
import { buildTown, EMPTY_FEATURES } from "./townMap";
import type { Activity, Difficulty, Holder, MapSettings } from "./types";

export { mapFeaturesOf } from "./townMap";

// ---------- Classroom pairs and versions ----------

export const MAX_PAIRS = 30;

/** How many unique versions to generate for a class (kept small: 1, 2, 3 or 5). */
export function versionCountFor(pairs: number): number {
  const p = Math.max(1, Math.min(MAX_PAIRS, Math.round(pairs) || 1));
  if (p <= 2) return p;
  return p <= 6 ? 3 : 5;
}

/** Version (1-based) used by classroom pair `pair` (1-based). Neighbouring pairs get different versions. */
export function versionForPair(pair: number, versionCount: number): number {
  return ((pair - 1) % versionCount) + 1;
}

/** Classroom pairs (1-based) that use `version`. */
export function pairsForVersion(version: number, pairCount: number, versionCount: number): number[] {
  return Array.from({ length: pairCount }, (_, i) => i + 1).filter((p) => versionForPair(p, versionCount) === version);
}

/**
 * May students open the answers after the activity? Only some activities have a self-check,
 * the teacher can turn it off, and Spot the Differences needs both stored pictures.
 */
export function selfCheckAllowed(activity: Activity): boolean {
  if (activity.allowSelfCheck === false) return false;
  if (activity.type === "picture") return Boolean(activity.images?.a && activity.images?.b);
  // Choose One with a Decision Review: students submit their choice and reasons instead, and then see the review.
  if (activity.type === "profile" && "reviews" in activity.data && Array.isArray(activity.data.reviews)) return false;
  return activity.type === "map" || activity.type === "story" || activity.type === "profile";
}

/**
 * Useful language that is safe to show a student. In What Happened? the AI sometimes writes
 * model answers that quote real events; any phrase that repeats part of an event is left out,
 * so language support cannot give away what a partner knows.
 */
export function studentUsefulLanguage(activity: Activity): Activity["usefulLanguage"] {
  const groups = activity.usefulLanguage ?? [];
  if (activity.type !== "story") return groups;
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const facts = activity.data.events.map((e) => plain(e.fact));
  const quotesAnEvent = (expression: string) => {
    const e = plain(expression);
    return e.split(" ").length >= 3 && facts.some((f) => f.includes(e) || e.includes(f));
  };
  return groups.map((g) => ({ ...g, expressions: g.expressions.filter((e) => !quotesAnEvent(e)) })).filter((g) => g.expressions.length > 0);
}

/**
 * Make the Best Choice: is tap-to-show Japanese offered? Only if the teacher left it on, and only where
 * it helps: lower levels, or whenever strong support is chosen.
 */
export function showsTranslations(activity: Activity): boolean {
  return activity.translations !== false && (activity.cefr === "A1" || activity.cefr === "A2" || activity.support === "Strong support");
}

// ---------- Who knows what ----------

/** Text Gap: checkerboard. Each row has cells for both students, and each student knows half. */
export function textCellHolder(row: number, col: number): Holder {
  return (row + col) % 2 === 0 ? "A" : "B";
}

/** Profile Gap: checkerboard across profiles and categories. Names are always shared. */
export function profileDetailHolder(profile: number, detail: number): Holder {
  return (profile + detail) % 2 === 0 ? "A" : "B";
}

/** Story Gap: first event shared (and last one if 6+ events); the rest alternate, starting with B. */
export function storyEventHolder(index: number, total: number): Holder {
  if (index === 0) return "both";
  if (total >= 6 && index === total - 1) return "both";
  return index % 2 === 1 ? "B" : "A";
}

/** Map Gap: landmarks shared; other places alternate between A and B. */
export function mapPlaceHolders(places: MapData["places"]): Holder[] {
  let n = 0;
  return places.map((p) => (p.shared ? "both" : n++ % 2 === 0 ? "A" : "B"));
}

export function canSee(holder: Holder, role: "A" | "B"): boolean {
  return holder === "both" || holder === role;
}

// ---------- Clean-up of AI output ----------
// Each function returns the (possibly corrected) data and notes for the teacher.

export function normalizeText(data: TextData, wanted: number): { data: TextData; notes: string[] } {
  const notes: string[] = [];
  const n = data.subjects.length;
  const rows = data.rows.filter((r) => r.cells.length === n);
  if (rows.length < data.rows.length) notes.push(`${data.rows.length - rows.length} incomplete row(s) were removed.`);
  if (rows.length !== wanted) notes.push(`The AI produced ${rows.length} rows (you asked for ${wanted}).`);
  return { data: { ...data, rows }, notes };
}

export function normalizeSchedule(data: ScheduleData): { data: ScheduleData; notes: string[] } {
  const notes: string[] = [];
  const sections = data.sections.map((section) => {
    const cells = [];
    for (const timeSlot of data.timeSlots) {
      for (const column of data.columns) {
        const cell = section.cells.find((c) => c.column === column && c.timeSlot === timeSlot);
        if (cell) cells.push(cell);
        else {
          notes.push(`"${section.heading}" had no entry for ${column} ${timeSlot}; it is shown as "Free".`);
          const owner = section.cells[0]?.knownBy ?? "both";
          cells.push({ column, timeSlot, text: "Free", knownBy: owner });
        }
      }
    }
    return { ...section, cells };
  });

  // Make sure each student has something to ask about.
  const all = sections.flatMap((s) => s.cells);
  const hiddenFromA = all.filter((c) => c.knownBy === "B").length;
  const hiddenFromB = all.filter((c) => c.knownBy === "A").length;
  if (hiddenFromA === 0 || hiddenFromB === 0) {
    notes.push("The AI did not split the schedule between the students, so the app split it alternately.");
    const splittable = all.some((c) => c.knownBy !== "both") ? all.filter((c) => c.knownBy !== "both") : all;
    splittable.forEach((c, i) => (c.knownBy = i % 2 === 0 ? "A" : "B"));
  }
  return { data: { ...data, sections }, notes };
}

/**
 * Cleans the AI's map plan, makes sure every feature the teacher required is present
 * (features the AI forgot are added at sensible default positions), then builds the town.
 */
/** Removes features that neither the environment nor the teacher asked for. */
function limitFeatures(f: MapFeatures, places: MapPlan["places"], allowed: Set<string>): MapPlan["places"] {
  const ok = (name: string) => allowed.has(name);
  const removed = new Set<string>();
  const remove = (label: string) => removed.add(label);

  if (f.river && !ok("River") && !ok("Bridge")) {
    f.river = false;
    remove("river");
  }
  if (f.railway && !ok("Railway") && !ok("Railway crossing") && !ok("Tunnel")) {
    f.railway = false;
    remove("railway");
  }
  f.railwayCrossings = f.railwayCrossings.map((c) => {
    if (c.kind === "tunnel" && !ok("Tunnel")) {
      remove("tunnel");
      return { ...c, kind: "railway crossing" as const };
    }
    if (c.kind === "railway crossing" && ok("Tunnel") && !ok("Railway crossing") && !ok("Railway")) return { ...c, kind: "tunnel" as const };
    return c;
  });
  if (f.trafficLights.length && !ok("Traffic lights")) {
    f.trafficLights = [];
    remove("traffic lights");
  }
  if (f.roundabouts.length && !ok("Roundabout")) {
    f.roundabouts = [];
    remove("roundabout");
  }
  const crossingName = { "zebra crossing": "Pedestrian crossing / zebra crossing", "pedestrian underpass": "Pedestrian underpass", "pedestrian overpass": "Pedestrian overpass" };
  f.pedestrianCrossings = f.pedestrianCrossings.filter((c) => ok(crossingName[c.kind]) || !remove(c.kind));
  const stopName = { "bus stop": "Bus stop", "taxi stand": "Taxi stand", "station entrance": "Station entrance", "subway entrance": "Subway entrance" };
  f.roadsideStops = f.roadsideStops.filter((st) => ok(stopName[st.kind]) || !remove(st.kind));
  if (f.parks.length && !ok("Park")) {
    f.parks = [];
    remove("park");
  }
  const result = places.map((p) => {
    if ((p.kind === "parking lot" && !ok("Parking lot")) || (p.kind === "police box" && !ok("Police box"))) {
      remove(`${p.kind} symbol`);
      return { ...p, kind: "building" as const };
    }
    return p;
  });
  return result;
}

export function normalizeMap(
  plan: MapPlan,
  settings: MapSettings,
  difficulty: Difficulty,
  environment: EnvironmentId = "town",
  random: () => number = Math.random,
): { data: MapData; notes: string[] } {
  const data = plan;
  const notes: string[] = [];
  // The environment and difficulty decide the features; the teacher can add more.
  const env = ENVIRONMENTS[environment] ?? ENVIRONMENTS.town;
  const extras = new Set(settings.features ?? []);
  const want = new Set([...(env.features[difficulty] ?? env.features.Intermediate), ...extras]);
  const f: MapFeatures = {
    ...EMPTY_FEATURES,
    ...data.features,
    railwayCrossings: [...(data.features?.railwayCrossings ?? [])],
  };
  const planPlaces = limitFeatures(f, data.places.map((p) => ({ ...p, kind: p.kind ?? "building", size: p.size ?? "medium" })), want);
  // Only worth telling the teacher about features they ticked themselves.
  const added = (what: string, feature: string) => extras.has(feature) && notes.push(`${what} was required but missing, so the app added one.`);

  // Linear features and what they imply.
  if ((want.has("River") || want.has("Bridge")) && !f.river) {
    f.river = true;
    added("A river", "River");
  }
  if (f.river) f.riverName ||= "River";
  if ((want.has("Railway") || want.has("Railway crossing") || want.has("Tunnel")) && !f.railway) {
    f.railway = true;
    added("A railway", "Railway");
  }
  if (f.railway) {
    // Every avenue must cross the railway somehow; default is a railway crossing.
    const byStreet = new Map(f.railwayCrossings.map((c) => [c.street, c.kind]));
    if (want.has("Tunnel") && ![...byStreet.values()].includes("tunnel")) byStreet.set("V3", "tunnel");
    if (want.has("Railway crossing") && ![...byStreet.values()].includes("railway crossing")) byStreet.set("V2", "railway crossing");
    f.railwayCrossings = (["V1", "V2", "V3"] as const).map((street) => ({ street, kind: byStreet.get(street) ?? "railway crossing" }));
  } else {
    f.railwayCrossings = [];
  }

  // Intersections: a roundabout replaces traffic lights at the same corner.
  f.roundabouts = [...new Set(f.roundabouts)];
  if (want.has("Roundabout") && !f.roundabouts.length) {
    f.roundabouts = ["H1-V2"];
    added("A roundabout", "Roundabout");
  }
  f.trafficLights = [...new Set(f.trafficLights)].filter((i) => !f.roundabouts.includes(i));
  if (want.has("Traffic lights") && !f.trafficLights.length) {
    f.trafficLights = [f.roundabouts.includes("H2-V2") ? "H2-V1" : "H2-V2"];
    added("Traffic lights", "Traffic lights");
  }
  // Above the easiest level the main avenue from START has lights, so the straight way is not always the fastest.
  if (difficulty !== "Easy" && want.has("Traffic lights"))
    for (const corner of ["H2-V2", "H1-V2"] as const) if (!f.trafficLights.includes(corner) && !f.roundabouts.includes(corner)) f.trafficLights.push(corner);

  // Street segments: at most one crossing per segment.
  const crossingSeen = new Set<string>();
  f.pedestrianCrossings = f.pedestrianCrossings.filter((c) => !crossingSeen.has(c.segment) && crossingSeen.add(c.segment));
  const ensureCrossing = (feature: string, kind: MapFeatures["pedestrianCrossings"][number]["kind"], defaults: string[]) => {
    if (!want.has(feature) || f.pedestrianCrossings.some((c) => c.kind === kind)) return;
    const segment = defaults.find((d) => !crossingSeen.has(d)) ?? defaults[0];
    crossingSeen.add(segment);
    f.pedestrianCrossings.push({ segment, kind });
    added(`A ${kind}`, feature);
  };
  ensureCrossing("Pedestrian crossing / zebra crossing", "zebra crossing", ["H2-c2", "H2-c3", "H1-c2"]);
  ensureCrossing("Pedestrian underpass", "pedestrian underpass", ["H1-c3", "H2-c1", "H1-c4"]);
  ensureCrossing("Pedestrian overpass", "pedestrian overpass", ["H2-c4", "H1-c1", "H0-c3"]);

  // Roadside stops: side must match the street direction.
  f.roadsideStops = f.roadsideStops.map((st) => {
    const horizontal = st.segment.startsWith("H");
    const ok = horizontal ? st.side === "north" || st.side === "south" : st.side === "east" || st.side === "west";
    return ok ? st : { ...st, side: horizontal ? "south" : "east" };
  });
  const ensureStop = (feature: string, kind: MapFeatures["roadsideStops"][number]["kind"], segment: string, side: "north" | "south" | "east" | "west") => {
    if (!want.has(feature) || f.roadsideStops.some((st) => st.kind === kind)) return;
    f.roadsideStops.push({ segment, side, kind });
    added(`A ${kind}`, feature);
  };
  ensureStop("Bus stop", "bus stop", "V2-r2", "east");
  ensureStop("Taxi stand", "taxi stand", "H2-c3", "north");
  ensureStop("Station entrance", "station entrance", f.railway ? "V3-r3" : "H0-c2", f.railway ? "west" : "south");
  ensureStop("Subway entrance", "subway entrance", "H1-c3", "south");

  // Parks fill a whole block.
  const parkSeen = new Set<string>();
  f.parks = f.parks.filter((p) => !parkSeen.has(p.block) && parkSeen.add(p.block));
  if (want.has("Park") && !f.parks.length) {
    f.parks.push({ block: "r2c4", name: environment === "campus" ? "Main Quad" : "City Park" });
    added("A park", "Park");
  }

  // Places the teacher required but the AI forgot become landmarks.
  const ensurePlace = (feature: string, name: string, kind: MapPlan["places"][number]["kind"], match: RegExp) => {
    if (!want.has(feature) || planPlaces.some((p) => p.kind === kind && (kind !== "building" || match.test(p.name)))) return;
    planPlaces.push({ name, kind, size: kind === "police box" ? "small" : "medium", shared: true, description: "" });
    added(`A ${name.toLowerCase()}`, feature);
  };
  ensurePlace("Convenience store", "Convenience Store", "building", /convenience/i);
  ensurePlace("Police box", "Police Box", "police box", /police/i);
  ensurePlace("Parking lot", "Parking Lot", "parking lot", /parking/i);

  const h = [...data.horizontalStreets];
  const v = [...data.verticalStreets];
  const fallbackH = ["North Street", "Park Road", "Market Street", "South Road"];
  const fallbackV = ["West Avenue", "Central Avenue", "East Avenue"];
  for (let i = 0; i < 4; i++) h[i] ||= fallbackH[i];
  for (let i = 0; i < 3; i++) v[i] ||= fallbackV[i];
  const streets = { horizontalStreets: h.slice(0, 4), verticalStreets: v.slice(0, 3) };
  // The app, not the AI, decides where every building and entrance is.
  const town = buildTown(planPlaces, f, streets, difficulty, environment, random);
  notes.push(...town.notes);
  const findable = town.places.filter((p) => !p.shared).length;
  if (findable !== settings.locationCount) notes.push(`The map has ${findable} places to find (you asked for ${settings.locationCount}).`);
  return { data: { ...streets, places: town.places, features: f, buildings: town.buildings, environment }, notes };
}

export function normalizeProfile(data: ProfileData): { data: ProfileData; notes: string[] } {
  const notes: string[] = [];
  const profiles = data.profiles.map((p) => {
    // Align details to the category list, whatever order the AI used.
    const details = data.categories.map(
      (category, i) =>
        p.details.find((d) => d.category.toLowerCase() === category.toLowerCase()) ??
        p.details[i] ?? { category, value: "—", question: "" },
    );
    if (p.details.length !== data.categories.length) notes.push(`${p.name}'s profile did not match the categories exactly.`);
    return { ...p, details: details.map((d, i) => ({ ...d, category: data.categories[i] })) };
  });
  return { data: { ...data, profiles }, notes };
}

export function normalizeStory(data: StoryData, wanted: number): { data: StoryData; notes: string[] } {
  const notes: string[] = [];
  if (data.events.length !== wanted) notes.push(`The story has ${data.events.length} events (you asked for ${wanted}).`);
  return { data, notes };
}
