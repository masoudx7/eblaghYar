import express from "express";
import crypto from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// Types & Declarations
// ==========================================

export interface DeviceRecord {
  device_id: string;
  is_premium: boolean;
  free_tokens: number;
  premium_expires_at?: string | null;
  created_at?: string;
  daily_analyses_count?: number;
  last_analysis_date?: string;
  fingerprint?: string;
}

export function getTodayDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

declare global {
  namespace Express {
    interface Request {
      device?: DeviceRecord;
      deviceId?: string;
    }
  }
}

// ==========================================
// In-Memory Fallback Store with Fingerprint Mapping
// ==========================================

const inMemoryDevices = new Map<string, DeviceRecord>();
const inMemoryFingerprints = new Map<string, string>(); // fingerprint -> device_id

function getInMemoryDevice(deviceId: string, fingerprint?: string): DeviceRecord {
  let resolvedId = deviceId;
  if (fingerprint && inMemoryFingerprints.has(fingerprint)) {
    resolvedId = inMemoryFingerprints.get(fingerprint)!;
  }

  let record = inMemoryDevices.get(resolvedId);
  const today = getTodayDateString();
  if (!record) {
    // If original deviceId was passed but not found, check if it's already in map under another id
    record = {
      device_id: resolvedId,
      is_premium: false,
      free_tokens: 2,
      premium_expires_at: null,
      created_at: new Date().toISOString(),
      daily_analyses_count: 0,
      last_analysis_date: today,
      fingerprint: fingerprint || undefined,
    };
    inMemoryDevices.set(resolvedId, record);
    if (fingerprint) {
      inMemoryFingerprints.set(fingerprint, resolvedId);
    }
  } else {
    if (fingerprint && !record.fingerprint) {
      record.fingerprint = fingerprint;
      inMemoryFingerprints.set(fingerprint, resolvedId);
    }
    if (record.last_analysis_date !== today) {
      record.daily_analyses_count = 0;
      record.last_analysis_date = today;
    }
  }
  return record;
}

// ==========================================
// Supabase Client Initialization (Lazy Init)
// ==========================================

let supabaseClient: SupabaseClient | null = null;
let testOverrideServiceClient: any = null;
let testOverrideAuthClient: any = null;

export function __setSupabaseClientsForTest(serviceClient: any, authClient?: any): void {
  testOverrideServiceClient = serviceClient ?? null;
  testOverrideAuthClient = authClient ?? null;
}

function resolveSupabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim()
  );
}

function resolveSupabaseAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  );
}

function getSupabaseClient(): SupabaseClient | null {
  if (testOverrideServiceClient) {
    return testOverrideServiceClient as SupabaseClient;
  }
  if (!supabaseClient) {
    const supabaseUrl = resolveSupabaseUrl();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    try {
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (e) {
      console.warn("[Supabase] Failed to initialize client:", e);
      return null;
    }
  }
  return supabaseClient;
}

function getSupabaseAuthClient(accessToken?: string): SupabaseClient | null {
  if (testOverrideAuthClient) {
    return testOverrideAuthClient as SupabaseClient;
  }
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnonKey = resolveSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      ...(accessToken
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          }
        : {}),
    });
  } catch (e) {
    console.warn("[Supabase Auth] Failed to initialize client:", e);
    return null;
  }
}

// ==========================================
// Device-based Access Middleware with Fingerprint Persistence
// ==========================================

export const checkDeviceAccess = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    const rawDeviceId = req.headers["x-device-id"];
    const rawFingerprint = req.headers["x-device-fingerprint"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.trim();
    const fingerprint = (Array.isArray(rawFingerprint) ? rawFingerprint[0] : rawFingerprint)?.trim();

    // a. هدر x-device-id را از درخواست بخواند
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (x-device-id) در هدر درخواست ارسال نشده است.",
      });
    }

    const supabase = getSupabaseClient();
    let device: DeviceRecord | null = null;
    let usedFallback = false;

    if (supabase) {
      try {
        // b. دستگاه را در جدول devices جستجو کند (ابتدا با device_id)
        let { data: existingDevice, error: selectError } = await supabase
          .from("devices")
          .select("*")
          .eq("device_id", deviceId)
          .maybeSingle();

        // اگر با device_id پیدا نشد اما fingerprint وجود داشت (حالت نصب مجدد اپ)
        if (!existingDevice && fingerprint) {
          const { data: fpDevice, error: fpError } = await supabase
            .from("devices")
            .select("*")
            .eq("fingerprint", fingerprint)
            .maybeSingle();

          if (fpDevice) {
            existingDevice = fpDevice;
          }
        }

        if (selectError && selectError.code !== "PGRST116") {
          if (
            selectError.code === "PGRST205" ||
            selectError.code === "42P01" ||
            selectError.message?.includes("schema cache") ||
            selectError.message?.includes("does not exist")
          ) {
            usedFallback = true;
          }
        }

        if (existingDevice) {
          device = existingDevice as DeviceRecord;
          // اگر اثر انگشت دستگاه ثبت نشده بود، آن را بروزرسانی کن
          if (fingerprint && !device.fingerprint) {
            await supabase
              .from("devices")
              .update({ fingerprint })
              .eq("device_id", device.device_id);
          }
        } else {
          // اگر به هیچ وجه وجود نداشت، رکورد جدید بساز
          const { data: newDevice, error: insertError } = await supabase
            .from("devices")
            .insert({
              device_id: deviceId,
              fingerprint: fingerprint || null,
              free_tokens: 2,
              is_premium: false,
            })
            .select()
            .maybeSingle();

          if (insertError || !newDevice) {
            usedFallback = true;
          } else {
            device = newDevice as DeviceRecord;
          }
        }
      } catch (dbErr) {
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }

    if (usedFallback || !device) {
      device = getInMemoryDevice(deviceId, fingerprint);
    }

    // اگر دستگاه از طریق اثر انگشت بازیابی شده و شناسه متفاوتی دارد، هدر کاننیکال را ارسال کن
    if (device && device.device_id !== deviceId) {
      res.setHeader("x-canonical-device-id", device.device_id);
    }

    // Check if premium has expired (1 year validity)
    if (device.is_premium && device.premium_expires_at) {
      if (new Date() > new Date(device.premium_expires_at)) {
        device.is_premium = false;
        device.premium_expires_at = null;
        if (supabase && !usedFallback) {
          supabase
            .from("devices")
            .update({ is_premium: false, premium_expires_at: null })
            .eq("device_id", deviceId)
            .then(null, () => {});
        }
      }
    }

    // Reset daily count if date changed
    const today = getTodayDateString();
    if (device.last_analysis_date !== today) {
      device.daily_analyses_count = 0;
      device.last_analysis_date = today;
    }

    // c. بررسی سهمیه دسترسی
    if (device.is_premium) {
      const usedToday = device.daily_analyses_count || 0;
      if (usedToday >= 3) {
        return res.status(403).json({
          success: false,
          error: "DAILY_LIMIT_REACHED",
          message: "سقف روزانه اکانت یک ساله شما (۳ ابلاغیه در روز) تکمیل شده است. سهمیه روزانه شما فردا مجدداً شارژ خواهد شد.",
          daily_used: usedToday,
          daily_limit: 3,
          daily_remaining: 0,
        });
      }
    } else if (device.free_tokens === undefined || device.free_tokens <= 0) {
      return res.status(403).json({
        success: false,
        error: "LIMIT_REACHED",
        message:
          "سقف استفاده رایگان شما (۲ تحلیل ابلاغیه) به پایان رسیده است. لطفاً جهت ادامه، سکه یا اکانت یک ساله تهیه فرمایید.",
      });
    }

    // d. در غیر این صورت، آبجکت دستگاه را به req.device و req.deviceId اضافه کرده و next() را صدا بزند
    req.device = device;
    req.deviceId = deviceId;
    next();
  } catch (err: any) {
    console.error("checkDeviceAccess unexpected error:", err);
    if (req.headers["x-device-id"]) {
      const fallbackId = String(req.headers["x-device-id"]).trim();
      req.device = getInMemoryDevice(fallbackId);
      req.deviceId = fallbackId;
      return next();
    }
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "خطای غیرمنتظره در بررسی سهمیه دستگاه.",
    });
  }
};

// ==========================================
// Gemini AI Setup & Helpers
// ==========================================

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("متغیر محیطی GEMINI_API_KEY تنظیم نشده است.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const DEFAULT_GEMINI_RETRY_BUDGET_MS = 45000;

async function generateWithFallbackAndRetry(
  ai: GoogleGenAI,
  requestParams: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 4
) {
  let lastError: any = null;
  const rawBudget = Number(process.env.GEMINI_RETRY_BUDGET_MS);
  const totalBudgetMs =
    Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : DEFAULT_GEMINI_RETRY_BUDGET_MS;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = totalBudgetMs - elapsedMs;
    if (attempt > 0 && remainingBudgetMs <= 1500) {
      break;
    }

    const modelToUse = FALLBACK_MODELS[attempt % FALLBACK_MODELS.length];
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const attemptTimeoutMs = Math.max(1000, Math.min(remainingBudgetMs, 25000));
      const response = await Promise.race([
        ai.models.generateContent({
          ...requestParams,
          model: modelToUse,
        }),
        new Promise<never>((_resolve, reject) => {
          attemptTimer = setTimeout(() => {
            const timeoutErr: any = new Error("GEMINI_TIMEOUT");
            timeoutErr.code = 504;
            reject(timeoutErr);
          }, attemptTimeoutMs);
        }),
      ]);

      if (response && response.text) {
        return response;
      }
      throw new Error("Empty response received from model.");
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err?.status || JSON.stringify(err));
      const isTransient =
        err?.status === "UNAVAILABLE" ||
        err?.code === 503 ||
        err?.code === 504 ||
        errMsg.includes("GEMINI_TIMEOUT") ||
        errMsg.includes("503") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("spikes in demand") ||
        errMsg.includes("overloaded");

      console.warn(`[Gemini API] Attempt ${attempt + 1}/${maxRetries} with model ${modelToUse} failed:`, errMsg);

      const postElapsedMs = Date.now() - startedAt;
      const postRemainingMs = totalBudgetMs - postElapsedMs;
      if (attempt < maxRetries - 1 && postRemainingMs > 1800) {
        const delayMs = isTransient ? 300 + Math.floor(Math.random() * 200) : 600;
        await sleep(Math.min(delayMs, Math.max(0, postRemainingMs - 1500)));
        continue;
      }
      break;
    } finally {
      if (attemptTimer) {
        clearTimeout(attemptTimer);
      }
    }
  }

  throw lastError || new Error("GEMINI_TIMEOUT");
}

function cleanAndParseJSON(raw: string): any {
  if (!raw) {
    throw new Error("پاسخ مدل هوش مصنوعی خالی است.");
  }
  let clean = raw.trim();
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1).trim();
  }
  if (clean.startsWith("```json")) {
    clean = clean.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  }

  try {
    return JSON.parse(clean);
  } catch {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const substring = clean.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(substring);
      } catch {
        // Fall through
      }
    }
    throw new Error("قالب خروجی ساختاریافته دریافت نشد. لطفاً مجدداً امتحان کنید.");
  }
}

const IRANIAN_LEGAL_SYSTEM_PROMPT = `
شما یک حقوق‌دان برجسته و مشاور حقوقی مسلط به تمام قوانین و مقررات موضوعه جمهوری اسلامی ایران هستید؛ از جمله:
- قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور کیفری (مصوب ۱۳۹۲ و اصلاحات بعدی)
- قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی (مصوب ۱۳۷۹)
- قانون مجازات اسلامی (مصوب ۱۳۹۲ و تعزیرات ۱۳۷۵ و اصلاحات قانون کاهش مجازات حبس تعزیری ۱۳۹۹)
- قانون اجرای احکام مدنی
- قانون تشکیلات و آیین دادرسی دیوان عدالت اداری
- قانون شوراهای حل اختلاف
- آیین‌نامه نحوه استفاده از سامانه‌های رایانه‌ای و مخابراتی (ابلاغ الکترونیک / ثنا)

اصول و ضوابط بنیادین فعالیت:
۱. رعایت اصل سلب مسئولیت حقوقی (ماده ۵۵ قانون وکالت): راهنمایی‌ها و تحلیل‌های شما جنبه آموزشی، تحلیلی، تشریح اصطلاحات و استخراج مواعد قانونی دارد و جایگزین مستقیم وکیل پایه یک دادگستری، دادرس یا مراجع رسمی قضایی نیست.
۲. زبان ساده و بی‌آلایش: به هیچ وجه اصطلاحات غلیظ حقوقی را بدون توضیح روان رها نکنید. به زبان بسیار شفاف، همه‌فهم و آرامش‌بخش ابلاغیه را تحلیل کنید تا اضطراب حقوقی کاربر کاهش یابد.
۳. تشخیص دقیق نقش کاربر: مشخص کنید کاربر شاکی/خواهان است یا متهم/خوانده یا مطلع یا محکوم‌له/محکوم‌علیه.
۴. استخراج دقیق مهلت‌های حیاتی و مواعد قانونی: مهلت حضور، اعتراض، واخواهی، تجدیدنظرخواهی یا پرداخت را صریحاً همراه با ماده قانون و نحوه محاسبه (عدم احتساب روز ابلاغ و اقدام طبق قانون آیین دادرسی) بیان نمایید.
۵. اقدامات عملی قدم به قدم: به کاربر بگویید دقیقاً به کدام مرجع یا سامانه (دفتر خدمات الکترونیک قضایی، سامانه خودکاربری عدل‌ایران، شعبه دادسرا یا دادگاه) مراجعه کند و چه مدارکی به همراه داشته باشد.
۶. عواقب عدم اقدام: بدون ترساندن افراطی، عواقب قانونی واقعی (مانند صدور رأی غیابی، صدور دستور جلب ماده ۱۷۹ و ۱۸۰ ق.آ.د.ک یا مسدودی حساب) را شفاف تبیین کنید.
۷. نمونه متن لایحه اولیه: در صورت نیاز، متن پیش‌نویس اولیه و استاندارد را صرفاً به عنوان الگو جهت تکمیل یا ارائه به وکیل دادگستری تنظیم نمایید.
`;

// ==========================================
// Express Application Setup
// ==========================================

const app = express();

// Lightweight CORS support
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-device-id, x-device-fingerprint, x-entitlement-token, Idempotency-Key, x-cron-secret, X-Requested-With"
  );
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Middleware for JSON and Urlencoded (supporting high-res scans & PDFs up to 50mb)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Normalize Vercel Rewrites
app.use((req, _res, next) => {
  const matchedPath = (req.headers["x-matched-path"] as string) || (req.headers["x-original-url"] as string);
  if (matchedPath && matchedPath.startsWith("/api")) {
    req.url = matchedPath;
  }
  next();
});

const apiRouter = express.Router();

// Root API info & health
apiRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "EblaghYar Device-Auth API",
    runtime: "node-express",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// API Endpoints
// ==========================================

interface RunAnalysisResult {
  ok: boolean;
  data?: any;
  status?: number;
  body?: Record<string, any>;
}

