/**
 * The town model behind "How Do I Get There?".
 *
 * The map is built from structure first, and the layers are kept separate:
 *   streets       fixed grid: H0-H3 (west-east) and V1-V3 (north-south), meeting at 12 intersections
 *   blocks        the 3 x 4 areas between the streets ("r2c3" = row 2, column 3)
 *   buildings     footprints inside a block; a block can hold one, two, three or four
 *   entrances     every building opens onto exactly one street, on one side of its block
 *   features      river, railway, traffic lights, parks ... (MapFeatures)
 *   places        names given to some of the buildings; the rest stay unnamed
 *
 * The app decides all of the geometry. The AI only supplies names, sizes and features,
 * and routes and location descriptions are always computed here.
 */
import { MAP_COLS, MAP_LOTS, MAP_ROWS } from "./activitySchemas";
import type { MapData, MapFeatures, MapPlace, MapPlan, Side, TownBuilding } from "./activitySchemas";
import { ENVIRONMENTS } from "./mapEnvironments";
import type { EnvironmentId } from "./mapEnvironments";
import type { Difficulty } from "./types";

// ---------- Features ----------

export const EMPTY_FEATURES: MapFeatures = {
  river: false,
  riverName: "",
  railway: false,
  railwayCrossings: [],
  trafficLights: [],
  roundabouts: [],
  pedestrianCrossings: [],
  roadsideStops: [],
  parks: [],
};

/** Features of a stored map (maps shared before features existed have none). */
export function mapFeaturesOf(data: MapData): MapFeatures {
  return data.features ?? EMPTY_FEATURES;
}

// ---------- Blocks and streets ----------

const blockId = (row: number, col: number) => `r${row}c${col}`;

/** True for a block that is on the grid ("r1c1" to "r3c4"). */
export const isBlock = (id: unknown): boolean => typeof id === "string" && /^r[1-3]c[1-4]$/.test(id);

export function parseBlock(id: string): { row: number; col: number } {
  const m = /^r(\d)c(\d)/.exec(id);
  if (!m) throw new Error(`Bad block id: ${id}`);
  return { row: Number(m[1]), col: Number(m[2]) };
}

/** The street along one side of a block, or null where the block is at the edge of the map. */
export function streetOfSide(row: number, col: number, side: Side): string | null {
  if (side === "north") return `H${row - 1}`;
  if (side === "south") return `H${row}`;
  if (side === "west") return col >= 2 ? `V${col - 1}` : null;
  return col < MAP_COLS ? `V${col}` : null;
}

export function streetName(street: string, data: Pick<MapData, "horizontalStreets" | "verticalStreets">): string {
  const n = Number(street.slice(1));
  return (street.startsWith("H") ? data.horizontalStreets[n] : data.verticalStreets[n - 1]) ?? street;
}

/** Which part of a block can hold buildings: the river takes the south half of row 1, the railway the north half of row 3. */
function usablePart(row: number, f: MapFeatures): "full" | "top" | "bottom" {
  if (row === 1 && f.river) return "top";
  if (row === MAP_ROWS && f.railway) return "bottom";
  return "full";
}

// ---------- Buildings ----------

type Footprint = Pick<TownBuilding, "x" | "y" | "w" | "h"> & { side: Side; position: TownBuilding["position"] };

function makeBuilding(row: number, col: number, id: string, fp: Footprint): TownBuilding {
  const street = streetOfSide(row, col, fp.side);
  if (!street) throw new Error(`Block ${blockId(row, col)} has no street on its ${fp.side} side.`);
  const along = fp.side === "north" || fp.side === "south" ? fp.x + fp.w / 2 : fp.y + fp.h / 2;
  // A corner building is a small one standing where two streets meet.
  const h = fp.y === 0 ? streetOfSide(row, col, "north") : fp.y + fp.h === 1 ? streetOfSide(row, col, "south") : null;
  const v = fp.x === 0 ? streetOfSide(row, col, "west") : fp.x + fp.w === 1 ? streetOfSide(row, col, "east") : null;
  const corner = fp.w < 1 && fp.h < 1 && h && v ? [h, v] : null;
  return { id, block: blockId(row, col), x: fp.x, y: fp.y, w: fp.w, h: fp.h, position: fp.position, entrance: { side: fp.side, street, at: along }, corner };
}

