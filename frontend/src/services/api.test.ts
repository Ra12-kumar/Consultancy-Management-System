import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet, apiPost } from "./api";

// A fetch stand-in whose answers the test releases by hand.
let pending: Array<{ resolve: () => void; signal: AbortSignal | null | undefined }> = [];
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        pending.push({ resolve: () => resolve(ok({ n: pending.length })), signal: init.signal });
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("API client: shared in-flight GET requests", () => {
  it("sends one request for identical GETs made at the same time, and a fresh one afterwards", async () => {
    const a = apiGet("/counsellor/summary");
    const b = apiGet("/counsellor/summary");
    expect(fetch).toHaveBeenCalledTimes(1);
    pending[0]!.resolve();
    expect(await a).toEqual(await b);
    // Nothing is cached once the answer arrived.
    const c = apiGet("/counsellor/summary");
    expect(fetch).toHaveBeenCalledTimes(2);
    pending[1]!.resolve();
    await c;
  });

  it("never shares writes or different addresses", async () => {
    void apiPost("/leads/callback", {});
    void apiPost("/leads/callback", {});
    void apiGet("/a");
    void apiGet("/b");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("lets one caller cancel without cancelling the other; the request stops when nobody waits", async () => {
    const first = new AbortController();
    const second = new AbortController();
    const a = api("GET", "/x", { signal: first.signal });
    const b = api("GET", "/x", { signal: second.signal });
    first.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(pending[0]!.signal?.aborted).toBe(false);
    pending[0]!.resolve();
    await expect(b).resolves.toMatchObject({ data: { n: 1 } });

    const third = new AbortController();
    const c = api("GET", "/y", { signal: third.signal });
    third.abort();
    await expect(c).rejects.toMatchObject({ name: "AbortError" });
    expect(pending[1]!.signal?.aborted).toBe(true);
  });
});