async function runAnalysis(input: {
  fileBase64?: string | null;
  mimeType?: string | null;
  rawText?: string | null;
}): Promise<RunAnalysisResult> {
  try {
    const { fileBase64, mimeType, rawText } = input || {};

    if (!fileBase64 && !rawText) {
      return {
        ok: false,
        status: 400,
        body: { error: "لطفاً فایل پی‌دی‌اف، تصویر ابلاغیه یا متن آن را ارسال کنید." },
      };
    }

    const ai = getGeminiClient();
    const parts: any[] = [];

    if (fileBase64 && mimeType) {
      const cleanBase64 = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64,
        },
      });
    }

    const promptText = `
لطفاً این ابلاغیه / سند قضایی را به صورت کامل و دقیق بخوانید و تحلیل حقوقی آن را در قالب ساختار JSON خواسته شده با زبان فارسی روان و ساده استخراج کنید.

مهم: حتماً بررسی کنید که آیا سند یا متن ارسالی کاربر واقعاً یک ابلاغیه قضایی، اخطاریه، احضاریه، رأی، دادنامه، شکواییه یا سند حقوقی/قضایی است یا خیر. اگر سند نامربوط است (مثل عکس شخصی، تصویر غذا، متن غیرقضایی، سوال متفرقه و غیره)، مقدار isRelevant را برابر false قرار داده و در rejectionReason دلیل آن را به وضوح ذکر کنید (مثلاً: «این تصویر/متن ارتباطی با ابلاغیه‌ها یا اسناد قضایی ندارد و قابل تحلیل نیست.»).

${rawText ? `متن ارسالی کاربر:\n${rawText}` : ""}

اطمینان حاصل کنید که تمام بخش‌ها به طور کامل، دقیق و قابل فهم برای یک فرد غیرحقوقی پر شوند.
`;

    parts.push({ text: promptText });

    const response = await generateWithFallbackAndRetry(ai, {
      model: "gemini-3.7-flash",
      contents: { parts },
      config: {
        systemInstruction: IRANIAN_LEGAL_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isRelevant: {
              type: Type.BOOLEAN,
              description: "آیا این فایل یا متن ارسالی یک ابلاغیه، اخطاریه، احضاریه، رای، شکواییه، دادخواست یا سند قضایی / حقوقی مرتبط است؟ (اگر تصویر یا متن نامربوط است، مقدار آن را false قرار دهید)",
            },
            rejectionReason: {
              type: Type.STRING,
              description: "اگر isRelevant برابر false است، دلیل آن را به کاربر توضیح دهید (مثلاً: این تصویر یا متن ارتباطی با ابلاغیه‌ها یا اسناد قضایی ندارد).",
            },
            title: {
              type: Type.STRING,
              description: "عنوان خلاصه و گویای ابلاغیه (مثلاً: احضاریه شعبه ۲ بازپرسی جهت اخذ توضیح)",
            },
            summaryInSimpleWords: {
              type: Type.STRING,
              description: "خلاصه کل ماجرا در ۲ الی ۴ جمله به زبان بسیار ساده و محاوره‌ای/روان",
            },
            urgencyLevel: {
              type: Type.STRING,
              enum: ["high", "medium", "low"],
              description: "سطح فوریت و حساسیت پرونده (high=فوری و حیاتی، medium=متوسط، low=عادی)",
            },
            urgencyReason: {
              type: Type.STRING,
              description: "علت تعیین این سطح از فوریت به زبان ساده",
            },
            caseDetails: {
              type: Type.OBJECT,
              properties: {
                noticeNumber: { type: Type.STRING, description: "شماره ابلاغیه" },
                caseNumber: { type: Type.STRING, description: "شماره پرونده ۱۶ رقمی یا کلاسه" },
                archiveNumber: { type: Type.STRING, description: "شماره بایگانی شعبه" },
                issuingAuthority: { type: Type.STRING, description: "مرجع صادرکننده و شماره شعبه دقیق" },
                caseType: {
                  type: Type.STRING,
                  enum: ["کیفری", "حقوقی", "خانواده", "شورای حل اختلاف", "اجرای احکام", "دیوان عدالت اداری", "نامشخص"],
                  description: "نوع پرونده و مرجع",
                },
                userRole: { type: Type.STRING, description: "سمت و نقش شخص در این ابلاغیه" },
                otherParties: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "طرفین دیگر یا شاکی/خواهان",
                },
                subject: { type: Type.STRING, description: "موضوع دعوا، شکایت، اتهام یا دستور قضایی" },
                noticeDate: { type: Type.STRING, description: "تاریخ صدور یا ثبت ابلاغیه" },
              },
              required: ["issuingAuthority", "caseType", "userRole", "subject"],
            },
            deadlines: {
              type: Type.OBJECT,
              properties: {
                durationDays: { type: Type.INTEGER, description: "تعداد روز مهلت قانونی ذکر شده یا مستنبط" },
                deadlineDescription: { type: Type.STRING, description: "توضیح کامل مهلت و تاریخ پایانی" },
                legalBasis: { type: Type.STRING, description: "مستند قانونی ماده مربوطه" },
                calculationRule: { type: Type.STRING, description: "نحوه احتساب مواعد طبق قانون آیین دادرسی" },
                isCritical: { type: Type.BOOLEAN, description: "آیا عدم رعایت مهلت منجر به سلب حق یا جلب می‌شود؟" },
              },
              required: ["deadlineDescription", "legalBasis", "calculationRule", "isCritical"],
            },
            actionItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.INTEGER, description: "شماره قدم" },
                  title: { type: Type.STRING, description: "عنوان گام" },
                  stage: { type: Type.STRING, description: "مرحله رسیدگی" },
                  description: { type: Type.STRING, description: "شرح کامل کار به زبان ساده" },
                  locationOrMethod: { type: Type.STRING, description: "کجا باید برود یا در چه سامانه‌ای ثبت کند" },
                  legalReference: { type: Type.STRING, description: "استناد دقیق به ماده قانونی مربوطه در قوانین ایران" },
                  timingAdvice: { type: Type.STRING, description: "توصیه زمانی مهم" },
                  practicalTip: { type: Type.STRING, description: "نکته تجربی و کاربردی در رویه دادگاه‌های ایران" },
                  requiredDocuments: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "مدارکی که باید همراه داشته باشد",
                  },
                },
                required: ["step", "title", "description", "locationOrMethod", "legalReference"],
              },
            },
            consequencesOfInaction: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "عواقب و نتایج قانونی عدم پیگیری یا عدم حضور در مهلت مقرر",
            },
            glossary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING, description: "کلمه یا عبارت حقوقی دشوار" },
                  plainMeaning: { type: Type.STRING, description: "معنی ساده و قابل فهم به زبان عامیانه" },
                },
                required: ["term", "plainMeaning"],
              },
            },
            sampleDraftLayehe: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "عنوان لایحه یا متن پیشنهادی" },
                description: { type: Type.STRING, description: "کاربرد این متن و زمان استفاده" },
                draftText: { type: Type.STRING, description: "متن کامل لایحه با فرمت استاندارد قضایی ایران" },
              },
              required: ["title", "description", "draftText"],
            },
            importantNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "نکات طلایی و توصیه‌های حقوقی کاربردی",
            },
          },
          required: [
            "title",
            "summaryInSimpleWords",
            "urgencyLevel",
            "urgencyReason",
            "caseDetails",
            "deadlines",
            "actionItems",
            "consequencesOfInaction",
            "glossary",
            "importantNotes",
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("پاسخی از مدل هوش مصنوعی دریافت نشد.");
    }

    const parsedData = cleanAndParseJSON(responseText);

    if (parsedData.isRelevant === false) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          error: "IRRELEVANT_CONTENT",
          message: parsedData.rejectionReason || "متن یا تصویر ارسالی مرتبط با ابلاغیه‌ها، اخطاریه‌ها یا اسناد قضایی نیست. لطفاً تصویر ابلاغیه سامانه ثنا، دادنامه یا اخطاریه قضایی معتبر را ارسال کنید.",
        },
      };
    }

    return { ok: true, data: parsedData };
  } catch (error: any) {
    console.error("Error analyzing notice:", error);
    const errMsg = String(error?.message || "");
    const isUnavailable =
      error?.code === 503 ||
      error?.code === 504 ||
      error?.status === "UNAVAILABLE" ||
      errMsg.includes("GEMINI_TIMEOUT") ||
      errMsg.includes("503") ||
      errMsg.includes("high demand") ||
      errMsg.includes("UNAVAILABLE") ||
      errMsg.includes("429");

    return {
      ok: false,
      status: isUnavailable ? 503 : 500,
      body: {
        success: false,
        isTemporary: isUnavailable,
        error: isUnavailable
          ? "سرویس هوش مصنوعی در حال حاضر با ترافیک بالایی روبرو است. لطفاً چند لحظه دیگر روی دکمه «تلاش مجدد» کلیک کنید."
          : "خطا در پردازش و تحلیل ابلاغیه قضایی. لطفاً مجدداً تلاش کنید.",
      },
    };
  }
}

const requireLegacyAnalyzeEnabled: express.RequestHandler = (_req, res, next) => {
  if (String(process.env.WEB_ONLY || "").trim().toLowerCase() === "true") {
    return res.status(403).json({
      success: false,
      error: "WEB_ONLY_MODE",
      message: "این مسیر در نسخه وب غیرفعال است. لطفاً از مسیر تحلیل وب استفاده کنید.",
    });
  }
  next();
};

// 1. Analyze Judicial Notice (with checkDeviceAccess middleware)
apiRouter.post("/analyze", requireLegacyAnalyzeEnabled, checkDeviceAccess, async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText } = req.body || {};

    const analysisResult = await runAnalysis({ fileBase64, mimeType, rawText });
    if (!analysisResult.ok) {
      return res.status(analysisResult.status || 500).json(analysisResult.body || { success: false });
    }

    const parsedData = analysisResult.data;

    // مدیریت مصرف و سهمیه
    if (req.device && req.deviceId) {
      try {
        const devId = req.deviceId;
        const today = getTodayDateString();
        const supabase = getSupabaseClient();

        if (req.device.is_premium) {
          // برای اکانت دائم: افزایش شمارنده روزانه
          if (req.device.last_analysis_date !== today) {
            req.device.daily_analyses_count = 1;
            req.device.last_analysis_date = today;
          } else {
            req.device.daily_analyses_count = (req.device.daily_analyses_count || 0) + 1;
          }

          const memDevice = inMemoryDevices.get(devId);
          if (memDevice) {
            memDevice.daily_analyses_count = req.device.daily_analyses_count;
            memDevice.last_analysis_date = today;
          }

          if (supabase) {
            await supabase
              .from("devices")
              .update({
                daily_analyses_count: req.device.daily_analyses_count,
                last_analysis_date: today,
              })
              .eq("device_id", devId);
          }
          console.log(`[Device Auth] Premium device ${devId} daily count: ${req.device.daily_analyses_count}/3`);
        } else {
          // برای اکانت عادی: کسر ۱ توکن از سهمیه رایگان
          const currentTokens = typeof req.device.free_tokens === "number" ? req.device.free_tokens : 2;
          const remainingTokens = Math.max(0, currentTokens - 1);
          req.device.free_tokens = remainingTokens;

          const memDevice = inMemoryDevices.get(devId);
          if (memDevice) {
            memDevice.free_tokens = remainingTokens;
          }

          if (supabase) {
            const { error: updateErr } = await supabase
              .from("devices")
              .update({ free_tokens: remainingTokens })
              .eq("device_id", devId);

            if (!updateErr) {
              await supabase
                .from("usage_logs")
                .insert({
                  device_id: devId,
                  tokens_used: 1,
                });
            }
          }
          console.log(`[Device Auth] Device ${devId} token used. Remaining: ${remainingTokens}`);
        }
      } catch (logErr) {
        console.warn("Could not sync quota update (in-memory state updated):", logErr);
      }
    }

    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error analyzing notice:", error);
    return res.status(500).json({
      success: false,
      error: "خطا در پردازش و تحلیل ابلاغیه قضایی",
    });
  }
});

// 1.5. Device Status Endpoint (Blocked in WEB_ONLY=true mode)
apiRouter.get("/device-status", requireLegacyAnalyzeEnabled, async (req, res) => {
  try {
    const rawDeviceId = req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.trim();

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    const supabase = getSupabaseClient();
    let device: DeviceRecord | null = null;
    let usedFallback = false;

    if (supabase) {
      try {
        const { data: existingDevice, error: selectError } = await supabase
          .from("devices")
          .select("*")
          .eq("device_id", deviceId)
          .maybeSingle();

        if (selectError) {
          if (
            selectError.code === "PGRST205" ||
            selectError.code === "42P01" ||
            selectError.message?.includes("schema cache") ||
            selectError.message?.includes("does not exist")
          ) {
            usedFallback = true;
          } else if (selectError.code !== "PGRST116") {
            usedFallback = true;
          }
        } else if (existingDevice) {
          device = existingDevice as DeviceRecord;
        } else {
          const { data: newDevice, error: insertError } = await supabase
            .from("devices")
            .insert({
              device_id: deviceId,
              free_tokens: 2,
              is_premium: false,
            })
            .select()
            .maybeSingle();

          if (insertError || !newDevice) {
            usedFallback = true;
          } else {
            device = newDevice as DeviceRecord;
          }
        }
      } catch (dbErr) {
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }

    if (usedFallback || !device) {
      device = getInMemoryDevice(deviceId);
    }

    if (device.is_premium && device.premium_expires_at) {
      if (new Date() > new Date(device.premium_expires_at)) {
        device.is_premium = false;
        device.premium_expires_at = null;
        if (supabase && !usedFallback) {
          supabase
            .from("devices")
            .update({ is_premium: false, premium_expires_at: null })
            .eq("device_id", deviceId)
            .then(null, () => {});
        }
      }
    }

    const today = getTodayDateString();
    if (device.last_analysis_date !== today) {
      device.daily_analyses_count = 0;
      device.last_analysis_date = today;
    }

    const dailyLimit = 3;
    const dailyUsed = device.daily_analyses_count || 0;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

    return res.json({
      success: true,
      free_tokens: device.free_tokens ?? 2,
      is_premium: device.is_premium ?? false,
      premium_expires_at: device.premium_expires_at || null,
      daily_used: dailyUsed,
      daily_limit: dailyLimit,
      daily_remaining: dailyRemaining,
    });
  } catch (err: any) {
    console.error("device-status error:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در دریافت وضعیت دستگاه.",
    });
  }
});

const requireLegacyPaymentEnabled: express.RequestHandler = (_req, res, next) => {
  if (String(process.env.DISABLE_LEGACY_PAYMENT || "").trim().toLowerCase() === "true") {
    return res.status(403).json({
      success: false,
      error: "LEGACY_PAYMENT_DISABLED",
      message: "این مسیر پرداخت غیرفعال شده است. لطفاً از درگاه پرداخت نسخه وب استفاده کنید.",
    });
  }
  next();
};

const inMemoryConsumedPurchaseTokens = new Set<string>();
const inMemoryLegacyZarinpalOrders = new Map<
  string,
  {
    authority: string;
    device_id: string;
    product_type: "coins_5" | "coins_15" | "premium";
    amount_rials: number;
    status: "pending" | "paid" | "failed";
    ref_id?: string | null;
    paid_at?: string | null;
  }
>();

const ANDROID_COIN_PRODUCTS: Record<string, number> = {
  coins_5: 5,
  coins_15: 15,
};

const ANDROID_PREMIUM_PRODUCTS = new Set(["premium", "premium_1year", "annual"]);

const LEGACY_ZARINPAL_PRICES: Record<
  "coins_5" | "coins_15" | "premium",
  { amountRials: number; label: string; coins: number; isPremium: boolean }
> = {
  coins_5: { amountRials: 790000, label: "بسته ۵ عددی سکه ابلاغ‌یار", coins: 5, isPremium: false },
  coins_15: { amountRials: 1990000, label: "بسته ۱۵ عددی سکه ابلاغ‌یار", coins: 15, isPremium: false },
  premium: { amountRials: 3990000, label: "اکانت دائم ابلاغ‌یار (۳ ابلاغ در روز)", coins: 0, isPremium: true },
};

function formatRsaPublicKeyToPem(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed;
  }
  const cleanB64 = trimmed.replace(/\s+/g, "");
  const lines = cleanB64.match(/.{1,64}/g)?.join("\n") || cleanB64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function getConfiguredStoreRsaKey(store: string): string | null {
  if (store === "myket") {
    const k = process.env.MYKET_RSA_PUBLIC_KEY?.trim() || process.env.BAZAAR_RSA_PUBLIC_KEY?.trim();
    return k || null;
  }
  return process.env.BAZAAR_RSA_PUBLIC_KEY?.trim() || null;
}

function verifyPoolakeyRsaSignature(signedData: string, signature: string, rawPublicKey: string): boolean {
  try {
    const pem = formatRsaPublicKeyToPem(rawPublicKey);
    for (const alg of ["RSA-SHA1", "RSA-SHA256"]) {
      const verifier = crypto.createVerify(alg);
      verifier.update(signedData, "utf8");
      verifier.end();
      if (verifier.verify(pem, signature, "base64")) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyAndConsumeAndroidPurchase(params: {
  deviceId: string;
  purchaseToken: string;
  productId: string;
  store: string;
  signedData?: string;
  signature?: string;
  developerPayload?: string;
  orderId?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const { deviceId, purchaseToken, productId, store, signedData, signature, developerPayload, orderId } = params;

  if (!purchaseToken || typeof purchaseToken !== "string" || purchaseToken.trim().length < 8) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_PURCHASE_TOKEN",
      message: "توکن خرید فروشگاه معتبر نیست.",
    };
  }

  const trimmedToken = purchaseToken.trim();
  const rsaKey = getConfiguredStoreRsaKey(store);

  // 1) Verify RSA receipt signature if provided (or if RSA key is configured)
  if (signedData && signature) {
    if (!rsaKey) {
      return {
        ok: false,
        status: 503,
        error: "STORE_KEY_NOT_CONFIGURED",
        message: "کلید عمومی تایید خرید فروشگاه روی سرور تنظیم نشده است.",
      };
    }

    if (!verifyPoolakeyRsaSignature(signedData, signature, rsaKey)) {
      return {
        ok: false,
        status: 403,
        error: "INVALID_PURCHASE_SIGNATURE",
        message: "امضای دیجیتال رسید خرید نامعتبر است.",
      };
    }

    let parsedReceipt: any = null;
    try {
      parsedReceipt = JSON.parse(signedData);
    } catch {
      return {
        ok: false,
        status: 400,
        error: "INVALID_SIGNED_DATA",
        message: "ساختار رسید خرید نامعتبر است.",
      };
    }

    if (parsedReceipt?.purchaseToken !== trimmedToken || parsedReceipt?.productId !== productId) {
      return {
        ok: false,
        status: 403,
        error: "RECEIPT_MISMATCH",
        message: "اطلاعات رسید خرید با محصول یا توکن ارسالی مطابقت ندارد.",
      };
    }

    const receiptPayload = String(parsedReceipt?.developerPayload ?? developerPayload ?? "").trim();
    if (receiptPayload && !receiptPayload.includes(deviceId)) {
      return {
        ok: false,
        status: 403,
        error: "PAYLOAD_DEVICE_MISMATCH",
        message: "رسید خرید متعلق به این دستگاه نیست.",
      };
    }
  } else {
    // 2) Fallback: check Store Server-to-Server API if configured, otherwise require signed receipt
    const bazaarToken = process.env.BAZAAR_DEVELOPER_API_TOKEN?.trim();
    const bazaarPkg = process.env.ANDROID_PACKAGE_NAME?.trim() || "ir.eblaghyar.app";
    if (bazaarToken && store === "bazaar") {
      try {
        const validateUrl = `https://pardakht.cafebazaar.ir/devapi/v2/api/validate/${encodeURIComponent(
          bazaarPkg
        )}/inapp/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(trimmedToken)}/`;
        const storeRes = await fetch(validateUrl, {
          method: "GET",
          headers: { "CAFEBAZAAR-PISHKHAN-API-SECRET": bazaarToken },
        });
        if (!storeRes.ok) {
          return {
            ok: false,
            status: 403,
            error: "STORE_VERIFICATION_FAILED",
            message: "خرید توسط سرور کافه‌بازار تأیید نشد.",
          };
        }
        const storeData: any = await storeRes.json().catch(() => null);
        if (storeData?.purchaseState !== 0) {
          return {
            ok: false,
            status: 403,
            error: "PURCHASE_NOT_COMPLETED",
            message: "وضعیت خرید در فروشگاه تکمیل نشده یا لغو شده است.",
          };
        }
        if (storeData?.developerPayload && !String(storeData.developerPayload).includes(deviceId)) {
          return {
            ok: false,
            status: 403,
            error: "PAYLOAD_DEVICE_MISMATCH",
            message: "شناسه دستگاه در رسید کافه‌بازار مطابقت ندارد.",
          };
        }
      } catch {
        return {
          ok: false,
          status: 502,
          error: "STORE_UNAVAILABLE",
          message: "خطا در استعلام خرید از سرور کافه‌بازار.",
        };
      }
    } else {
      return {
        ok: false,
        status: 403,
        error: "MISSING_PURCHASE_VERIFICATION",
        message: "امضای رسید خرید (signedData و signature) یا تأیید استور الزامی است.",
      };
    }
  }

  if (developerPayload && !String(developerPayload).includes(deviceId)) {
    return {
      ok: false,
      status: 403,
      error: "PAYLOAD_DEVICE_MISMATCH",
      message: "payload خرید با شناسه دستگاه مطابقت ندارد.",
    };
  }

  // 3) Replay prevention: atomically record consumed purchase token
  if (inMemoryConsumedPurchaseTokens.has(trimmedToken)) {
    return {
      ok: false,
      status: 409,
      error: "PURCHASE_ALREADY_CONSUMED",
      message: "این رسید خرید قبلاً استفاده شده است.",
    };
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error: insertErr } = await supabase.from("consumed_purchase_tokens").insert({
      purchase_token: trimmedToken,
      device_id: deviceId,
      product_id: productId,
      store,
      order_id: orderId || null,
      developer_payload: developerPayload || null,
    });

    if (insertErr) {
      if (insertErr.code === "23505" || String(insertErr.message || "").toLowerCase().includes("duplicate")) {
        return {
          ok: false,
          status: 409,
          error: "PURCHASE_ALREADY_CONSUMED",
          message: "این رسید خرید قبلاً مصرف شده است.",
        };
      }
      console.error("[Android Billing] Failed recording consumed token:", insertErr);
      return {
        ok: false,
        status: 500,
        error: "PURCHASE_LOG_FAILED",
        message: "خطا در ثبت ایمن رسید خرید.",
      };
    }
  }

  inMemoryConsumedPurchaseTokens.add(trimmedToken);
  return { ok: true };
}

// 2. Activate Premium Endpoint (Hardened with Poolakey/Store Verification + Replay Protection)
apiRouter.post("/activate-premium", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const {
      deviceId,
      purchaseToken,
      productId = "premium",
      store = "bazaar",
      signedData,
      signature,
      developerPayload,
      payload,
      orderId,
    } = req.body || {};

    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    if (!ANDROID_PREMIUM_PRODUCTS.has(String(productId))) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PRODUCT_ID",
        message: "شناسه محصول پرمیوم معتبر نیست.",
      });
    }

    const verification = await verifyAndConsumeAndroidPurchase({
      deviceId: deviceId.trim(),
      purchaseToken,
      productId: String(productId),
      store: String(store || "bazaar").toLowerCase(),
      signedData,
      signature,
      developerPayload: developerPayload ?? payload,
      orderId,
    });

    if ("error" in verification) {
      return res.status(verification.status).json({
        success: false,
        error: verification.error,
        message: verification.message,
      });
    }

    // محاسبه تاریخ انقضا (یک سال از تاریخ خرید)
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const memDevice = getInMemoryDevice(deviceId.trim());
    memDevice.is_premium = true;
    memDevice.premium_expires_at = expiresAt;

    let savedData: any = memDevice;

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from("devices")
          .upsert(
            {
              device_id: deviceId.trim(),
              is_premium: true,
              premium_expires_at: expiresAt,
            },
            { onConflict: "device_id" }
          )
          .select()
          .maybeSingle();

        if (!error && data) {
          savedData = data;
        }
      }
    } catch (dbErr) {
      console.warn("Supabase upsert failed during activate-premium, using memory state:", dbErr);
    }

    return res.json({
      success: true,
      message: "نسخه پرمیوم یک‌ساله با موفقیت برای این دستگاه فعال شد.",
      device: savedData,
    });
  } catch (err: any) {
    console.error("activate-premium error:", err);
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "خطای سرور در فعال‌سازی نسخه پرمیوم.",
    });
  }
});