/** Ways to divide a block into buildings. */
type Template = "halves" | "split-north" | "split-south" | "side-by-side" | "quad" | "large" | "single" | "pair";
const MULTI: Template[] = ["split-north", "split-south", "side-by-side", "quad", "pair"];

/**
 * The buildings of one block.
 * sideStreets = buildings may open onto the avenue beside the block instead of the street above or below it.
 */
function layoutBlock(row: number, col: number, template: Template, part: "full" | "top" | "bottom", sideStreets: boolean, largeSide: Side): TownBuilding[] {
  const west = sideStreets && streetOfSide(row, col, "west") !== null;
  const east = sideStreets && streetOfSide(row, col, "east") !== null;
  let fps: Footprint[];
  if (part !== "full") {
    // Half a block: everything faces the one street, except a corner building that may face the avenue.
    const y = part === "top" ? 0 : 0.5;
    const side: Side = part === "top" ? "north" : "south";
    const pos = (we: "west" | "east") => `${side}-${we}` as TownBuilding["position"];
    fps =
      template === "pair"
        ? [
            { x: 0, y, w: 0.5, h: 0.5, side, position: pos("west") },
            { x: 0.5, y, w: 0.5, h: 0.5, side: east ? "east" : side, position: pos("east") },
          ]
        : [{ x: 0, y, w: 1, h: 0.5, side, position: side }];
  } else {
    const north: Footprint = { x: 0, y: 0, w: 1, h: 0.5, side: "north", position: "north" };
    const south: Footprint = { x: 0, y: 0.5, w: 1, h: 0.5, side: "south", position: "south" };
    const nw: Footprint = { x: 0, y: 0, w: 0.5, h: 0.5, side: "north", position: "north-west" };
    const ne: Footprint = { x: 0.5, y: 0, w: 0.5, h: 0.5, side: east ? "east" : "north", position: "north-east" };
    const sw: Footprint = { x: 0, y: 0.5, w: 0.5, h: 0.5, side: west ? "west" : "south", position: "south-west" };
    const se: Footprint = { x: 0.5, y: 0.5, w: 0.5, h: 0.5, side: "south", position: "south-east" };
    fps = {
      halves: [north, south],
      "split-north": [nw, ne, south],
      "split-south": [north, sw, se],
      "side-by-side": [
        { x: 0, y: 0, w: 0.5, h: 1, side: west ? "west" : "north", position: "west" } as Footprint,
        { x: 0.5, y: 0, w: 0.5, h: 1, side: east ? "east" : "south", position: "east" } as Footprint,
      ],
      quad: [nw, ne, sw, se],
      large: [{ x: 0, y: 0, w: 1, h: 1, side: largeSide, position: "whole" } as Footprint],
      single: [north, south],
      pair: [north, south],
    }[template];
  }
  return fps.map((fp, i) => makeBuilding(row, col, `${blockId(row, col)}-${i + 1}`, fp));
}

/** Small, repeatable random numbers, so a map can be rebuilt from its seed in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isNarrow = (b: TownBuilding) => b.w < 1;
const longestWord = (name: string) => Math.max(...name.split(/\s+/).map((w) => w.length));
/** Narrow buildings only take names that can be read inside them (the map draws longer words a little smaller). */
const NARROW_WORD_LIMIT = 9;

function fits(place: MapPlan["places"][number], b: TownBuilding): boolean {
  if (!isNarrow(b)) return true;
  if (place.kind === "parking lot") return false;
  return longestWord(place.name) <= NARROW_WORD_LIMIT && place.name.split(/\s+/).length <= (b.h === 1 ? 4 : 2);
}

/**
 * Builds the town: divides the blocks into buildings, then gives the AI's places a building each.
 * Buildings that get no place stay on the map without a name.
 */
