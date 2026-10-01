// api/index.ts
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var idProfiles = mysqlTable("idProfiles", {
  id: int("id").autoincrement().primaryKey(),
  handle: varchar("handle", { length: 64 }).notNull().unique(),
  identifier: varchar("identifier", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  profileJson: text("profileJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var aiUsage = mysqlTable("aiUsage", {
  profileId: int("profileId").primaryKey(),
  windowStarted: timestamp("windowStarted").defaultNow().notNull(),
  requestCount: int("requestCount").default(0).notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function getProfileByHandle(handle) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.handle, handle)).limit(1);
  return result[0];
}
async function getProfileByIdentifier(identifier) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.identifier, identifier)).limit(1);
  return result[0];
}
async function getProfileById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(idProfiles).where(eq(idProfiles.id, id)).limit(1);
  return result[0];
}
async function createProfile(profile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(idProfiles).values(profile);
  return Number(result[0].insertId);
}
async function updateProfile(id, profile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(idProfiles).set(profile).where(eq(idProfiles.id, id));
}
async function consumeAiRequest(profileId, limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = (await db.select().from(aiUsage).where(eq(aiUsage.profileId, profileId)).limit(1))[0];
  const now = /* @__PURE__ */ new Date();
  const windowExpired = !current || now.getTime() - current.windowStarted.getTime() >= 24 * 60 * 60 * 1e3;
  if (windowExpired) {
    await db.insert(aiUsage).values({ profileId, windowStarted: now, requestCount: 1 }).onDuplicateKeyUpdate({ set: { windowStarted: now, requestCount: 1 } });
    return { allowed: true, count: 1, limit, resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1e3) };
  }
  if (current.requestCount >= limit) {
    return { allowed: false, count: current.requestCount, limit, resetAt: new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1e3) };
  }
  const nextCount = current.requestCount + 1;
  await db.update(aiUsage).set({ requestCount: nextCount }).where(eq(aiUsage.profileId, profileId));
  return { allowed: true, count: nextCount, limit, resetAt: new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1e3) };
}
async function getAiUsage(profileId, limit = 10) {
  const db = await getDb();
  if (!db) return { count: 0, limit, resetAt: null };
  const current = (await db.select().from(aiUsage).where(eq(aiUsage.profileId, profileId)).limit(1))[0];
  if (!current) return { count: 0, limit, resetAt: null };
  const resetAt = new Date(current.windowStarted.getTime() + 24 * 60 * 60 * 1e3);
  if (resetAt.getTime() <= Date.now()) return { count: 0, limit, resetAt: null };
  return { count: current.requestCount, limit, resetAt };
}

