import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { InMemorySupabaseStore, createMockSupabaseClients } from "./helpers/mockSupabase";

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function MockGoogleGenAI() {
    return {
      models: { generateContent: vi.fn() },
    };
  }),
  Type: {
    OBJECT: "OBJECT",
    STRING: "STRING",
    NUMBER: "NUMBER",
    BOOLEAN: "BOOLEAN",
    ARRAY: "ARRAY",
  },
}));

import app, {
  __setSupabaseClientsForTest,
  __resetTestState,
  WEB_PRODUCTS,
} from "../api/app";

describe("Phase 2: Web Payments Integrity, Idempotency (100/101/granted_at), Failed->Paid Recovery & /recheck", () => {
  const store = new InMemorySupabaseStore();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WEB_ONLY = "true";
    process.env.DISABLE_LEGACY_PAYMENT = "true";
    process.env.ZARINPAL_MERCHANT_ID = "12345678-1234-1234-1234-123456789012";
    process.env.APP_URL = "https://tahlil-yar.ir";

    store.reset();
    __resetTestState();
    const { serviceClient, authClient } = createMockSupabaseClients(store);
    __setSupabaseClientsForTest(serviceClient, authClient);
    global.fetch = originalFetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    __setSupabaseClientsForTest(null, null);
  });

  it("reads price strictly from WEB_PRODUCTS, rejects unauthenticated pack_10/annual (401), allows single guest with deviceId", async () => {
    const unauthPack = await request(app)
      .post("/api/web/payment/request")
      .send({ product: "pack_10", deviceId: crypto.randomUUID() });
    expect(unauthPack.status).toBe(401);

    const authority = "A00000000000000000000000000000000100";
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: { code: 100, authority } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    const devId = crypto.randomUUID();
    const guestSingle = await request(app)
      .post("/api/web/payment/request")
      .send({ product: "single", deviceId: devId, amount: 1 }); // spoofed client amount ignored

    expect(guestSingle.status).toBe(200);
    expect(guestSingle.body.amount_rials).toBe(WEB_PRODUCTS.single.amountRials);
    expect(capturedBody.amount).toBe(WEB_PRODUCTS.single.amountRials);
    expect(guestSingle.body.paymentUrl).toBe(`https://www.zarinpal.com/pg/StartPay/${authority}`);
  });

  it("grants pack_10 credits EXACTLY ONCE across Zarinpal code 100, duplicate callback, and code 101 via granted_at atomic lock", async () => {
    const user = store.seedUser({ email: "buyer@example.com", credits: 2 });
    const authority = "A00000000000000000000000000000000200";
    const order = store.seedPayment({
      user_id: user.id,
      product: "pack_10",
      status: "pending",
      amount_rials: WEB_PRODUCTS.pack_10.amountRials,
      authority,
    });

    // 1) Callback verify returns Zarinpal code 100
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { code: 100, ref_id: 991122 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const cb1 = await request(app)
      .get("/api/web/payment/verify")
      .query({ Authority: authority, Status: "OK" });
    expect(cb1.status).toBe(302);
    expect(cb1.headers.location).toBe(`/?payment=success&order_id=${order.id}`);

    // 2) Duplicate callback -> must NOT double-grant!
    const cb2 = await request(app)
      .get("/api/web/payment/verify")
      .query({ Authority: authority, Status: "OK" });
    expect(cb2.status).toBe(302);

    // 3) Simulate concurrent code 101 on another order where status is pending
    const authority101 = "A00000000000000000000000000000000101";
    const order101 = store.seedPayment({
      user_id: user.id,
      product: "pack_10",
      status: "pending",
      amount_rials: WEB_PRODUCTS.pack_10.amountRials,
      authority: authority101,
    });

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { code: 101, ref_id: 554433 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    // Concurrent verify + recheck (>60s) on order101 -> granted_at guarantees grant happens ONLY ONCE!
    order101.created_at = new Date(Date.now() - 120_000).toISOString();
    const [rVerify, rRecheck] = await Promise.all([
      request(app).get("/api/web/payment/verify").query({ Authority: authority101, Status: "OK" }),
      request(app)
        .post("/api/web/payment/recheck")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({ order_id: order101.id }),
    ]);

    expect(rVerify.status).toBe(302);
    expect(rRecheck.status).toBe(200);
    expect(rRecheck.body.status).toBe("paid");

    // 2 initial + 10 (order) + 10 (order101) = 22 (zero double-grants!)
    const prof = store.tables.profiles.find((p) => p.id === user.id);
    expect(prof.credits).toBe(22);
    expect(order.granted_at).toBeTruthy();
    expect(order101.granted_at).toBeTruthy();
  });

  it("rejects fake authority callbacks and enforces ownership checks on /status and /recheck", async () => {
    const owner = store.seedUser({ email: "owner@example.com" });
    const attacker = store.seedUser({ email: "attacker@example.com" });
    const order = store.seedPayment({
      user_id: owner.id,
      product: "annual",
      status: "pending",
      amount_rials: WEB_PRODUCTS.annual.amountRials,
      authority: "A00000000000000000000000000000000300",
    });

    const fakeCb = await request(app)
      .get("/api/web/payment/verify")
      .query({ Authority: "invalid_auth", Status: "OK" });
    expect(fakeCb.status).toBe(302);
    expect(fakeCb.headers.location).toBe("/?payment=failed");

    const attackerStatus = await request(app)
      .get("/api/web/payment/status")
      .set("Authorization", `Bearer ${attacker.accessToken}`)
      .query({ order_id: order.id });
    expect(attackerStatus.status).toBe(403);

    const attackerRecheck = await request(app)
      .post("/api/web/payment/recheck")
      .set("Authorization", `Bearer ${attacker.accessToken}`)
      .send({ order_id: order.id });
    expect(attackerRecheck.status).toBe(403);
  });

  it("supports failed -> paid recovery via POST /api/web/payment/recheck after 60s wait", async () => {
    const devId = crypto.randomUUID();
    const order = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "failed",
      amount_rials: WEB_PRODUCTS.single.amountRials,
      authority: "A00000000000000000000000000000000400",
      created_at: new Date(Date.now() - 10_000).toISOString(), // only 10s old
    });

    // Too early -> 400 TOO_EARLY
    const earlyRes = await request(app)
      .post("/api/web/payment/recheck")
      .send({ order_id: order.id, deviceId: devId });
    expect(earlyRes.status).toBe(400);
    expect(earlyRes.body.error).toBe("TOO_EARLY");

    // Age > 60s -> Zarinpal now confirms code 100
    order.created_at = new Date(Date.now() - 90_000).toISOString();
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { code: 100, ref_id: 778899 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const recoverRes = await request(app)
      .post("/api/web/payment/recheck")
      .send({ order_id: order.id, deviceId: devId });

    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.status).toBe("paid");
    expect(recoverRes.body.ref_id).toBe("778899");
    expect(recoverRes.body.entitlement_token).toBe(order.entitlement_token);
  });

  it("lists user orders and recovers guest single entitlement token via GET /api/web/orders", async () => {
    const devId = crypto.randomUUID();
    const order = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
      ref_id: "334455",
    });

    const listRes = await request(app)
      .get("/api/web/orders")
      .query({ deviceId: devId, order_id: order.id });

    expect(listRes.status).toBe(200);
    expect(listRes.body.orders).toHaveLength(1);
    expect(listRes.body.orders[0].entitlement_token).toBe(order.entitlement_token);
  });
});
