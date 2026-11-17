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

import app, { __setSupabaseClientsForTest, __resetTestState } from "../api/app";

function signPoolakeyReceipt(privateKeyPem: string, receiptObj: Record<string, any>) {
  const signedData = JSON.stringify(receiptObj);
  const signer = crypto.createSign("RSA-SHA1");
  signer.update(signedData, "utf8");
  const signature = signer.sign(privateKeyPem, "base64");
  return { signedData, signature };
}

describe("Phase 1B Hotfix: Android Purchase Verification & Hardened Legacy Zarinpal", () => {
  const store = new InMemorySupabaseStore();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let publicKeyPem = "";
  let privateKeyPem = "";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DISABLE_LEGACY_PAYMENT = "false";
    process.env.WEB_ONLY = "false";

    const kp = crypto.generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKeyPem = kp.publicKey;
    privateKeyPem = kp.privateKey;
    process.env.BAZAAR_RSA_PUBLIC_KEY = publicKeyPem;

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

  it("rejects forged / activate-premium and /buy-coins calls without valid RSA signature or store verification (403)", async () => {
    const devId = crypto.randomUUID();

    const missingSigRes = await request(app)
      .post("/api/activate-premium")
      .send({
        deviceId: devId,
        purchaseToken: "tok_forged_12345678",
        productId: "premium",
      });

    expect(missingSigRes.status).toBe(403);
    expect(missingSigRes.body.error).toBe("MISSING_PURCHASE_VERIFICATION");

    const invalidSigRes = await request(app)
      .post("/api/buy-coins")
      .send({
        deviceId: devId,
        purchaseToken: "tok_forged_coins_123",
        productId: "coins_5",
        signedData: JSON.stringify({
          purchaseToken: "tok_forged_coins_123",
          productId: "coins_5",
          purchaseState: 0,
          developerPayload: devId,
        }),
        signature: Buffer.from("invalid-signature").toString("base64"),
      });

    expect(invalidSigRes.status).toBe(403);
    expect(invalidSigRes.body.error).toBe("INVALID_PURCHASE_SIGNATURE");
  });

  it("verifies authentic Poolakey RSA signature, binds developerPayload deviceId, rejects replay (409), and enforces server-side coin mapping", async () => {
    const devId = crypto.randomUUID();
    const otherDevId = crypto.randomUUID();
    const purchaseToken = "poolakey_real_token_99887766";

    store.tables.devices.push({
      device_id: devId,
      free_tokens: 2,
      is_premium: false,
      daily_used: 0,
      last_usage_date: "2026-06-15",
    });

    const receipt = {
      orderId: "ord_123",
      packageName: "ir.eblaghyar.app",
      productId: "coins_5",
      purchaseTime: Date.now(),
      purchaseState: 0,
      developerPayload: devId,
      purchaseToken,
    };
    const { signedData, signature } = signPoolakeyReceipt(privateKeyPem, receipt);

    // Try with wrong deviceId -> rejected
    const wrongDevRes = await request(app)
      .post("/api/buy-coins")
      .send({
        deviceId: otherDevId,
        purchaseToken,
        productId: "coins_5",
        signedData,
        signature,
      });
    expect(wrongDevRes.status).toBe(403);
    expect(wrongDevRes.body.error).toBe("PAYLOAD_DEVICE_MISMATCH");

    // Attacker passes coinCount: 9999 alongside productId "coins_5" -> server MUST only grant 5 coins!
    const validRes = await request(app)
      .post("/api/buy-coins")
      .send({
        deviceId: devId,
        purchaseToken,
        productId: "coins_5",
        coinCount: 9999,
        signedData,
        signature,
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.free_tokens).toBe(7);
    expect(validRes.body.device.free_tokens).toBe(7);

    // Replay same purchaseToken -> rejected with 409 PURCHASE_ALREADY_CONSUMED
    const replayRes = await request(app)
      .post("/api/buy-coins")
      .send({
        deviceId: devId,
        purchaseToken,
        productId: "coins_5",
        signedData,
        signature,
      });

    expect(replayRes.status).toBe(409);
    expect(replayRes.body.error).toBe("PURCHASE_ALREADY_CONSUMED");

    const devAfter = store.tables.devices.find((d) => d.device_id === devId);
    expect(devAfter.free_tokens).toBe(7);
  });

  it("activates premium once via RSA signature and blocks replay", async () => {
    const devId = crypto.randomUUID();
    const purchaseToken = "poolakey_premium_token_554433";
    const { signedData, signature } = signPoolakeyReceipt(privateKeyPem, {
      productId: "premium",
      purchaseState: 0,
      developerPayload: devId,
      purchaseToken,
    });

    const first = await request(app)
      .post("/api/activate-premium")
      .send({
        deviceId: devId,
        purchaseToken,
        productId: "premium",
        signedData,
        signature,
      });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.device.is_premium).toBe(true);

    const replay = await request(app)
      .post("/api/activate-premium")
      .send({
        deviceId: devId,
        purchaseToken,
        productId: "premium",
        signedData,
        signature,
      });
    expect(replay.status).toBe(409);
  });

  it("legacy Zarinpal has no mock mode when ZARINPAL_MERCHANT_ID is missing and verifies against real v4 API without double grant", async () => {
    const devId = crypto.randomUUID();
    delete process.env.ZARINPAL_MERCHANT_ID;

    const noMerchantRes = await request(app)
      .post("/api/payment/zarinpal/request")
      .send({ deviceId: devId, productType: "coins_5" });

    expect(noMerchantRes.status).toBe(503);

    process.env.ZARINPAL_MERCHANT_ID = "12345678-1234-1234-1234-123456789012";
    const authority = "A00000000000000000000000000000000001";

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { code: 100, authority } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const reqRes = await request(app)
      .post("/api/payment/zarinpal/request")
      .send({ deviceId: devId, productType: "coins_5" });

    expect(reqRes.status).toBe(200);
    expect(reqRes.body.paymentUrl).toBe(`https://www.zarinpal.com/pg/StartPay/${authority}`);

    // Fake authority callback -> failed redirect
    const fakeCallback = await request(app)
      .get("/api/payment/zarinpal/verify")
      .query({ Authority: "A00000000000000000000000000000009999", Status: "OK" });
    expect(fakeCallback.status).toBe(302);
    expect(fakeCallback.headers.location).toBe("/?payment=failed");

    // Real callback verify -> Zarinpal code 100
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { code: 100, ref_id: 88776655 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const okCallback = await request(app)
      .get("/api/payment/zarinpal/verify")
      .query({ Authority: authority, Status: "OK" });
    expect(okCallback.status).toBe(302);
    expect(okCallback.headers.location).toContain("/?payment=success&added=5");

    // Duplicate callback does not double grant
    const dupCallback = await request(app)
      .get("/api/payment/zarinpal/verify")
      .query({ Authority: authority, Status: "OK" });
    expect(dupCallback.status).toBe(302);

    const devRow = store.tables.devices.find((d) => d.device_id === devId);
    expect(devRow.free_tokens).toBe(7); // default 2 + 5 added once
  });
});
