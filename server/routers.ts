import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createProfile, getProfileByHandle, getProfileById, getProfileByIdentifier, updateProfile } from "./db";
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
});

export type AppRouter = typeof appRouter;
