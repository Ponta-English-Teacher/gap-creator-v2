/**
 * Environments for "How Do I Get There?".
 *
 * The setting the teacher chooses is a PLACE, not a task. Each environment decides the kind of
 * places the AI names, how the app divides the blocks, which map features appear, and how the map looks.
 * The navigation task itself comes from the difficulty (see lib/routeTasks.ts).
 */
import type { Difficulty } from "./types";

export const ENVIRONMENT_IDS = ["downtown", "campus", "shopping", "tourist", "town"] as const;
export type EnvironmentId = (typeof ENVIRONMENT_IDS)[number];

/**
 * How the blocks are divided.
 *   split / sideBySide / quad / pair: how many blocks are divided that way (the rest hold two buildings)
 *   busy: how many divided blocks are filled with names first, so several places share a block
 *   large: the most places that may take a whole block
 *   sideStreets: buildings may open onto the avenue beside their block, not only the street above or below
 */
export interface TownPlan {
  split: number;
  sideBySide: number;
  quad: number;
  pair: number;
  busy: number;
  large: number;
  sideStreets: boolean;
}

export interface Environment {
  id: EnvironmentId;
  /** Shown to the teacher as the setting to choose. */
  label: string;
  /** Words in a teacher's own description that point to this environment. */
  keywords: RegExp;
  /** Told to the AI: what this place is like and what belongs there. */
  brief: string;
  plan: Record<Difficulty, TownPlan>;
  /** Map features that are always there (names from MAP_FEATURE_OPTIONS in lib/activityTypes.ts). */
  features: Record<Difficulty, string[]>;
  look: {
    /** Colour of the ground inside a block, and of a building that has no name on this map. */
    ground: string;
    unnamed: string;
    /** Width of the west-east streets and of the north-south avenues, in map units. */
    streetH: number;
    streetV: number;
    /** Draw a centre line on the avenues (wide city streets). */
    centreLine: boolean;
  };
}

const plan = (split: number, sideBySide: number, quad: number, pair: number, busy: number, large: number, sideStreets: boolean): TownPlan => ({
  split,
  sideBySide,
  quad,
  pair,
  busy,
  large,
  sideStreets,
});

const ZEBRA = "Pedestrian crossing / zebra crossing";

export const ENVIRONMENTS: Record<EnvironmentId, Environment> = {
  downtown: {
    id: "downtown",
    label: "Downtown business district",
    keywords: /downtown|business|office|financial|commercial|city cent|central district|cbd|manhattan/i,
    brief: `A dense downtown business district of a big city (think of central Manhattan or downtown San Francisco, but invent everything).
- Places: banks, office buildings, hotels, cafes, restaurants, bookstores, pharmacies, a department store, a business center, delis, a gym, a post office. No farms, schools, houses or suburban facilities.
- Large places (whole block): an office tower, a department store or a big hotel.
- Most places are small street-level businesses that share a block.
- Streets: horizontal streets are numbered or named side streets (e.g. "1st Street", "Pine Street"); vertical streets are wide avenues (e.g. "Park Avenue", "5th Avenue", "Broadway").
- Features: traffic lights at several intersections, a subway entrance, pedestrian crossings. No river, railway, roundabout or park.`,
    plan: {
      Easy: plan(4, 0, 2, 0, 2, 2, false),
      Intermediate: plan(3, 2, 4, 0, 3, 2, true),
      Challenging: plan(3, 2, 5, 0, 3, 2, true),
    },
    features: {
      Easy: ["Traffic lights", "Subway entrance"],
      Intermediate: ["Traffic lights", "Subway entrance", ZEBRA],
      Challenging: ["Traffic lights", "Subway entrance", ZEBRA, "Bus stop"],
    },
    look: { ground: "#bfc7d1", unnamed: "#e6e9ee", streetH: 44, streetV: 74, centreLine: true },
  },
  campus: {
    id: "campus",
    label: "University campus",
    keywords: /campus|universit|college|school grounds/i,
    brief: `A university campus.
- Places: library, student center, cafeteria, gym, science building, arts building, lecture hall, administration office, bookstore, dormitory, health center, campus cafe.
- Large places (whole block): the main library, the gym or sports hall, the student center, a science building.
- A green quad or lawn is a park (parks), e.g. "Main Quad".
- Streets are campus roads and walks (e.g. "College Walk", "Library Lane", "University Road").
- Features: a bus stop, pedestrian crossings, a parking lot. No river, railway, subway or roundabout.`,
    plan: {
      Easy: plan(0, 0, 0, 0, 0, 3, false),
      Intermediate: plan(2, 2, 0, 0, 1, 3, true),
      Challenging: plan(3, 3, 1, 0, 2, 3, true),
    },
    features: {
      Easy: ["Park", "Bus stop"],
      Intermediate: ["Park", "Bus stop", ZEBRA, "Traffic lights"],
      Challenging: ["Park", "Bus stop", ZEBRA, "Traffic lights", "Parking lot"],
    },
    look: { ground: "#d3ebc4", unnamed: "#e3e7e2", streetH: 46, streetV: 46, centreLine: false },
  },
  shopping: {
    id: "shopping",
    label: "Shopping district",
    keywords: /shopping|shops|retail|mall|market|high street|stores/i,
    brief: `A busy shopping district.
- Places: clothes shops, shoe shop, bakery, cafe, restaurants, bookshop, toy shop, pharmacy, phone shop, florist, supermarket, cinema.
- Large places (whole block): a shopping center or a department store.
- Most places are small shops side by side in the same block.
- Streets are shopping streets (e.g. "Market Street", "High Street", "Garden Lane").
- Features: pedestrian crossings, a bus stop, a taxi stand, a parking lot (place kind "parking lot"). No river, railway or subway.`,
    plan: {
      Easy: plan(4, 0, 2, 0, 2, 1, false),
      Intermediate: plan(3, 2, 3, 0, 3, 1, true),
      Challenging: plan(3, 2, 5, 0, 3, 2, true),
    },
    features: {
      Easy: ["Bus stop", "Parking lot"],
      Intermediate: ["Bus stop", "Parking lot", ZEBRA, "Traffic lights"],
      Challenging: ["Bus stop", "Parking lot", ZEBRA, "Traffic lights", "Taxi stand"],
    },
    look: { ground: "#e6d9c2", unnamed: "#f1ece3", streetH: 50, streetV: 62, centreLine: false },
  },
  tourist: {
    id: "tourist",
    label: "Tourist district",
    keywords: /touris|sightsee|old town|historic|attraction|visitor|museum quarter/i,
    brief: `A tourist district of a city.
- Places: hotels, museums, an art gallery, a castle or palace, a theatre, restaurants, cafes, souvenir shops, a visitor center, a ticket office, an ice-cream shop.
- Large places (whole block): a museum, a palace or a grand hotel.
- Streets fit an old or scenic quarter (e.g. "Castle Street", "Harbor Road", "Museum Lane").
- Features: a park or gardens, a bus stop, a taxi stand; at harder levels a river with bridges.`,
    plan: {
      Easy: plan(0, 0, 0, 0, 0, 2, false),
      Intermediate: plan(3, 2, 0, 2, 2, 2, true),
      Challenging: plan(3, 2, 3, 3, 3, 2, true),
    },
    features: {
      Easy: ["Park", "Bus stop"],
      Intermediate: ["Park", "Bus stop", "Traffic lights", "Taxi stand"],
      Challenging: ["River", "Bridge", "Park", "Traffic lights", "Taxi stand"],
    },
    look: { ground: "#eef2e8", unnamed: "#d9dde2", streetH: 54, streetV: 58, centreLine: false },
  },
  town: {
    id: "town",
    label: "Small town centre",
    keywords: /town|village|neighbou?rhood|suburb|residential/i,
    brief: `The centre of a small town.
- Places: bakery, bank, cafe, pharmacy, post office, bookshop, supermarket, library, town hall, school, cinema, hotel.
- Large places (whole block): a school or a hospital.
- Streets have simple names (e.g. "Market Street", "Park Road", "Station Road").
- Features: a park, a bus stop; at harder levels traffic lights, a river and a railway.`,
    plan: {
      Easy: plan(0, 0, 0, 0, 0, 1, false),
      Intermediate: plan(3, 2, 0, 2, 2, 2, true),
      Challenging: plan(3, 2, 3, 3, 3, 2, true),
    },
    features: {
      Easy: ["Park", "Bus stop"],
      Intermediate: ["Traffic lights", ZEBRA, "Park", "Bus stop"],
      Challenging: ["River", "Bridge", "Railway", "Railway crossing", "Traffic lights", "Station entrance"],
    },
    look: { ground: "#eef2e8", unnamed: "#d9dde2", streetH: 58, streetV: 58, centreLine: false },
  },
};

