import { server } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZOZ Pro listening on http://0.0.0.0:${PORT}`);
});
