import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const options = { N: 32_768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const keyLength = 64;
const fallbackSalt = Buffer.alloc(16);
const fallbackKey = Buffer.alloc(keyLength);
const email = z.email().trim().max(254).transform(value => value.toLowerCase());

export const credentialsInput = z.object({ email, password: z.string().min(1).max(128) });
export const registrationInput = z.object({
  email, password: z.string().min(12).max(128), name: z.string().trim().min(2).max(120),
}).strict();

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const parsed = stored?.match(/^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/);
  const salt = parsed ? Buffer.from(parsed[1], "hex") : fallbackSalt;
  const expected = parsed ? Buffer.from(parsed[2], "hex") : fallbackKey;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(parsed);
}
