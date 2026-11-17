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
  getClientIp,
  getTodayDateString,
} from "../api/app";

describe("Security Hardening, WEB_ONLY AI Gating, IP Trust & Rate Limit", () => {
  const store = new InMemorySupabaseStore();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = "test-gemini-key";
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

  it("blocks /api/analyze and /api/device-status with 403 WEB_ONLY_MODE when WEB_ONLY=true", async () => {
    process.env.WEB_ONLY = "true";

    const analyzeRes = await request(app)
      .post("/api/analyze")
      .set("x-device-id", crypto.randomUUID())
      .send({ rawText: "متن ابلاغیه تستی" });

    expect(analyzeRes.status).toBe(403);
    expect(analyzeRes.body.error).toBe("WEB_ONLY_MODE");

    const statusRes = await request(app)
      .get("/api/device-status")
      .set("x-device-id", crypto.randomUUID());

    expect(statusRes.status).toBe(403);
    expect(statusRes.body.error).toBe("WEB_ONLY_MODE");
  });

  it("gates /api/generate-defense-draft and /api/chat under WEB_ONLY=true (402 unpaid, 200 valid paid WITHOUT deducting quota)", async () => {
    process.env.WEB_ONLY = "true";

    // Unpaid user -> 402
    const unpaidDraft = await request(app)
      .post("/api/generate-defense-draft")
      .set("x-device-id", crypto.randomUUID())
      .send({ analysis: buildSampleNoticeAnalysis(), draftType: "defense_denial" });

    expect(unpaidDraft.status).toBe(402);
    expect(unpaidDraft.body.error).toBe("PAYMENT_REQUIRED");

    const unpaidChat = await request(app)
      .post("/api/chat")
      .set("x-device-id", crypto.randomUUID())
      .send({ userQuestion: "مهلت من چقدر است؟" });

    expect(unpaidChat.status).toBe(402);
    expect(unpaidChat.body.error).toBe("PAYMENT_REQUIRED");

    // Paid user with 1 credit -> 200 and credit remains 1 (not deducted for secondary AI tools)
    const user = store.seedUser({ email: "lawyer@example.com", credits: 1 });
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        title: "لایحه دفاعیه",
        recipientAuthority: "شعبه سوم دادیاری",
        preamble: "با سلام",
        legalArguments: ["دفاع مستند"],
        statutoryReferences: ["ماده ۱۶۸ آ.د.ک"],
        petitionsAndRequests: ["برائت"],
        attachmentsList: ["کارت ملی"],
        fullFormattedText: "متن کامل لایحه دفاعیه تست",
        lawyerReviewAdvice: "بررسی با وکیل",
      }),
    });

    const paidDraft = await request(app)
      .post("/api/generate-defense-draft")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ analysis: buildSampleNoticeAnalysis(), draftType: "defense_denial" });

    expect(paidDraft.status).toBe(200);
    expect(paidDraft.body.success).toBe(true);

    const profAfter = store.tables.profiles.find((p) => p.id === user.id);
    expect(profAfter.credits).toBe(1);

    generateContentMock.mockResolvedValueOnce({
      text: "پاسخ حقوقی دقیق بر اساس قوانین ایران.",
    });

    const paidChat = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ userQuestion: "مهلت حضور چند روز است؟" });

    expect(paidChat.status).toBe(200);
    expect(paidChat.body.success).toBe(true);
    expect(profAfter.credits).toBe(1);
    expect(store.tables.web_usage_logs.some((l) => l.action === "chat")).toBe(true);
  });

  it("getClientIp ignores spoofed cf-connecting-ip unless TRUST_CF_HEADER=true and prefers x-vercel-forwarded-for", () => {
    delete process.env.TRUST_CF_HEADER;

    const fakeReq1: any = {
      headers: {
        "cf-connecting-ip": "9.9.9.9",
        "x-vercel-forwarded-for": "185.10.20.30, 10.0.0.1",
      },
      ip: "127.0.0.1",
    };
    expect(getClientIp(fakeReq1)).toBe("185.10.20.30");

    // Without x-vercel-forwarded-for and TRUST_CF_HEADER unset, spoofed cf-connecting-ip is ignored
    const fakeReq2: any = {
      headers: {
        "cf-connecting-ip": "9.9.9.9",
        "x-forwarded-for": "203.0.113.5",
      },
      ip: "127.0.0.1",
    };
    expect(getClientIp(fakeReq2)).toBe("203.0.113.5");

    // When TRUST_CF_HEADER=true and no x-vercel-forwarded-for, cf-connecting-ip is honored
    process.env.TRUST_CF_HEADER = "true";
    expect(getClientIp(fakeReq2)).toBe("9.9.9.9");
  });

  it("enforces Upstash Redis REST rate limiting when configured and falls back cleanly to memory when Redis errors", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-secret-token";

    // Simulate Upstash count=16 exceeding maxRequests=15 on /api/web/auth/login
    global.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify([{ result: 16 }, { result: 60000 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    const rateLimitedRes = await request(app)
      .post("/api/web/auth/login")
      .set("x-vercel-forwarded-for", "198.51.100.11")
      .send({ email: "user@example.com", password: "wrong" });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.error).toBe("RATE_LIMIT_EXCEEDED");

    // Simulate Upstash outage -> graceful fallback to in-memory limiter (should NOT 500)
    global.fetch = vi.fn().mockRejectedValue(new Error("Redis connection timeout")) as any;
    const fallbackRes = await request(app)
      .post("/api/web/auth/login")
      .set("x-vercel-forwarded-for", "198.51.100.12")
      .send({ email: "user@example.com", password: "wrong" });

    expect(fallbackRes.status).toBe(401);
  });

  it("computes daily reset date strictly in Asia/Tehran timezone (+03:30)", () => {
    // 2026-06-15 21:00:00 UTC is already 2026-06-16 00:30:00 in Asia/Tehran!
    const utcBoundaryDate = new Date("2026-06-15T21:00:00.000Z");
    expect(getTodayDateString(utcBoundaryDate)).toBe("2026-06-16");

    // 2026-06-15 19:00:00 UTC is 2026-06-15 22:30:00 in Asia/Tehran
    const sameTehranDay = new Date("2026-06-15T19:00:00.000Z");
    expect(getTodayDateString(sameTehranDay)).toBe("2026-06-15");
  });
});
