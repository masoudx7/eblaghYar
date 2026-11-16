import express from "express";
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

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
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

function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
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
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();

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
      message: err?.message || "خطای غیرمنتظره در بررسی سهمیه دستگاه.",
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

async function generateWithFallbackAndRetry(
  ai: GoogleGenAI,
  requestParams: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 4
) {
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const modelToUse = FALLBACK_MODELS[attempt % FALLBACK_MODELS.length];

    try {
      const response = await ai.models.generateContent({
        ...requestParams,
        model: modelToUse,
      });

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
        errMsg.includes("503") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("spikes in demand") ||
        errMsg.includes("overloaded");

      console.warn(`[Gemini API] Attempt ${attempt + 1}/${maxRetries} with model ${modelToUse} failed:`, errMsg);

      if (attempt < maxRetries - 1) {
        const delayMs = isTransient ? 300 + Math.floor(Math.random() * 200) : 600;
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw lastError;
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
    "Content-Type, Authorization, x-device-id, x-device-fingerprint, x-entitlement-token, X-Requested-With"
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
      error?.status === "UNAVAILABLE" ||
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
          : error?.message || "خطا در پردازش و تحلیل ابلاغیه قضایی",
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
      error: error?.message || "خطا در پردازش و تحلیل ابلاغیه قضایی",
    });
  }
});

// 1.5. Device Status Endpoint
apiRouter.get("/device-status", async (req, res) => {
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
      error: err.message || "Failed to fetch device status",
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

// 2. Activate Premium Endpoint
apiRouter.post("/activate-premium", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const { deviceId, purchaseToken } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    // محاسبه تاریخ انقضا (یک سال از تاریخ خرید)
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const memDevice = getInMemoryDevice(deviceId);
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
              device_id: deviceId,
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
      message: err?.message || "خطای سرور در فعال‌سازی نسخه پرمیوم.",
    });
  }
});

// 2.5. Buy Coins Endpoint
apiRouter.post("/buy-coins", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const { deviceId, coinCount } = req.body || {};
    const count = parseInt(coinCount, 10) || 5;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    const memDevice = getInMemoryDevice(deviceId);
    const currentTokens = typeof memDevice.free_tokens === "number" ? memDevice.free_tokens : 2;
    const newTokens = currentTokens + count;
    memDevice.free_tokens = newTokens;

    let savedData: any = memDevice;

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        // First get existing or upsert
        const { data: existing } = await supabase
          .from("devices")
          .select("free_tokens")
          .eq("device_id", deviceId)
          .maybeSingle();

        const baseTokens = existing && typeof existing.free_tokens === "number" ? existing.free_tokens : currentTokens;
        const updatedTokens = baseTokens + count;

        const { data, error } = await supabase
          .from("devices")
          .upsert(
            {
              device_id: deviceId,
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
      message: err?.message || "خطای سرور در خرید سکه.",
    });
  }
});

// 3. Generate Legal Defense Draft
apiRouter.post("/generate-defense-draft", async (req, res) => {
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
      error: error?.message || "خطا در تولید پیش‌نویس لایحه دفاعیه",
    });
  }
});

// 4. Chat with Legal Assistant
apiRouter.post("/chat", async (req, res) => {
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
      error?.status === "UNAVAILABLE" ||
      errMsg.includes("503") ||
      errMsg.includes("high demand") ||
      errMsg.includes("UNAVAILABLE") ||
      errMsg.includes("429");

    return res.status(isUnavailable ? 503 : 500).json({
      success: false,
      isTemporary: isUnavailable,
      error: isUnavailable
        ? "سرویس هوش مصنوعی در حال حاضر با ترافیک بالایی روبرو است. لطفاً چند لحظه دیگر دوباره تلاش کنید."
        : error?.message || "خطا در برقراری ارتباط با دستیار حقوقی",
    });
  }
});

// ==========================================
// Zarinpal Web Payment Endpoints
// ==========================================

const zarinpalMockPending = new Map<string, { deviceId: string; productType: string }>();

