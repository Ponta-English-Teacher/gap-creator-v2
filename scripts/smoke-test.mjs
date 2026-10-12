// Runs the first test cases against a running app (npm run dev) and saves the results.
// Usage: node scripts/smoke-test.mjs [text|map|profile|story|picture ...]
// Each case makes real OpenAI calls (picture also generates two images).
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const common = (cefr, topic, goal = "", expressions = "", pairs = 1) => ({
  cefr, topic, goal, expressions, difficulty: "Intermediate", support: "Useful expressions", pairs,
});

const CASES = {
  // Classroom pairs: 4 pairs -> 3 unique versions (pair 4 reuses version 1).
  textPairs: {
    type: "text",
    common: common("A1", "What two friends like and do not like", "", "He likes ...\nHe doesn't like ...\nDoes he like ...?", 4),
    settings: { contentType: "likes and dislikes", itemCount: 6, mainTask: "" },
  },
  picturePairs: {
    type: "picture",
    common: common("B1", "Things in a student's room", "", "", 4),
    settings: { differences: 5, differenceTypes: [] },
  },
  picture: {
    type: "picture",
    common: common("B1", "Things in a student's room", "", "A poster of a popular singer is on the wall near the window."),
    settings: { differences: 5, differenceTypes: [] },
  },
  text: {
    type: "text",
    common: common("A1", "What John and Steve like and do not like", "", "He likes ...\nHe doesn't like ...\nDoes he like ...?"),
    settings: { contentType: "likes and dislikes", itemCount: 8, mainTask: "" },
  },
  schedule: {
    type: "schedule",
    common: common("B1", "Two classmates need to meet to work on a group project this week", "Students can talk about plans and agree when to meet."),
    settings: { eventCount: 8, finalTask: "find a time when both are free" },
  },
  map: {
    type: "map",
    common: common("B1", "Downtown business district", "Ask for and give directions"),
    settings: { locationCount: 6, features: [], allowSelfCheck: true },
  },
  mapA2: {
    type: "map",
    common: common("A2", "Town center", "Ask for and give simple directions"),
    settings: { locationCount: 6, features: [], allowSelfCheck: true },
  },
  mapB1: {
    type: "map",
    common: common("B1", "Town center", "Ask for and give directions"),
    settings: { locationCount: 6, features: ["Traffic lights", "River", "Bridge", "Railway crossing"], allowSelfCheck: true },
  },
  profile: {
    type: "profile",
    common: common("B1", "Choose the best person for a café job"),
    settings: { profileType: "job applicants", profileCount: 3, categories: "", finalTask: "choose the best person" },
  },
  story: {
    type: "story",
    common: common("B1", "A student arrived late for an exam."),
    settings: { eventCount: 6, finalTask: "explain why something happened" },
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["text", "map", "profile", "story"];
mkdirSync("test-output", { recursive: true });

for (const name of wanted) {
  const started = Date.now();
  process.stdout.write(`${name}: generating... `);
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CASES[name]),
  });
  const json = await res.json();
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (!res.ok) {
    console.log(`FAILED (${res.status}, ${secs}s): ${json.error}\n  ${json.detail ?? ""}`);
    continue;
  }
  const { set } = json;
  // Keep the full set (with image data URLs) for sharing tests; save pictures as files to inspect.
  writeFileSync(`test-output/${name}.set.json`, JSON.stringify(set));
  set.versions.forEach((a, i) => {
    const v = set.versions.length > 1 ? `-v${i + 1}` : "";
    if (a.images) {
      for (const k of ["a", "b"]) writeFileSync(`test-output/${name}${v}-${k}.jpg`, Buffer.from(a.images[k].split(",")[1], "base64"));
      a.images = { a: `test-output/${name}${v}-a.jpg`, b: `test-output/${name}${v}-b.jpg` };
    }
  });
  // Single version: <name>.json is the activity itself (as before); several: the set.
  writeFileSync(`test-output/${name}.json`, JSON.stringify(set.versions.length > 1 ? set : set.versions[0], null, 2));
  console.log(`OK (${secs}s) ${set.pairCount} pair(s), ${set.versions.length} version(s): ${set.versions.map((a) => `"${a.title}"`).join(" | ")}`);
  set.versions.forEach((a, i) => {
    if (a.notes?.length) console.log(`  v${i + 1} notes:`, a.notes);
    if (a.imageError) console.log(`  v${i + 1} imageError:`, a.imageError);
  });
}