export function buildTown(
  planPlaces: MapPlan["places"],
  f: MapFeatures,
  streets: Pick<MapData, "horizontalStreets" | "verticalStreets">,
  difficulty: Difficulty,
  environment: EnvironmentId = "town",
  random: () => number = Math.random,
): { buildings: TownBuilding[]; places: MapPlace[]; notes: string[] } {
  // The environment and the difficulty together decide how the blocks are divided.
  const plans = (ENVIRONMENTS[environment] ?? ENVIRONMENTS.town).plan;
  const plan = plans[difficulty] ?? plans.Intermediate;
  const notes: string[] = [];
  const parkBlocks = new Set(f.parks.map((p) => p.block));

  const blocks: { row: number; col: number; part: "full" | "top" | "bottom" }[] = [];
  for (let row = 1; row <= MAP_ROWS; row++)
    for (let col = 1; col <= MAP_COLS; col++) if (!parkBlocks.has(blockId(row, col))) blocks.push({ row, col, part: usablePart(row, f) });

  // 1. Structure: choose how every block is divided.
  const largePlaces = planPlaces.filter((p) => p.size === "large" && p.kind === "building").slice(0, plan.large);
  const full = shuffled(blocks.filter((b) => b.part === "full"), random);
  const half = shuffled(blocks.filter((b) => b.part !== "full"), random);
  const templates = new Map<string, Template>();
  const take = (list: typeof blocks, count: number, template: (i: number) => Template) =>
    list.splice(0, Math.min(count, list.length)).forEach((b, i) => templates.set(blockId(b.row, b.col), template(i)));
  const fullLeft = [...full];
  const halfLeft = [...half];
  take(fullLeft, largePlaces.length, () => "large");
  take(fullLeft, plan.quad, () => "quad");
  take(fullLeft, plan.split, (i) => (i % 2 === 0 ? "split-north" : "split-south"));
  take(fullLeft, plan.sideBySide, () => "side-by-side");
  take(fullLeft, fullLeft.length, () => "halves");
  take(halfLeft, plan.pair, () => "pair");
  take(halfLeft, halfLeft.length, () => "single");

  const byBlock = new Map<string, TownBuilding[]>();
  for (const b of blocks) {
    const id = blockId(b.row, b.col);
    // A large building opens onto any street around its block; harder maps may pick a less obvious side.
    const sides = (["north", "south", "east", "west"] as Side[]).filter(
      (s) => streetOfSide(b.row, b.col, s) && (plan.sideStreets || s === "north" || s === "south"),
    );
    const largeSide = sides[Math.floor(random() * sides.length)];
    byBlock.set(id, layoutBlock(b.row, b.col, templates.get(id) ?? "halves", b.part, plan.sideStreets, largeSide));
  }
  const buildings = [...byBlock.values()].flat();

  // 2. Names: large places first, then blocks that should be busy, then one building per block in turn.
  const assigned = new Map<MapPlan["places"][number], string>();
  const largeBlocks = [...templates].filter(([, t]) => t === "large").map(([id]) => id);
  largePlaces.forEach((p, i) => largeBlocks[i] && assigned.set(p, byBlock.get(largeBlocks[i])![0].id));

  const interesting = (b: TownBuilding) => (b.corner ? 1 : 0) + (b.entrance.street.startsWith("V") ? 1 : 0);
  const order = (list: TownBuilding[]) => (plan.sideStreets ? [...list].sort((a, b) => interesting(b) - interesting(a)) : list);
  const open = shuffled(
    [...byBlock].filter(([id]) => templates.get(id) !== "large"),
    random,
  ).map(([id, list]) => ({ id, list: order(list) }));
  const busy = open.filter((b) => MULTI.includes(templates.get(b.id)!)).slice(0, plan.busy);
  const queue: TownBuilding[] = busy.flatMap((b) => b.list.splice(0));
  for (let round = 0; open.some((b) => b.list.length); round++) for (const b of open) if (b.list.length) queue.push(b.list.shift()!);

  // Mix landmarks and places to find, so a busy block has something both students can see.
  const rest = planPlaces.filter((p) => !assigned.has(p));
  const landmarks = rest.filter((p) => p.shared);
  const toFind = rest.filter((p) => !p.shared);
  const turn: typeof rest = [];
  while (landmarks.length || toFind.length) turn.push(...landmarks.splice(0, 1), ...toFind.splice(0, 2));
  for (const place of turn) {
    // Looking only at the buildings coming up next keeps busy blocks busy. Among those, places to find take
    // corner buildings and avenue entrances first, and shops take the small buildings.
    // Where route challenges exist, places to find are also kept away from the doors right beside START,
    // so that getting to them is a real route.
    const special = (b: TownBuilding) => interesting(b) > 0;
    const suits = (b: TownBuilding) => fits(place, b) && (place.shared || !plan.sideStreets || (routeTo(b)?.legs.length ?? 0) > 0);
    const soon = (test: (b: TownBuilding) => boolean) => queue.slice(0, 6).findIndex((b) => suits(b) && test(b));
    let i = plan.sideStreets ? soon((b) => special(b) === !place.shared && isNarrow(b) === (place.size === "small")) : -1;
    if (i < 0 && plan.sideStreets) i = soon((b) => special(b) === !place.shared);
    if (i < 0) i = soon((b) => isNarrow(b) === (place.size === "small"));
    if (i < 0) i = queue.findIndex(suits);
    if (i < 0) i = queue.findIndex((b) => fits(place, b));
    if (i < 0) i = queue.findIndex((b) => !isNarrow(b) || place.kind !== "parking lot");
    if (i < 0) {
      notes.push(`"${place.name}" did not fit on the map and was removed.`);
      continue;
    }
    assigned.set(place, queue.splice(i, 1)[0].id);
  }

  // Keep the AI's order: it decides which student knows which place.
  const places: MapPlace[] = planPlaces
    .filter((p) => assigned.has(p))
    .map((p) => ({ name: p.name, kind: p.kind, shared: p.shared, description: p.description, building: assigned.get(p) }));
  const data: MapData = { ...streets, places, features: f, buildings };
  for (const place of places) place.near = describeLocation(place, data).near;
  return { buildings, places, notes };
}

