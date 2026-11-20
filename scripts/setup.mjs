import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const env = new URL("../api/.env", import.meta.url);
const secret = `AUTH_SECRET=${randomBytes(32).toString("base64url")}`;

try {
  const current = await readFile(env, "utf8");
  if (/^\s*AUTH_SECRET[ \t]*=[ \t]*\S/m.test(current)) {
    console.log("Se conservó api/.env");
  } else {
    const updated = current.replace(/^[ \t]*AUTH_SECRET[ \t]*=[ \t]*(?:\r)?$/m, secret);
    await writeFile(env, updated === current ? `${current.trimEnd()}\n${secret}\n` : updated);
    console.log("Se agregó la clave de sesión a api/.env");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const example = await readFile(new URL("../api/.env.example", import.meta.url), "utf8");
  await writeFile(env, example.replace(/^AUTH_SECRET=.*$/m, secret), { flag: "wx", mode: 0o600 });
  console.log("Configuración local creada en api/.env");
}
