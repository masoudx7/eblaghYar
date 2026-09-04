import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
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
  created_at?: string;
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
// Supabase Client Initialization (Lazy Init)
// ==========================================

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "متغیرهای محیطی SUPABASE_URL یا SUPABASE_SERVICE_ROLE_KEY تنظیم نشده‌اند. لطفاً مقادیر را در متغیرهای محیطی Vercel یا فایل .env قرار دهید."
      );
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

// ==========================================
// Device-based Access Middleware
// ==========================================

export const checkDeviceAccess = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    const rawDeviceId = req.headers["x-device-id"];
    const deviceId = (Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId)?.trim();

    // a. هدر x-device-id را از درخواست بخواند
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (x-device-id) در هدر درخواست ارسال نشده است.",
      });
    }

    const supabase = getSupabaseClient();

    // b. دستگاه را در جدول devices جستجو کند
    const { data: existingDevice, error: selectError } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("Supabase error fetching device:", selectError);
      return res.status(500).json({
        success: false,
        error: "DATABASE_ERROR",
        message: "خطا در ارتباط با دیتابیس جهت استعلام وضعیت دستگاه.",
      });
    }

    let device: DeviceRecord;

    if (!existingDevice) {
      // اگر وجود نداشت، یک رکورد جدید با free_tokens: 3 و is_premium: false بسازد
      const { data: newDevice, error: insertError } = await supabase
        .from("devices")
        .insert({
          device_id: deviceId,
          free_tokens: 3,
          is_premium: false,
        })
        .select()
        .single();

      if (insertError || !newDevice) {
        console.error("Supabase error creating device:", insertError);
        return res.status(500).json({
          success: false,
          error: "DATABASE_ERROR",
          message: "خطا در ایجاد رکورد مشخصات دستگاه در دیتابیس.",
        });
      }
      device = newDevice as DeviceRecord;
    } else {
      device = existingDevice as DeviceRecord;
    }

    // c. اگر is_premium === false و free_tokens <= 0 بود، درخواست را با وضعیت ۴۰۳ رد کند
    if (!device.is_premium && (device.free_tokens === undefined || device.free_tokens <= 0)) {
      return res.status(403).json({
        success: false,
        error: "LIMIT_REACHED",
        message:
          "سقف استفاده رایگان شما (۳ تحلیل ابلاغیه) به پایان رسیده است. لطفاً جهت ادامه، نسخه پرمیوم را فعال فرمایید.",
      });
    }

    // d. در غیر این صورت، آبجکت دستگاه را به req.device و req.deviceId اضافه کرده و next() را صدا بزند
    req.device = device;
    req.deviceId = deviceId;
    next();
  } catch (err: any) {
    console.error("checkDeviceAccess error:", err);
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
const PORT = 3000;

// Lightweight CORS support
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-device-id, X-Requested-With");
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

// 1. Analyze Judicial Notice (with checkDeviceAccess middleware)
apiRouter.post("/analyze", checkDeviceAccess, async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText } = req.body || {};

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: "لطفاً فایل پی‌دی‌اف، تصویر ابلاغیه یا متن آن را ارسال کنید." });
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

    // اگر کاربر پرمیوم نبود، پس از موفقیت‌آمیز بودن پاسخ AI، یک واحد از free_tokens دستگاه کم کند و یک رکورد در usage_logs ثبت نماید
    if (req.device && !req.device.is_premium && req.deviceId) {
      try {
        const supabase = getSupabaseClient();
        const currentTokens = typeof req.device.free_tokens === "number" ? req.device.free_tokens : 3;
        const remainingTokens = Math.max(0, currentTokens - 1);

        // ۱. کاهش یک واحد توکن در جدول devices
        await supabase
          .from("devices")
          .update({ free_tokens: remainingTokens })
          .eq("device_id", req.deviceId);

        // ۲. ثبت رکورد مصرف در جدول usage_logs
        await supabase
          .from("usage_logs")
          .insert({
            device_id: req.deviceId,
            tokens_used: 1,
          });

        console.log(`[Supabase Device Auth] Device ${req.deviceId} token used. Remaining: ${remainingTokens}`);
      } catch (logErr) {
        console.error("Failed to decrement tokens or log usage:", logErr);
      }
    }

    return res.json({ success: true, data: parsedData });
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

    return res.status(isUnavailable ? 503 : 500).json({
      success: false,
      isTemporary: isUnavailable,
      error: isUnavailable
        ? "سرویس هوش مصنوعی در حال حاضر با ترافیک بالایی روبرو است. لطفاً چند لحظه دیگر روی دکمه «تلاش مجدد» کلیک کنید."
        : error?.message || "خطا در پردازش و تحلیل ابلاغیه قضایی",
    });
  }
});

// 2. Activate Premium Endpoint
apiRouter.post("/activate-premium", async (req, res) => {
  try {
    const { deviceId, purchaseToken } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DEVICE_ID",
        message: "شناسه دستگاه (deviceId) الزامی است.",
      });
    }

    const supabase = getSupabaseClient();

    // =========================================================================
    // نکته مهم: اعتبارسنجی توکن خرید (purchaseToken) از درگاه پرداخت شاپرک یا
    // کافه بازار/مایکت در مرحله بعدی توسعه اضافه خواهد شد.
    // فعلاً وضعیت is_premium در جدول devices برای این deviceId برابر با true قرار داده می‌شود.
    // =========================================================================
    const { data, error } = await supabase
      .from("devices")
      .upsert(
        {
          device_id: deviceId,
          is_premium: true,
        },
        { onConflict: "device_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase error activating premium:", error);
      return res.status(500).json({
        success: false,
        error: "DATABASE_ERROR",
        message: "خطا در ارتقای دستگاه به وضعیت پرمیوم.",
      });
    }

    return res.json({
      success: true,
      message: "نسخه پرمیوم با موفقیت برای این دستگاه فعال شد.",
      device: data,
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

// ==========================================
// Server Startup & Vite Middleware
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Judicial Notice Analyzer server running on http://0.0.0.0:${PORT}`);
  });
}

// In local and container environments, boot server automatically
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}

export default app;