// 2.5. Buy Coins Endpoint (Hardened with Poolakey/Store Verification + Replay Protection)
apiRouter.post("/buy-coins", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const {
      deviceId,
      purchaseToken,
      productId,
      store = "bazaar",
      signedData,
      signature,
      developerPayload,
      payload,
      orderId,
    } = req.body || {};

    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    const resolvedProductId = String(productId || "");
    const count = ANDROID_COIN_PRODUCTS[resolvedProductId];
    if (!count) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PRODUCT_ID",
        message: "شناسه بسته سکه معتبر نیست (coins_5 یا coins_15).",
      });
    }

    const verification = await verifyAndConsumeAndroidPurchase({
      deviceId: deviceId.trim(),
      purchaseToken,
      productId: resolvedProductId,
      store: String(store || "bazaar").toLowerCase(),
      signedData,
      signature,
      developerPayload: developerPayload ?? payload,
      orderId,
    });

    if ("error" in verification) {
      return res.status(verification.status).json({
        success: false,
        error: verification.error,
        message: verification.message,
      });
    }

    const memDevice = getInMemoryDevice(deviceId.trim());
    const currentTokens = typeof memDevice.free_tokens === "number" ? memDevice.free_tokens : 2;
    const newTokens = currentTokens + count;
    memDevice.free_tokens = newTokens;

    let savedData: any = memDevice;

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: existing } = await supabase
          .from("devices")
          .select("free_tokens")
          .eq("device_id", deviceId.trim())
          .maybeSingle();

        const baseTokens = existing && typeof existing.free_tokens === "number" ? existing.free_tokens : currentTokens;
        const updatedTokens = baseTokens + count;

        const { data, error } = await supabase
          .from("devices")
          .upsert(
            {
              device_id: deviceId.trim(),
              free_tokens: updatedTokens,
            },
            { onConflict: "device_id" }
          )
          .select()
          .maybeSingle();

        if (!error && data) {
          savedData = data;
          memDevice.free_tokens = data.free_tokens;
        }
      }
    } catch (dbErr) {
      console.warn("Supabase upsert failed during buy-coins, using memory state:", dbErr);
    }

    return res.json({
      success: true,
      message: `${count} سکه با موفقیت به حساب شما اضافه شد.`,
      free_tokens: memDevice.free_tokens,
      device: savedData,
    });
  } catch (err: any) {
    console.error("buy-coins error:", err);
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "خطای سرور در خرید سکه.",
    });
  }
});

// Shared Web AI Access Middleware wrapper (hoists to webAiGuard defined below)
const requireWebAiAccessIfWebOnly: express.RequestHandler = (req, res, next) => {
  return webAiAccessMiddleware(req, res, next);
};

// 3. Generate Legal Defense Draft
apiRouter.post("/generate-defense-draft", requireWebAiAccessIfWebOnly, async (req, res) => {
  try {
    const { analysis, draftType, userCustomFacts, userFullName, userNationalCode, attachedEvidences } = req.body || {};

    if (!analysis) {
      return res.status(400).json({ error: "اطلاعات تحلیل ابلاغیه ارسال نشده است." });
    }

    const ai = getGeminiClient();

    const draftTypePrompt =
      draftType === "extension_request"
        ? "لایحه تقاضای استمهال، تمدید مهلت و مطالعه پرونده"
        : draftType === "procedural_objection"
        ? "لایحه ایراد عدم صلاحیت محلی/ذاتی و ایرادات شکلی اولیه"
        : draftType === "settlement_proposal"
        ? "لایحه اعلام آمادگی صلح و سازش و ارجاع به شورای حل اختلاف یا داوری"
        : "لایحه جامع دفاعیه در ماهیت و رد ادعا / اتهام انتسابی";

    const prompt = `
شما یک وکیل مجرب پایه یک دادگستری و متخصص تنظیم لوایح حقوقی در محاکم ایران هستید.
بر اساس تحلیل ابلاغیه و پرونده زیر، یک «پیش‌نویس لایحه حقوقی مستند و شایسته» جهت بررسی اولیه کاربر و اصلاح نهایی توسط وکیل تنظیم فرمایید:

اطلاعات پرونده:
- مرجع رسیدگی: ${analysis.caseDetails?.issuingAuthority || "شعبه محترم دادگاه/دادسرا"}
- نوع پرونده: ${analysis.caseDetails?.caseType || "نامشخص"}
- نقش شخص: ${analysis.caseDetails?.userRole || "متهم/خوانده"}
- موضوع: ${analysis.caseDetails?.subject || "موضوع مطروحه"}
- شماره پرونده: ${analysis.caseDetails?.caseNumber || "ثبت شده در سامانه ثنا"}
- شماره بایگانی: ${analysis.caseDetails?.archiveNumber || "بایگانی شعبه"}
- شماره ابلاغیه: ${analysis.caseDetails?.noticeNumber || "ابلاغیه ثنا"}
- نام کاربر: ${userFullName || "[نام و نام خانوادگی]"}
- کد ملی: ${userNationalCode || "[کد ملی]"}

نوع لایحه درخواستی: ${draftTypePrompt}

نکات و واقعیت‌های اعلامی کاربر:
${userCustomFacts ? userCustomFacts : "تکذیب هرگونه تخلف/بدهی، استناد به اصل برائت و تقاضای رسیدگی عادلانه"}

مدارک پیوست:
${attachedEvidences && attachedEvidences.length > 0 ? attachedEvidences.join(" - ") : "مدارک شناسایی، تصویر ابلاغیه، رسیدها و اسناد پیوست"}

الزامات نگارش:
۱. رعایت کامل اصول نگارش لوایح دادگستری ایران (شروع با بسمه تعالی، عنوان شعبه، مشخصات طرفین، مقدمه، شرح استدلال و مستندات قانونی دقیق، خواسته‌ها و تقاضا، منضمات و امضا).
۲. استفاده از مواد قانونی دقیق و واقعی ایران مرتبط با موضوع.
۳. روان بودن و عدم استفاده از عباراتی که به عنوان اقرار ناخواسته تلقی گردد.
۴. درج تذکر حرفه‌ای جهت ضرورت بررسی نهایی توسط وکیل قبل از ثبت در سامانه خدمات الکترونیک قضایی.

لطفاً نتیجه را دقیقاً در قالب ساختار JSON زیر خروجی دهید:
`;

    const response = await generateWithFallbackAndRetry(ai, {
      model: "gemini-3.7-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: IRANIAN_LEGAL_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "عنوان رسمی لایحه" },
            recipientAuthority: { type: Type.STRING, description: "مرجع خطاب لایحه" },
            preamble: { type: Type.STRING, description: "مقدمه لایحه" },
            legalArguments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "بندهای استدلال حقوقی و دفاعیات",
            },
            statutoryReferences: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "مواد قانونی مورد استناد دقیق",
            },
            petitionsAndRequests: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "خواسته‌ها و تقاضای مشخص از قاضی",
            },
            attachmentsList: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "فهرست ضمائم و مدارک پیوست",
            },
            fullFormattedText: {
              type: Type.STRING,
              description: "متن کامل، آماده و دارای فرمت استاندارد قضایی",
            },
            lawyerReviewAdvice: {
              type: Type.STRING,
              description: "توصیه و هشدار وکیل برای چک نهایی قبل از ارسال",
            },
          },
          required: [
            "title",
            "recipientAuthority",
            "preamble",
            "legalArguments",
            "statutoryReferences",
            "petitionsAndRequests",
            "fullFormattedText",
            "lawyerReviewAdvice",
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("پاسخی از هوش مصنوعی دریافت نشد.");
    }

    const draftResult = cleanAndParseJSON(responseText);
    return res.json({ success: true, draft: draftResult });
  } catch (error: any) {
    console.error("Error generating draft:", error);
    return res.status(500).json({
      success: false,
      error: "خطا در تولید پیش‌نویس لایحه دفاعیه. لطفاً دوباره تلاش کنید.",
    });
  }
});

// 4. Chat with Legal Assistant
apiRouter.post("/chat", requireWebAiAccessIfWebOnly, async (req, res) => {
  try {
    const { messages, contextAnalysis, userQuestion, sectionContext } = req.body || {};

    if (!userQuestion) {
      return res.status(400).json({ error: "متن سوال مشخص نشده است." });
    }

    const ai = getGeminiClient();

    const sectionPromptSnippet = sectionContext
      ? `
⚠️ تمرکز ویژه بر بخش خاصی از ابلاغیه:
کاربر در حال حاضر سوال جزئی مشخصی درباره بخش زیر از ابلاغیه مطرح کرده است:
- عنوان بخش: ${sectionContext.sectionTitle || "بخش منتخب"}
- محتوای این بخش در ابلاغیه:
"""
${sectionContext.sectionSnippet || ""}
"""
لطفاً در پاسخ خود، ضمن در نظر گرفتن کل پرونده، به طور موشکافانه و دقیق بر همین بخش و آثار و الزامات قانونی آن بر اساس قوانین ایران تمرکز کنید.
`
      : "";

    const systemPromptWithContext = `
${IRANIAN_LEGAL_SYSTEM_PROMPT}

اطلاعات پرونده و ابلاغیه فعلی کاربر به شرح زیر است:
عنوان ابلاغیه: ${contextAnalysis?.title || "ابلاغیه قضایی"}
مرجع: ${contextAnalysis?.caseDetails?.issuingAuthority || "نامشخص"}
نوع پرونده: ${contextAnalysis?.caseDetails?.caseType || "نامشخص"}
نقش کاربر: ${contextAnalysis?.caseDetails?.userRole || "نامشخص"}
موضوع: ${contextAnalysis?.caseDetails?.subject || "نامشخص"}
خلاصه پرونده: ${contextAnalysis?.summaryInSimpleWords || "نامشخص"}
مهلت‌ها: ${contextAnalysis?.deadlines?.deadlineDescription || "نامشخص"}
مستند قانونی: ${contextAnalysis?.deadlines?.legalBasis || "نامشخص"}
${sectionPromptSnippet}

به سوالات کاربر پیرامون این ابلاغیه، بندهای خاص، رویه قضایی دادگاه‌های ایران، نحوه دفاع، نگارش لایحه، استمهال، مواد قانونی مرتبط و مراحل عملی با نهایت صمیمیت، دقت حقوقی و زبان شفاف پاسخ دهید.
`;

    const formattedContents: any[] = [];

    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        formattedContents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    formattedContents.push({
      role: "user",
      parts: [{ text: userQuestion }],
    });

    const response = await generateWithFallbackAndRetry(ai, {
      model: "gemini-3.7-flash",
      contents: formattedContents,
      config: {
        systemInstruction: systemPromptWithContext,
      },
    });

    const answer = response.text || "متاسفانه پاسخی دریافت نشد.";
    return res.json({ success: true, answer });
  } catch (error: any) {
    console.error("Error in legal chat:", error);
    const errMsg = String(error?.message || "");
    const isUnavailable =
      error?.code === 503 ||
      error?.code === 504 ||
      error?.status === "UNAVAILABLE" ||
      errMsg.includes("GEMINI_TIMEOUT") ||
      errMsg.includes("503") ||
      errMsg.includes("high demand") ||
      errMsg.includes("UNAVAILABLE") ||
      errMsg.includes("429");

    return res.status(isUnavailable ? 503 : 500).json({
      success: false,
      isTemporary: isUnavailable,
      error: isUnavailable
        ? "سرویس هوش مصنوعی در حال حاضر با ترافیک بالایی روبرو است. لطفاً چند لحظه دیگر دوباره تلاش کنید."
        : "خطا در برقراری ارتباط با دستیار حقوقی. لطفاً دوباره تلاش کنید.",
    });
  }
});

// ==========================================
// Legacy Zarinpal Payment Endpoints (Hardened - No Mock/Fallback)
// ==========================================

apiRouter.post("/payment/zarinpal/request", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const { productType, deviceId } = req.body || {};
    if (!deviceId || typeof deviceId !== "string" || !productType || typeof productType !== "string") {
      return res.status(400).json({ success: false, error: "شناسه دستگاه و نوع محصول الزامی هستند." });
    }

    if (!Object.prototype.hasOwnProperty.call(LEGACY_ZARINPAL_PRICES, productType)) {
      return res.status(400).json({ success: false, error: "محصول درخواستی معتبر نیست." });
    }

    const typedProduct = productType as "coins_5" | "coins_15" | "premium";
    const item = LEGACY_ZARINPAL_PRICES[typedProduct];
    const merchantId = getConfiguredZarinpalMerchantId();

    if (!merchantId) {
      return res.status(503).json({
        success: false,
        error: "درگاه پرداخت زرین‌پال پیکربندی نشده است (ZARINPAL_MERCHANT_ID).",
      });
    }

    const callbackUrl = `${getWebRedirectBaseUrl(req)}/api/payment/zarinpal/verify`;

    const zarinpalRes = await fetch("https://api.zarinpal.com/pg/v4/payment/request.json", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: item.amountRials,
        callback_url: callbackUrl,
        description: item.label,
      }),
    });

    const data: any = await zarinpalRes.json().catch(() => null);
    if (data?.data?.code !== 100 || !data?.data?.authority) {
      return res.status(502).json({
        success: false,
        error: data?.errors?.message || data?.data?.message || "درگاه زرین‌پال درخواست پرداخت را تایید نکرد.",
      });
    }

    const authority = String(data.data.authority);
    const trimmedDeviceId = deviceId.trim();

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("legacy_zarinpal_orders").insert({
        authority,
        device_id: trimmedDeviceId,
        product_type: typedProduct,
        amount_rials: item.amountRials,
        status: "pending",
      });
    }
    inMemoryLegacyZarinpalOrders.set(authority, {
      authority,
      device_id: trimmedDeviceId,
      product_type: typedProduct,
      amount_rials: item.amountRials,
      status: "pending",
    });

    return res.json({
      success: true,
      authority,
      paymentUrl: `https://www.zarinpal.com/pg/StartPay/${authority}`,
    });
  } catch (e: any) {
    console.error("Zarinpal legacy request error:", e);
    return res.status(502).json({
      success: false,
      error: "خطا در برقراری ارتباط با درگاه زرین‌پال.",
    });
  }
});

apiRouter.get("/payment/zarinpal/verify", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const rawAuthority = req.query?.Authority;
    const rawStatus = req.query?.Status;
    const authority = (Array.isArray(rawAuthority) ? rawAuthority[0] : rawAuthority)?.toString().trim() || "";
    const statusParam = (Array.isArray(rawStatus) ? rawStatus[0] : rawStatus)?.toString().trim() || "";

    if (!authority || !AUTHORITY_REGEX.test(authority)) {
      return res.redirect("/?payment=failed");
    }

    const supabase = getSupabaseClient();
    let order: any = null;
    if (supabase) {
      const { data } = await supabase
        .from("legacy_zarinpal_orders")
        .select("*")
        .eq("authority", authority)
        .maybeSingle();
      order = data;
    }
    if (!order) {
      order = inMemoryLegacyZarinpalOrders.get(authority) || null;
    }

    if (!order) {
      return res.redirect("/?payment=failed");
    }

    if (order.status === "paid") {
      const item = LEGACY_ZARINPAL_PRICES[order.product_type as "coins_5" | "coins_15" | "premium"];
      return res.redirect(`/?payment=success&added=${item?.coins || 0}&premium=${Boolean(item?.isPremium)}`);
    }

    if (statusParam !== "OK") {
      if (supabase) {
        await supabase
          .from("legacy_zarinpal_orders")
          .update({ status: "failed" })
          .eq("authority", authority)
          .eq("status", "pending");
      }
      order.status = "failed";
      return res.send(
        `<html><body style="font-family:Tahoma;direction:rtl;text-align:center;padding:50px;"><h2 style="color:red;">پرداخت لغو شد یا انجام نشد.</h2><a href="/">بازگشت به برنامه</a></body></html>`
      );
    }

    const merchantId = getConfiguredZarinpalMerchantId();
    if (!merchantId) {
      return res.redirect("/?payment=failed");
    }

    const verifyRes = await fetch("https://api.zarinpal.com/pg/v4/payment/verify.json", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Number(order.amount_rials),
        authority,
      }),
    });
    const verifyData: any = await verifyRes.json().catch(() => null);
    const code = verifyData?.data?.code;
    const refId = verifyData?.data?.ref_id != null ? String(verifyData.data.ref_id) : null;

    if (code !== 100 && code !== 101) {
      if (supabase) {
        await supabase
          .from("legacy_zarinpal_orders")
          .update({ status: "failed" })
          .eq("authority", authority)
          .in("status", ["pending"]);
      }
      order.status = "failed";
      return res.redirect("/?payment=failed");
    }

    let claimed = false;
    if (supabase) {
      const { data: updatedOrder } = await supabase
        .from("legacy_zarinpal_orders")
        .update({ status: "paid", ref_id: refId, paid_at: new Date().toISOString() })
        .eq("authority", authority)
        .in("status", ["pending", "failed"])
        .select("*")
        .maybeSingle();
      claimed = Boolean(updatedOrder);
    } else if (order.status !== "paid") {
      order.status = "paid";
      order.ref_id = refId;
      claimed = true;
    }

    const item = LEGACY_ZARINPAL_PRICES[order.product_type as "coins_5" | "coins_15" | "premium"];
    const tokensToAdd = item?.coins || 0;
    const makePremium = Boolean(item?.isPremium);

    if (claimed) {
      const targetDeviceId = order.device_id;
      const expiresAt = makePremium ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
      if (supabase) {
        const { data: dev } = await supabase.from("devices").select("*").eq("device_id", targetDeviceId).maybeSingle();
        if (dev) {
          await supabase
            .from("devices")
            .update({
              free_tokens: (dev.free_tokens || 0) + tokensToAdd,
              is_premium: dev.is_premium || makePremium,
              ...(makePremium ? { premium_expires_at: expiresAt } : {}),
            })
            .eq("device_id", targetDeviceId);
        } else {
          await supabase.from("devices").insert({
            device_id: targetDeviceId,
            free_tokens: 2 + tokensToAdd,
            is_premium: makePremium,
            ...(makePremium ? { premium_expires_at: expiresAt } : {}),
          });
        }
      } else {
        const memDev = getInMemoryDevice(targetDeviceId);
        memDev.free_tokens += tokensToAdd;
        if (makePremium) {
          memDev.is_premium = true;
          memDev.premium_expires_at = expiresAt;
        }
      }
    }

    return res.redirect(`/?payment=success&added=${tokensToAdd}&premium=${makePremium}`);
  } catch (e: any) {
    console.error("Zarinpal legacy verify error:", e);
    return res.redirect("/?payment=error&message=verify_failed");
  }
});