/**
 * The buildings of a stored map. Maps made before buildings existed had two lots per
 * block (north and south half); they are read as buildings facing the street above or below.
 */
export function townBuildings(data: MapData): TownBuilding[] {
  if (data.buildings) return data.buildings.filter((b) => isBlock(b.block));
  const f = mapFeaturesOf(data);
  const parks = new Set(f.parks.map((p) => p.block));
  return MAP_LOTS.flatMap((lot) => {
    const { row, col } = parseBlock(lot);
    const north = lot.endsWith("n");
    if (parks.has(blockId(row, col)) || (f.river && row === 1 && !north) || (f.railway && row === MAP_ROWS && north)) return [];
    return [makeBuilding(row, col, lot, { x: 0, y: north ? 0 : 0.5, w: 1, h: 0.5, side: north ? "north" : "south", position: north ? "north" : "south" })];
  });
}

/** The building a place is in ("lot" on maps made before buildings existed). */
export function buildingOf(place: MapPlace, data: MapData): TownBuilding | undefined {
  const id = place.building ?? place.lot;
  return townBuildings(data).find((b) => b.id === id);
}

// ---------- Where a place is ----------

const touches = (b: TownBuilding, side: Side) =>
  side === "north" ? b.y === 0 : side === "south" ? b.y + b.h === 1 : side === "west" ? b.x === 0 : b.x + b.w === 1;
/** The stretch of a block edge a building takes up (west to east, or north to south). */
const span = (b: TownBuilding, side: Side): [number, number] => (side === "north" || side === "south" ? [b.x, b.x + b.w] : [b.y, b.y + b.h]);
const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.01;
const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/**
 * A location description that both students can follow: it only mentions streets,
 * parks and the landmarks named on both maps. `near` lists the landmarks it uses.
 */