// server/profileAuth.ts
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
var SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
function secret() {
  return process.env.JWT_SECRET || "id4me-development-secret";
}
function normalizeIdentifier(value) {
  return value.trim().toLowerCase();
}
function normalizeHandle(value) {
  return value.trim().toLowerCase().replace(/^@/, "");
}
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function verifyPassword(password, encoded) {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function createProfileSession(profileId) {
  const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_TTL_SECONDS;
  const payload = `${profileId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}
function readProfileSession(token) {
  if (!token) return void 0;
  const [profileIdText, expiresText, signature] = token.split(".");
  if (!profileIdText || !expiresText || !signature) return void 0;
  const payload = `${profileIdText}.${expiresText}`;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return void 0;
  const profileId = Number(profileIdText);
  const expiresAt = Number(expiresText);
  if (!Number.isInteger(profileId) || expiresAt < Math.floor(Date.now() / 1e3)) return void 0;
  return profileId;
}
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return void 0;
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : void 0;
}
var PROFILE_SESSION_COOKIE = "id4me_profile_session";

// server/routers.ts
var profileInput = z2.record(z2.string(), z2.string());
var profileShape = z2.object({
  handle: z2.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  identifier: z2.string().trim().min(5).max(320),
  password: z2.string().min(8).max(200),
  profile: profileInput
});
function safeProfile(row) {
  let profile = {};
  try {
    profile = JSON.parse(row.profileJson);
  } catch {
  }
  return { handle: row.handle, profile };
}
async function enforceAiQuota(profileId) {
  const quota = await consumeAiRequest(profileId, 10);
  if (!quota.allowed) {
    throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "You have reached the 10-request AI limit. Reset after 24 hours." });
  }
  return quota;
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  profiles: router({
    publicByHandle: publicProcedure.input(z2.object({ handle: z2.string().min(3).max(64) })).query(async ({ input }) => {
      const row = await getProfileByHandle(normalizeHandle(input.handle));
      if (!row) throw new TRPCError3({ code: "NOT_FOUND", message: "This 1id4.me profile does not exist." });
      return safeProfile(row);
    }),
    session: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.profileId) return null;
      const row = await getProfileById(ctx.profileId);
      return row ? safeProfile(row) : null;
    }),
    signUp: publicProcedure.input(profileShape).mutation(async ({ input, ctx }) => {
      const handle = normalizeHandle(input.handle);
      const identifier = normalizeIdentifier(input.identifier);
      if (!/^(?:[^@\s]+@[^@\s]+\.[^@\s]+|\+?[\d\s().-]{7,})$/.test(identifier)) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Enter a valid email address or telephone number." });
      }
      if (await getProfileByHandle(handle)) throw new TRPCError3({ code: "CONFLICT", message: "That handle is already taken." });
      if (await getProfileByIdentifier(identifier)) throw new TRPCError3({ code: "CONFLICT", message: "That email or telephone number is already registered." });
      const id = await createProfile({ handle, identifier, passwordHash: hashPassword(input.password), profileJson: JSON.stringify(input.profile) });
      ctx.res.cookie(PROFILE_SESSION_COOKIE, createProfileSession(id), { ...getSessionCookieOptions(ctx.req), maxAge: 1e3 * 60 * 60 * 24 * 30 });
      return { handle, profile: input.profile };
    }),
    login: publicProcedure.input(z2.object({ identifier: z2.string().min(5), password: z2.string().min(8) })).mutation(async ({ input, ctx }) => {
      const row = await getProfileByIdentifier(normalizeIdentifier(input.identifier));
      if (!row || !verifyPassword(input.password, row.passwordHash)) throw new TRPCError3({ code: "UNAUTHORIZED", message: "The login details do not match." });
      ctx.res.cookie(PROFILE_SESSION_COOKIE, createProfileSession(row.id), { ...getSessionCookieOptions(ctx.req), maxAge: 1e3 * 60 * 60 * 24 * 30 });
      return safeProfile(row);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PROFILE_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true };
    }),
    update: publicProcedure.input(z2.object({ handle: z2.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/), identifier: z2.string().trim().min(5).max(320), profile: profileInput })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Log in to edit this profile." });
      const handle = normalizeHandle(input.handle);
      const identifier = normalizeIdentifier(input.identifier);
      const existingHandle = await getProfileByHandle(handle);
      if (existingHandle && existingHandle.id !== ctx.profileId) throw new TRPCError3({ code: "CONFLICT", message: "That handle is already taken." });
      const existingIdentifier = await getProfileByIdentifier(identifier);
      if (existingIdentifier && existingIdentifier.id !== ctx.profileId) throw new TRPCError3({ code: "CONFLICT", message: "That email or telephone number is already registered." });
      await updateProfile(ctx.profileId, { handle, identifier, profileJson: JSON.stringify(input.profile) });
      return { handle, profile: input.profile };
    })
  }),
  ai: router({
    usage: publicProcedure.query(async ({ ctx }) => ctx.profileId ? getAiUsage(ctx.profileId, 10) : null),
    polishBio: publicProcedure.input(z2.object({
      name: z2.string().max(120).optional(),
      role: z2.string().max(120).optional(),
      company: z2.string().max(160).optional(),
      project: z2.string().max(160).optional()
    })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Log in to use the AI profile assistant." });
      const quota = await enforceAiQuota(ctx.profileId);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "AI is not configured yet. Add OPENROUTER_API_KEY to enable it." });
      const prompt = [
        "Write one warm, confident link-in-bio introduction for this professional identity.",
        "Return only the introduction, no quotes, no markdown, and keep it under 160 characters.",
        `Name: ${input.name || "Not provided"}`,
        `Role: ${input.role || "Not provided"}`,
        `Company: ${input.company || "Not provided"}`,
        `Project: ${input.project || "Not provided"}`
      ].join("\n");
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://1id4.me",
          "X-Title": "1id4.me Identity Studio"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 80,
          temperature: 0.7
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[AI] OpenRouter request failed", response.status, detail.slice(0, 300));
        throw new TRPCError3({ code: response.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY", message: "The free AI service is temporarily unavailable. Try again shortly." });
      }
      const data = await response.json();
      const bio = data.choices?.[0]?.message?.content?.trim();
      if (!bio) throw new TRPCError3({ code: "BAD_GATEWAY", message: "The AI service returned an empty response." });
      return { bio: bio.replace(/^['"`]|['"`]$/g, "").slice(0, 160), quota: { count: quota.count, limit: quota.limit, resetAt: quota.resetAt } };
    }),
    extractIdScan: publicProcedure.input(z2.object({ image: z2.string().startsWith("data:image/").max(8e6) })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Log in to extract fields from an ID scan." });
      const quota = await enforceAiQuota(ctx.profileId);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "AI is not configured yet. Add OPENROUTER_API_KEY to enable it." });
      const prompt = `Extract only clearly visible identity and contact details from this ID or business-card scan. Return a single JSON object with these optional string keys: company, project, name, role, issueDate, telephone, whatsapp, email, linkedin, facebook, handle, bio. Use an ISO date (YYYY-MM-DD) when a date is unambiguous. Do not guess, do not include keys you cannot read, do not extract passwords, payment data, or government ID numbers, and return JSON only.`;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://1id4.me",
          "X-Title": "1id4.me Identity Studio"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: input.image } }] }],
          max_tokens: 300,
          temperature: 0.1
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[AI] ID scan extraction failed", response.status, detail.slice(0, 300));
        throw new TRPCError3({ code: response.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY", message: "The free AI service could not read this scan. Try a clearer image." });
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "{}";
      const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      let extracted;
      try {
        extracted = JSON.parse(jsonText);
      } catch {
        throw new TRPCError3({ code: "BAD_GATEWAY", message: "The AI returned unreadable scan results. Try a clearer image." });
      }
      const allowed = ["company", "project", "name", "role", "issueDate", "telephone", "whatsapp", "email", "linkedin", "facebook", "handle", "bio"];
      const fields = Object.fromEntries(allowed.flatMap((key) => typeof extracted[key] === "string" && extracted[key].trim() ? [[key, extracted[key].trim()]] : []));
      return { fields, quota: { count: quota.count, limit: quota.limit, resetAt: quota.resetAt } };
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret2 = ENV.cookieSecret;
    return new TextEncoder().encode(secret2);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  const profileId = readProfileSession(getCookieValue(opts.req.headers.cookie, PROFILE_SESSION_COOKIE));
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    profileId
  };
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// api/index.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service: "1id4.me" }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