// ==========================================
// Web Products Configuration & Web Auth Routes (/api/web/auth/*)
// ==========================================

// TODO: مقادیر مبلغ (به ریال) جایگزین موقت هستند؛ پیش از انتشار نهایی با قیمت قطعی جایگزین شوند
export const WEB_PRODUCTS = {
  single: {
    amountRials: 690000, // ۶۹,۰۰۰ تومان
    credits: 1,
    label: "تحلیل تکی ابلاغیه (نسخه وب)",
  },
  pack_5: {
    amountRials: 2390000, // ۲۳۹,۰۰۰ تومان
    credits: 5,
    label: "بسته ۵ عددی تحلیل ابلاغیه (نسخه وب)",
  },
  pack_10: {
    amountRials: 3690000, // ۳۶۹,۰۰۰ تومان
    credits: 10,
    label: "بسته ۱۰ عددی تحلیل ابلاغیه (نسخه وب)",
  },
  annual: {
    amountRials: 3990000,
    dailyLimit: 3,
    durationDays: 365,
    label: "اشتراک یک‌ساله وب ابلاغ‌یار (تا ۳ تحلیل در روز)",
  },
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;
const AUTHORITY_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const ALLOWED_WEB_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function getClientIp(req: express.Request): string {
  const vercelIp = req.headers["x-vercel-forwarded-for"];
  const rawVercel = (Array.isArray(vercelIp) ? vercelIp[0] : vercelIp)?.trim();
  if (rawVercel) {
    const firstIp = rawVercel.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  if (String(process.env.TRUST_CF_HEADER || "").trim().toLowerCase() === "true") {
    const cfIp = req.headers["cf-connecting-ip"];
    const rawCf = (Array.isArray(cfIp) ? cfIp[0] : cfIp)?.trim();
    if (rawCf) return rawCf;
  }

  const xff = req.headers["x-forwarded-for"];
  const rawXff = (Array.isArray(xff) ? xff[0] : xff)?.trim();
  if (rawXff) {
    const firstIp = rawXff.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = req.headers["x-real-ip"];
  const rawReal = (Array.isArray(xRealIp) ? xRealIp[0] : xRealIp)?.trim();
  if (rawReal) return rawReal;

  return req.ip || req.socket?.remoteAddress || "unknown";
}

const rateLimiterResetCallbacks: Array<() => void> = [];

export function __resetTestState(): void {
  inMemoryDevices.clear();
  inMemoryFingerprints.clear();
  inMemoryConsumedPurchaseTokens.clear();
  inMemoryLegacyZarinpalOrders.clear();
  for (const resetFn of rateLimiterResetCallbacks) {
    resetFn();
  }
}

async function incrementUpstashRateLimit(
  bucketKey: string,
  windowMs: number
): Promise<{ count: number; resetAt: number } | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) {
    return null;
  }

  try {
    const baseUrl = redisUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(`${baseUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", bucketKey],
          ["PTTL", bucketKey],
        ]),
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const results: any = await res.json().catch(() => null);
      if (!Array.isArray(results) || results.length < 2) return null;

      const count = Number(results[0]?.result);
      let pttl = Number(results[1]?.result);
      if (!Number.isFinite(count) || count <= 0) return null;

      if (!Number.isFinite(pttl) || pttl <= 0) {
        await fetch(`${baseUrl}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redisToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([["PEXPIRE", bucketKey, windowMs]]),
        }).catch(() => {});
        pttl = windowMs;
      }

      return { count, resetAt: Date.now() + pttl };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

function createIpRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  message: string;
}): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  rateLimiterResetCallbacks.push(() => hits.clear());

  return async (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next();
    }

    const now = Date.now();
    const ip = getClientIp(req);
    const bucketKey = `rl:${options.keyPrefix}:${ip}`;

    let count = 1;
    let resetAt = now + options.windowMs;

    const redisResult = await incrementUpstashRateLimit(bucketKey, options.windowMs);
    if (redisResult) {
      count = redisResult.count;
      resetAt = redisResult.resetAt;
    } else {
      if (hits.size > 2000) {
        for (const [key, entry] of hits.entries()) {
          if (entry.resetAt <= now) {
            hits.delete(key);
          }
        }
      }

      const existing = hits.get(bucketKey);
      if (existing && existing.resetAt > now) {
        count = existing.count + 1;
        resetAt = existing.resetAt;
      }
      hits.set(bucketKey, { count, resetAt });
    }

    const remaining = Math.max(0, options.maxRequests - count);
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));

    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (count > options.maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message: options.message,
      });
    }

    next();
  };
}

const webAuthRateLimiter = createIpRateLimiter({
  keyPrefix: "web_auth",
  windowMs: 15 * 60 * 1000,
  maxRequests: 45,
  message: "تعداد درخواست‌های احراز هویت از این نشانی بیش از حد مجاز است. لطفاً دقایقی دیگر تلاش کنید.",
});

const webAuthMutationRateLimiter = createIpRateLimiter({
  keyPrefix: "web_auth_mut",
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  message: "تعداد تلاش‌های ورود یا ثبت‌نام بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر دوباره امتحان کنید.",
});

const webPaymentRateLimiter = createIpRateLimiter({
  keyPrefix: "web_pay",
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: "تعداد درخواست‌های پرداخت از این نشانی بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.",
});

const webAnalyzeRateLimiter = createIpRateLimiter({
  keyPrefix: "web_analyze",
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  message: "تعداد درخواست‌های تحلیل در بازه زمانی کوتاه بیش از حد مجاز است. لطفاً دقایقی دیگر تلاش کنید.",
});

const webAiRateLimiter = createIpRateLimiter({
  keyPrefix: "web_ai_tools",
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  message: "تعداد درخواست‌های مشاوره و تنظیم لایحه در بازه زمانی کوتاه بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.",
});

apiRouter.use("/web/auth", webAuthRateLimiter);
apiRouter.use("/web/payment", webPaymentRateLimiter);
apiRouter.use("/web/analyze", webAnalyzeRateLimiter);

async function verifyTurnstileIfEnabled(
  token: unknown,
  remoteIp: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secretKey) {
    return { ok: true };
  }

  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (!tokenStr) {
    return { ok: false, error: "لطفاً تأیید امنیتی (کپچا) را تکمیل کنید." };
  }

  try {
    const form = new URLSearchParams({
      secret: secretKey,
      response: tokenStr,
      ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
    });
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data: any = await verifyRes.json().catch(() => null);
    if (data?.success === true) {
      return { ok: true };
    }
    return { ok: false, error: "تأیید امنیتی (کپچا) معتبر نبود. لطفاً دوباره امتحان کنید." };
  } catch {
    return { ok: false, error: "خطا در بررسی تأیید امنیتی. لطفاً دوباره تلاش کنید." };
  }
}

async function logWebUsage(
  serviceClient: SupabaseClient | null,
  entry: {
    userId?: string | null;
    deviceId?: string | null;
    paymentId?: string | null;
    action: string;
    accessMode?: string | null;
    metadata?: Record<string, any> | null;
  }
): Promise<void> {
  if (!serviceClient) return;
  try {
    await serviceClient.from("web_usage_logs").insert({
      user_id: entry.userId || null,
      device_id: entry.deviceId || null,
      payment_id: entry.paymentId || null,
      action: entry.action,
      access_mode: entry.accessMode || null,
      metadata: entry.metadata || null,
    });
  } catch {
    // Audit logging must never fail the user request
  }
}

const AI_TOOLS_PASS_WINDOW_MS = 24 * 60 * 60 * 1000;

type WebAccessMode =
  | { kind: "annual"; userId: string; today: string; usedToday: number }
  | { kind: "credits"; userId: string }
  | { kind: "entitlement"; paymentId: string; deviceId: string; claimId?: string }
  | { kind: "ai_tools_pass"; userId?: string | null; deviceId?: string | null; validUntil: string };

type WebAccessResolution =
  | { ok: true; accessMode: WebAccessMode; verifiedUserId: string | null; deviceId: string }
  | { ok: false; status: number; error: string; message: string; extra?: Record<string, any> };

async function findRecentPaidAnalyzePass(
  serviceClient: SupabaseClient,
  verifiedUserId: string | null,
  deviceId: string
): Promise<string | null> {
  const cutoffIso = new Date(Date.now() - AI_TOOLS_PASS_WINDOW_MS).toISOString();

  if (verifiedUserId) {
    const { data: rows } = await serviceClient
      .from("web_usage_logs")
      .select("created_at")
      .eq("user_id", verifiedUserId)
      .eq("action", "analyze")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.created_at) {
      return new Date(new Date(row.created_at).getTime() + AI_TOOLS_PASS_WINDOW_MS).toISOString();
    }
  }

  if (deviceId && DEVICE_ID_REGEX.test(deviceId)) {
    const { data: rows } = await serviceClient
      .from("web_usage_logs")
      .select("created_at")
      .eq("device_id", deviceId)
      .eq("action", "analyze")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.created_at) {
      return new Date(new Date(row.created_at).getTime() + AI_TOOLS_PASS_WINDOW_MS).toISOString();
    }
  }

  return null;
}

async function resolveWebAccessForRequest(
  req: express.Request,
  serviceClient: SupabaseClient,
  options?: { allowRecentAnalyzePass?: boolean }
): Promise<WebAccessResolution> {
  const rawDeviceId = req.headers["x-device-id"] ?? req.body?.deviceId;
  const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";

  const rawEntitlement = req.headers["x-entitlement-token"] ?? req.body?.entitlementToken;
  const entitlementToken =
    (Array.isArray(rawEntitlement) ? rawEntitlement[0] : rawEntitlement)?.toString().trim() || "";

  const bearerToken = extractBearerToken(req);

  let verifiedUserId: string | null = null;
  let userProfile: any = null;
  let annualDailyLimitHit = false;
  let usedToday = 0;

  if (bearerToken) {
    const authClient = getSupabaseAuthClient();
    if (authClient) {
      const { data: userData, error: userErr } = await authClient.auth.getUser(bearerToken);
      if (!userErr && userData?.user) {
        verifiedUserId = userData.user.id;
        const { data: existingProf } = await serviceClient
          .from("profiles")
          .select("*")
          .eq("id", verifiedUserId)
          .maybeSingle();

        if (existingProf) {
          userProfile = existingProf;
        } else {
          const { data: createdProf } = await serviceClient
            .from("profiles")
            .upsert({ id: verifiedUserId, email: userData.user.email || null }, { onConflict: "id" })
            .select("*")
            .maybeSingle();
          userProfile = createdProf;
        }
      }
    }
  }

  let accessMode: WebAccessMode | null = null;
  const today = getTodayDateString();
  const dailyLimit = WEB_PRODUCTS.annual.dailyLimit;

  if (verifiedUserId && userProfile) {
    const isAnnualActive = Boolean(
      userProfile.annual_expires_at && new Date(userProfile.annual_expires_at) > new Date()
    );
    if (isAnnualActive) {
      usedToday =
        userProfile.last_analysis_date === today ? Number(userProfile.daily_analyses_count || 0) : 0;
      if (usedToday < dailyLimit) {
        accessMode = { kind: "annual", userId: verifiedUserId, today, usedToday };
      } else {
        annualDailyLimitHit = true;
      }
    }

    if (!accessMode && Number(userProfile.credits || 0) > 0) {
      accessMode = { kind: "credits", userId: verifiedUserId };
    }
  }

  let entitlementConsumed = false;
  if (
    !accessMode &&
    entitlementToken &&
    UUID_REGEX.test(entitlementToken) &&
    deviceId &&
    DEVICE_ID_REGEX.test(deviceId)
  ) {
    const { data: paidRow, error: entErr } = await serviceClient
      .from("payments")
      .select("id, device_id, product, status, entitlement_used")
      .eq("entitlement_token", entitlementToken)
      .eq("product", "single")
      .eq("status", "paid")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (!entErr && paidRow) {
      if (paidRow.entitlement_used === false) {
        accessMode = { kind: "entitlement", paymentId: paidRow.id, deviceId };
      } else {
        entitlementConsumed = true;
      }
    }
  }

  if (!accessMode && options?.allowRecentAnalyzePass) {
    const validUntil = await findRecentPaidAnalyzePass(serviceClient, verifiedUserId, deviceId);
    if (validUntil) {
      accessMode = {
        kind: "ai_tools_pass",
        userId: verifiedUserId,
        deviceId: deviceId || null,
        validUntil,
      };
    }
  }

  if (accessMode) {
    return { ok: true, accessMode, verifiedUserId, deviceId };
  }

  if (annualDailyLimitHit) {
    return {
      ok: false,
      status: 403,
      error: "DAILY_LIMIT_REACHED",
      message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است. سهمیه روزانه شما فردا مجدداً شارژ خواهد شد یا می‌توانید بسته اعتبار تهیه فرمایید.`,
      extra: {
        daily_used: usedToday,
        daily_limit: dailyLimit,
        daily_remaining: 0,
      },
    };
  }

  if (entitlementConsumed) {
    return {
      ok: false,
      status: 402,
      error: "ENTITLEMENT_CONSUMED",
      message: "توکن تحلیل تکی شما قبلاً مصرف شده است. لطفاً برای تحلیل جدید اعتبار تهیه کنید.",
    };
  }

  return {
    ok: false,
    status: 402,
    error: "PAYMENT_REQUIRED",
    message: "برای استفاده از این قابلیت در نسخه وب، لطفاً تحلیل تکی خریداری کنید یا وارد حساب کاربری دارای اعتبار شوید.",
  };
}

async function webAiAccessMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (String(process.env.WEB_ONLY || "").trim().toLowerCase() !== "true") {
    return next();
  }

  return webAiRateLimiter(req, res, async () => {
    try {
      const serviceClient = getSupabaseClient();
      if (!serviceClient) {
        return res.status(503).json({
          success: false,
          error: "SERVICE_UNAVAILABLE",
          message: "اتصال به سرویس دیتابیس برقرار نیست.",
        });
      }

      const access = await resolveWebAccessForRequest(req, serviceClient, {
        allowRecentAnalyzePass: true,
      });
      if ("error" in access) {
        return res.status(access.status).json({
          success: false,
          error: access.error,
          message: access.message,
          ...(access.extra || {}),
        });
      }

      await logWebUsage(serviceClient, {
        userId: access.verifiedUserId,
        deviceId: access.deviceId,
        action: req.path.includes("chat") ? "chat" : "defense_draft",
        accessMode: access.accessMode.kind,
      });

      return next();
    } catch (err: any) {
      console.error("[Web AI Guard Error]:", err);
      return res.status(500).json({
        success: false,
        error: "SERVER_ERROR",
        message: "خطا در بررسی دسترسی حساب کاربری.",
      });
    }
  });
}

function getWebRedirectBaseUrl(req: express.Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== "MY_APP_URL") {
    return envUrl.replace(/\/+$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = (rawProto ? rawProto.split(",")[0].trim() : "") || req.protocol || "https";

  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const host = (rawHost ? rawHost.split(",")[0].trim() : "") || req.get("host");

  return `${proto}://${host}`;
}

function isEmailNotConfirmedError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || err?.error_description || err?.msg || "").toLowerCase();
  return code === "email_not_confirmed" || msg.includes("email not confirmed");
}

function translateSupabaseAuthError(err: any, fallback = "خطا در عملیات احراز هویت. لطفاً دوباره تلاش کنید."): string {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || err?.error_description || err?.msg || "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "ایمیل یا رمز عبور واردشده اشتباه است.";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "ایمیل شما هنوز تأیید نشده است. لطفاً صندوق ورودی یا پوشه اسپم ایمیل خود را بررسی کرده و روی لینک تأیید کلیک کنید.";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("user already registered") ||
    msg.includes("already been registered")
  ) {
    return "حساب کاربری با این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید یا از گزینه فراموشی رمز استفاده کنید.";
  }
  if (
    code === "weak_password" ||
    code === "password_too_short" ||
    msg.includes("password should be at least") ||
    msg.includes("password should contain") ||
    msg.includes("weak password")
  ) {
    return "رمز عبور باید حداقل ۸ کاراکتر و شامل ترکیب مطمئنی از حروف و اعداد باشد.";
  }
  if (code === "same_password" || msg.includes("different from the old password")) {
    return "رمز عبور جدید نباید با رمز عبور قبلی یکسان باشد.";
  }
  if (
    code === "email_address_invalid" ||
    msg.includes("unable to validate email address") ||
    msg.includes("invalid email")
  ) {
    return "فرمت ایمیل واردشده معتبر نیست.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("only request this after") ||
    msg.includes("too many requests") ||
    msg.includes("security purposes, you can only request this after")
  ) {
    return "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.";
  }
  if (
    msg.includes("error sending confirmation email") ||
    msg.includes("error sending recovery email") ||
    msg.includes("error sending magic link email") ||
    msg.includes("smtp")
  ) {
    return "ارسال ایمیل تأیید از سوی سرور ایمیل انجام نشد. لطفاً دقایقی دیگر تلاش کنید یا از پنل مدیریت/تنظیمات ایمیل بررسی شود.";
  }
  if (msg.includes("database error saving new user") || msg.includes("database error updating user")) {
    return "خطای پایگاه داده هنگام ثبت اطلاعات کاربر. لطفاً مطمئن شوید اسکریپت‌های SQL پروفایل در Supabase اجرا شده‌اند.";
  }
  if (
    code === "otp_expired" ||
    code === "bad_jwt" ||
    msg.includes("token has expired") ||
    msg.includes("otp_expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("auth session missing")
  ) {
    return "نشست کاربری یا لینک تأیید منقضی یا نامعتبر است. لطفاً دوباره درخواست دهید.";
  }
  if (
    code === "signup_disabled" ||
    code === "email_provider_disabled" ||
    msg.includes("signup is disabled") ||
    msg.includes("email signups are disabled")
  ) {
    return "ثبت‌نام با ایمیل در حال حاضر غیرفعال است.";
  }
  return fallback;
}

