import { createHash, randomBytes } from "node:crypto";
import { Auth, type AuthConfig } from "@auth/core";
import { getToken } from "@auth/core/jwt";
import Credentials from "@auth/core/providers/credentials";
import { settings } from "./config.js";
import { db, HttpError } from "./db.js";
import { demoAccounts } from "./demo-accounts.js";
import { credentialsInput, hashPassword, verifyPassword, registrationInput } from "./passwords.js";
import type { z } from "zod";

export const sessionCookie = `${settings.secureCookies ? "__Secure-" : ""}authjs.session-token`;
const sessionAge = 7 * 86_400;
const sessionMs = sessionAge * 1_000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const demoIds = new Set<string>(demoAccounts.map(account => account.id));
const demoEmails = new Set<string>(demoAccounts.map(account => account.email));

const attempts = new Map<string, { count: number; expires: number }>();
const retryWindow = 10 * 60_000;

function allowAttempt(email: string) {
  const now = Date.now();
  const current = attempts.get(email);
  if (current && current.expires > now) {
    if (current.count >= 8) return false;
    current.count++;
    return true;
  }
  if (attempts.size >= 1_000) {
    for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
    if (attempts.size >= 1_000) return false;
  }
  attempts.set(email, { count: 1, expires: now + retryWindow });
  return true;
}

export async function registerUser(data: z.output<typeof registrationInput>) {
  if (demoEmails.has(data.email)) {
    throw new HttpError(400, "Usa una dirección de correo válida para crear la cuenta.");
  }
  return db.user.create({
    data: { email: data.email, name: data.name, passwordHash: await hashPassword(data.password) },
    select: { id: true, name: true, email: true },
  });
}

export async function newSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + sessionMs) } });
  return token;
}

async function readAuthToken(cookie: string) {
  if (!settings.authSecret || !cookie) return null;
  const token = await getToken({
    req: { headers: new Headers({ cookie }) }, secret: settings.authSecret, cookieName: sessionCookie,
    salt: sessionCookie, secureCookie: settings.secureCookies,
  });
  return typeof token?.sessionToken === "string" ? token.sessionToken : null;
}

export async function findSession(cookie: string) {
  const token = await readAuthToken(cookie);
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) }, select: { expiresAt: true,
      user: { select: { id: true, name: true, email: true } } },
  });
  if (!session || session.expiresAt <= new Date() || (!settings.demoMode && demoIds.has(session.user.id))) return null;
  return session.user;
}

async function removeSession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

const config: AuthConfig = {
  basePath: "/api/auth",
  secret: settings.authSecret,
  trustHost: true,
  useSecureCookies: settings.secureCookies,
  pages: { signIn: "/", error: "/" },
  providers: [
    Credentials({
      credentials: { email: { label: "Correo electrónico", type: "email" }, password: { label: "Contraseña", type: "password" } },
      async authorize(input, request) {
        const result = credentialsInput.safeParse(input);
        if (!result.success || !allowAttempt(result.data.email)) return null;
        const { email, password } = result.data;
        const user = await db.user.findUnique({
          where: { email }, select: { id: true, email: true, name: true, passwordHash: true },
        });
        const passwordHash = user && (settings.demoMode || !demoIds.has(user.id)) ? user.passwordHash : null;
        if (!await verifyPassword(password, passwordHash) || !user) return null;
        attempts.delete(email);
        const old = await readAuthToken(request.headers.get("cookie") ?? "");
        if (old) await removeSession(old);
        return { id: user.id, email: user.email, name: user.name, sessionToken: await newSession(user.id) };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: sessionAge },
  callbacks: {
    jwt({ token, user }) {
      if (user && "sessionToken" in user) token.sessionToken = user.sessionToken;
      return token;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sessionToken === "string") {
        await removeSession(message.token.sessionToken);
      }
    },
  },
};

export function handleAuth(request: Request) {
  if (!settings.authSecret) throw new HttpError(503, "Ejecuta npm run setup y reinicia Impulso para activar el acceso.");
  return Auth(request, config);
}

export async function memberships(userId: string) {
  const rows = await db.membership.findMany({
    where: { userId }, orderBy: [{ business: { name: "asc" } }, { businessId: "asc" }],
    include: { business: true },
  });
  return rows.map(({ business, role }) => ({ id: business.id, slug: business.slug, name: business.name, logoPath: business.logoPath, role }));
}
