import { randomUUID } from "node:crypto";
import type { MailJob } from "@prisma/client";
import { db } from "./db.js";
import { settings } from "./config.js";
import { qrPng } from "./qr.js";

export const mailEnabled = () => Boolean(settings.mailKey && settings.mailFrom);

async function send(job: MailJob) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.mailKey}`, "Idempotency-Key": job.id },
    body: JSON.stringify({
      from: settings.mailFrom, to: [job.recipient], subject: job.subject, text: job.body,
      ...(job.couponCode && {
        attachments: [{ filename: "cupon-impulso.png", content: qrPng(job.couponCode).toString("base64") }],
      }),
    }),
  });
  if (!response.ok) throw new Error(`El servicio de correo devolvió HTTP ${response.status}.`);
}

export function startMailWorker() {
  if (!mailEnabled()) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const eligible = {
        OR: [{ status: "QUEUED" as const, availableAt: { lte: now } }, { status: "SENDING" as const, lockedUntil: { lte: now } }],
      };
      const jobs = await db.mailJob.findMany({ where: eligible, orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: 5 });
      for (const job of jobs) {
        const leaseToken = randomUUID();
        const claim = await db.mailJob.updateMany({
          where: { id: job.id, ...eligible },
          data: { status: "SENDING", lockedUntil: new Date(Date.now() + 45_000), leaseToken, attempts: { increment: 1 } },
        });
        if (!claim.count) continue;
        const where = { id: job.id, leaseToken };
        try {
          if (job.marketingCustomerId) {
            const customer = await db.customer.findUnique({ where: { businessId_id: { businessId: job.businessId, id: job.marketingCustomerId } } });
            if (!customer?.marketingOptIn) {
              await db.mailJob.updateMany({ where, data: { status: "FAILED", lockedUntil: null, leaseToken: null } });
              continue;
            }
          }
          await send(job);
          await db.mailJob.updateMany({ where, data: { status: "SENT", sentAt: new Date(), lockedUntil: null, leaseToken: null } });
        } catch {
          const attempts = job.attempts + 1;
          await db.mailJob.updateMany({ where, data: {
            status: attempts >= 5 ? "FAILED" : "QUEUED", lockedUntil: null, leaseToken: null,
            availableAt: new Date(Date.now() + attempts * 60_000),
          } });
        }
      }
    } catch (error) {
      console.error("No se pudo procesar la cola de correo.", (error as { code?: string }).code ?? "MAIL_WORKER");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), 8_000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
