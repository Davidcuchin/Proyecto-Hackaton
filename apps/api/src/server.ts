import { resolve } from "node:path";
import dotenv from "dotenv";
import express from "express";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const app = express();
const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT debe ser un numero entero entre 1 y 65535.");
}

app.use(express.json());
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API disponible en http://localhost:${port}`);
});
