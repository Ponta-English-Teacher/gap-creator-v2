/**
 * Checks for "How Do I Get There?": route calculations and the rules every generated map must obey.
 * Run with `npm test` (compiles to .test-build, then runs Node's test runner). No AI calls.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapData, MapFeatures, MapPlace, MapPlan } from "../lib/activitySchemas";
import { mapPlaceHolders } from "../lib/gapLogic";
import { ENVIRONMENT_CHOICES, environmentFor } from "../lib/mapEnvironments";
import type { EnvironmentId } from "../lib/mapEnvironments";
import { buildMapActivity, mapUsefulLanguage, routeSolutions, routeTaskText } from "../lib/routeTasks";
import { buildingOf, closedSegments, describeLocation, describeRoute, directionsToPlace, EMPTY_FEATURES, parseBlock, routeTo, routeToPlace, seededRandom, streetOfSide, townBuildings } from "../lib/townMap";
import { CEFR_LEVELS, DIFFICULTIES } from "../lib/types";
import type { CommonSettings, Difficulty } from "../lib/types";

// ---------- A small hand-made map (old two-lots format, so every position is known) ----------

const streets = { horizontalStreets: ["North Street", "Park Road", "Market Street", "South Road"], verticalStreets: ["West Avenue", "Central Avenue", "East Avenue"] };
const place = (name: string, lot: string, shared = false): MapPlace => ({ name, kind: "building", shared, description: "", lot });
const handMade = (features: Partial<MapFeatures> = {}): MapData => ({
  ...streets,
  features: { ...EMPTY_FEATURES, ...features },
  places: [place("Library", "r1c1n", true), place("Bank", "r2c3s"), place("Cafe", "r3c2s"), place("Hotel", "r2c1n")],
});
const LIGHTS_ON_MAIN_AVENUE = { trafficLights: ["H2-V2", "H1-V2"] };
const find = (data: MapData, name: string) => data.places.find((p) => p.name === name)!;

test("a route leads to the entrance and its distance and time follow the stated walking model", () => {
  const data = handMade();
  // Library: north side of the north-west block. 3 blocks north (300 m), 1 block west (120 m), half a block more (60 m).
  const r = routeToPlace(find(data, "Library"), data)!;
  assert.equal(r.meters, 480);
  assert.equal(r.minutes, 6); // 480 m at 80 m a minute, no waiting
  assert.equal(r.turns, 1);
  assert.equal(describeRoute(r, find(data, "Library"), data), "Go straight along Central Avenue for 3 blocks. Turn left onto North Street. Go straight for 1 block. Go past West Avenue. The Library is on your left.");
  // Bank: south side of its block, so the door is on Market Street and the building is on the left when walking east.
  assert.equal(directionsToPlace(find(data, "Bank"), data), "Go straight along Central Avenue for 1 block. Turn right onto Market Street. The Bank is on your left.");
  assert.equal(routeToPlace(find(data, "Bank"), data)!.meters, 160);
});

test("shortest and fastest are the same route when nothing causes waiting", () => {
  const data = handMade();
  for (const p of data.places) assert.equal(routeToPlace(p, data, { mode: "fastest" })!.path, routeToPlace(p, data, { mode: "shortest" })!.path, p.name);
});

test("traffic lights make the fastest route differ from the shortest, without changing the distance", () => {
  const data = handMade(LIGHTS_ON_MAIN_AVENUE);
  const shortest = routeToPlace(find(data, "Library"), data, { mode: "shortest" })!;
  const fastest = routeToPlace(find(data, "Library"), data, { mode: "fastest" })!;
  assert.equal(shortest.meters, 480);
  assert.equal(shortest.lights, 2);
  assert.equal(shortest.minutes, 8); // 6 minutes walking + 2 lights
  assert.equal(fastest.meters, 480); // same distance by another street
  assert.equal(fastest.lights, 0);
  assert.equal(fastest.minutes, 6);
  assert.notEqual(fastest.path, shortest.path);
  assert.ok(fastest.turns > shortest.turns, "the faster route costs extra turns");
});

test("a closed street is never used, and a place with no open route has no route", () => {
  const data = handMade();
  const library = buildingOf(find(data, "Library"), data)!;
  const detour = routeTo(library, { closed: new Set(["V2-r3"]) })!;
  assert.ok(!detour.path.includes("V2-r3"));
  assert.equal(detour.meters, 480); // a grid detour of the same length, but with more turns
  assert.ok(detour.turns > routeTo(library)!.turns);
  const longer = routeTo(buildingOf(find(data, "Bank"), data)!, { closed: new Set(["V2-r3"]) })!;
  assert.ok(longer.meters > 160, "closing the direct street makes this route longer");
  assert.equal(routeTo(library, { closed: new Set(["V2-r3", "H3-c2", "H3-c3"]) }), null); // START is cut off
});

test("a railway crossing adds waiting time, and a tunnel does not", () => {
  const railway = (kind: "railway crossing" | "tunnel") =>
    handMade({ railway: true, railwayCrossings: [{ street: "V1", kind: "tunnel" }, { street: "V2", kind }, { street: "V3", kind: "tunnel" }] });
  const bank = (d: MapData) => routeToPlace(find(d, "Bank"), d, { mode: "shortest" })!;
  assert.equal(bank(railway("railway crossing")).minutes, 160 / 80 + 2);
  assert.equal(bank(railway("tunnel")).minutes, 160 / 80);
  // With a crossing on the direct avenue, the fastest route goes round by a tunnel if that is quicker.
  const fastest = routeToPlace(find(railway("railway crossing"), "Bank"), railway("railway crossing"), { mode: "fastest" })!;
  assert.ok(fastest.minutes <= bank(railway("railway crossing")).minutes);
});

test("the teacher's own words choose the environment", () => {
  assert.equal(environmentFor("Downtown area of business sectors"), "downtown");
  assert.equal(environmentFor("Downtown business district"), "downtown");
  assert.equal(environmentFor("a university campus in spring"), "campus");
  assert.equal(environmentFor("old town for sightseeing"), "tourist");
  assert.equal(environmentFor("town center"), "town");
  assert.equal(environmentFor("the moon"), null); // unclear: the AI chooses
});

// ---------- Generated maps: every environment at every difficulty ----------

const NAMES: Record<EnvironmentId, { large: string[]; landmarks: string[]; find: string[] }> = {
  downtown: { large: ["Office Tower", "Grand Hotel"], landmarks: ["City Bank", "Post Office"], find: ["Cafe", "Deli", "Pharmacy", "Bookstore", "Gym", "Bakery"] },
  campus: { large: ["Library", "Sports Hall"], landmarks: ["Student Center", "Cafeteria"], find: ["Bookstore", "Science Hall", "Arts Hall", "Health Center", "Cafe", "Office"] },
  shopping: { large: ["Shopping Center"], landmarks: ["Cinema", "Supermarket", "Bank"], find: ["Bakery", "Shoe Shop", "Toy Shop", "Florist", "Cafe", "Pharmacy"] },
  tourist: { large: ["City Museum", "Grand Hotel"], landmarks: ["Theatre", "Visitor Center"], find: ["Gallery", "Cafe", "Gift Shop", "Ticket Office", "Hostel", "Bistro"] },
  town: { large: ["School"], landmarks: ["Town Hall", "Library", "Bank"], find: ["Bakery", "Cafe", "Pharmacy", "Bookshop", "Post Office", "Cinema"] },
};
const COUNT: Record<Difficulty, number> = { Easy: 6, Intermediate: 6, Challenging: 4 };

/** What the AI would return: names and sizes only. The app must add every feature the environment needs. */
function plan(environment: EnvironmentId, difficulty: Difficulty): MapPlan {
  const n = NAMES[environment];
  const p = (name: string, size: "small" | "medium" | "large", shared: boolean) => ({ name, kind: "building" as const, size, shared, description: "" });
  return {
    environment,
    ...streets,
    features: { ...EMPTY_FEATURES },
    places: [...n.large.map((x) => p(x, "large", true)), ...n.landmarks.map((x) => p(x, "medium", true)), ...n.find.slice(0, COUNT[difficulty]).map((x, i) => p(x, i % 3 === 2 ? "medium" : "small", false))],
  };
}
const common = (environment: EnvironmentId, difficulty: Difficulty): CommonSettings => ({ cefr: "A2", topic: "", goal: "", expressions: "", difficulty, support: "Useful expressions", pairs: 1 });
const SEEDS = 40;