export function describeLocation(place: MapPlace, data: MapData): { text: string; near: string[] } {
  const b = buildingOf(place, data);
  if (!b) return { text: "", near: [] };
  const all = townBuildings(data);
  const name = (street: string) => streetName(street, data);
  const landmarkIn = new Map(data.places.filter((p) => p.shared && p !== place).map((p) => [p.building ?? p.lot, p.name]));
  const parts: string[] = [];
  const near: string[] = [];

  const street = name(b.entrance.street);
  const { row, col } = parseBlock(b.block);
  // The two streets at either end of the entrance street's stretch along this block.
  const horizontal = b.entrance.side === "north" || b.entrance.side === "south";
  const ends = horizontal ? [streetOfSide(row, col, "west"), streetOfSide(row, col, "east")] : [streetOfSide(row, col, "north"), streetOfSide(row, col, "south")];
  if (b.position === "whole") parts.push(`It fills a whole block. The entrance is on ${street}.`);
  else if (b.corner) parts.push(`It is on the corner of ${name(b.corner[0])} and ${name(b.corner[1])}. The entrance is on ${street}.`);
  else if (ends[0] && ends[1]) parts.push(`It is on ${street}, between ${name(ends[0])} and ${name(ends[1])}.`);
  else parts.push(`It is on ${street}.`);

  // Next to: landmarks in the same block that share a wall with it.
  const sharesWall = (o: TownBuilding) =>
    (overlap([b.x, b.x + b.w], [o.x, o.x + o.w]) && (o.y + o.h === b.y || b.y + b.h === o.y)) ||
    (overlap([b.y, b.y + b.h], [o.y, o.y + o.h]) && (o.x + o.w === b.x || b.x + b.w === o.x));
  const neighbours = all.filter((o) => o.block === b.block && o !== b && landmarkIn.has(o.id) && sharesWall(o)).map((o) => landmarkIn.get(o.id)!);
  if (neighbours.length) parts.push(`It is next to the ${neighbours.join(" and the ")}.`);
  near.push(...neighbours);

  // Opposite: what faces its entrance from the other side of the street.
  const facing = { north: [row - 1, col], south: [row + 1, col], west: [row, col - 1], east: [row, col + 1] }[b.entrance.side];
  const facingId = blockId(facing[0], facing[1]);
  const park = mapFeaturesOf(data).parks.find((p) => p.block === facingId);
  const across = all.find(
    (o) => o.block === facingId && landmarkIn.has(o.id) && touches(o, OPPOSITE[b.entrance.side]) && overlap(span(o, b.entrance.side), span(b, b.entrance.side)),
  );
  if (park) {
    parts.push(`It is opposite ${park.name}.`);
    near.push(park.name);
  } else if (across) {
    parts.push(`It is opposite the ${landmarkIn.get(across.id)}.`);
    near.push(landmarkIn.get(across.id)!);
  }
  return { text: parts.join(" "), near };
}

// ---------- Routes ----------

type Dir = "north" | "south" | "east" | "west";
const VEC: Record<Dir, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const DIRS = Object.keys(VEC) as Dir[];

/**
 * The walking model. These are the app's stated assumptions; every distance and time shown
 * to teachers or students is calculated from them, never written by the AI.
 */
export const WALK = {
  /** Metres from one intersection to the next, west-east and north-south. */
  blockEastWest: 120,
  blockNorthSouth: 100,
  /** Walking speed in metres per minute. */
  speed: 80,
  /** Minutes waiting to cross at traffic lights, and at a railway crossing. */
  lightsWait: 1,
  railwayWait: 2,
};

/** START: the corner of H3 and V2, facing north. */
const START = { k: 3, j: 2, dir: "north" as Dir };

const turnWord = (from: Dir, to: Dir) => (VEC[from][0] * VEC[to][1] - VEC[from][1] * VEC[to][0] > 0 ? "right" : "left");
const reverses = (a: Dir, b: Dir) => VEC[a][0] === -VEC[b][0] && VEC[a][1] === -VEC[b][1];

/** The next intersection in a direction, with the street and segment that lead there. */
function step(k: number, j: number, dir: Dir): { k: number; j: number; street: string; segment: string; meters: number } | null {
  if (dir === "north") return k > 0 ? { k: k - 1, j, street: `V${j}`, segment: `V${j}-r${k}`, meters: WALK.blockNorthSouth } : null;
  if (dir === "south") return k < MAP_ROWS ? { k: k + 1, j, street: `V${j}`, segment: `V${j}-r${k + 1}`, meters: WALK.blockNorthSouth } : null;
  if (dir === "west") return j > 1 ? { k, j: j - 1, street: `H${k}`, segment: `H${k}-c${j}`, meters: WALK.blockEastWest } : null;
  return j < MAP_COLS - 1 ? { k, j: j + 1, street: `H${k}`, segment: `H${k}-c${j + 1}`, meters: WALK.blockEastWest } : null;
}

/** Shortest = least walking distance. Fastest = least time, counting waits at traffic lights and railway crossings. */
export type RouteMode = "shortest" | "fastest";
export interface RouteOptions {
  mode?: RouteMode;
  /** Street segments that cannot be used ("H1-c2", "V3-r1"): road works. */
  closed?: ReadonlySet<string>;
  /** Needed for waiting times; without it the route has none. */
  features?: MapFeatures;
}