/** Settings offered to the teacher, in order. The first is the default. */
export const ENVIRONMENT_CHOICES: EnvironmentId[] = ["downtown", "campus", "shopping", "tourist", "town"];

/**
 * The environment a teacher's setting means: one of the listed settings, or their own words
 * ("Downtown area of business sectors" is a downtown). Null when the words do not say; the AI then chooses.
 */
export function environmentFor(topic: string): EnvironmentId | null {
  const text = topic.trim().toLowerCase();
  if (!text) return "town";
  const exact = ENVIRONMENT_CHOICES.find((id) => ENVIRONMENTS[id].label.toLowerCase() === text);
  if (exact) return exact;
  // Older setting names.
  if (text === "town center" || text === "town centre") return "town";
  return ENVIRONMENT_CHOICES.find((id) => ENVIRONMENTS[id].keywords.test(text)) ?? null;
}

// ---------- Geometry ----------

export interface MapGeometry {
  width: number;
  height: number;
  streetH: number;
  streetV: number;
  /** Top edge of horizontal street Hk (k = 0-3). */
  hY: (k: number) => number;
  /** Left edge of vertical street Vk (k = 1-3). */
  vX: (k: number) => number;
  block: (row: number, col: number) => { x: number; y: number; w: number; h: number };
}

const MARGIN = 24;
const BLOCK_W = 200;
const BLOCK_H = 176;
const ROWS = 3;
const COLS = 4;

/** Sizes of the drawn map. Maps saved before environments existed use the small-town sizes. */
export function mapGeometry(environment?: EnvironmentId): MapGeometry {
  const { streetH, streetV } = ENVIRONMENTS[environment ?? "town"]?.look ?? ENVIRONMENTS.town.look;
  const hY = (k: number) => k * (BLOCK_H + streetH);
  const vX = (k: number) => MARGIN + k * BLOCK_W + (k - 1) * streetV;
  return {
    width: MARGIN * 2 + COLS * BLOCK_W + (COLS - 1) * streetV,
    height: (ROWS + 1) * streetH + ROWS * BLOCK_H,
    streetH,
    streetV,
    hY,
    vX,
    block: (row, col) => ({ x: MARGIN + (col - 1) * (BLOCK_W + streetV), y: streetH + (row - 1) * (BLOCK_H + streetH), w: BLOCK_W, h: BLOCK_H }),
  };
}
