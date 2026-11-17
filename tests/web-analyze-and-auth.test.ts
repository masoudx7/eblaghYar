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
  getTodayDateString,
} from "../api/app";

describe("Phase 3 & 5: Web Analyze Atomic Reserve/Refund, Annual Daily Quota, Auth Update-Password, Turnstile & Server History", () => {
  const store = new InMemorySupabaseStore();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WEB_ONLY = "true";
    process.env.GEMINI_API_KEY = "test-gemini-key";
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

  it("prevents parallel race-condition double spend on 1 credit and 1 single entitlement token", async () => {
    const user = store.seedUser({ email: "race@example.com", credits: 1 });
    generateContentMock.mockImplementation(async () => ({
      text: JSON.stringify(buildSampleNoticeAnalysis()),
    }));

    // Two concurrent analyze requests with only 1 credit -> exactly 1 succeeds (200), 1 fails (402)
    const [c1, c2] = await Promise.all([
      request(app)
        .post("/api/web/analyze")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({ rawText: "متن ابلاغیه اول", fileName: "n1.txt" }),
      request(app)
        .post("/api/web/analyze")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({ rawText: "متن ابلاغیه دوم", fileName: "n2.txt" }),
    ]);

    const statuses = [c1.status, c2.status].sort();
    expect(statuses).toEqual([200, 402]);
    expect(store.tables.profiles.find((p) => p.id === user.id).credits).toBe(0);

    // Now test concurrent race on a single-use guest entitlement token
    const devId = crypto.randomUUID();
    const singleOrder = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
    });

    const [s1, s2] = await Promise.all([
      request(app)
        .post("/api/web/analyze")
        .set("x-device-id", devId)
        .set("x-entitlement-token", singleOrder.entitlement_token)
        .send({ rawText: "متن ابلاغیه تکی ۱" }),
      request(app)
        .post("/api/web/analyze")
        .set("x-device-id", devId)
        .set("x-entitlement-token", singleOrder.entitlement_token)
        .send({ rawText: "متن ابلاغیه تکی ۲" }),
    ]);

    const sStatuses = [s1.status, s2.status].sort();
    expect(sStatuses).toEqual([200, 402]);
    expect(singleOrder.entitlement_used).toBe(true);

    // Calling again after consumption returns explicit ENTITLEMENT_CONSUMED error
    const afterRes = await request(app)
      .post("/api/web/analyze")
      .set("x-device-id", devId)
      .set("x-entitlement-token", singleOrder.entitlement_token)
      .send({ rawText: "تلاش مجدد با توکن مصرف شده" });
    expect(afterRes.status).toBe(402);
    expect(afterRes.body.error).toBe("ENTITLEMENT_CONSUMED");
  });

  it("automatically refunds credit and single entitlement token on Gemini failure or IRRELEVANT_CONTENT", async () => {
    const user = store.seedUser({ email: "refund@example.com", credits: 1 });
    const devId = crypto.randomUUID();
    const singleOrder = store.seedPayment({
      device_id: devId,
      product: "single",
      status: "paid",
      amount_rials: WEB_PRODUCTS.single.amountRials,
    });

    // 1) Irrelevant content -> 400 and credit refunded back to 1
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        isRelevant: false,
        rejectionReason: "تصویر ارسالی فاقد محتوای ابلاغیه قضایی است.",
      }),
    });

    const irrelevantRes = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ rawText: "دستور پخت قرمه سبزی" });
    expect(irrelevantRes.status).toBe(400);
    expect(irrelevantRes.body.error).toBe("IRRELEVANT_CONTENT");
    expect(store.tables.profiles.find((p) => p.id === user.id).credits).toBe(1);

    // 2) Gemini API error -> 503/500 and guest single entitlement token is refunded back to entitlement_used=false!
    generateContentMock.mockRejectedValueOnce(new Error("503 Service Unavailable quota exceeded"));
    const aiErrRes = await request(app)
      .post("/api/web/analyze")
      .set("x-device-id", devId)
      .set("x-entitlement-token", singleOrder.entitlement_token)
      .send({ rawText: "متن ابلاغیه واقعی" });

    expect(aiErrRes.status).toBeGreaterThanOrEqual(500);
    expect(singleOrder.entitlement_used).toBe(false);
    expect(store.tables.web_usage_logs.some((l) => l.action === "analyze_refund")).toBe(true);
  });

  it("enforces 3/day Tehran quota on annual plan and returns 403 DAILY_LIMIT_REACHED on 4th request", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000 * 30).toISOString();
    const user = store.seedUser({
      email: "annual@example.com",
      credits: 0,
      annualExpiresAt: tomorrow,
      dailyAnalysesCount: 2,
      lastAnalysisDate: getTodayDateString(),
    });

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(buildSampleNoticeAnalysis()),
    });

    // 3rd request today succeeds
    const thirdRes = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ rawText: "ابلاغیه سوم امروز" });
    expect(thirdRes.status).toBe(200);
    expect(thirdRes.body.accessMode).toBe("annual");

    // 4th request today -> 403 DAILY_LIMIT_REACHED
    const fourthRes = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ rawText: "ابلاغیه چهارم امروز" });
    expect(fourthRes.status).toBe(403);
    expect(fourthRes.body.error).toBe("DAILY_LIMIT_REACHED");
  });

  it("saves and manages server-side analysis history (/api/web/analyses) and password update (/api/web/auth/update-password)", async () => {
    const user = store.seedUser({ email: "history@example.com", password: "OldPassword123", credits: 2 });
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(buildSampleNoticeAnalysis()),
    });

    const analyzeRes = await request(app)
      .post("/api/web/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ rawText: "متن ابلاغیه ذخیره شونده", fileName: "eblagh-test.pdf" });
    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.savedAnalysisId).toBeTruthy();

    const listRes = await request(app)
      .get("/api/web/analyses")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.analyses).toHaveLength(1);
    expect(listRes.body.analyses[0].file_name).toBe("eblagh-test.pdf");

    const delRes = await request(app)
      .delete(`/api/web/analyses/${listRes.body.analyses[0].id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(delRes.status).toBe(200);

    const listAfter = await request(app)
      .get("/api/web/analyses")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(listAfter.body.analyses).toHaveLength(0);

    // Update password flow
    const updatePwRes = await request(app)
      .post("/api/web/auth/update-password")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: "NewStrongPassword99!" });
    expect(updatePwRes.status).toBe(200);

    const loginNewRes = await request(app)
      .post("/api/web/auth/login")
      .send({ email: "history@example.com", password: "NewStrongPassword99!" });
    expect(loginNewRes.status).toBe(200);
  });

  it("validates optional Turnstile CAPTCHA when TURNSTILE_SECRET_KEY is configured and bypasses when unset", async () => {
    // Unset -> registers without token
    const openReg = await request(app)
      .post("/api/web/auth/register")
      .send({ fullName: "کاربر بدون کپچا", email: "nocaptcha@example.com", password: "Password123!" });
    expect(openReg.status).toBe(201);

    // Configured -> rejects missing token, accepts valid siteverify
    process.env.TURNSTILE_SITE_KEY = "0x4AAAAAAA_site";
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA_secret";

    const missingCaptcha = await request(app)
      .post("/api/web/auth/register")
      .send({ fullName: "کاربر با کپچا", email: "withcaptcha@example.com", password: "Password123!" });
    expect(missingCaptcha.status).toBe(400);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const validCaptcha = await request(app)
      .post("/api/web/auth/register")
      .send({
        fullName: "کاربر تاییدشده",
        email: "withcaptcha@example.com",
        password: "Password123!",
        turnstileToken: "valid-turnstile-token",
      });
    expect(validCaptcha.status).toBe(201);
  });
});
