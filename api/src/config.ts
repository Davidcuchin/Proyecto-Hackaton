import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";

dotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:4317");
const apiHost = process.env.API_HOST ?? "127.0.0.1";
export const settings = {
  appOrigin: origin.origin,
  secureCookies: origin.protocol === "https:",
  apiHost,
  apiPort: Number(process.env.API_PORT ?? 4318),
  demoMode: process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(origin.hostname) && ["localhost", "127.0.0.1", "::1"].includes(apiHost),
  authSecret: process.env.AUTH_SECRET,
  mailKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  llmBase: process.env.LLM_BASE_URL,
  llmKey: process.env.LLM_API_KEY,
  llmModel: process.env.LLM_MODEL,
};
