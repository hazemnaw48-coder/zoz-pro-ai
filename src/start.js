import { server } from "./server.js";
import { startRenderWorker } from "./render-worker.js";

const PORT = Number(process.env.PORT ?? 3000);
const worker = startRenderWorker();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZOZ Pro listening on http://0.0.0.0:${PORT}`);
  if (worker.status().enabled) {
    console.log("ZOZ Pro Render polling worker started.");
  }
});

function shutdown(signal) {
  console.log(`ZOZ Pro received ${signal}; shutting down cleanly.`);
  worker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
