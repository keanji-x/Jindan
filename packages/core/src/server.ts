// ============================================================
// Server entry point
// ============================================================

import { ApiServer } from "./ApiServer.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const server = new ApiServer();
await server.start(port);
