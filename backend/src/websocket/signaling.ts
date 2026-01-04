import { Server } from "socket.io";
import { logger } from "../utils/logger";
import { getCallBillingEngine } from "../services/engineSingleton";

export function registerSignaling(io: Server) {
  io.on("connection", (socket) => {
    logger.info("Socket connected", socket.id);

    socket.on("join-call", ({ roomId, userId }) => {
      socket.join(roomId);
      socket.to(roomId).emit("user-joined", { userId });
    });

    socket.on("signal", ({ roomId, data }) => {
      socket.to(roomId).emit("signal", data);
    });

    // Client request to end a call
    socket.on("end-call", async ({ roomId, callId }) => {
      try {
        if (callId) {
          const engine = getCallBillingEngine();
          if (engine.isActive(callId)) {
            await engine.stop(callId, "ENDED");
          }
        }
      } catch (e: any) {
        logger.error("end-call error", e?.message ?? e);
      } finally {
        socket.to(roomId).emit("call-ended");
      }
    });

    socket.on("disconnect", () => {
      logger.info("Socket disconnected", socket.id);
    });
  });
}
