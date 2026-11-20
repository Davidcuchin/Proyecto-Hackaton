import "./config.js";
import { Prisma, PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";

export const db = new PrismaClient();

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 4) throw new HttpError(409, "Hubo cambios simultáneos. Intenta nuevamente.");
      await delay(12 * (attempt + 1) + Math.random() * 15);
    }
  }
}