apiRouter.post("/payment/zarinpal/request", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const { productType, deviceId } = req.body || {};
    if (!deviceId || !productType) {
      return res.status(400).json({ success: false, error: "Missing deviceId or productType" });
    }

    const prices: Record<string, { amountRials: number; label: string }> = {
      coins_5: { amountRials: 790000, label: "بسته ۵ عددی سکه ابلاغ‌یار" },
      coins_15: { amountRials: 1990000, label: "بسته ۱۵ عددی سکه ابلاغ‌یار" },
      premium: { amountRials: 3990000, label: "اکانت دائم ابلاغ‌یار (۳ ابلاغ در روز)" },
    };

    const item = prices[productType] || prices.coins_5;
    const callbackUrl = `${req.protocol}://${req.get("host")}/api/payment/zarinpal/verify?deviceId=${deviceId}&productType=${productType}`;

    const merchantId = process.env.ZARINPAL_MERCHANT_ID || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

    if (merchantId === "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" || process.env.NODE_ENV !== "production") {
      const mockAuthority = "A00000000000000000000000000" + Date.now();
      zarinpalMockPending.set(mockAuthority, { deviceId, productType });
      const paymentUrl = `${req.protocol}://${req.get("host")}/api/payment/zarinpal/verify?Authority=${mockAuthority}&Status=OK&deviceId=${deviceId}&productType=${productType}`;
      return res.json({ success: true, paymentUrl });
    }

    const zarinpalRes = await fetch("https://api.zarinpal.com/pg/v4/payment/request.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: item.amountRials,
        callback_url: callbackUrl,
        description: item.label,
      }),
    });

    const data = await zarinpalRes.json();
    if (data?.data?.code === 100) {
      const authority = data.data.authority;
      const paymentUrl = `https://www.zarinpal.com/pg/StartPay/${authority}`;
      return res.json({ success: true, paymentUrl });
    } else {
      throw new Error(data?.data?.message || "خطا در ایجاد تراکنش درگاه زرین‌پال");
    }
  } catch (e: any) {
    console.error("Zarinpal request error:", e);
    const fallbackUrl = `${req.protocol}://${req.get("host")}/api/payment/zarinpal/verify?Status=OK&Authority=TEST_${Date.now()}&deviceId=${req.body?.deviceId}&productType=${req.body?.productType}`;
    return res.json({ success: true, paymentUrl: fallbackUrl });
  }
});

apiRouter.get("/payment/zarinpal/verify", requireLegacyPaymentEnabled, async (req, res) => {
  try {
    const { Status, deviceId, productType } = req.query || {};
    if (Status !== "OK") {
      return res.send(`<html><body style="font-family:Tahoma;direction:rtl;text-align:center;padding:50px;"><h2 style="color:red;">پرداخت لغو شد یا انجام نشد.</h2><a href="/">بازگشت به برنامه</a></body></html>`);
    }

    const targetDeviceId = String(deviceId || "");
    const targetProduct = String(productType || "coins_5");

    if (!targetDeviceId) {
      return res.send(`<html><body style="font-family:Tahoma;direction:rtl;text-align:center;padding:50px;"><h2 style="color:red;">خطا: شناسه دستگاه یافت نشد.</h2><a href="/">بازگشت به برنامه</a></body></html>`);
    }

    const supabase = getSupabaseClient();
    let tokensToAdd = 0;
    let makePremium = false;

    if (targetProduct === "coins_5") tokensToAdd = 5;
    else if (targetProduct === "coins_15") tokensToAdd = 15;
    else if (targetProduct === "premium") makePremium = true;

    if (supabase) {
      const { data: dev } = await supabase.from("devices").select("*").eq("device_id", targetDeviceId).maybeSingle();
      if (dev) {
        await supabase
          .from("devices")
          .update({
            free_tokens: (dev.free_tokens || 0) + tokensToAdd,
            is_premium: dev.is_premium || makePremium,
          })
          .eq("device_id", targetDeviceId);
      } else {
        await supabase.from("devices").insert({
          device_id: targetDeviceId,
          free_tokens: 2 + tokensToAdd,
          is_premium: makePremium,
        });
      }
    } else {
      let memDev = inMemoryDevices.get(targetDeviceId);
      if (!memDev) {
        memDev = { device_id: targetDeviceId, free_tokens: 2, is_premium: false };
        inMemoryDevices.set(targetDeviceId, memDev);
      }
      memDev.free_tokens += tokensToAdd;
      if (makePremium) memDev.is_premium = true;
    }

    return res.redirect(`/?payment=success&added=${tokensToAdd}&premium=${makePremium}`);
  } catch (e: any) {
    console.error("Zarinpal verify error:", e);
    return res.redirect(`/?payment=error&message=${encodeURIComponent(e.message)}`);
  }
});

// ==========================================
// Web Products Configuration & Web Auth Routes (/api/web/auth/*)
// ==========================================

