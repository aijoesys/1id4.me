import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { consumeAiRequest, createProfile, getAiUsage, getProfileByHandle, getProfileById, getProfileByIdentifier, updateProfile } from "./db";
import { createProfileSession, getCookieValue, hashPassword, normalizeHandle, normalizeIdentifier, PROFILE_SESSION_COOKIE, verifyPassword } from "./profileAuth";

const profileInput = z.record(z.string(), z.string());
const profileShape = z.object({
  handle: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  identifier: z.string().trim().min(5).max(320),
  password: z.string().min(8).max(200),
  profile: profileInput,
});

function safeProfile(row: NonNullable<Awaited<ReturnType<typeof getProfileByHandle>>>) {
  let profile: Record<string, string> = {};
  try { profile = JSON.parse(row.profileJson) as Record<string, string>; } catch { /* invalid legacy data */ }
  return { handle: row.handle, profile };
}

async function enforceAiQuota(profileId: number) {
  const quota = await consumeAiRequest(profileId, 10);
  if (!quota.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You have reached the 10-request AI limit. Reset after 24 hours." });
  }
  return quota;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profiles: router({
    publicByHandle: publicProcedure.input(z.object({ handle: z.string().min(3).max(64) })).query(async ({ input }) => {
      const row = await getProfileByHandle(normalizeHandle(input.handle));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "This 1id4.me profile does not exist." });
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid email address or telephone number." });
      }
      if (await getProfileByHandle(handle)) throw new TRPCError({ code: "CONFLICT", message: "That handle is already taken." });
      if (await getProfileByIdentifier(identifier)) throw new TRPCError({ code: "CONFLICT", message: "That email or telephone number is already registered." });
      const id = await createProfile({ handle, identifier, passwordHash: hashPassword(input.password), profileJson: JSON.stringify(input.profile) });
      ctx.res.cookie(PROFILE_SESSION_COOKIE, createProfileSession(id), { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { handle, profile: input.profile };
    }),
    login: publicProcedure.input(z.object({ identifier: z.string().min(5), password: z.string().min(8) })).mutation(async ({ input, ctx }) => {
      const row = await getProfileByIdentifier(normalizeIdentifier(input.identifier));
      if (!row || !verifyPassword(input.password, row.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "The login details do not match." });
      ctx.res.cookie(PROFILE_SESSION_COOKIE, createProfileSession(row.id), { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return safeProfile(row);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PROFILE_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
    update: publicProcedure.input(z.object({ handle: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/), identifier: z.string().trim().min(5).max(320), profile: profileInput })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Log in to edit this profile." });
      const handle = normalizeHandle(input.handle);
      const identifier = normalizeIdentifier(input.identifier);
      const existingHandle = await getProfileByHandle(handle);
      if (existingHandle && existingHandle.id !== ctx.profileId) throw new TRPCError({ code: "CONFLICT", message: "That handle is already taken." });
      const existingIdentifier = await getProfileByIdentifier(identifier);
      if (existingIdentifier && existingIdentifier.id !== ctx.profileId) throw new TRPCError({ code: "CONFLICT", message: "That email or telephone number is already registered." });
      await updateProfile(ctx.profileId, { handle, identifier, profileJson: JSON.stringify(input.profile) });
      return { handle, profile: input.profile };
    }),
  }),
  ai: router({
    usage: publicProcedure.query(async ({ ctx }) => ctx.profileId ? getAiUsage(ctx.profileId, 10) : null),
    polishBio: publicProcedure.input(z.object({
      name: z.string().max(120).optional(),
      role: z.string().max(120).optional(),
      company: z.string().max(160).optional(),
      project: z.string().max(160).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Log in to use the AI profile assistant." });
      const quota = await enforceAiQuota(ctx.profileId);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI is not configured yet. Add OPENROUTER_API_KEY to enable it." });
      const prompt = [
        "Write one warm, confident link-in-bio introduction for this professional identity.",
        "Return only the introduction, no quotes, no markdown, and keep it under 160 characters.",
        `Name: ${input.name || "Not provided"}`,
        `Role: ${input.role || "Not provided"}`,
        `Company: ${input.company || "Not provided"}`,
        `Project: ${input.project || "Not provided"}`,
      ].join("\n");
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://1id4.me",
          "X-Title": "1id4.me Identity Studio",
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 80,
          temperature: 0.7,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[AI] OpenRouter request failed", response.status, detail.slice(0, 300));
        throw new TRPCError({ code: response.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY", message: "The free AI service is temporarily unavailable. Try again shortly." });
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const bio = data.choices?.[0]?.message?.content?.trim();
      if (!bio) throw new TRPCError({ code: "BAD_GATEWAY", message: "The AI service returned an empty response." });
      return { bio: bio.replace(/^['"`]|['"`]$/g, "").slice(0, 160), quota: { count: quota.count, limit: quota.limit, resetAt: quota.resetAt } };
    }),
    extractIdScan: publicProcedure.input(z.object({ image: z.string().startsWith("data:image/").max(8_000_000) })).mutation(async ({ input, ctx }) => {
      if (!ctx.profileId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Log in to extract fields from an ID scan." });
      const quota = await enforceAiQuota(ctx.profileId);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI is not configured yet. Add OPENROUTER_API_KEY to enable it." });
      const prompt = `Extract only clearly visible identity and contact details from this ID or business-card scan. Return a single JSON object with these optional string keys: company, project, name, role, issueDate, telephone, whatsapp, email, linkedin, facebook, handle, bio. Use an ISO date (YYYY-MM-DD) when a date is unambiguous. Do not guess, do not include keys you cannot read, do not extract passwords, payment data, or government ID numbers, and return JSON only.`;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://1id4.me",
          "X-Title": "1id4.me Identity Studio",
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: input.image } }] }],
          max_tokens: 300,
          temperature: 0.1,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[AI] ID scan extraction failed", response.status, detail.slice(0, 300));
        throw new TRPCError({ code: response.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY", message: "The free AI service could not read this scan. Try a clearer image." });
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim() || "{}";
      const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      let extracted: Record<string, unknown>;
      try { extracted = JSON.parse(jsonText) as Record<string, unknown>; }
      catch { throw new TRPCError({ code: "BAD_GATEWAY", message: "The AI returned unreadable scan results. Try a clearer image." }); }
      const allowed = ["company", "project", "name", "role", "issueDate", "telephone", "whatsapp", "email", "linkedin", "facebook", "handle", "bio"];
      const fields = Object.fromEntries(allowed.flatMap((key) => typeof extracted[key] === "string" && extracted[key].trim() ? [[key, extracted[key].trim()]] : []));
      return { fields, quota: { count: quota.count, limit: quota.limit, resetAt: quota.resetAt } };
    }),
  }),
});

export type AppRouter = typeof appRouter;