function generate(environment: EnvironmentId, difficulty: Difficulty, seed: number) {
  return buildMapActivity(plan(environment, difficulty), { locationCount: COUNT[difficulty], features: [], allowSelfCheck: true }, { ...common(environment, difficulty), topic: environment === "town" ? "town center" : environment }, seededRandom(seed));
}

for (const environment of ENVIRONMENT_CHOICES)
  for (const difficulty of DIFFICULTIES)
    test(`${environment} / ${difficulty}: buildings, entrances, routes and challenges are valid`, () => {
      let detours = 0;
      let tasks = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { data, usefulLanguage } = generate(environment, difficulty, seed);
        const where = `${environment}/${difficulty}/seed ${seed}`;
        const buildings = townBuildings(data);
        const f = data.features;
        const parks = new Set(f.parks.map((p) => p.block));
        assert.equal(data.environment, environment, where);
        // The environment may add a landmark of its own (a parking lot), but never loses a place.
        for (const p of plan(environment, difficulty).places) assert.ok(buildingOf(find(data, p.name), data), `${where}: ${p.name} has a building`);
        assert.equal(new Set(data.places.map((p) => p.building)).size, data.places.length, `${where}: one place per building`);

        for (const b of buildings) {
          const { row, col } = parseBlock(b.block);
          assert.ok(!parks.has(b.block), `${where}: ${b.id} is in a park`);
          assert.equal(streetOfSide(row, col, b.entrance.side), b.entrance.street, `${where}: ${b.id} opens onto a real street`);
          if (f.river && row === 1) assert.ok(b.y + b.h <= 0.5, `${where}: ${b.id} is in the river`);
          if (f.railway && row === 3) assert.ok(b.y >= 0.5, `${where}: ${b.id} is on the railway`);
          for (const o of buildings)
            if (o !== b && o.block === b.block) assert.ok(!(b.x < o.x + o.w - 1e-9 && o.x < b.x + b.w - 1e-9 && b.y < o.y + o.h - 1e-9 && o.y < b.y + b.h - 1e-9), `${where}: ${b.id} overlaps ${o.id}`);
        }

        // Every place can be reached by an open route, and has directions and a location description.
        const closed = closedSegments(data);
        for (const p of data.places) {
          const r = routeToPlace(p, data);
          assert.ok(r, `${where}: no open route to ${p.name}`);
          assert.ok(![...closed].some((s) => r.path.split(">").includes(s)), `${where}: route to ${p.name} uses a closed street`);
          assert.match(directionsToPlace(p, data), /on your (left|right)\.$/, `${where}: directions to ${p.name}`);
          assert.ok(describeLocation(p, data).text.length > 5);
        }

        // Route challenges.
        const holders = mapPlaceHolders(data.places);
        const solutions = routeSolutions(data);
        assert.equal(solutions.length, (data.routeTasks ?? []).length, `${where}: every challenge has an answer`);
        if (difficulty === "Easy") {
          assert.equal((data.routeTasks ?? []).length, 0, `${where}: no challenge at Easy`);
          assert.equal(closed.size, 0);
        } else assert.equal((data.routeTasks ?? []).length, 2, `${where}: one challenge for each student`);
        if (difficulty !== "Challenging") assert.equal(closed.size, 0, `${where}: closures only at Challenging`);
        for (const s of solutions) {
          tasks++;
          const index = data.places.findIndex((p) => p.name === s.task.place);
          assert.equal(holders[index], s.task.for === "A" ? "B" : "A", `${where}: the destination is one only the partner can see`);
          const open = s.options.filter((o) => !o.blocked);
          assert.ok(open.length >= 1, `${where}: at least one open route`);
          if (s.task.kind === "detour") {
            detours++;
            assert.ok(s.closure, `${where}: a detour challenge has road works`);
            assert.equal(s.closure!.knownBy, s.task.for, `${where}: the traveller, not the partner, sees the road works`);
            assert.equal(s.options.filter((o) => o.blocked).length, 1, `${where}: the blocked direct route is shown`);
          } else {
            // Two open routes are compared, or the answer says honestly that there is only one.
            assert.ok(open.length === 2 || /no other sensible route/.test(s.verdict), `${where}: something to compare`);
            if (open.length === 2 && Math.abs(open[0].meters - open[1].meters) < 5) assert.match(s.verdict, /same distance/, `${where}: equal distances are reported as equal`);
          }
          // The student's challenge text gives away neither the place's position nor the closed street.
          const text = routeTaskText(s.task, data);
          for (const street of [...data.horizontalStreets, ...data.verticalStreets]) assert.ok(!text.includes(street), `${where}: challenge text names ${street}`);
        }
        for (const c of data.closures ?? []) assert.ok(data.routeTasks!.some((t) => t.for === c.knownBy && t.kind === "detour"), `${where}: each closure belongs to a challenge`);

        // Above Easy, places to find include a corner building or an entrance on an avenue.
        if (difficulty !== "Easy") {
          const special = data.places.filter((p, i) => holders[i] !== "both").map((p) => buildingOf(p, data)!).filter((b) => b.corner || b.entrance.street.startsWith("V"));
          assert.ok(special.length >= 1, `${where}: no place to find is on a corner or an avenue entrance`);
        }
        // Language support never names a place.
        const language = usefulLanguage.flatMap((g) => g.expressions).join(" ");
        for (const p of data.places) assert.ok(!language.includes(p.name), `${where}: language support names ${p.name}`);
      }
      // At the hardest level most challenges must be real detours (a few maps cannot support one and say so to the teacher).
      if (difficulty === "Challenging") assert.ok(detours / tasks >= 0.8, `${environment}: only ${detours} of ${tasks} challenges are detours`);
    });