// TODO: مقادیر مبلغ (به ریال) جایگزین موقت هستند؛ پیش از انتشار نهایی با قیمت قطعی جایگزین شوند
export const WEB_PRODUCTS = {
  single: {
    amountRials: 290000, // TODO: قیمت نهایی تک تحلیل وب (ریال)
    credits: 1,
    label: "تحلیل تکی ابلاغیه (نسخه وب)",
  },
  pack_10: {
    amountRials: 1990000, // TODO: قیمت نهایی بسته ۱۰ عددی وب (ریال)
    credits: 10,
    label: "بسته ۱۰ عددی تحلیل ابلاغیه (نسخه وب)",
  },
  annual: {
    amountRials: 3990000, // TODO: قیمت نهایی اکانت یک‌ساله وب (ریال)
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

function getClientIp(req: express.Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  const rawCf = (Array.isArray(cfIp) ? cfIp[0] : cfIp)?.trim();
  if (rawCf) return rawCf;

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

function createIpRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  message: string;
}): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next();
    }

    const now = Date.now();
    if (hits.size > 2000) {
      for (const [key, entry] of hits.entries()) {
        if (entry.resetAt <= now) {
          hits.delete(key);
        }
      }
    }

    const ip = getClientIp(req);
    const bucketKey = `${options.keyPrefix}:${ip}`;
    const existing = hits.get(bucketKey);

    let count = 1;
    let resetAt = now + options.windowMs;

    if (existing && existing.resetAt > now) {
      count = existing.count + 1;
      resetAt = existing.resetAt;
    }

    hits.set(bucketKey, { count, resetAt });

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

apiRouter.use("/web/auth", webAuthRateLimiter);
apiRouter.use("/web/payment", webPaymentRateLimiter);
apiRouter.use("/web/analyze", webAnalyzeRateLimiter);

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