interface Leg {
  dir: Dir;
  street: string;
  from: { k: number; j: number };
  segments: string[];
}
export interface Route {
  /** Whole streets walked, intersection to intersection. */
  legs: Leg[];
  /** The last stretch, from an intersection along the entrance street to the door. */
  last: { dir: Dir; street: string; segment: string; from: { k: number; j: number }; meters: number };
  meters: number;
  /** Walking time plus waiting time. */
  minutes: number;
  turns: number;
  /** Traffic lights and railway crossings waited at. */
  lights: number;
  railwayCrossings: number;
  /** Identifies the path, so two routes can be compared. */
  path: string;
}

/** Does walking this part of an avenue segment cross the railway at a level crossing? (The railway lies across the north half of row 3.) */
function railwayWaits(segment: string, fromT: number, toT: number, f: MapFeatures | undefined): number {
  const [street, part] = segment.split("-");
  if (!f?.railway || !street.startsWith("V") || part !== `r${MAP_ROWS}`) return 0;
  if (Math.min(fromT, toT) >= 0.25 || Math.max(fromT, toT) <= 0.25) return 0;
  return (f.railwayCrossings.find((c) => c.street === street)?.kind ?? "railway crossing") === "railway crossing" ? 1 : 0;
}

/**
 * The best walking route from START to a building's entrance (not to the middle of its block).
 * Costs are compared in order, so nothing is traded off by accident:
 *   shortest: distance, then fewer turns, then time
 *   fastest:  time, then distance, then fewer turns
 */
export function routeTo(b: TownBuilding, options: RouteOptions = {}): Route | null {
  const { mode = "shortest", closed = new Set<string>(), features: f } = options;
  const { row, col } = parseBlock(b.block);
  const horizontal = b.entrance.side === "north" || b.entrance.side === "south";
  const n = Number(b.entrance.street.slice(1));
  const segment = horizontal ? `H${n}-c${col}` : `V${n}-r${row}`;
  if (closed.has(segment)) return null;
  const length = horizontal ? WALK.blockEastWest : WALK.blockNorthSouth;
  // Intersections at each end of the entrance segment, and the way you walk from there.
  const ends: { k: number; j: number; dir: Dir; meters: number; fromT: number }[] = horizontal
    ? [
        ...(col >= 2 ? [{ k: n, j: col - 1, dir: "east" as Dir, meters: b.entrance.at * length, fromT: 0 }] : []),
        ...(col < MAP_COLS ? [{ k: n, j: col, dir: "west" as Dir, meters: (1 - b.entrance.at) * length, fromT: 1 }] : []),
      ]
    : [
        { k: row - 1, j: n, dir: "south" as Dir, meters: b.entrance.at * length, fromT: 0 },
        { k: row, j: n, dir: "north" as Dir, meters: (1 - b.entrance.at) * length, fromT: 1 },
      ];

  type Cost = { meters: number; waits: number; turns: number; lights: number; rail: number };
  const minutes = (c: Cost) => c.meters / WALK.speed + c.waits;
  const rank = (c: Cost): [number, number, number] => (mode === "fastest" ? [minutes(c), c.meters, c.turns] : [c.meters, c.turns, minutes(c)]);
  const better = (a: Cost, b2: Cost) => {
    const [x, y] = [rank(a), rank(b2)];
    for (let i = 0; i < 3; i++) if (Math.abs(x[i] - y[i]) > 1e-9) return x[i] < y[i];
    return false;
  };
  const hasLights = (k: number, j: number) => Boolean(f?.trafficLights.includes(`H${k}-V${j}`));

  // Dijkstra over (intersection, direction faced); the graph is tiny, so a plain scan is enough.
  type State = { k: number; j: number; dir: Dir; cost: Cost; prev: State | null; via: ReturnType<typeof step> };
  const key = (s: { k: number; j: number; dir: Dir }) => `${s.k},${s.j},${s.dir}`;
  const first: State = { ...START, cost: { meters: 0, waits: 0, turns: 0, lights: 0, rail: 0 }, prev: null, via: null };
  const best = new Map<string, State>([[key(first), first]]);
  const todo: State[] = [first];
  const done = new Set<string>();
  while (todo.length) {
    todo.sort((a, b2) => (better(a.cost, b2.cost) ? -1 : better(b2.cost, a.cost) ? 1 : 0));
    const s = todo.shift()!;
    if (done.has(key(s))) continue;
    done.add(key(s));
    for (const dir of DIRS) {
      const next = step(s.k, s.j, dir);
      if (reverses(dir, s.dir) || !next || closed.has(next.segment)) continue;
      const rail = railwayWaits(next.segment, 0, 1, f);
      const lights = hasLights(next.k, next.j) ? 1 : 0;
      const cost: Cost = {
        meters: s.cost.meters + next.meters,
        waits: s.cost.waits + rail * WALK.railwayWait + lights * WALK.lightsWait,
        turns: s.cost.turns + (dir === s.dir ? 0 : 1),
        lights: s.cost.lights + lights,
        rail: s.cost.rail + rail,
      };
      const state: State = { k: next.k, j: next.j, dir, cost, prev: s, via: next };
      const known = best.get(key(state));
      if (!known || better(cost, known.cost)) {
        best.set(key(state), state);
        todo.push(state);
      }
    }
  }

  let chosen: { state: State; end: (typeof ends)[number]; cost: Cost } | null = null;
  for (const end of ends)
    for (const dir of DIRS) {
      const state = best.get(key({ k: end.k, j: end.j, dir }));
      if (!state || reverses(dir, end.dir)) continue;
      const rail = railwayWaits(segment, end.fromT, b.entrance.at, f);
      const cost: Cost = {
        meters: state.cost.meters + end.meters,
        waits: state.cost.waits + rail * WALK.railwayWait,
        turns: state.cost.turns + (dir === end.dir ? 0 : 1),
        lights: state.cost.lights,
        rail: state.cost.rail + rail,
      };
      if (!chosen || better(cost, chosen.cost)) chosen = { state, end, cost };
    }
  if (!chosen) return null;

  const steps: State[] = [];
  for (let s: State | null = chosen.state; s?.prev; s = s.prev) steps.unshift(s);
  const legs: Leg[] = [];
  for (const s of steps) {
    const lastLeg = legs[legs.length - 1];
    if (lastLeg && lastLeg.dir === s.dir) lastLeg.segments.push(s.via!.segment);
    else legs.push({ dir: s.dir, street: s.via!.street, from: { k: s.prev!.k, j: s.prev!.j }, segments: [s.via!.segment] });
  }
  return {
    legs,
    last: { dir: chosen.end.dir, street: b.entrance.street, segment, from: { k: chosen.end.k, j: chosen.end.j }, meters: chosen.end.meters },
    meters: chosen.cost.meters,
    minutes: minutes(chosen.cost),
    turns: chosen.cost.turns,
    lights: chosen.cost.lights,
    railwayCrossings: chosen.cost.rail,
    path: [...legs.flatMap((l) => l.segments), `${segment}:${chosen.end.dir}`].join(">"),
  };
}