function formatWebUserPayload(
  authUser: { id: string; email?: string | null; user_metadata?: any },
  profile: any
) {
  const today = getTodayDateString();
  const annualExpiresAt: string | null = profile?.annual_expires_at || null;
  const isAnnualActive = Boolean(annualExpiresAt && new Date(annualExpiresAt) > new Date());
  const dailyLimit = WEB_PRODUCTS.annual.dailyLimit;
  const dailyUsed = profile?.last_analysis_date === today ? Number(profile?.daily_analyses_count || 0) : 0;
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  return {
    id: authUser.id,
    email: profile?.email || authUser.email || "",
    full_name: profile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || "",
    credits: Number(profile?.credits ?? 0),
    annual_expires_at: annualExpiresAt,
    is_annual_active: isAnnualActive,
    daily_used: dailyUsed,
    daily_limit: dailyLimit,
    daily_remaining: dailyRemaining,
    created_at: profile?.created_at || null,
  };
}

async function fetchOrEnsureWebProfile(authUser: { id: string; email?: string | null; user_metadata?: any }) {
  const serviceClient = getSupabaseClient();
  if (!serviceClient) {
    return formatWebUserPayload(authUser, null);
  }

  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  const metaFullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;

  if (existingProfile) {
    const patch: Record<string, any> = {};
    if (!existingProfile.email && authUser.email) {
      patch.email = authUser.email;
    }
    if (!existingProfile.full_name && metaFullName) {
      patch.full_name = metaFullName;
    }
    if (Object.keys(patch).length > 0) {
      const { data: updatedProfile } = await serviceClient
        .from("profiles")
        .update(patch)
        .eq("id", authUser.id)
        .select("*")
        .maybeSingle();
      return formatWebUserPayload(authUser, updatedProfile || { ...existingProfile, ...patch });
    }
    return formatWebUserPayload(authUser, existingProfile);
  }

  const { data: insertedProfile } = await serviceClient
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email: authUser.email || null,
        full_name: metaFullName,
      },
      { onConflict: "id" }
    )
    .select("*")
    .maybeSingle();

  return formatWebUserPayload(authUser, insertedProfile || { full_name: metaFullName, credits: 0 });
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// GET /api/web/config
apiRouter.get("/web/config", (_req, res) => {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || "";
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || "";
  return res.json({
    success: true,
    turnstileSiteKey: siteKey && secretKey ? siteKey : null,
  });
});

// POST /api/web/auth/register
apiRouter.post("/web/auth/register", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است (SUPABASE_ANON_KEY تنظیم نشده است).",
      });
    }

    const turnstileCheck = await verifyTurnstileIfEnabled(req.body?.turnstileToken, getClientIp(req));
    if ("error" in turnstileCheck) {
      return res.status(400).json({
        success: false,
        error: turnstileCheck.error,
      });
    }

    const rawName = String(req.body?.fullName ?? req.body?.full_name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!rawName || rawName.length < 2 || rawName.length > 120) {
      return res.status(400).json({
        success: false,
        error: "نام و نام خانوادگی باید بین ۲ تا ۱۲۰ کاراکتر باشد.",
      });
    }
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: "لطفاً یک نشانی ایمیل معتبر وارد کنید.",
      });
    }
    if (!password || password.length < 8 || password.length > 128) {
      return res.status(400).json({
        success: false,
        error: "رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.",
      });
    }

    const baseUrl = getWebRedirectBaseUrl(req);
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: rawName,
        },
        emailRedirectTo: `${baseUrl}/?auth=verified`,
      },
    });

    if (error) {
      console.error("[Web Auth Register Supabase Error]:", {
        code: (error as any)?.code,
        status: (error as any)?.status,
        message: error.message,
      });
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(error, "ثبت‌نام انجام نشد. لطفاً اطلاعات را بررسی کنید."),
      });
    }

    // Supabase returns empty identities array when email already exists and confirmation is enabled
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.status(409).json({
        success: false,
        error: "حساب کاربری با این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید یا از بخش بازیابی رمز استفاده کنید.",
      });
    }

    if (data.session && data.user) {
      const userPayload = await fetchOrEnsureWebProfile(data.user);
      return res.status(201).json({
        success: true,
        requiresEmailVerification: false,
        message: "ثبت‌نام با موفقیت انجام شد.",
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? null,
        },
        user: userPayload,
      });
    }

    // Pre-create profile row cleanly if service client is available (even before email confirmation)
    if (data.user?.id) {
      await fetchOrEnsureWebProfile({
        ...data.user,
        user_metadata: { ...(data.user.user_metadata || {}), full_name: rawName },
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      message: "ثبت‌نام با موفقیت انجام شد. لینک تأیید به ایمیل شما ارسال گردید؛ لطفاً صندوق ورودی (و پوشه اسپم) را بررسی کرده و پس از تأیید وارد شوید.",
      session: null,
      user: null,
    });
  } catch (err: any) {
    console.error("[Web Auth Register Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در فرآیند ثبت‌نام. لطفاً لحظاتی دیگر تلاش کنید.",
    });
  }
});

// POST /api/web/auth/login
apiRouter.post("/web/auth/login", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است (SUPABASE_ANON_KEY تنظیم نشده است).",
      });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: "لطفاً یک نشانی ایمیل معتبر وارد کنید.",
      });
    }
    if (!password || password.length > 128) {
      return res.status(400).json({
        success: false,
        error: "لطفاً رمز عبور معتبر را وارد کنید.",
      });
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      const emailNotConfirmed = isEmailNotConfirmedError(error);
      if (error && !String(error.message || "").toLowerCase().includes("invalid login credentials")) {
        console.warn("[Web Auth Login Supabase Warning]:", {
          code: (error as any)?.code,
          status: (error as any)?.status,
          message: error.message,
        });
      }
      return res.status(401).json({
        success: false,
        code: emailNotConfirmed ? "EMAIL_NOT_CONFIRMED" : "INVALID_CREDENTIALS",
        error: translateSupabaseAuthError(error, "ایمیل یا رمز عبور اشتباه است."),
      });
    }

    const userPayload = await fetchOrEnsureWebProfile(data.user);

    return res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      },
      user: userPayload,
    });
  } catch (err: any) {
    console.error("[Web Auth Login Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در ورود به حساب کاربری.",
    });
  }
});

// POST /api/web/auth/refresh
apiRouter.post("/web/auth/refresh", async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const refreshToken = String(req.body?.refresh_token ?? req.body?.refreshToken ?? "").trim();
    if (!refreshToken || refreshToken.length > 2048) {
      return res.status(400).json({
        success: false,
        error: "توکن بازیابی (refresh_token) معتبر ارسال نشده است.",
      });
    }

    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      return res.status(401).json({
        success: false,
        error: translateSupabaseAuthError(error, "نشست کاربری شما منقضی شده است. لطفاً مجدداً وارد شوید."),
      });
    }

    const userPayload = await fetchOrEnsureWebProfile(data.user);

    return res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      },
      user: userPayload,
    });
  } catch (err: any) {
    console.error("[Web Auth Refresh Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در تمدید نشست کاربری.",
    });
  }
});

// POST /api/web/auth/logout
apiRouter.post("/web/auth/logout", async (req, res) => {
  try {
    const token = extractBearerToken(req) || String(req.body?.access_token ?? "").trim();
    const serviceClient = getSupabaseClient();

    if (token && serviceClient) {
      await serviceClient.auth.admin.signOut(token).catch(() => {});
    }

    return res.json({
      success: true,
      message: "خروج از حساب کاربری با موفقیت انجام شد.",
    });
  } catch (err: any) {
    console.error("[Web Auth Logout Error]:", err);
    return res.json({
      success: true,
      message: "خروج انجام شد.",
    });
  }
});

// POST /api/web/auth/resend-verification
apiRouter.post("/web/auth/resend-verification", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const turnstileCheck = await verifyTurnstileIfEnabled(req.body?.turnstileToken, getClientIp(req));
    if ("error" in turnstileCheck) {
      return res.status(400).json({
        success: false,
        error: turnstileCheck.error,
      });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: "لطفاً یک نشانی ایمیل معتبر وارد کنید.",
      });
    }

    const baseUrl = getWebRedirectBaseUrl(req);
    const { error } = await authClient.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${baseUrl}/?auth=verified`,
      },
    });

    if (error) {
      console.error("[Web Auth Resend Verification Error]:", {
        code: (error as any)?.code,
        message: error.message,
      });
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("rate limit") || msg.includes("only request this after") || msg.includes("too many requests")) {
        return res.status(429).json({
          success: false,
          error: "تعداد درخواست ارسال مجدد ایمیل تأیید بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.",
        });
      }
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(error, "ارسال مجدد ایمیل تأیید با خطا مواجه شد."),
      });
    }

    return res.json({
      success: true,
      message: "لینک تأیید جدید به ایمیل شما ارسال شد. لطفاً صندوق ورودی و پوشه اسپم را بررسی کنید.",
    });
  } catch (err: any) {
    console.error("[Web Auth Resend Verification Exception]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در ارسال مجدد ایمیل تأیید.",
    });
  }
});

// POST /api/web/auth/verify-otp (for Supabase token_hash links)
apiRouter.post("/web/auth/verify-otp", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const tokenHash = String(req.body?.tokenHash ?? req.body?.token_hash ?? "").trim();
    const rawType = String(req.body?.type ?? "signup").trim().toLowerCase();
    const allowedTypes = new Set(["signup", "recovery", "email", "magiclink", "invite", "email_change"]);

    if (!tokenHash || tokenHash.length > 512) {
      return res.status(400).json({
        success: false,
        error: "توکن تأیید نامعتبر یا ناقص است.",
      });
    }

    const otpType = (allowedTypes.has(rawType) ? rawType : "signup") as
      | "signup"
      | "recovery"
      | "email"
      | "magiclink"
      | "invite"
      | "email_change";

    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error || !data?.session || !data?.user) {
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(error, "لینک تأیید منقضی یا نامعتبر است. لطفاً دوباره درخواست دهید."),
      });
    }

    const userPayload = await fetchOrEnsureWebProfile(data.user);

    return res.json({
      success: true,
      type: otpType,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      },
      user: userPayload,
    });
  } catch (err: any) {
    console.error("[Web Auth Verify OTP Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در تأیید لینک ایمیل.",
    });
  }
});

// POST /api/web/auth/forgot-password
apiRouter.post("/web/auth/forgot-password", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const turnstileCheck = await verifyTurnstileIfEnabled(req.body?.turnstileToken, getClientIp(req));
    if ("error" in turnstileCheck) {
      return res.status(400).json({
        success: false,
        error: turnstileCheck.error,
      });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: "لطفاً یک نشانی ایمیل معتبر وارد کنید.",
      });
    }

    const baseUrl = getWebRedirectBaseUrl(req);
    const { error } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/?auth=recovery`,
    });

    if (error) {
      console.error("[Web Auth Forgot Password Supabase Error]:", {
        code: (error as any)?.code,
        message: error.message,
      });
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("rate limit") || msg.includes("only request this after") || msg.includes("too many requests")) {
        return res.status(429).json({
          success: false,
          error: "تعداد درخواست ارسال ایمیل بازیابی بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.",
        });
      }
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(error, "ارسال ایمیل بازیابی رمز عبور با خطا مواجه شد."),
      });
    }

    return res.json({
      success: true,
      message: "لینک بازیابی رمز عبور به ایمیل شما ارسال شد. لطفاً صندوق ورودی و پوشه اسپم خود را بررسی کنید.",
    });
  } catch (err: any) {
    console.error("[Web Auth Forgot Password Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در ارسال ایمیل بازیابی رمز عبور.",
    });
  }
});

// GET /api/web/auth/me
apiRouter.get("/web/auth/me", async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "توکن احراز هویت ارسال نشده است.",
      });
    }

    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: translateSupabaseAuthError(error, "نشست کاربری نامعتبر یا منقضی است. لطفاً دوباره وارد شوید."),
      });
    }

    const userPayload = await fetchOrEnsureWebProfile(data.user);

    return res.json({
      success: true,
      user: userPayload,
    });
  } catch (err: any) {
    console.error("[Web Auth Me Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در دریافت اطلاعات حساب کاربری.",
    });
  }
});

// POST /api/web/auth/update-password (after recovery redirect)
apiRouter.post("/web/auth/update-password", webAuthMutationRateLimiter, async (req, res) => {
  try {
    const authClient = getSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس احراز هویت وب پیکربندی نشده است.",
      });
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "برای تنظیم رمز عبور جدید، توکن نشست بازیابی الزامی است.",
      });
    }

    const newPassword = String(req.body?.password ?? "");
    const refreshToken = String(req.body?.refresh_token ?? req.body?.refreshToken ?? "").trim();
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        error: "رمز عبور جدید باید بین ۸ تا ۱۲۸ کاراکتر باشد.",
      });
    }

    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({
        success: false,
        error: translateSupabaseAuthError(userErr, "لینک بازیابی منقضی یا نامعتبر است. لطفاً مجدداً درخواست فراموشی رمز دهید."),
      });
    }

    const serviceClient = getSupabaseClient();
    if (serviceClient?.auth?.admin?.updateUserById) {
      const { error: adminErr } = await serviceClient.auth.admin.updateUserById(userData.user.id, {
        password: newPassword,
      });
      if (adminErr) {
        return res.status(400).json({
          success: false,
          error: translateSupabaseAuthError(adminErr, "تغییر رمز عبور انجام نشد."),
        });
      }
    } else {
      const scopedClient = getSupabaseAuthClient(token);
      if (!scopedClient) {
        return res.status(503).json({
          success: false,
          error: "سرویس احراز هویت در دسترس نیست.",
        });
      }
      if (refreshToken && typeof scopedClient.auth.setSession === "function") {
        await scopedClient.auth.setSession({
          access_token: token,
          refresh_token: refreshToken,
        }).catch(() => {});
      }
      const { error: updateErr } = await scopedClient.auth.updateUser({ password: newPassword });
      if (updateErr) {
        return res.status(400).json({
          success: false,
          error: translateSupabaseAuthError(updateErr, "تغییر رمز عبور انجام نشد."),
        });
      }
    }

    return res.json({
      success: true,
      message: "رمز عبور شما با موفقیت تغییر یافت.",
    });
  } catch (err: any) {
    console.error("[Web Auth Update Password Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در تغییر رمز عبور.",
    });
  }
});

// ==========================================
// Web Zarinpal Payment Routes (/api/web/payment/*)
// ==========================================

type WebProductKey = keyof typeof WEB_PRODUCTS;

function isValidWebProduct(val: unknown): val is WebProductKey {
  return typeof val === "string" && Object.prototype.hasOwnProperty.call(WEB_PRODUCTS, val);
}

function getConfiguredZarinpalMerchantId(): string | null {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
  if (!merchantId || merchantId === "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") {
    return null;
  }
  return merchantId;
}

async function grantWebPaymentEntitlement(
  serviceClient: SupabaseClient,
  payment: { id: string; user_id?: string | null; device_id?: string | null; product: string; granted_at?: string | null }
): Promise<boolean> {
  if (payment.granted_at) {
    return false;
  }

  // Strictly atomic idempotency claim on granted_at IS NULL before mutating profile credits/subscription
  const nowIso = new Date().toISOString();
  const { data: grantClaim, error: claimErr } = await serviceClient
    .from("payments")
    .update({ granted_at: nowIso })
    .eq("id", payment.id)
    .eq("status", "paid")
    .is("granted_at", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    throw new Error(`خطا در قفل اتمیک اعطای سفارش: ${claimErr.message || "unknown"}`);
  }

  if (!grantClaim) {
    return false;
  }

  try {
    if (payment.product === "single") {
      await logWebUsage(serviceClient, {
        deviceId: payment.device_id,
        paymentId: payment.id,
        action: "payment_grant",
        accessMode: "single",
      });
      return true;
    }

    if (!payment.user_id) {
      throw new Error(`Paid pack/annual order missing user_id: ${payment.id}`);
    }

    const userId = payment.user_id;

    // Ensure profile row exists before updating
    await serviceClient
      .from("profiles")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

    if (payment.product === "pack_10" || payment.product === "pack_5") {
      const productCfg = WEB_PRODUCTS[payment.product as keyof typeof WEB_PRODUCTS] as { credits: number };
      const creditsDelta = productCfg.credits;
      const { error: rpcError } = await serviceClient.rpc("increment_profile_credits", {
        p_user_id: userId,
        p_delta: creditsDelta,
      });

      if (rpcError) {
        let casSuccess = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: prof } = await serviceClient
            .from("profiles")
            .select("credits")
            .eq("id", userId)
            .maybeSingle();

          const oldCredits = Number(prof?.credits ?? 0);
          const { data: updated } = await serviceClient
            .from("profiles")
            .update({ credits: oldCredits + creditsDelta })
            .eq("id", userId)
            .eq("credits", oldCredits)
            .select("credits")
            .maybeSingle();

          if (updated) {
            casSuccess = true;
            break;
          }
        }
        if (!casSuccess) {
          throw new Error("خطا در افزایش اتمیک اعتبار پروفایل.");
        }
      }
    }

    await logWebUsage(serviceClient, {
      userId,
      deviceId: payment.device_id,
      paymentId: payment.id,
      action: "payment_grant",
      accessMode: payment.product,
    });
    return true;
  } catch (grantErr) {
    // Roll back granted_at so /recheck or callback retry can recover cleanly
    await serviceClient
      .from("payments")
      .update({ granted_at: null })
      .eq("id", payment.id)
      .eq("granted_at", nowIso);
    throw grantErr;
  }
}

// 0) GET /api/web/products
apiRouter.get("/web/products", (_req, res) => {
  return res.json({
    success: true,
    products: WEB_PRODUCTS,
  });
});

