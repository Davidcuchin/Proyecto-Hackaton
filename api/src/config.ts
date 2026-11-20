import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";

dotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:4317");
const apiHost = process.env.API_HOST ?? "127.0.0.1";
const loopbackHosts = ["localhost", "127.0.0.1"];
const localDevelopment = process.env.NODE_ENV !== "production" &&
  loopbackHosts.includes(origin.hostname) && [...loopbackHosts, "::1"].includes(apiHost);
export const settings = {
  appOrigin: origin.origin,
  secureCookies: origin.protocol === "https:",
  apiHost,
  apiPort: Number(process.env.API_PORT ?? 4318),
  demoMode: process.env.DEMO_MODE === "true" && localDevelopment,
  localAppHosts: localDevelopment && origin.protocol === "http:"
    ? loopbackHosts.map(host => origin.port ? `${host}:${origin.port}` : host)
    : [],
  authSecret: process.env.AUTH_SECRET,
  mailKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  llmBase: process.env.LLM_BASE_URL,
  llmKey: process.env.LLM_API_KEY,
  llmModel: process.env.LLM_MODEL,
};