/** Road works on a stored map, as the set of street segments that cannot be used. */
export function closedSegments(data: MapData): Set<string> {
  return new Set((data.closures ?? []).map((c) => c.segment));
}

/** "Park Road between West Avenue and Central Avenue": a street segment in words. */
export function segmentLabel(segment: string, data: MapData): string {
  const [street, part] = segment.split("-");
  const n = Number(part.slice(1));
  const name = (s: string | null) => (s ? streetName(s, data) : null);
  const ends = street.startsWith("H")
    ? [n >= 2 ? `V${n - 1}` : null, n < MAP_COLS ? `V${n}` : null]
    : [`H${n - 1}`, `H${n}`];
  const [a, b] = ends.map(name);
  return a && b ? `${name(street)} between ${a} and ${b}` : `${name(street)} (${a ? "east of " + a : "west of " + b})`;
}

const ORDINAL = ["first", "second", "third", "fourth"];

/**
 * A computed route in words. Counting ("the second building on your left") uses the
 * buildings students can see along that side of the street.
 */
export function describeRoute(route: Route, place: MapPlace, data: MapData): string {
  const b = buildingOf(place, data);
  if (!b) return "";
  const f = mapFeaturesOf(data);
  const name = (street: string) => streetName(street, data);
  const steps: string[] = [];

  const turn = (at: { k: number; j: number }, from: Dir, to: Dir, street: string, atStart: boolean) => {
    const corner = `H${at.k}-V${at.j}`;
    const lead = f.roundabouts.includes(corner) ? "At the roundabout, turn" : f.trafficLights.includes(corner) ? "At the traffic lights, turn" : atStart ? "From START, turn" : "Turn";
    steps.push(`${lead} ${turnWord(from, to)} onto ${name(street)}.`);
  };
  /** The river and the railway lie across the avenues; say so when the walk crosses them. */
  const crossing = (segment: string, fromT: number, toT: number) => {
    const [street, part] = segment.split("-");
    if (!street.startsWith("V")) return;
    const [lo, hi] = [Math.min(fromT, toT), Math.max(fromT, toT)];
    if (f.river && part === "r1" && lo < 0.75 && hi > 0.75) steps.push(`Cross the bridge over the ${f.riverName}.`);
    if (f.railway && part === `r${MAP_ROWS}` && lo < 0.25 && hi > 0.25) {
      const kind = f.railwayCrossings.find((c) => c.street === street)?.kind ?? "railway crossing";
      steps.push(kind === "tunnel" ? "Go through the tunnel under the railway." : "Cross the railway at the railway crossing.");
    }
  };

  let heading: Dir = START.dir;
  route.legs.forEach((leg, i) => {
    if (leg.dir !== heading) turn(leg.from, heading, leg.dir, leg.street, i === 0);
    const blocks = `${leg.segments.length} block${leg.segments.length > 1 ? "s" : ""}`;
    steps.push(leg.dir === heading && i === 0 ? `Go straight along ${name(leg.street)} for ${blocks}.` : `Go straight for ${blocks}.`);
    leg.segments.forEach((s) => crossing(s, 0, 1));
    heading = leg.dir;
  });

  const last = route.last;
  if (last.dir !== heading) turn(last.from, heading, last.dir, last.street, route.legs.length === 0);
  else if (route.legs.length) {
    const crossStreet = last.street.startsWith("H") ? `V${last.from.j}` : `H${last.from.k}`;
    steps.push(`Go past ${name(crossStreet)}.`);
  } else steps.push(`Go straight along ${name(last.street)}.`);
  const startsAtLowEnd = last.dir === "east" || last.dir === "south";
  crossing(last.segment, startsAtLowEnd ? 0 : 1, b.entrance.at);

  // The building is on the far side of the street from where its entrance faces.
  const toBuilding = VEC[OPPOSITE[b.entrance.side]];
  const side = VEC[last.dir][0] * toBuilding[1] - VEC[last.dir][1] * toBuilding[0] > 0 ? "right" : "left";
  const row = townBuildings(data)
    .filter((o) => o.block === b.block && touches(o, b.entrance.side))
    .sort((p, q) => (startsAtLowEnd ? 1 : -1) * (span(p, b.entrance.side)[0] - span(q, b.entrance.side)[0]));
  const position = row.indexOf(b);
  steps.push(row.length > 1 ? `The ${place.name} is the ${ORDINAL[position] ?? "last"} building on your ${side}.` : `The ${place.name} is on your ${side}.`);
  return steps.join(" ");
}

