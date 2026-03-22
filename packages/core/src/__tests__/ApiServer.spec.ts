import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiServer } from "../ApiServer.js";

function fetchJson(
  url: string,
  method = "GET",
  body?: any,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    const req = http.request(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 500, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("ApiServer", () => {
  let server: ApiServer;
  const PORT = 3010;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test_secret";
    server = new ApiServer();
    await server.start(PORT);
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should return world status via /world/status", async () => {
    const res = await fetchJson(`http://127.0.0.1:${PORT}/world/status`);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("tick");
    expect(res.data).toHaveProperty("daoTanks");
    expect(res.data).toHaveProperty("entities");
  });

  it("should return empty entities via GET /entities", async () => {
    const res = await fetchJson(`http://127.0.0.1:${PORT}/entities`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("should require entityId for /char/attach", async () => {
    const res = await fetchJson(`http://127.0.0.1:${PORT}/char/attach`, "POST", {});
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/entityId is required/);
  });

  it("should block POST /entity/123/report without agent secret", async () => {
    const res = await fetchJson(`http://127.0.0.1:${PORT}/entity/123/report`, "POST", {
      text: "hello",
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/Agent secret required/);
  });

  it("should handle CORS OPTIONS preflight", async () => {
    const req = http.request(`http://127.0.0.1:${PORT}/entities`, { method: "OPTIONS" });
    const resPromise = new Promise<http.IncomingMessage>((resolve) => req.on("response", resolve));
    req.end();
    const res = await resPromise;
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toBeDefined();
  });
});
