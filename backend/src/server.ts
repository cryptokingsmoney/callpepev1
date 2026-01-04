import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { ENV } from "./config/env";
import { registerSignaling } from "./websocket/signaling";
import { logger } from "./utils/logger";
import { PrismaClient } from "@prisma/client";
import { initCallBillingEngine } from "./services/engineSingleton";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const prisma = new PrismaClient();
initCallBillingEngine(io, prisma);
registerSignaling(io);

server.listen(ENV.PORT, () => {
  logger.info(`CallPepe backend listening on port ${ENV.PORT}`);
});