// 1) POST /api/web/payment/request
apiRouter.post("/web/payment/request", async (req, res) => {
  try {
    const rawProduct = req.body?.product;
    if (!isValidWebProduct(rawProduct)) {
      return res.status(400).json({
        success: false,
        error: "محصول انتخاب‌شده معتبر نیست.",
      });
    }

    const product: WebProductKey = rawProduct;
    const productConfig = WEB_PRODUCTS[product];

    const rawDeviceId = req.body?.deviceId ?? req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || null;

    if (deviceId && !DEVICE_ID_REGEX.test(deviceId)) {
      return res.status(400).json({
        success: false,
        error: "فرمت شناسه دستگاه (deviceId) معتبر نیست.",
      });
    }

    const bearerToken =
      extractBearerToken(req) ||
      (typeof req.body?.accessToken === "string" ? req.body.accessToken.trim() : "") ||
      (typeof req.body?.access_token === "string" ? req.body.access_token.trim() : "");

    let verifiedUserId: string | null = null;
    let verifiedEmail: string | null = null;

    if (bearerToken) {
      const authClient = getSupabaseAuthClient();
      if (!authClient) {
        return res.status(503).json({
          success: false,
          error: "سرویس احراز هویت وب پیکربندی نشده است.",
        });
      }
      const { data: userData, error: userErr } = await authClient.auth.getUser(bearerToken);
      if (!userErr && userData?.user) {
        verifiedUserId = userData.user.id;
        verifiedEmail = userData.user.email || null;
      }
    }

    // بسته‌های اعتباری (۵ و ۱۰ عددی) نیازمند نشست معتبر کاربر وب هستند
    if (product === "pack_10" || product === "pack_5") {
      if (!verifiedUserId) {
        return res.status(401).json({
          success: false,
          error: "برای خرید این بسته ابتدا باید وارد حساب کاربری وب خود شوید.",
        });
      }
    } else {
      // single برای مهمان مجاز است اما deviceId الزامی است
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "شناسه دستگاه (deviceId) برای خرید تحلیل تکی الزامی است.",
        });
      }
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "اتصال به دیتابیس پرداخت برقرار نیست.",
      });
    }

    const merchantId = getConfiguredZarinpalMerchantId();
    if (!merchantId) {
      return res.status(503).json({
        success: false,
        error: "درگاه پرداخت زرین‌پال پیکربندی نشده است (ZARINPAL_MERCHANT_ID).",
      });
    }

    // الف) ثبت ردیف pending در جدول payments با مبلغ خوانده‌شده از WEB_PRODUCTS
    const { data: pendingOrder, error: insertErr } = await serviceClient
      .from("payments")
      .insert({
        user_id: verifiedUserId,
        device_id: deviceId,
        product,
        amount_rials: productConfig.amountRials,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr || !pendingOrder) {
      console.error("[Web Payment Request] DB insert failed:", insertErr);
      return res.status(500).json({
        success: false,
        error: "خطا در ثبت اولیه سفارش پرداخت.",
      });
    }

    const callbackUrl = `${getWebRedirectBaseUrl(req)}/api/web/payment/verify`;

    // ب) فراخوانی درگاه زرین‌پال (بدون هیچ مسیر mock/fallback)
    let zarinpalData: any = null;
    try {
      const zarinpalRes = await fetch("https://api.zarinpal.com/pg/v4/payment/request.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: productConfig.amountRials,
          callback_url: callbackUrl,
          description: productConfig.label,
          metadata: {
            order_id: pendingOrder.id,
            ...(verifiedEmail ? { email: verifiedEmail } : {}),
          },
        }),
      });
      zarinpalData = await zarinpalRes.json().catch(() => null);
    } catch (gatewayErr) {
      console.error("[Web Payment Request] Zarinpal fetch error:", gatewayErr);
      await serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", pendingOrder.id)
        .eq("status", "pending");

      return res.status(502).json({
        success: false,
        error: "خطا در برقراری ارتباط با درگاه پرداخت زرین‌پال. لطفاً دوباره تلاش کنید.",
      });
    }

    const code = zarinpalData?.data?.code;
    const authority = zarinpalData?.data?.authority ? String(zarinpalData.data.authority) : null;

    if (code !== 100 || !authority) {
      console.error("[Web Payment Request] Zarinpal rejected:", zarinpalData);
      await serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", pendingOrder.id)
        .eq("status", "pending");

      return res.status(502).json({
        success: false,
        error:
          zarinpalData?.errors?.message ||
          zarinpalData?.data?.message ||
          "درگاه زرین‌پال درخواست پرداخت را تایید نکرد.",
      });
    }

    // ج) ذخیره authority روی همان ردیف سفارش
    const { error: updateAuthErr } = await serviceClient
      .from("payments")
      .update({ authority })
      .eq("id", pendingOrder.id)
      .eq("status", "pending");

    if (updateAuthErr) {
      console.error("[Web Payment Request] Failed to store authority:", updateAuthErr);
      return res.status(500).json({
        success: false,
        error: "خطا در ذخیره‌سازی شناسه تراکنش پرداخت.",
      });
    }

    return res.json({
      success: true,
      order_id: pendingOrder.id,
      authority,
      product,
      amount_rials: productConfig.amountRials,
      paymentUrl: `https://www.zarinpal.com/pg/StartPay/${authority}`,
    });
  } catch (err: any) {
    console.error("[Web Payment Request] Unexpected error:", err);
    return res.status(500).json({
      success: false,
      error: "خطای غیرمنتظره در ایجاد درخواست پرداخت.",
    });
  }
});

// 2) GET /api/web/payment/verify
apiRouter.get("/web/payment/verify", async (req, res) => {
  try {
    // سفارش فقط از روی Authority پیدا می‌شود؛ هیچ پارامتر دیگری از کوئری اعتماد نمی‌شود
    const rawAuthority = req.query?.Authority;
    const rawStatus = req.query?.Status;
    const authority = (Array.isArray(rawAuthority) ? rawAuthority[0] : rawAuthority)?.toString().trim() || "";
    const statusParam = (Array.isArray(rawStatus) ? rawStatus[0] : rawStatus)?.toString().trim() || "";

    if (!authority || !AUTHORITY_REGEX.test(authority)) {
      return res.redirect("/?payment=failed");
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.redirect("/?payment=failed");
    }

    const { data: order, error: findErr } = await serviceClient
      .from("payments")
      .select("*")
      .eq("authority", authority)
      .maybeSingle();

    if (findErr || !order) {
      console.warn("[Web Payment Verify] Unknown authority callback:", authority);
      return res.redirect("/?payment=failed");
    }

    // اگر سفارش قبلاً paid شده است: اگر هنوز granted_at ثبت نشده بود، ایمن اعطا کن
    if (order.status === "paid") {
      if (!order.granted_at) {
        await grantWebPaymentEntitlement(serviceClient, order);
      }
      return res.redirect(`/?payment=success&order_id=${encodeURIComponent(order.id)}`);
    }

    // اگر کاربر پرداخت را لغو کرده یا Status برابر OK نیست
    if (statusParam !== "OK") {
      await serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", order.id)
        .eq("status", "pending");

      return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
    }

    const merchantId = getConfiguredZarinpalMerchantId();
    if (!merchantId) {
      await serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", order.id)
        .eq("status", "pending");
      return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
    }

    // فراخوانی verify.json با دقیقاً همان amount_rials ذخیره‌شده در سفارش (حتی برای بازیابی failed -> paid)
    let verifyData: any = null;
    try {
      const verifyRes = await fetch("https://api.zarinpal.com/pg/v4/payment/verify.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: Number(order.amount_rials),
          authority,
        }),
      });
      verifyData = await verifyRes.json().catch(() => null);
    } catch (gatewayErr) {
      console.error("[Web Payment Verify] Zarinpal verify fetch error:", gatewayErr);
      return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
    }

    const code = verifyData?.data?.code;
    const refId = verifyData?.data?.ref_id != null ? String(verifyData.data.ref_id) : order.ref_id || null;

    if (code === 100 || code === 101) {
      // تغییر وضعیت اتمیک pending|failed به paid و اعطای idempotent با شرط granted_at IS NULL
      const { data: claimedOrder, error: claimErr } = await serviceClient
        .from("payments")
        .update({
          status: "paid",
          ...(refId ? { ref_id: refId } : {}),
          paid_at: order.paid_at || new Date().toISOString(),
        })
        .eq("id", order.id)
        .in("status", ["pending", "failed"])
        .select("*")
        .maybeSingle();

      if (claimErr) {
        console.error("[Web Payment Verify] Failed claiming order:", claimErr);
        return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
      }

      const targetOrder = claimedOrder || (await serviceClient.from("payments").select("*").eq("id", order.id).maybeSingle()).data;
      if (targetOrder && !targetOrder.granted_at) {
        await grantWebPaymentEntitlement(serviceClient, targetOrder);
      }

      return res.redirect(`/?payment=success&order_id=${encodeURIComponent(order.id)}`);
    }

    // سایر کدها = ناموفق
    await serviceClient
      .from("payments")
      .update({ status: "failed" })
      .eq("id", order.id)
      .eq("status", "pending");

    return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
  } catch (err: any) {
    console.error("[Web Payment Verify] Unexpected error:", err);
    return res.redirect("/?payment=failed");
  }
});

// 2.5) POST /api/web/payment/recheck (Payment Recovery for pending/failed orders > 60s)
apiRouter.post("/web/payment/recheck", async (req, res) => {
  try {
    const rawOrderId = req.body?.order_id ?? req.query?.order_id;
    const orderId = (Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId)?.toString().trim() || "";
    if (!orderId || !UUID_REGEX.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: "شناسه سفارش (order_id) معتبر نیست.",
      });
    }

    const rawDeviceId = req.body?.deviceId ?? req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";
    if (deviceId && !DEVICE_ID_REGEX.test(deviceId)) {
      return res.status(400).json({
        success: false,
        error: "شناسه دستگاه (deviceId) معتبر نیست.",
      });
    }

    const bearerToken = extractBearerToken(req);
    if (!deviceId && !bearerToken) {
      return res.status(401).json({
        success: false,
        error: "برای بررسی مجدد سفارش، توکن حساب کاربری یا شناسه دستگاه الزامی است.",
      });
    }

    let callerUserId: string | null = null;
    if (bearerToken) {
      const authClient = getSupabaseAuthClient();
      if (authClient) {
        const { data: userData } = await authClient.auth.getUser(bearerToken);
        if (userData?.user) {
          callerUserId = userData.user.id;
        }
      }
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس بررسی پرداخت در دسترس نیست.",
      });
    }

    const { data: order, error: selectErr } = await serviceClient
      .from("payments")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (selectErr || !order) {
      return res.status(404).json({
        success: false,
        error: "سفارش مورد نظر یافت نشد.",
      });
    }

    const userMatches = Boolean(order.user_id && callerUserId && order.user_id === callerUserId);
    const deviceMatches = Boolean(order.device_id && deviceId && order.device_id === deviceId);
    if (!userMatches && !deviceMatches) {
      return res.status(403).json({
        success: false,
        error: "شما مجاز به بررسی مجدد این سفارش نیستید.",
      });
    }

    if (order.status === "paid") {
      if (!order.granted_at) {
        await grantWebPaymentEntitlement(serviceClient, order);
      }
      const canRevealSingleEntitlement = order.product === "single" && deviceMatches;
      return res.json({
        success: true,
        order_id: order.id,
        product: order.product,
        status: "paid",
        amount_rials: order.amount_rials,
        ref_id: order.ref_id || null,
        paid_at: order.paid_at || null,
        entitlement_token: canRevealSingleEntitlement ? order.entitlement_token : null,
        entitlement_used: Boolean(order.entitlement_used),
      });
    }

    if (!order.authority) {
      return res.status(400).json({
        success: false,
        error: "NO_AUTHORITY",
        message: "برای این سفارش شناسه تراکنش درگاه ثبت نشده است.",
      });
    }

    const createdMs = order.created_at ? new Date(order.created_at).getTime() : 0;
    if (createdMs > 0 && Date.now() - createdMs < 60_000) {
      return res.status(400).json({
        success: false,
        error: "TOO_EARLY",
        message: "لطفاً حداقل ۶۰ ثانیه پس از ایجاد سفارش برای بررسی مجدد صبر کنید.",
      });
    }

    const merchantId = getConfiguredZarinpalMerchantId();
    if (!merchantId) {
      return res.status(503).json({
        success: false,
        error: "درگاه پرداخت زرین‌پال پیکربندی نشده است.",
      });
    }

    let verifyData: any = null;
    try {
      const verifyRes = await fetch("https://api.zarinpal.com/pg/v4/payment/verify.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: Number(order.amount_rials),
          authority: order.authority,
        }),
      });
      verifyData = await verifyRes.json().catch(() => null);
    } catch {
      return res.status(502).json({
        success: false,
        error: "خطا در ارتباط با درگاه زرین‌پال جهت استعلام مجدد. لطفاً دقایقی دیگر تلاش کنید.",
      });
    }

    const code = verifyData?.data?.code;
    const refId = verifyData?.data?.ref_id != null ? String(verifyData.data.ref_id) : order.ref_id || null;

    if (code === 100 || code === 101) {
      const { data: claimedOrder } = await serviceClient
        .from("payments")
        .update({
          status: "paid",
          ...(refId ? { ref_id: refId } : {}),
          paid_at: order.paid_at || new Date().toISOString(),
        })
        .eq("id", order.id)
        .in("status", ["pending", "failed"])
        .select("*")
        .maybeSingle();

      const targetOrder = claimedOrder || (await serviceClient.from("payments").select("*").eq("id", order.id).maybeSingle()).data;
      if (targetOrder && !targetOrder.granted_at) {
        await grantWebPaymentEntitlement(serviceClient, targetOrder);
      }

      await logWebUsage(serviceClient, {
        userId: callerUserId,
        deviceId,
        paymentId: order.id,
        action: "payment_recheck",
        accessMode: order.product,
        metadata: { code, refId },
      });

      const finalOrder = targetOrder || order;
      const canRevealSingleEntitlement = finalOrder.product === "single" && deviceMatches;
      return res.json({
        success: true,
        order_id: finalOrder.id,
        product: finalOrder.product,
        status: "paid",
        amount_rials: finalOrder.amount_rials,
        ref_id: refId,
        paid_at: finalOrder.paid_at || new Date().toISOString(),
        entitlement_token: canRevealSingleEntitlement ? finalOrder.entitlement_token : null,
        entitlement_used: Boolean(finalOrder.entitlement_used),
      });
    }

    await serviceClient
      .from("payments")
      .update({ status: "failed" })
      .eq("id", order.id)
      .eq("status", "pending");

    return res.json({
      success: true,
      order_id: order.id,
      product: order.product,
      status: "failed",
      amount_rials: order.amount_rials,
      ref_id: null,
      paid_at: null,
      entitlement_token: null,
      entitlement_used: false,
      message: "پرداخت توسط درگاه زرین‌پال تایید نشد.",
    });
  } catch (err: any) {
    console.error("[Web Payment Recheck Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در بررسی مجدد وضعیت پرداخت.",
    });
  }
});

// 3) GET /api/web/payment/status
apiRouter.get("/web/payment/status", async (req, res) => {
  try {
    const rawOrderId = req.query?.order_id;
    const orderId = (Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId)?.toString().trim() || "";

    if (!orderId || !UUID_REGEX.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: "شناسه سفارش (order_id) معتبر نیست.",
      });
    }

    const rawDeviceId = req.query?.deviceId ?? req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";
    if (deviceId && !DEVICE_ID_REGEX.test(deviceId)) {
      return res.status(400).json({
        success: false,
        error: "شناسه دستگاه (deviceId) معتبر نیست.",
      });
    }
    const bearerToken = extractBearerToken(req);

    if (!deviceId && !bearerToken) {
      return res.status(401).json({
        success: false,
        error: "برای استعلام وضعیت سفارش، ارسال توکن حساب کاربری یا شناسه دستگاه الزامی است.",
      });
    }

    let callerUserId: string | null = null;
    if (bearerToken) {
      const authClient = getSupabaseAuthClient();
      if (authClient) {
        const { data: userData } = await authClient.auth.getUser(bearerToken);
        if (userData?.user) {
          callerUserId = userData.user.id;
        }
      }
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس استعلام پرداخت در دسترس نیست.",
      });
    }

    const { data: payment, error: selectErr } = await serviceClient
      .from("payments")
      .select("id, user_id, device_id, product, amount_rials, status, ref_id, entitlement_token, entitlement_used, created_at, paid_at, granted_at")
      .eq("id", orderId)
      .maybeSingle();

    if (selectErr || !payment) {
      return res.status(404).json({
        success: false,
        error: "سفارش مورد نظر یافت نشد.",
      });
    }

    const userMatches = Boolean(payment.user_id && callerUserId && payment.user_id === callerUserId);
    const deviceMatches = Boolean(payment.device_id && deviceId && payment.device_id === deviceId);

    if (!userMatches && !deviceMatches) {
      return res.status(403).json({
        success: false,
        error: "شما مجاز به مشاهده وضعیت این سفارش نیستید.",
      });
    }

    if (payment.status === "paid" && !payment.granted_at) {
      await grantWebPaymentEntitlement(serviceClient, payment).catch((e) =>
        console.warn("[Web Payment Status] Self-heal grant warning:", e)
      );
    }

    const canRevealSingleEntitlement =
      payment.product === "single" &&
      payment.status === "paid" &&
      deviceMatches;

    return res.json({
      success: true,
      order_id: payment.id,
      product: payment.product,
      status: payment.status,
      amount_rials: payment.amount_rials,
      ref_id: payment.ref_id || null,
      paid_at: payment.paid_at || null,
      entitlement_token: canRevealSingleEntitlement ? payment.entitlement_token : null,
      entitlement_used: Boolean(payment.entitlement_used),
    });
  } catch (err: any) {
    console.error("[Web Payment Status] Unexpected error:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در دریافت وضعیت پرداخت.",
    });
  }
});

