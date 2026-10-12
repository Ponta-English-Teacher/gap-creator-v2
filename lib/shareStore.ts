/**
 * Temporary storage for shared activities.
 *
 * Every shared activity is stored as up to three files under one key prefix:
 *   shared/<id>/activity.json   (the full activity, incl. answer key: server-only)
 *   shared/<id>/a.jpg, b.jpg    (Picture Gap only)
 *
 * Where the files go:
 *   - Vercel Blob (private store) when Blob credentials are present
 *     (BLOB_STORE_ID, added by Vercel when a store is connected, or BLOB_READ_WRITE_TOKEN).
 *   - Otherwise the local disk: .data/shared/... (local development).
 *
 * Expiry: an activity stops opening after SHARE_DAYS. Old files are deleted
 * opportunistically whenever a new activity is shared (no scheduler).
 */
import { del, get, list, put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChooseOneData } from "./activitySchemas";
import type { Activity, ActivitySet } from "./types";

export const SHARE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (0/o, 1/l/i)
const ID_PATTERN = /^[a-z0-9]{8}$/;

// ---------- The two storage backends (same four operations) ----------

interface Storage {
  write(key: string, body: Buffer | string, contentType: string): Promise<void>;
  /** Returns null when the file does not exist. */
  read(key: string): Promise<Buffer | null>;
  removeActivity(id: string): Promise<void>;
  /** Deletes activities uploaded before the cutoff (best effort). */
  removeOlderThan(cutoff: Date): Promise<void>;
}

const LOCAL_ROOT = path.join(process.cwd(), ".data");

const localStorage: Storage = {
  async write(key, body) {
    const file = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  },
  async read(key) {
    try {
      return await readFile(path.join(LOCAL_ROOT, key));
    } catch {
      return null;
    }
  },
  async removeActivity(id) {
    await rm(path.join(LOCAL_ROOT, "shared", id), { recursive: true, force: true });
  },
  async removeOlderThan(cutoff) {
    const root = path.join(LOCAL_ROOT, "shared");
    const ids = await readdir(root).catch(() => [] as string[]);
    for (const id of ids) {
      const info = await stat(path.join(root, id, "activity.json")).catch(() => null);
      if (!info || info.mtime < cutoff) await localStorage.removeActivity(id);
    }
  },
};

