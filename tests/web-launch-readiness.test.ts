import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { InMemorySupabaseStore, createMockSupabaseClients, buildSampleNoticeAnalysis } from "./helpers/mockSupabase";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function MockGoogleGenAI() {
    return {
      models: {
        generateContent: generateContentMock,
      },
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

describe("Web Launch-Readiness: 24h AI Pass, Reconcile, Claim Guard, Atomic Annual, Idempotency-Key & Retention", () => {
  const store = new InMemorySupabaseStore();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WEB_ONLY = "true";
    process.env.DISABLE_LEGACY_PAYMENT = "true";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.CRON_SECRET = "cron_super_secret_value_123";
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    store.reset();
    __resetTestState();
    const { serviceClient, authClient } = createMockSupabaseClients(store);
    __setSupabaseClientsForTest(serviceClient, authClient);
    generateContentMock.mockReset();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    __setSupabaseClientsForTest(null, null);
  });

  it("grants 24h AI tools pass for chat & defense draft after consuming single token, blocks re-analyze, and expires after 24h", async () => {
    const devId = crypto.randomUUID();
    const singleOrder = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
    });

    // Unpaid device is blocked on chat and defense draft
    const blockedChat = await request(app)
      .post("/api/chat")
      .set("x-device-id", devId)
      .send({ userQuestion: "مهلت حضور چند روز است؟" });
    expect(blockedChat.status).toBe(402);

    // Run single paid analyze
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(buildSampleNoticeAnalysis()),
    });
    const analyzeRes = await request(app)
      .post("/api/web/analyze")
      .set("x-device-id", devId)
      .set("x-entitlement-token", singleOrder.entitlement_token)
      .send({ rawText: "متن ابلاغیه قضایی تستی" });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.ai_tools_until).toBeTruthy();
    expect(singleOrder.entitlement_used).toBe(true);
    expect(store.tables.web_usage_logs.some((l) => l.action === "reserve")).toBe(true);
    expect(store.tables.web_usage_logs.some((l) => l.action === "analyze")).toBe(true);

    // Even AFTER single entitlement_token is consumed and NOT sent, chat and defense draft succeed within 24h!
    generateContentMock.mockResolvedValueOnce({
      text: "پاسخ حقوقی مشاور برای شما: مهلت حضور ۵ روز است.",
    });
    const chatRes = await request(app)
      .post("/api/chat")
      .set("x-device-id", devId)
      .send({ userQuestion: "آیا مهلت قابل تمدید است؟", contextAnalysis: buildSampleNoticeAnalysis() });
    expect(chatRes.status).toBe(200);
    expect(chatRes.body.success).toBe(true);

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: "لایحه دفاعیه",
        recipientAuthority: "شعبه سوم",
        preamble: "ریاست محترم...",
        legalArguments: ["بند ۱"],
        statutoryReferences: ["ماده ۱۶۸"],
        petitionsAndRequests: ["تقاضای استمهال"],
        attachmentsList: ["ابلاغیه"],
        fullFormattedText: "بسمه تعالی...",
        lawyerReviewAdvice: "نیاز به بررسی وکیل",
      }),
    });
    const draftRes = await request(app)
      .post("/api/generate-defense-draft")
      .set("x-device-id", devId)
      .set("x-entitlement-token", singleOrder.entitlement_token) // even if still sent while consumed!
      .send({ analysis: buildSampleNoticeAnalysis(), draftType: "extension_request" });
    expect(draftRes.status).toBe(200);
    expect(draftRes.body.success).toBe(true);

    // Re-running /api/web/analyze is NEVER allowed with 24h pass
    const reAnalyzeRes = await request(app)
      .post("/api/web/analyze")
      .set("x-device-id", devId)
      .set("x-entitlement-token", singleOrder.entitlement_token)
      .send({ rawText: "تلاش برای تحلیل مجدد بدون پرداخت" });
    expect(reAnalyzeRes.status).toBe(402);

    // Backdate analyze log beyond 24h -> chat & draft are locked again (402)
    const analyzeLog = store.tables.web_usage_logs.find((l) => l.action === "analyze");
    analyzeLog.created_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    const expiredChat = await request(app)
      .post("/api/chat")
      .set("x-device-id", devId)
      .send({ userQuestion: "سوال پس از انقضا" });
    expect(expiredChat.status).toBe(402);

    const expiredDraft = await request(app)
      .post("/api/generate-defense-draft")
      .set("x-device-id", devId)
      .send({ analysis: buildSampleNoticeAnalysis() });
    expect(expiredDraft.status).toBe(402);
  });

  it("reconciles stale reserves, grants ungranted paid orders, purges 90-day analyses, and requires valid cron secret", async () => {
    const user = store.seedUser({ email: "reconcile@example.com", credits: 0 });
    const devId = crypto.randomUUID();
    const staleClaimId = crypto.randomUUID();

    // Seed an orphaned reserve for single payment (already granted payment whose analyze crashed before completion)
    const singleOrder = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
      entitlement_used: true,
      entitlement_claim_id: staleClaimId,
      granted_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    });

    const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    store.tables.web_usage_logs.push(
      {
        id: crypto.randomUUID(),
        user_id: null,
        device_id: devId,
        payment_id: singleOrder.id,
        action: "reserve",
        access_mode: "entitlement",
        metadata: { reserve_id: "res_orphan_single", claim_id: staleClaimId },
        created_at: staleCreatedAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        device_id: null,
        payment_id: null,
        action: "reserve",
        access_mode: "credits",
        metadata: { reserve_id: "res_orphan_credit" },
        created_at: staleCreatedAt,
      }
    );

    // Seed an ungranted paid pack_10 order
    const ungrantedOrder = store.seedPayment({
      user_id: user.id,
      product: "pack_10",
      status: "paid",
      amount_rials: WEB_PRODUCTS.pack_10.amountRials,
      granted_at: null,
    });

    // Check /api/web/orders exposes granted: false before reconcile
    const ordersBefore = await request(app)
      .get("/api/web/orders")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(ordersBefore.status).toBe(200);
    expect(ordersBefore.body.orders[0].granted).toBe(false);

    // Seed an expired (>90 days) and a fresh (<90 days) web_analysis
    const oldAnalysisId = crypto.randomUUID();
    const freshAnalysisId = crypto.randomUUID();
    store.tables.web_analyses.push(
      {
        id: oldAnalysisId,
        user_id: user.id,
        file_name: "old.pdf",
        title: "قدیمی",
        summary: "خلاصه قدیمی",
        authority: "دادگاه",
        urgency: "low",
        analysis_json: buildSampleNoticeAnalysis(),
        created_at: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: freshAnalysisId,
        user_id: user.id,
        file_name: "fresh.pdf",
        title: "جدید",
        summary: "خلاصه جدید",
        authority: "دادگاه",
        urgency: "medium",
        analysis_json: buildSampleNoticeAnalysis(),
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      }
    );

    // Unauthorized reconcile fails 401
    const unauth = await request(app).post("/api/web/reconcile").send({});
    expect(unauth.status).toBe(401);

    // Authorized reconcile succeeds
    const recRes = await request(app)
      .post("/api/web/reconcile")
      .set("Authorization", "Bearer cron_super_secret_value_123")
      .send({});

    expect(recRes.status).toBe(200);
    expect(recRes.body.refundedReserves).toBe(2);
    expect(recRes.body.grantedOrders).toBe(1);
    expect(recRes.body.purgedAnalyses).toBe(1);

    // Verify outcomes
    expect(singleOrder.entitlement_used).toBe(false);
    expect(singleOrder.entitlement_claim_id).toBeNull();
    // credits user got +1 refunded from orphan reserve + 10 from ungranted pack_10 = 11
    expect(store.tables.profiles.find((p) => p.id === user.id).credits).toBe(11);
    expect(ungrantedOrder.granted_at).toBeTruthy();

    // Only fresh analysis remains
    expect(store.tables.web_analyses.map((a) => a.id)).toEqual([freshAnalysisId]);

    // Orders now show granted: true
    const ordersAfter = await request(app)
      .get("/api/web/orders")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(ordersAfter.body.orders[0].granted).toBe(true);

    // Re-running reconcile is idempotent (0 refundedReserves, 0 grantedOrders)
    const recRes2 = await request(app)
      .get("/api/web/reconcile")
      .set("Authorization", "Bearer cron_super_secret_value_123");
    expect(recRes2.status).toBe(200);
    expect(recRes2.body.refundedReserves).toBe(0);
    expect(recRes2.body.grantedOrders).toBe(0);
    expect(recRes2.body.purgedAnalyses).toBe(0);
  });

  it("handles Idempotency-Key replay without double-charging and returns cached result", async () => {
    const user = store.seedUser({ email: "idem@example.com", credits: 2 });
    const idemKey = crypto.randomUUID();

    generateContentMock.mockResolvedValue({
      text: JSON.stringify(buildSampleNoticeAnalysis()),
    });

    const res1 = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ rawText: "متن ابلاغیه تکراری" });
    expect(res1.status).toBe(200);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(store.tables.profiles.find((p) => p.id === user.id).credits).toBe(1);

    // Replay exact same Idempotency-Key -> cached 200 without Gemini call and without consuming 2nd credit
    const res2 = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ rawText: "متن ابلاغیه تکراری" });
    expect(res2.status).toBe(200);
    expect(res2.body.data.title).toBe(res1.body.data.title);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(store.tables.profiles.find((p) => p.id === user.id).credits).toBe(1);

    // Different user cannot reuse another user's Idempotency-Key
    const otherUser = store.seedUser({ email: "other@example.com", credits: 1 });
    const resOther = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${otherUser.accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ rawText: "متن" });
    expect(resOther.status).toBe(409);
  });

  it("atomically stacks concurrent annual renewals via extend_profile_annual RPC and sanitizes 500 errors", async () => {
    const user = store.seedUser({ email: "annual-stack@example.com" });
    const order1 = store.seedPayment({
      user_id: user.id,
      product: "annual",
      status: "pending",
      authority: "A_ANNUAL_1",
      amount_rials: WEB_PRODUCTS.annual.amountRials,
    });
    const order2 = store.seedPayment({
      user_id: user.id,
      product: "annual",
      status: "pending",
      authority: "A_ANNUAL_2",
      amount_rials: WEB_PRODUCTS.annual.amountRials,
    });

    process.env.ZARINPAL_MERCHANT_ID = "12345678-1234-1234-1234-123456789012";
    global.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ data: { code: 100, ref_id: 778899 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    await Promise.all([
      request(app).get(`/api/web/payment/verify?Authority=${order1.authority}&Status=OK`),
      request(app).get(`/api/web/payment/verify?Authority=${order2.authority}&Status=OK`),
    ]);

    const prof = store.tables.profiles.find((p) => p.id === user.id);
    const expiresMs = new Date(prof.annual_expires_at).getTime();
    const expectedMinMs = Date.now() + 720 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThan(expectedMinMs);

    // Verify 500 error does NOT leak internal secret/stack error.message to client
    generateContentMock.mockRejectedValue(new Error("SENSITIVE_DB_PASSWORD_LEAK_12345"));
    const user500 = store.seedUser({ email: "err500@example.com", credits: 1 });
    const errRes = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user500.accessToken}`)
      .send({ rawText: "متن ابلاغیه برای تست خطای ۵۰۰" });
    expect(errRes.status).toBe(500);
    expect(JSON.stringify(errRes.body)).not.toContain("SENSITIVE_DB_PASSWORD_LEAK_12345");
  });

  it("protects newer single entitlement claim from stale reconcile refund via entitlement_claim_id", async () => {
    const devId = crypto.randomUUID();
    const newerClaimId = crypto.randomUUID();
    const oldClaimId = crypto.randomUUID();

    const singleOrder = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
      entitlement_used: true,
      entitlement_claim_id: newerClaimId,
      granted_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });

    // Old stale reserve referencing oldClaimId
    store.tables.web_usage_logs.push({
      id: crypto.randomUUID(),
      user_id: null,
      device_id: devId,
      payment_id: singleOrder.id,
      action: "reserve",
      access_mode: "entitlement",
      metadata: { reserve_id: "res_old_claim", claim_id: oldClaimId },
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const recRes = await request(app)
      .post("/api/web/reconcile")
      .set("Authorization", "Bearer cron_super_secret_value_123")
      .send({});
    expect(recRes.status).toBe(200);

    // Must NOT overwrite newerClaimId or reset entitlement_used!
    expect(singleOrder.entitlement_used).toBe(true);
    expect(singleOrder.entitlement_claim_id).toBe(newerClaimId);
  });
});