// 4) GET /api/web/orders (List authenticated user's orders or recover a guest order by order_id + deviceId)
apiRouter.get("/web/orders", async (req, res) => {
  try {
    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "سرویس سفارش‌ها در دسترس نیست.",
      });
    }

    const rawDeviceId = req.query?.deviceId ?? req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";
    const rawOrderId = req.query?.order_id;
    const orderId = (Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId)?.toString().trim() || "";
    const bearerToken = extractBearerToken(req);

    let callerUserId: string | null = null;
    if (bearerToken) {
      const authClient = getSupabaseAuthClient();
      if (authClient) {
        const { data: userData } = await authClient.auth.getUser(bearerToken);
        if (userData?.user) {
          callerUserId = userData.user.id;
        }
      }
    }

    if (orderId) {
      if (!UUID_REGEX.test(orderId)) {
        return res.status(400).json({ success: false, error: "شناسه سفارش معتبر نیست." });
      }
      if (!deviceId && !callerUserId) {
        return res.status(401).json({ success: false, error: "برای بازیابی سفارش ورود یا شناسه مرورگر لازم است." });
      }
      const { data: row } = await serviceClient
        .from("payments")
        .select("id, user_id, device_id, product, amount_rials, status, ref_id, entitlement_token, entitlement_used, created_at, paid_at, granted_at")
        .eq("id", orderId)
        .maybeSingle();

      if (!row) {
        return res.status(404).json({ success: false, error: "سفارشی با این شناسه یافت نشد." });
      }
      const ownsRow =
        (row.user_id && callerUserId && row.user_id === callerUserId) ||
        (row.device_id && deviceId && row.device_id === deviceId);
      if (!ownsRow) {
        return res.status(403).json({ success: false, error: "این سفارش متعلق به شما نیست." });
      }
      return res.json({
        success: true,
        orders: [
          {
            order_id: row.id,
            product: row.product,
            amount_rials: row.amount_rials,
            status: row.status,
            ref_id: row.ref_id || null,
            created_at: row.created_at,
            paid_at: row.paid_at || null,
            granted: Boolean(row.granted_at),
            entitlement_used: Boolean(row.entitlement_used),
            entitlement_token:
              row.product === "single" &&
              row.status === "paid" &&
              !row.entitlement_used &&
              row.device_id === deviceId
                ? row.entitlement_token
                : null,
          },
        ],
      });
    }

    if (!callerUserId) {
      if (deviceId && DEVICE_ID_REGEX.test(deviceId)) {
        const { data: guestRows } = await serviceClient
          .from("payments")
          .select("id, device_id, product, amount_rials, status, ref_id, entitlement_token, entitlement_used, created_at, paid_at, granted_at")
          .eq("device_id", deviceId)
          .order("created_at", { ascending: false })
          .limit(15);

        return res.json({
          success: true,
          orders: (guestRows || []).map((row: any) => ({
            order_id: row.id,
            product: row.product,
            amount_rials: row.amount_rials,
            status: row.status,
            ref_id: row.ref_id || null,
            created_at: row.created_at,
            paid_at: row.paid_at || null,
            granted: Boolean(row.granted_at),
            entitlement_used: Boolean(row.entitlement_used),
            entitlement_token:
              row.product === "single" && row.status === "paid" && !row.entitlement_used
                ? row.entitlement_token
                : null,
          })),
        });
      }

      return res.status(401).json({
        success: false,
        error: "برای مشاهده سفارش‌های خود وارد حساب کاربری شوید یا شناسه سفارش را وارد کنید.",
      });
    }

    const { data: rows, error: listErr } = await serviceClient
      .from("payments")
      .select("id, device_id, product, amount_rials, status, ref_id, entitlement_token, entitlement_used, created_at, paid_at, granted_at")
      .eq("user_id", callerUserId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (listErr) {
      return res.status(500).json({ success: false, error: "خطا در دریافت فهرست سفارش‌ها." });
    }

    return res.json({
      success: true,
      orders: (rows || []).map((row: any) => ({
        order_id: row.id,
        product: row.product,
        amount_rials: row.amount_rials,
        status: row.status,
        ref_id: row.ref_id || null,
        created_at: row.created_at,
        paid_at: row.paid_at || null,
        granted: Boolean(row.granted_at),
        entitlement_used: Boolean(row.entitlement_used),
        entitlement_token:
          row.product === "single" &&
          row.status === "paid" &&
          !row.entitlement_used &&
          deviceId &&
          row.device_id === deviceId
            ? row.entitlement_token
            : null,
      })),
    });
  } catch (err: any) {
    console.error("[Web Orders Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطای سرور در دریافت تاریخچه سفارش‌ها.",
    });
  }
});

// ==========================================
// Admin Routes (/api/admin/*) — Restricted to masoudx7@gmail.com
// ==========================================

async function verifyAdminUser(req: express.Request): Promise<{ userId: string; email: string } | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const authClient = getSupabaseAuthClient();
  if (!authClient) return null;
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user || !userData.user.email) return null;
  if (userData.user.email.toLowerCase().trim() !== "masoudx7@gmail.com") return null;
  return { userId: userData.user.id, email: userData.user.email };
}

apiRouter.get("/admin/users", async (req, res) => {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: "دسترسی غیرمجاز. فقط ادمین مجاز به مشاهده است." });
    }
    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس دیتابیس در دسترس نیست." });
    }

    const { data: profiles, error: profErr } = await serviceClient
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profErr) {
      return res.status(500).json({ success: false, error: "خطا در دریافت لیست کاربران از دیتابیس." });
    }

    const profileMap = new Map<string, any>();
    for (const p of profiles || []) {
      profileMap.set(p.id, { ...p });
    }

    if (typeof serviceClient.auth?.admin?.listUsers === "function") {
      try {
        const { data: authListData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUsers = authListData?.users || [];
        const missingProfiles: any[] = [];

        for (const au of authUsers) {
          const existing = profileMap.get(au.id);
          const metaName = au.user_metadata?.full_name || au.user_metadata?.name || null;
          if (existing) {
            existing.email = existing.email || au.email || "";
            existing.full_name = existing.full_name || metaName || "";
            existing.email_confirmed = Boolean((au as any).email_confirmed_at);
          } else {
            const synthesized = {
              id: au.id,
              email: au.email || "",
              full_name: metaName || "",
              credits: 0,
              annual_expires_at: null,
              last_analysis_date: null,
              daily_analyses_count: 0,
              created_at: au.created_at || new Date().toISOString(),
              email_confirmed: Boolean((au as any).email_confirmed_at),
            };
            profileMap.set(au.id, synthesized);
            missingProfiles.push({
              id: au.id,
              email: au.email || null,
              full_name: metaName,
              credits: 0,
            });
          }
        }

        if (missingProfiles.length > 0) {
          await serviceClient
            .from("profiles")
            .upsert(missingProfiles, { onConflict: "id", ignoreDuplicates: true });
        }
      } catch (listErr) {
        console.warn("[Admin List Auth Users Warning]:", listErr);
      }
    }

    const mergedUsers = Array.from(profileMap.values()).sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

    return res.json({
      success: true,
      users: mergedUsers,
    });
  } catch (err: any) {
    console.error("[Admin Users Error]:", err);
    return res.status(500).json({ success: false, error: "خطای سرور در بارگذاری لیست کاربران." });
  }
});

apiRouter.post("/admin/users/credits", async (req, res) => {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: "دسترسی غیرمجاز." });
    }
    const userId = String(req.body?.userId || "").trim();
    const delta = Number(req.body?.delta);
    const absolute = Number(req.body?.absoluteCredits);

    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ success: false, error: "شناسه کاربر معتبر نیست." });
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس دیتابیس در دسترس نیست." });
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id, email, full_name, credits")
      .eq("id", userId)
      .maybeSingle();

    const currentCredits = Number(profile?.credits ?? 0);
    let newCredits = currentCredits;

    if (req.body?.absoluteCredits !== undefined && Number.isFinite(absolute)) {
      newCredits = Math.max(0, Math.floor(absolute));
    } else if (req.body?.delta !== undefined && Number.isFinite(delta)) {
      newCredits = Math.max(0, Math.floor(currentCredits + delta));
    } else {
      return res.status(400).json({ success: false, error: "مقدار اعتبار نامعتبر است." });
    }

    let updateErr: any = null;
    if (profile) {
      const resUpdate = await serviceClient
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", userId);
      updateErr = resUpdate.error;
    } else {
      let authEmail: string | null = null;
      let authName: string | null = null;
      if (typeof serviceClient.auth?.admin?.getUserById === "function") {
        const { data: auData } = await serviceClient.auth.admin.getUserById(userId).catch(() => ({ data: null }));
        authEmail = auData?.user?.email || null;
        authName = auData?.user?.user_metadata?.full_name || null;
      }
      const resUpsert = await serviceClient
        .from("profiles")
        .upsert(
          { id: userId, email: authEmail, full_name: authName, credits: newCredits },
          { onConflict: "id" }
        );
      updateErr = resUpsert.error;
    }

    if (updateErr) {
      return res.status(500).json({ success: false, error: "خطا در به‌روزرسانی اعتبار کاربر." });
    }

    await logWebUsage(serviceClient, {
      userId: admin.userId,
      action: "admin_credits_update",
      accessMode: `target_${userId}_credits_${newCredits}`,
    });

    return res.json({
      success: true,
      userId,
      credits: newCredits,
    });
  } catch (err: any) {
    console.error("[Admin Credits Update Error]:", err);
    return res.status(500).json({ success: false, error: "خطای سرور در تغییر اعتبار کاربر." });
  }
});

apiRouter.post("/admin/users/create", async (req, res) => {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: "دسترسی غیرمجاز." });
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const fullName = String(req.body?.fullName || "").trim();
    const rawCredits = Number(req.body?.initialCredits ?? 1);
    const initialCredits = Number.isFinite(rawCredits) ? Math.max(0, Math.floor(rawCredits)) : 1;

    if (!email || !EMAIL_REGEX.test(email) || password.length < 8 || password.length > 128) {
      return res.status(400).json({
        success: false,
        error: "ایمیل معتبر و رمز عبور (حداقل ۸ کاراکتر) الزامی است.",
      });
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس دیتابیس در دسترس نیست." });
    }

    const { data: createData, error: createErr } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });

    if (createErr || !createData?.user) {
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(createErr, "خطا در ایجاد حساب کاربری."),
      });
    }

    const newUserId = createData.user.id;

    const { error: upsertErr } = await serviceClient
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name: fullName || email.split("@")[0],
          credits: initialCredits,
        },
        { onConflict: "id" }
      );

    if (upsertErr) {
      console.error("[Admin Create Profile Upsert Error]:", upsertErr);
    }

    return res.json({
      success: true,
      user: {
        id: newUserId,
        email,
        full_name: fullName || email.split("@")[0],
        credits: initialCredits,
        email_confirmed: true,
      },
    });
  } catch (err: any) {
    console.error("[Admin Create User Error]:", err);
    return res.status(500).json({ success: false, error: "خطای سرور در ثبت کاربر جدید." });
  }
});

apiRouter.post("/admin/users/update", async (req, res) => {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return res.status(403).json({ success: false, error: "دسترسی غیرمجاز." });
    }

    const userId = String(req.body?.userId || "").trim();
    const password = typeof req.body?.password === "string" ? req.body.password : undefined;
    const confirmEmail = req.body?.confirmEmail === true;

    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ success: false, error: "شناسه کاربر معتبر نیست." });
    }

    if (password !== undefined && (password.length < 8 || password.length > 128)) {
      return res.status(400).json({
        success: false,
        error: "رمز عبور جدید باید بین ۸ تا ۱۲۸ کاراکتر باشد.",
      });
    }

    if (!password && !confirmEmail) {
      return res.status(400).json({
        success: false,
        error: "هیچ تغییری برای اعمال ارسال نشده است.",
      });
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس دیتابیس در دسترس نیست." });
    }

    const attrs: Record<string, any> = {};
    if (password) attrs.password = password;
    if (confirmEmail) attrs.email_confirm = true;

    const { error: updateErr } = await serviceClient.auth.admin.updateUserById(userId, attrs);
    if (updateErr) {
      return res.status(400).json({
        success: false,
        error: translateSupabaseAuthError(updateErr, "به‌روزرسانی اطلاعات کاربر انجام نشد."),
      });
    }

    await logWebUsage(serviceClient, {
      userId: admin.userId,
      action: "admin_user_update",
      accessMode: `target_${userId}_${password ? "pw" : ""}${confirmEmail ? "_confirm" : ""}`,
    });

    return res.json({
      success: true,
      message: password
        ? "رمز عبور کاربر با موفقیت تغییر یافت."
        : "ایمیل کاربر با موفقیت تأیید شد.",
    });
  } catch (err: any) {
    console.error("[Admin Update User Error]:", err);
    return res.status(500).json({ success: false, error: "خطای سرور در به‌روزرسانی حساب کاربری." });
  }
});

// ==========================================
// Web Server-Side Analysis History Routes (/api/web/analyses)
// ==========================================

apiRouter.get("/web/analyses", async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "توکن احراز هویت ارسال نشده است." });
    }
    const authClient = getSupabaseAuthClient();
    const serviceClient = getSupabaseClient();
    if (!authClient || !serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس تاریخچه در دسترس نیست." });
    }

    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ success: false, error: "نشست کاربری نامعتبر است." });
    }

    const { data: rows, error: listErr } = await serviceClient
      .from("web_analyses")
      .select("id, file_name, title, summary, authority, urgency, analysis_json, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (listErr) {
      return res.status(500).json({ success: false, error: "خطا در بارگذاری تاریخچه تحلیل‌ها." });
    }

    return res.json({
      success: true,
      analyses: rows || [],
    });
  } catch (err: any) {
    console.error("[Web Analyses List Error]:", err);
    return res.status(500).json({ success: false, error: "خطای سرور در دریافت تاریخچه تحلیل‌ها." });
  }
});

apiRouter.delete("/web/analyses/:id", async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "توکن احراز هویت ارسال نشده است." });
    }
    const id = String(req.params?.id || "").trim();
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ success: false, error: "شناسه تحلیل معتبر نیست." });
    }

    const authClient = getSupabaseAuthClient();
    const serviceClient = getSupabaseClient();
    if (!authClient || !serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس در دسترس نیست." });
    }
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ success: false, error: "نشست کاربری نامعتبر است." });
    }

    await serviceClient.from("web_analyses").delete().eq("id", id).eq("user_id", userData.user.id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[Web Analyses Delete Error]:", err);
    return res.status(500).json({ success: false, error: "خطا در حذف مورد تاریخچه." });
  }
});

apiRouter.delete("/web/analyses", async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "توکن احراز هویت ارسال نشده است." });
    }
    const authClient = getSupabaseAuthClient();
    const serviceClient = getSupabaseClient();
    if (!authClient || !serviceClient) {
      return res.status(503).json({ success: false, error: "سرویس در دسترس نیست." });
    }
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ success: false, error: "نشست کاربری نامعتبر است." });
    }

    await serviceClient.from("web_analyses").delete().eq("user_id", userData.user.id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[Web Analyses Clear Error]:", err);
    return res.status(500).json({ success: false, error: "خطا در پاک‌سازی تاریخچه." });
  }
});

// ==========================================
// Web Paid-Only Analyze Route (POST /api/web/analyze)
// Atomic Reserve-Before-Gemini + Automatic Refund on Error
// ==========================================

async function reserveWebAccessUnit(
  serviceClient: SupabaseClient,
  accessMode: WebAccessMode
): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const dailyLimit = WEB_PRODUCTS.annual.dailyLimit;

  if (accessMode.kind === "annual") {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: freshProf } = await serviceClient
        .from("profiles")
        .select("daily_analyses_count, last_analysis_date")
        .eq("id", accessMode.userId)
        .maybeSingle();

      const currentCount =
        freshProf?.last_analysis_date === accessMode.today
          ? Number(freshProf?.daily_analyses_count || 0)
          : 0;

      if (currentCount >= dailyLimit) {
        return {
          ok: false,
          status: 403,
          error: "DAILY_LIMIT_REACHED",
          message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است.`,
        };
      }

      let query = serviceClient
        .from("profiles")
        .update({
          daily_analyses_count: currentCount + 1,
          last_analysis_date: accessMode.today,
        })
        .eq("id", accessMode.userId);

      if (freshProf?.last_analysis_date === accessMode.today) {
        query = query.eq("daily_analyses_count", currentCount);
      } else if (freshProf?.last_analysis_date) {
        query = query.eq("last_analysis_date", freshProf.last_analysis_date);
      } else {
        query = query.is("last_analysis_date", null);
      }

      const { data: updatedProf } = await query.select("id").maybeSingle();
      if (updatedProf) {
        return { ok: true };
      }
    }
    return {
      ok: false,
      status: 403,
      error: "DAILY_LIMIT_REACHED",
      message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است.`,
    };
  }

  if (accessMode.kind === "credits") {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: freshProf } = await serviceClient
        .from("profiles")
        .select("credits")
        .eq("id", accessMode.userId)
        .maybeSingle();

      const curCredits = Number(freshProf?.credits ?? 0);
      if (curCredits <= 0) {
        break;
      }

      const { data: updatedProf } = await serviceClient
        .from("profiles")
        .update({ credits: curCredits - 1 })
        .eq("id", accessMode.userId)
        .eq("credits", curCredits)
        .select("credits")
        .maybeSingle();

      if (updatedProf) {
        return { ok: true };
      }
    }
    return {
      ok: false,
      status: 402,
      error: "PAYMENT_REQUIRED",
      message: "اعتبار حساب کاربری شما برای این تحلیل کافی نیست.",
    };
  }

  if (accessMode.kind === "entitlement") {
    const claimId = crypto.randomUUID();
    const { data: claimedPayment } = await serviceClient
      .from("payments")
      .update({ entitlement_used: true, entitlement_claim_id: claimId })
      .eq("id", accessMode.paymentId)
      .eq("entitlement_used", false)
      .eq("status", "paid")
      .eq("device_id", accessMode.deviceId)
      .select("id, entitlement_claim_id")
      .maybeSingle();

    if (!claimedPayment) {
      return {
        ok: false,
        status: 402,
        error: "ENTITLEMENT_CONSUMED",
        message: "توکن تحلیل تکی قبلاً مصرف شده یا معتبر نیست.",
      };
    }

    accessMode.claimId = claimedPayment.entitlement_claim_id || claimId;
    return { ok: true };
  }

  return {
    ok: false,
    status: 402,
    error: "PAYMENT_REQUIRED",
    message: "دسترسی معتبر برای تحلیل یافت نشد.",
  };
}

async function refundWebAccessUnit(serviceClient: SupabaseClient, accessMode: WebAccessMode): Promise<void> {
  try {
    if (accessMode.kind === "annual") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: freshProf } = await serviceClient
          .from("profiles")
          .select("daily_analyses_count, last_analysis_date")
          .eq("id", accessMode.userId)
          .maybeSingle();

        if (!freshProf || freshProf.last_analysis_date !== accessMode.today) {
          return;
        }
        const curCount = Number(freshProf.daily_analyses_count || 0);
        if (curCount <= 0) {
          return;
        }
        const { data: updated } = await serviceClient
          .from("profiles")
          .update({ daily_analyses_count: curCount - 1 })
          .eq("id", accessMode.userId)
          .eq("daily_analyses_count", curCount)
          .eq("last_analysis_date", accessMode.today)
          .select("id")
          .maybeSingle();
        if (updated) return;
      }
      return;
    }

    if (accessMode.kind === "credits") {
      const { error: rpcErr } = await serviceClient.rpc("increment_profile_credits", {
        p_user_id: accessMode.userId,
        p_delta: 1,
      });
      if (!rpcErr) return;

      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: freshProf } = await serviceClient
          .from("profiles")
          .select("credits")
          .eq("id", accessMode.userId)
          .maybeSingle();
        const curCredits = Number(freshProf?.credits ?? 0);
        const { data: updated } = await serviceClient
          .from("profiles")
          .update({ credits: curCredits + 1 })
          .eq("id", accessMode.userId)
          .eq("credits", curCredits)
          .select("id")
          .maybeSingle();
        if (updated) return;
      }
      return;
    }

    if (accessMode.kind === "entitlement") {
      let updateQuery = serviceClient
        .from("payments")
        .update({ entitlement_used: false, entitlement_claim_id: null })
        .eq("id", accessMode.paymentId)
        .eq("entitlement_used", true);

      if (accessMode.claimId) {
        updateQuery = updateQuery.eq("entitlement_claim_id", accessMode.claimId);
      }

      await updateQuery;
    }
  } catch (refundErr) {
    console.error("[Web Analyze Refund Error]:", refundErr);
  }
}

