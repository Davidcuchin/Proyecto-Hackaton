import { db } from "./db.js";
import { settings } from "./config.js";
import { createApp } from "./http.js";
import { startMailWorker } from "./mail.js";

const server = createApp().listen(settings.apiPort, settings.apiHost, () => {
  console.log(`API en http://${settings.apiHost}:${settings.apiPort}/api/v1`);
});
const stopMail = startMailWorker();
const cleanup = setInterval(() => {
  void db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }).catch(() => {});
}, 60 * 60_000);
cleanup.unref();

function stop() {
  stopMail();
  clearInterval(cleanup);
  server.close(() => void db.$disconnect());
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
