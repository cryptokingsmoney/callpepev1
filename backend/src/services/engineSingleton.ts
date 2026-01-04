import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { CallBillingEngine } from "./callBillingEngine";

let engine: CallBillingEngine | null = null;

export function initCallBillingEngine(io: Server, prisma: PrismaClient) {
  engine = new CallBillingEngine(prisma, io);
  return engine;
}

export function getCallBillingEngine() {
  if (!engine) throw new Error("CallBillingEngine not initialized");
  return engine;
}