/** A route to a place on a stored map: around any road works on it, with its waiting times. */
export function routeToPlace(place: MapPlace, data: MapData, options: RouteOptions = {}): Route | null {
  const b = buildingOf(place, data);
  return b ? routeTo(b, { closed: closedSegments(data), features: mapFeaturesOf(data), ...options }) : null;
}

/** Spoken directions from START to a place's entrance: the shortest route that is open. */
export function directionsToPlace(place: MapPlace, data: MapData): string {
  const route = routeToPlace(place, data);
  return route ? describeRoute(route, place, data) : "";
}

/** "about 350 m" and "about 5 minutes": rounded for people, from the exact calculation. */
export const aboutMeters = (meters: number) => `about ${Math.max(10, Math.round(meters / 10) * 10)} m`;
export const aboutMinutes = (minutes: number) => {
  const n = Math.max(1, Math.round(minutes));
  return `about ${n} minute${n === 1 ? "" : "s"}`;
};

/**
 * Teacher demo, built from the computed routes (the AI's left/right reasoning is unreliable).
 * Uses landmarks named on both maps, so the demo gives away nothing that only one student knows.
 */
export function mapDemoExchange(data: MapData): string[] {
  const [first, second] = data.places.filter((p) => p.shared);
  const lines: string[] = [];
  if (first) lines.push(`A: Excuse me, how do I get to the ${first.name} from START?`, `B: ${directionsToPlace(first, data)}`);
  if (second) lines.push(`B: How do I get to the ${second.name} from START?`, `A: ${directionsToPlace(second, data)}`);
  return lines;
}