const blobStorage: Storage = {
  async write(key, body, contentType) {
    await put(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  },
  async read(key) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async removeActivity(id) {
    const { blobs } = await list({ prefix: `shared/${id}/` });
    if (blobs.length) await del(blobs.map((b) => b.url));
  },
  async removeOlderThan(cutoff) {
    // One page (up to 1000 files) per call keeps this cheap; later shares continue the cleanup.
    const { blobs } = await list({ prefix: "shared/", limit: 1000 });
    const old = blobs.filter((b) => b.uploadedAt < cutoff).map((b) => b.url);
    if (old.length) await del(old);
  },
};

export function storageKind(): "vercel-blob" | "local" {
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  if (process.env.VERCEL) {
    // Vercel's disk is temporary, so local files would silently disappear.
    throw new Error("No Vercel Blob store is connected to this project. Connect a private Blob store in the Vercel dashboard (Storage).");
  }
  return "local";
}

function storage(): Storage {
  return storageKind() === "vercel-blob" ? blobStorage : localStorage;
}

// ---------- Shared activities ----------

interface StoredFile {
  expiresAt: string;
  /** Picture Gap images are replaced by picture names, e.g. { a: "v2-a", b: "v2-b" }. */
  set?: ActivitySet;
  /** Links shared before classroom pairs existed: one activity, pictures "a" / "b". */
  activity?: Activity;
}

/** Picture names: "a"/"b" (older links), "v{version}-a"/"v{version}-b", or "v{version}-o{option}" (Make the Best Choice). */
const PICTURE_NAME = /^(v\d{1,2}-)?[ab]$|^v\d{1,2}-o\d{1,2}$/;

/** Activities whose options have pictures (Make the Best Choice, Choose One). */
const hasOptionPictures = (activity: Activity): activity is Extract<Activity, { type: "profile" }> & { data: ChooseOneData } =>
  activity.type === "profile" && "format" in activity.data && activity.data.format === "choose-one";

function newId(): string {
  return Array.from(randomBytes(8), (b) => ID_CHARS[b % ID_CHARS.length]).join("");
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Picture is not a valid image data URL.");
  return Buffer.from(match[2], "base64");
}

/** Saves an activity set (all versions) and returns its short id. */
export async function saveSharedSet(set: ActivitySet): Promise<string> {
  const store = storage();
  // Opportunistic cleanup; a failure here must not stop the teacher from sharing.
  await store.removeOlderThan(new Date(Date.now() - SHARE_DAYS * DAY_MS)).catch((err) => console.error("[share] cleanup", err));

  const id = newId();
  const versions: Activity[] = [];
  for (const [i, activity] of set.versions.entries()) {
    if (hasOptionPictures(activity)) {
      // Each option's picture becomes a stored file; an option without one is shared without a picture.
      const options = [];
      for (const [k, option] of activity.data.options.entries()) {
        const name = `v${i + 1}-o${k + 1}`;
        if (option.picture?.startsWith("data:")) await store.write(`shared/${id}/${name}.jpg`, dataUrlToBuffer(option.picture), "image/jpeg");
        options.push({ ...option, picture: option.picture?.startsWith("data:") ? name : undefined });
      }
      versions.push({ ...activity, data: { ...activity.data, options }, pictureError: undefined });
      continue;
    }
    if (activity.type !== "picture") {
      versions.push(activity);
      continue;
    }
    if (!activity.images) throw new Error(`Draw the pictures for version ${i + 1} before sharing.`);
    const names = { a: `v${i + 1}-a`, b: `v${i + 1}-b` };
    await store.write(`shared/${id}/${names.a}.jpg`, dataUrlToBuffer(activity.images.a), "image/jpeg");
    await store.write(`shared/${id}/${names.b}.jpg`, dataUrlToBuffer(activity.images.b), "image/jpeg");
    versions.push({ ...activity, images: names, imageError: undefined });
  }
  const file: StoredFile = {
    expiresAt: new Date(Date.now() + SHARE_DAYS * DAY_MS).toISOString(),
    set: { pairCount: set.pairCount, versions },
  };
  // Written last, so an activity only "exists" once its pictures are stored.
  await store.write(`shared/${id}/activity.json`, JSON.stringify(file), "application/json");
  return id;
}

/** Loads a shared set, or null if it is missing or expired. Picture URLs point to the image route. */
export async function loadSharedSet(id: string): Promise<{ set: ActivitySet; expiresAt: string } | null> {
  if (!ID_PATTERN.test(id)) return null;
  const store = storage();
  const raw = await store.read(`shared/${id}/activity.json`);
  if (!raw) return null;
  const file = JSON.parse(raw.toString("utf8")) as StoredFile;
  if (new Date(file.expiresAt).getTime() < Date.now()) {
    await store.removeActivity(id).catch(() => {});
    return null;
  }
  const set: ActivitySet = file.set ?? { pairCount: 1, versions: file.activity ? [file.activity] : [] };
  for (const activity of set.versions) {
    if (activity.type === "picture" && activity.images) {
      const name = (n: string) => `/activity/${id}/image/${n.replace(/\.jpg$/, "")}`;
      activity.images = { a: name(activity.images.a), b: name(activity.images.b) };
    }
    if (hasOptionPictures(activity))
      activity.data.options = activity.data.options.map((o) => ({ ...o, picture: o.picture && PICTURE_NAME.test(o.picture) ? `/activity/${id}/image/${o.picture}` : undefined }));
  }
  return set.versions.length ? { set, expiresAt: file.expiresAt } : null;
}

/** Reads a stored picture ("a", "b", "v2-a", ...), or null if missing/expired. */
export async function loadSharedImage(id: string, name: string): Promise<Buffer | null> {
  if (!PICTURE_NAME.test(name)) return null;
  if (!(await loadSharedSet(id))) return null; // also enforces expiry
  return storage().read(`shared/${id}/${name}.jpg`);
}