async function resolveOwnerKeyForAnalyzeIdempotency(req: express.Request): Promise<string> {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const authClient = getSupabaseAuthClient();
    if (authClient) {
      const { data: userData, error: userErr } = await authClient.auth.getUser(bearerToken);
      if (!userErr && userData?.user) {
        return `user:${userData.user.id}`;
      }
    }
  }
  const rawDeviceId = req.headers["x-device-id"] ?? req.body?.deviceId;
  const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";
  if (deviceId) {
    return `device:${deviceId}`;
  }
  return "anonymous";
}

apiRouter.post("/web/analyze", async (req, res) => {
  const serviceClient = getSupabaseClient();
  let reservedAccess: WebAccessMode | null = null;
  let activeReserveId: string | null = null;
  let activeUserId: string | null = null;
  let activeDeviceId = "";
  let activeIdempotencyKey: string | null = null;

  try {
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "اتصال به سرویس دیتابیس برقرار نیست.",
      });
    }

    // بررسی هدر Idempotency-Key پیش از رزرو سهمیه تا تکرار شبکه دوبار سهمیه کسر نکند
    const rawIdemKey = req.headers["idempotency-key"] ?? req.body?.idempotencyKey;
    const idempotencyKey =
      (Array.isArray(rawIdemKey) ? rawIdemKey[0] : rawIdemKey)?.toString().trim() || "";
    if (idempotencyKey) {
      if (!UUID_REGEX.test(idempotencyKey)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_IDEMPOTENCY_KEY",
          message: "شناسه تکرار درخواست (Idempotency-Key) معتبر نیست.",
        });
      }

      const ownerKey = await resolveOwnerKeyForAnalyzeIdempotency(req);
      const { data: existingIdem } = await serviceClient
        .from("web_analyze_idempotency")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingIdem) {
        if (existingIdem.owner_key !== ownerKey) {
          return res.status(409).json({
            success: false,
            error: "IDEMPOTENCY_KEY_CONFLICT",
            message: "این شناسه درخواست متعلق به نشست یا کاربر دیگری است.",
          });
        }
        if (existingIdem.status === "completed" && existingIdem.response_body) {
          return res.status(existingIdem.response_status || 200).json(existingIdem.response_body);
        }
        const createdMs = existingIdem.created_at ? new Date(existingIdem.created_at).getTime() : 0;
        if (existingIdem.status === "in_progress" && Date.now() - createdMs < 120_000) {
          return res.status(409).json({
            success: false,
            error: "REQUEST_IN_PROGRESS",
            message: "درخواست تحلیل با همین شناسه هم‌اکنون در حال پردازش است. لطفاً چند لحظه صبر کنید.",
          });
        }
      }
      activeIdempotencyKey = idempotencyKey;
    }

    const access = await resolveWebAccessForRequest(req, serviceClient, {
      allowRecentAnalyzePass: false,
    });
    if ("error" in access) {
      return res.status(access.status).json({
        success: false,
        error: access.error,
        message: access.message,
        ...(access.extra || {}),
      });
    }

    activeUserId = access.verifiedUserId;
    activeDeviceId = access.deviceId;

    // اعتبارسنجی ورودی تحلیل پیش از رزرو سهمیه و فراخوانی Gemini
    const { fileBase64, mimeType, rawText, fileName } = req.body || {};
    if (!fileBase64 && !rawText) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "لطفاً فایل پی‌دی‌اف، تصویر ابلاغیه یا متن آن را ارسال کنید.",
      });
    }
    if (fileBase64 != null && typeof fileBase64 !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "فرمت فایل ارسالی نامعتبر است.",
      });
    }
    if (rawText != null && (typeof rawText !== "string" || rawText.length > 200000)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "متن ارسالی نامعتبر یا بیش از حد مجاز طولانی است.",
      });
    }
    if (fileBase64) {
      const normalizedMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
      if (!ALLOWED_WEB_MIME_TYPES.has(normalizedMime)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_MIME_TYPE",
          message: "فقط فایل‌های PDF و تصاویر JPG، PNG و WEBP پشتیبانی می‌شوند.",
        });
      }
    }

    // قفل idempotency پس از اعتبارسنجی دسترسی و ورودی
    if (activeIdempotencyKey) {
      const ownerKey = access.verifiedUserId
        ? `user:${access.verifiedUserId}`
        : access.deviceId
        ? `device:${access.deviceId}`
        : "anonymous";
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await serviceClient
        .from("web_analyze_idempotency")
        .delete()
        .eq("idempotency_key", activeIdempotencyKey)
        .eq("owner_key", ownerKey)
        .eq("status", "failed");

      const { error: idemInsertErr } = await serviceClient
        .from("web_analyze_idempotency")
        .insert({
          idempotency_key: activeIdempotencyKey,
          owner_key: ownerKey,
          status: "in_progress",
          created_at: nowIso,
          expires_at: expiresIso,
        });

      if (idemInsertErr) {
        const { data: raceRow } = await serviceClient
          .from("web_analyze_idempotency")
          .select("*")
          .eq("idempotency_key", activeIdempotencyKey)
          .maybeSingle();

        if (raceRow && raceRow.owner_key === ownerKey && raceRow.status === "completed" && raceRow.response_body) {
          return res.status(raceRow.response_status || 200).json(raceRow.response_body);
        }
        if (raceRow && raceRow.owner_key === ownerKey) {
          return res.status(409).json({
            success: false,
            error: "REQUEST_IN_PROGRESS",
            message: "درخواست تحلیل با همین شناسه هم‌اکنون در حال پردازش است. لطفاً چند لحظه صبر کنید.",
          });
        }
      }
    }

    // ۱) رزرو اتمیک سهمیه پیش از اجرای Gemini (جلوگیری از Race Condition همزمان روی ۱ اعتبار/توکن)
    const reservation = await reserveWebAccessUnit(serviceClient, access.accessMode);
    if ("error" in reservation) {
      if (activeIdempotencyKey) {
        await serviceClient
          .from("web_analyze_idempotency")
          .update({
            status: "failed",
            response_status: reservation.status,
            response_body: {
              success: false,
              error: reservation.error,
              message: reservation.message,
            },
          })
          .eq("idempotency_key", activeIdempotencyKey);
      }
      return res.status(reservation.status).json({
        success: false,
        error: reservation.error,
        message: reservation.message,
      });
    }
    reservedAccess = access.accessMode;
    activeReserveId = crypto.randomUUID();

    await logWebUsage(serviceClient, {
      userId: access.verifiedUserId,
      deviceId: access.deviceId,
      paymentId: reservedAccess.kind === "entitlement" ? reservedAccess.paymentId : null,
      action: "reserve",
      accessMode: reservedAccess.kind,
      metadata: {
        reserve_id: activeReserveId,
        ...(reservedAccess.kind === "annual" ? { today: reservedAccess.today } : {}),
        ...(reservedAccess.kind === "entitlement" && reservedAccess.claimId
          ? { claim_id: reservedAccess.claimId }
          : {}),
      },
    });

    // ۲) اجرای تحلیل با تابع مشترک runAnalysis
    const analysisResult = await runAnalysis({ fileBase64, mimeType, rawText });
    if (!analysisResult.ok) {
      // ۳) بازگشت خودکار سهمیه در صورت خطای AI یا نامربوط بودن سند
      await refundWebAccessUnit(serviceClient, reservedAccess);
      await logWebUsage(serviceClient, {
        userId: access.verifiedUserId,
        deviceId: access.deviceId,
        paymentId: reservedAccess.kind === "entitlement" ? reservedAccess.paymentId : null,
        action: "refund",
        accessMode: reservedAccess.kind,
        metadata: {
          reserve_id: activeReserveId,
          reason: analysisResult.body?.error || "analysis_failed",
        },
      });
      reservedAccess = null;

      const errStatus = analysisResult.status || 500;
      const errBody = analysisResult.body || { success: false };
      if (activeIdempotencyKey) {
        await serviceClient
          .from("web_analyze_idempotency")
          .update({
            status: "failed",
            response_status: errStatus,
            response_body: errBody,
          })
          .eq("idempotency_key", activeIdempotencyKey);
      }

      return res.status(errStatus).json(errBody);
    }

    reservedAccess = null;

    // ذخیره سرور-ساید تاریخچه برای کاربر لاگین‌شده و ثبت لاگ مصرف (بدون ایجاد وقفه در صورت خطای جانبی)
    let savedAnalysisId: string | null = null;
    if (access.verifiedUserId && analysisResult.data) {
      try {
        const cleanFileName =
          typeof fileName === "string" && fileName.trim()
            ? fileName.trim().slice(0, 200)
            : "ابلاغیه قضایی";
        const { data: savedRow } = await serviceClient
          .from("web_analyses")
          .insert({
            user_id: access.verifiedUserId,
            file_name: cleanFileName,
            title: String(analysisResult.data.title || cleanFileName).slice(0, 300),
            summary: String(analysisResult.data.summaryInSimpleWords || "").slice(0, 2000),
            authority: String(analysisResult.data.caseDetails?.issuingAuthority || "مرجع قضایی").slice(0, 300),
            urgency: ["high", "medium", "low"].includes(analysisResult.data.urgencyLevel)
              ? analysisResult.data.urgencyLevel
              : "medium",
            analysis_json: analysisResult.data,
          })
          .select("id")
          .maybeSingle();
        savedAnalysisId = savedRow?.id || null;
      } catch {
        // non-blocking
      }
    }

    await logWebUsage(serviceClient, {
      userId: access.verifiedUserId,
      deviceId: access.deviceId,
      paymentId: access.accessMode.kind === "entitlement" ? access.accessMode.paymentId : null,
      action: "analyze",
      accessMode: access.accessMode.kind,
      metadata: activeReserveId ? { reserve_id: activeReserveId } : null,
    });

    const aiToolsUntil = new Date(Date.now() + AI_TOOLS_PASS_WINDOW_MS).toISOString();
    const successBody = {
      success: true,
      data: analysisResult.data,
      accessMode: access.accessMode.kind,
      ai_tools_until: aiToolsUntil,
      ...(savedAnalysisId ? { savedAnalysisId } : {}),
    };

    if (activeIdempotencyKey) {
      await serviceClient
        .from("web_analyze_idempotency")
        .update({
          status: "completed",
          response_status: 200,
          response_body: successBody,
        })
        .eq("idempotency_key", activeIdempotencyKey);
    }

    return res.json(successBody);
  } catch (error: any) {
    if (serviceClient && reservedAccess) {
      await refundWebAccessUnit(serviceClient, reservedAccess);
      await logWebUsage(serviceClient, {
        userId: activeUserId,
        deviceId: activeDeviceId,
        paymentId: reservedAccess.kind === "entitlement" ? reservedAccess.paymentId : null,
        action: "refund",
        accessMode: reservedAccess.kind,
        metadata: {
          ...(activeReserveId ? { reserve_id: activeReserveId } : {}),
          reason: "unexpected_exception",
        },
      });
    }
    if (serviceClient && activeIdempotencyKey) {
      await serviceClient
        .from("web_analyze_idempotency")
        .update({
          status: "failed",
          response_status: 500,
          response_body: {
            success: false,
            error: "خطا در پردازش و تحلیل ابلاغیه قضایی",
          },
        })
        .eq("idempotency_key", activeIdempotencyKey);
    }
    console.error("[Web Analyze Error]:", error);
    return res.status(500).json({
      success: false,
      error: "خطا در پردازش و تحلیل ابلاغیه قضایی",
    });
  }
});

// ==========================================
// Protected Reconciliation & 90-Day Retention Cleanup Endpoint
// ==========================================

function timingSafeStringMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorizedReconcileRequest(req: express.Request): boolean {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.RECONCILE_SECRET?.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  ].filter((s): s is string => Boolean(s));

  if (secrets.length === 0) {
    return false;
  }

  const bearer = extractBearerToken(req);
  const rawHeader = req.headers["x-cron-secret"] ?? req.headers["x-reconcile-secret"];
  const headerSecret = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.toString().trim() || "";
  const candidate = bearer || headerSecret;
  if (!candidate) {
    return false;
  }

  return secrets.some((secret) => timingSafeStringMatch(candidate, secret));
}

async function handleWebReconcile(req: express.Request, res: express.Response) {
  try {
    if (!isAuthorizedReconcileRequest(req)) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "دسترسی غیرمجاز به سرویس همگام‌سازی.",
      });
    }

    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "اتصال به سرویس دیتابیس برقرار نیست.",
      });
    }

    const rawStaleMinutes = req.body?.staleMinutes ?? req.query?.staleMinutes;
    const parsedStale = rawStaleMinutes !== undefined ? Number(rawStaleMinutes) : 5;
    const staleMinutes =
      Number.isFinite(parsedStale) && parsedStale >= 0 ? Math.min(parsedStale, 1440) : 5;

    const nowMs = Date.now();
    const staleBeforeIso = new Date(nowMs - staleMinutes * 60 * 1000).toISOString();
    const lookbackIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();

    let refundedReserves = 0;
    const { data: reserveLogs } = await serviceClient
      .from("web_usage_logs")
      .select("id, user_id, device_id, payment_id, access_mode, metadata, created_at")
      .eq("action", "reserve")
      .lt("created_at", staleBeforeIso)
      .gte("created_at", lookbackIso)
      .limit(200);

    if (Array.isArray(reserveLogs) && reserveLogs.length > 0) {
      const { data: resolvedLogs } = await serviceClient
        .from("web_usage_logs")
        .select("action, metadata")
        .in("action", ["analyze", "refund", "analyze_refund"])
        .gte("created_at", lookbackIso);

      const resolvedReserveIds = new Set<string>();
      for (const row of resolvedLogs || []) {
        const rid = row?.metadata?.reserve_id;
        if (typeof rid === "string" && rid) {
          resolvedReserveIds.add(rid);
        }
      }

      for (const reserve of reserveLogs) {
        const reserveId = reserve?.metadata?.reserve_id;
        if (!reserveId || resolvedReserveIds.has(reserveId)) {
          continue;
        }

        let targetAccess: WebAccessMode | null = null;
        if (reserve.access_mode === "annual" && reserve.user_id) {
          targetAccess = {
            kind: "annual",
            userId: reserve.user_id,
            today: String(reserve.metadata?.today || getTodayDateString()),
            usedToday: 0,
          };
        } else if (reserve.access_mode === "credits" && reserve.user_id) {
          targetAccess = {
            kind: "credits",
            userId: reserve.user_id,
          };
        } else if (reserve.access_mode === "entitlement" && reserve.payment_id && reserve.device_id) {
          targetAccess = {
            kind: "entitlement",
            paymentId: reserve.payment_id,
            deviceId: reserve.device_id,
            claimId: reserve.metadata?.claim_id ? String(reserve.metadata.claim_id) : undefined,
          };
        }

        if (!targetAccess) {
          continue;
        }

        await refundWebAccessUnit(serviceClient, targetAccess);
        await logWebUsage(serviceClient, {
          userId: reserve.user_id,
          deviceId: reserve.device_id,
          paymentId: reserve.payment_id,
          action: "refund",
          accessMode: reserve.access_mode,
          metadata: {
            reserve_id: reserveId,
            reason: "reconcile_stale_reserve",
            ...(targetAccess.kind === "entitlement" && targetAccess.claimId
              ? { claim_id: targetAccess.claimId }
              : {}),
          },
        });
        resolvedReserveIds.add(reserveId);
        refundedReserves++;
      }
    }

    // اعطای سفارش‌های پرداخت‌شده‌ای که به هر دلیل هنوز granted_at ندارند
    let grantedOrders = 0;
    const { data: ungrantedOrders } = await serviceClient
      .from("payments")
      .select("id, user_id, device_id, product, status, granted_at")
      .eq("status", "paid")
      .is("granted_at", null)
      .limit(100);

    for (const order of ungrantedOrders || []) {
      try {
        const granted = await grantWebPaymentEntitlement(serviceClient, order);
        if (granted) {
          grantedOrders++;
        }
      } catch (grantErr) {
        console.warn("[Web Reconcile] Grant recovery failed for order:", order.id, grantErr);
      }
    }

    // پاک‌سازی خودکار تحلیل‌های ذخیره‌شده قدیمی‌تر از ۹۰ روز و کلیدهای idempotency منقضی‌شده
    const retentionCutoffIso = new Date(nowMs - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedAnalyses } = await serviceClient
      .from("web_analyses")
      .delete()
      .lt("created_at", retentionCutoffIso)
      .select("id");
    const purgedAnalyses = Array.isArray(deletedAnalyses) ? deletedAnalyses.length : 0;

    const { data: deletedIdem } = await serviceClient
      .from("web_analyze_idempotency")
      .delete()
      .lt("expires_at", new Date(nowMs).toISOString())
      .select("idempotency_key");
    const purgedIdempotencyKeys = Array.isArray(deletedIdem) ? deletedIdem.length : 0;

    return res.json({
      success: true,
      refundedReserves,
      grantedOrders,
      purgedAnalyses,
      purgedIdempotencyKeys,
      timestamp: new Date(nowMs).toISOString(),
    });
  } catch (err: any) {
    console.error("[Web Reconcile Error]:", err);
    return res.status(500).json({
      success: false,
      error: "خطا در اجرای عملیات همگام‌سازی و پاک‌سازی سرور.",
    });
  }
}

apiRouter.get("/web/reconcile", handleWebReconcile);
apiRouter.post("/web/reconcile", handleWebReconcile);

// Mount the API Router on "/api" (and fallback on "/" in Vercel Serverless)
app.use("/api", apiRouter);
if (process.env.VERCEL) {
  app.use("/", apiRouter);
}

// 404 handler for unmatched API routes
apiRouter.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `مسیر درخواستی (${req.originalUrl || req.baseUrl + req.path}) در سرور یافت نشد.`,
  });
});

// Express API error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API Express Error:", err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    success: false,
    error:
      err.type === "entity.too.large"
        ? "حجم فایل یا درخواست ارسالی بیش از حد مجاز سرور است."
        : "خطای داخلی سرور",
  });
});

export default app;