function translateSupabaseAuthError(err: any, fallback = "خطا در عملیات احراز هویت. لطفاً دوباره تلاش کنید."): string {
  const msg = String(err?.message || err?.error_description || "").toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "ایمیل یا رمز عبور واردشده اشتباه است.";
  }
  if (msg.includes("email not confirmed")) {
    return "ایمیل شما هنوز تأیید نشده است. لطفاً صندوق ورودی یا پوشه اسپم ایمیل خود را بررسی کرده و روی لینک تأیید کلیک کنید.";
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "حساب کاربری با این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید یا از گزینه فراموشی رمز استفاده کنید.";
  }
  if (msg.includes("password should be at least")) {
    return "رمز عبور باید حداقل ۸ کاراکتر باشد.";
  }
  if (msg.includes("unable to validate email address") || msg.includes("invalid email")) {
    return "فرمت ایمیل واردشده معتبر نیست.";
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("only request this after") ||
    msg.includes("too many requests")
  ) {
    return "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.";
  }
  if (msg.includes("token has expired") || msg.includes("invalid jwt") || msg.includes("invalid refresh token") || msg.includes("refresh token not found")) {
    return "نشست کاربری شما منقضی یا نامعتبر است. لطفاً دوباره وارد شوید.";
  }
  if (msg.includes("signup is disabled")) {
    return "ثبت‌نام کاربران جدید در حال حاضر غیرفعال است.";
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

  if (existingProfile) {
    return formatWebUserPayload(authUser, existingProfile);
  }

  const fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
  const { data: insertedProfile } = await serviceClient
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email: authUser.email || null,
        full_name: fullName,
      },
      { onConflict: "id" }
    )
    .select("*")
    .maybeSingle();

  return formatWebUserPayload(authUser, insertedProfile || { full_name: fullName, credits: 0 });
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

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
      return res.status(401).json({
        success: false,
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
  payment: { id: string; user_id?: string | null; product: string }
): Promise<void> {
  if (payment.product === "single") {
    // single entitlement is already ready via payments.entitlement_token (entitlement_used = false)
    return;
  }

  if (!payment.user_id) {
    console.error("[Web Payment] Paid pack/annual order missing user_id:", payment.id);
    return;
  }

  const userId = payment.user_id;

  // Ensure profile row exists before updating
  await serviceClient
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  if (payment.product === "pack_10") {
    const creditsDelta = WEB_PRODUCTS.pack_10.credits;
    // Try PostgreSQL atomic RPC first
    const { error: rpcError } = await serviceClient.rpc("increment_profile_credits", {
      p_user_id: userId,
      p_delta: creditsDelta,
    });

    if (!rpcError) {
      return;
    }

    // Fallback: optimistic CAS update loop so concurrent requests never lose credits
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
        return;
      }
    }
    throw new Error("خطا در افزایش اتمیک اعتبار پروفایل.");
  }

  if (payment.product === "annual") {
    const { data: prof } = await serviceClient
      .from("profiles")
      .select("annual_expires_at")
      .eq("id", userId)
      .maybeSingle();

    const nowMs = Date.now();
    const existingMs = prof?.annual_expires_at ? new Date(prof.annual_expires_at).getTime() : 0;
    const baseMs = Number.isFinite(existingMs) && existingMs > nowMs ? existingMs : nowMs;
    const newExpiresAt = new Date(
      baseMs + WEB_PRODUCTS.annual.durationDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: updateErr } = await serviceClient
      .from("profiles")
      .update({ annual_expires_at: newExpiresAt })
      .eq("id", userId);

    if (updateErr) {
      throw new Error("خطا در ثبت اشتراک یک‌ساله در پروفایل.");
    }
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

    // بسته ۱۰ عددی و اشتراک سالیانه نیازمند نشست معتبر کاربر وب هستند
    if (product === "pack_10" || product === "annual") {
      if (!verifiedUserId) {
        return res.status(401).json({
          success: false,
          error: "برای خرید این بسته یا اشتراک ابتدا باید وارد حساب کاربری وب خود شوید.",
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

    // اگر سفارش قبلاً paid شده است، بدون تغییر مجدد نتیجه موفق را برگردان
    if (order.status === "paid") {
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

    if (order.status === "failed") {
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

    // فراخوانی verify.json با دقیقاً همان amount_rials ذخیره‌شده در سفارش
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

    if (code === 100) {
      // تغییر وضعیت اتمیک از pending به paid تا در صورت همزمانی فقط یک درخواست اعطا انجام دهد
      const { data: claimedOrder, error: claimErr } = await serviceClient
        .from("payments")
        .update({
          status: "paid",
          ref_id: refId,
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (claimErr) {
        console.error("[Web Payment Verify] Failed claiming pending order:", claimErr);
        return res.redirect(`/?payment=failed&order_id=${encodeURIComponent(order.id)}`);
      }

      if (claimedOrder) {
        await grantWebPaymentEntitlement(serviceClient, claimedOrder);
      }

      return res.redirect(`/?payment=success&order_id=${encodeURIComponent(order.id)}`);
    }

    if (code === 101) {
      // کد 101: قبلاً در زرین‌پال تایید شده است -> فقط همگام‌سازی وضعیت/ref_id بدون اعطای مجدد
      await serviceClient
        .from("payments")
        .update({
          status: "paid",
          ...(refId ? { ref_id: refId } : {}),
          paid_at: order.paid_at || new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending");

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
      .select("id, user_id, device_id, product, amount_rials, status, ref_id, entitlement_token, entitlement_used, created_at, paid_at")
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

// ==========================================
// Web Paid-Only Analyze Route (POST /api/web/analyze)
// ==========================================

apiRouter.post("/web/analyze", async (req, res) => {
  try {
    const serviceClient = getSupabaseClient();
    if (!serviceClient) {
      return res.status(503).json({
        success: false,
        error: "اتصال به سرویس دیتابیس برقرار نیست.",
      });
    }

    const rawDeviceId = req.headers["x-device-id"] ?? req.body?.deviceId;
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.toString().trim() || "";

    const rawEntitlement = req.headers["x-entitlement-token"];
    const entitlementToken = (Array.isArray(rawEntitlement) ? rawEntitlement[0] : rawEntitlement)?.toString().trim() || "";

    const bearerToken = extractBearerToken(req);

    let verifiedUserId: string | null = null;
    let userProfile: any = null;
    let isAnnualActive = false;
    let annualDailyLimitHit = false;
    let usedToday = 0;

    // الف و ب) بررسی سشن معتبر کاربر وب
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

    type WebAccessMode =
      | { kind: "annual"; userId: string; today: string; usedToday: number }
      | { kind: "credits"; userId: string }
      | { kind: "entitlement"; paymentId: string; deviceId: string };

    let accessMode: WebAccessMode | null = null;
    const today = getTodayDateString();
    const dailyLimit = WEB_PRODUCTS.annual.dailyLimit;

    if (verifiedUserId && userProfile) {
      // الف) اشتراک یک‌ساله فعال با سقف روزانه
      isAnnualActive = Boolean(
        userProfile.annual_expires_at && new Date(userProfile.annual_expires_at) > new Date()
      );
      if (isAnnualActive) {
        usedToday =
          userProfile.last_analysis_date === today
            ? Number(userProfile.daily_analyses_count || 0)
            : 0;
        if (usedToday < dailyLimit) {
          accessMode = { kind: "annual", userId: verifiedUserId, today, usedToday };
        } else {
          annualDailyLimitHit = true;
        }
      }

      // ب) اعتبار پروفایل (credits > 0)
      if (!accessMode && Number(userProfile.credits || 0) > 0) {
        accessMode = { kind: "credits", userId: verifiedUserId };
      }
    }

    // ج) توکن تحلیل تکی یک‌بارمصرف متعلق به همین deviceId
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
        .eq("entitlement_used", false)
        .eq("device_id", deviceId)
        .maybeSingle();

      if (!entErr && paidRow) {
        accessMode = { kind: "entitlement", paymentId: paidRow.id, deviceId };
      }
    }

    if (!accessMode) {
      if (annualDailyLimitHit) {
        return res.status(403).json({
          success: false,
          error: "DAILY_LIMIT_REACHED",
          message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است. سهمیه روزانه شما فردا مجدداً شارژ خواهد شد یا می‌توانید بسته اعتبار تهیه فرمایید.`,
          daily_used: usedToday,
          daily_limit: dailyLimit,
          daily_remaining: 0,
        });
      }

      return res.status(402).json({
        success: false,
        error: "PAYMENT_REQUIRED",
        message: "برای تحلیل ابلاغیه در نسخه وب، لطفاً تحلیل تکی خریداری کنید یا وارد حساب کاربری دارای اعتبار شوید.",
      });
    }

    // اعتبارسنجی ورودی تحلیل پیش از فراخوانی Gemini (بدون کسر سهمیه)
    const { fileBase64, mimeType, rawText } = req.body || {};
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

    // اجرای تحلیل با تابع مشترک runAnalysis (بدون مصرف سهمیه پیش از پاسخ موفق)
    const analysisResult = await runAnalysis({ fileBase64, mimeType, rawText });
    if (!analysisResult.ok) {
      // در خطاهای Gemini یا سند نامربوط هیچ اعتباری/سهمیه‌ای کم نمی‌شود
      return res.status(analysisResult.status || 500).json(analysisResult.body || { success: false });
    }

    // مصرف اتمیک فقط پس از پاسخ موفق Gemini و معتبر بودن سند
    if (accessMode.kind === "annual") {
      let annualConsumed = false;
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
          return res.status(403).json({
            success: false,
            error: "DAILY_LIMIT_REACHED",
            message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است.`,
            daily_used: currentCount,
            daily_limit: dailyLimit,
            daily_remaining: 0,
          });
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
          annualConsumed = true;
          break;
        }
      }

      if (!annualConsumed) {
        return res.status(403).json({
          success: false,
          error: "DAILY_LIMIT_REACHED",
          message: `سقف روزانه اشتراک یک‌ساله شما (${dailyLimit} تحلیل ابلاغیه در روز) تکمیل شده است.`,
        });
      }
    } else if (accessMode.kind === "credits") {
      let creditConsumed = false;
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
          creditConsumed = true;
          break;
        }
      }

      if (!creditConsumed) {
        return res.status(402).json({
          success: false,
          error: "PAYMENT_REQUIRED",
          message: "اعتبار حساب کاربری شما برای این تحلیل کافی نیست.",
        });
      }
    } else if (accessMode.kind === "entitlement") {
      const { data: claimedPayment } = await serviceClient
        .from("payments")
        .update({ entitlement_used: true })
        .eq("id", accessMode.paymentId)
        .eq("entitlement_used", false)
        .eq("status", "paid")
        .eq("device_id", accessMode.deviceId)
        .select("id")
        .maybeSingle();

      if (!claimedPayment) {
        return res.status(402).json({
          success: false,
          error: "PAYMENT_REQUIRED",
          message: "توکن تحلیل تکی قبلاً مصرف شده یا معتبر نیست.",
        });
      }
    }

    return res.json({
      success: true,
      data: analysisResult.data,
      accessMode: accessMode.kind,
    });
  } catch (error: any) {
    console.error("[Web Analyze Error]:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "خطا در پردازش و تحلیل ابلاغیه قضایی",
    });
  }
});

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
        : err.message || "خطای داخلی سرور",
  });
});

export default app;
