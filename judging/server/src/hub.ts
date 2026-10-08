import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { Bus } from "./bus";
import type { Metrics } from "./metrics";

/** Clients subscribe with `?channel=event:{id}:board`. The bus is the only fan-out. */
export function attachHub(server: Server, bus: Bus, metrics: Metrics) {
  const sockets = new WebSocketServer({ server, path: "/ws" });
  sockets.on("connection", (socket, request) => {
    const channel = new URL(request.url ?? "/", "http://localhost").searchParams.get(
      "channel",
    );
    metrics.wsConnections.inc();
    if (!channel) {
      socket.close();
      metrics.wsConnections.dec();
      return;
    }
    const unsubscribe = bus.subscribe(channel, (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    });
    socket.on("close", () => {
      unsubscribe();
      metrics.wsConnections.dec();
    });
  });
  bus.onDown(() => {
    for (const client of sockets.clients) client.close();
  });
  return sockets;
}