test("a downtown is denser than a small town, and a campus has more large buildings", () => {
  for (const difficulty of DIFFICULTIES) {
    const count = (e: EnvironmentId) => townBuildings(generate(e, difficulty, 3).data).length;
    const large = (e: EnvironmentId) => townBuildings(generate(e, difficulty, 3).data).filter((b) => b.position === "whole").length;
    assert.ok(count("downtown") > count("town"), `${difficulty}: downtown ${count("downtown")} buildings, town ${count("town")}`);
    assert.ok(large("campus") >= 2, `${difficulty}: campus has ${large("campus")} large buildings`);
  }
});

test("language support is chosen for the level, and only talks about problems when the map has road works", () => {
  const easy = generate("downtown", "Easy", 1).data;
  const hard = generate("downtown", "Challenging", 1).data;
  for (const cefr of CEFR_LEVELS) {
    const purposes = (d: MapData) => mapUsefulLanguage(cefr, d, "", "Useful expressions").map((g) => g.purpose);
    assert.ok(!purposes(easy).includes("Problems") && !purposes(easy).includes("Comparing routes"), cefr);
    if (hard.closures?.length) assert.ok(purposes(hard).includes("Problems"), cefr);
  }
  const a2 = mapUsefulLanguage("A2", easy, "", "Useful expressions").flatMap((g) => g.expressions);
  const b2 = mapUsefulLanguage("B2", easy, "", "Useful expressions").flatMap((g) => g.expressions);
  assert.ok(a2.includes("Go straight.") && !b2.includes("Go straight."));
  assert.equal(mapUsefulLanguage("A2", easy, "My own phrase", "Useful expressions")[0].expressions[0], "My own phrase");
});

test("maps saved in the old two-lots format still get buildings, routes and descriptions", () => {
  const data = handMade({ parks: [{ block: "r2c2", name: "City Park" }] });
  assert.equal(townBuildings(data).length, 22); // 24 lots minus the park's two
  for (const p of data.places) {
    assert.ok(buildingOf(p, data), p.name);
    assert.ok(directionsToPlace(p, data).length > 10, p.name);
  }
  assert.equal(routeSolutions(data).length, 0);
});
