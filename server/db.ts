import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertIdProfile, InsertUser, idProfiles, users } from "../drizzle/schema";
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
