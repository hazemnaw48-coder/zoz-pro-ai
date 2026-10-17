import { server } from "./server.js";

const PORT = Number(process.env.PORT ?? 8080);

server.listen(PORT, "0.0.0.0", () => {
  console.log("ZOZ Pro Cloud Run service listening.");
});

// Cloud Run request-based instances scale to zero. Commands are processed in-band
// and pending safe work is swept once on the first API request, not continuously.
process.once("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.once("SIGINT", () => {
  server.close(() => process.exit(0));
});
