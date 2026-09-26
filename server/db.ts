import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { aiUsage, InsertIdProfile, InsertUser, idProfiles, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getProfileByHandle(handle: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.handle, handle)).limit(1);
  return result[0];
}

export async function getProfileByIdentifier(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.identifier, identifier)).limit(1);
  return result[0];
}

export async function getProfileById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.id, id)).limit(1);
  return result[0];
}

export async function createProfile(profile: InsertIdProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(idProfiles).values(profile);
  return Number(result[0].insertId);
}

export async function updateProfile(id: number, profile: Pick<InsertIdProfile, "handle" | "identifier" | "profileJson">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(idProfiles).set(profile).where(eq(idProfiles.id, id));
}

export async function consumeAiRequest(profileId: number, limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = (await db.select().from(aiUsage).where(eq(aiUsage.profileId, profileId)).limit(1))[0];
  const now = new Date();
  const windowExpired = !current || now.getTime() - current.windowStarted.getTime() >= 24 * 60 * 60 * 1000;
  if (windowExpired) {
    await db.insert(aiUsage).values({ profileId, windowStarted: now, requestCount: 1 }).onDuplicateKeyUpdate({ set: { windowStarted: now, requestCount: 1 } });
    return { allowed: true, count: 1, limit, resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
  }
  if (current.requestCount >= limit) {
    return { allowed: false, count: current.requestCount, limit, resetAt: new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1000) };
  }
  const nextCount = current.requestCount + 1;
  await db.update(aiUsage).set({ requestCount: nextCount }).where(eq(aiUsage.profileId, profileId));
  return { allowed: true, count: nextCount, limit, resetAt: new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1000) };
}

export async function getAiUsage(profileId: number, limit = 10) {
  const db = await getDb();
  if (!db) return { count: 0, limit, resetAt: null };
  const current = (await db.select().from(aiUsage).where(eq(aiUsage.profileId, profileId)).limit(1))[0];
  if (!current) return { count: 0, limit, resetAt: null };
  const resetAt = new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1000);
  if (resetAt.getTime() <= Date.now()) return { count: 0, limit, resetAt: null };
  return { count: current.requestCount, limit, resetAt };
}
