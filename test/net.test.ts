import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { defaultBackoff, fetchWithRetry, isRetryableStatus } from "../src/net.js";

const noBackoff = () => 1;
let server: http.Server | null = null;

function startServer(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`);
    });
  });
}

afterEach(() => {
  server?.close();
  server?.closeAllConnections();
  server = null;
});

describe("isRetryableStatus", () => {
  it("retries 408/429/5xx and nothing else", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });
});

describe("defaultBackoff", () => {
  it("grows exponentially and caps at 8s plus jitter", () => {
    expect(defaultBackoff(0)).toBeGreaterThanOrEqual(1000);
    expect(defaultBackoff(0)).toBeLessThan(1250);
    expect(defaultBackoff(10)).toBeLessThan(8250);
  });
});

describe("fetchWithRetry", () => {
  it("retries through transient 5xx and returns the eventual success", async () => {
    let attempts = 0;
    const base = await startServer((_req, res) => {
      attempts += 1;
      if (attempts < 3) {
        res.writeHead(500).end("boom");
        return;
      }
      res.writeHead(200).end("ok");
    });
    const res = await fetchWithRetry(`${base}/x`, undefined, { backoff: noBackoff });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable statuses", async () => {
    let attempts = 0;
    const base = await startServer((_req, res) => {
      attempts += 1;
      res.writeHead(404).end("nope");
    });
    const res = await fetchWithRetry(`${base}/x`, undefined, { backoff: noBackoff });
    expect(res.status).toBe(404);
    expect(attempts).toBe(1);
  });

  it("returns the last retryable response once retries are exhausted", async () => {
    let attempts = 0;
    const base = await startServer((_req, res) => {
      attempts += 1;
      res.writeHead(503).end("still down");
    });
    const res = await fetchWithRetry(`${base}/x`, undefined, { retries: 2, backoff: noBackoff });
    expect(res.status).toBe(503);
    expect(attempts).toBe(3);
  });

  it("retries connection errors and reports the attempt count when all fail", async () => {
    // Grab a port that is definitely closed.
    const base = await startServer((_req, res) => res.end());
    const closed = base;
    await new Promise((r) => server!.close(r));
    server = null;
    await expect(fetchWithRetry(`${closed}/x`, undefined, { retries: 1, backoff: noBackoff })).rejects.toThrow(
      /failed after 2 attempts/,
    );
  });

  it("times out a hung response", async () => {
    const base = await startServer(() => {
      // Never respond.
    });
    await expect(
      fetchWithRetry(`${base}/x`, undefined, { retries: 0, timeoutMs: 200, backoff: noBackoff }),
    ).rejects.toThrow(/failed after 1 attempts/);
  });
});
