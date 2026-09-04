import express from "express";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// Kavenegar SMS & Phone Auth Helpers
// ==========================================

function normalizeIranianPhoneNumber(raw: string): string | null {
  if (!raw) return null;
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  let clean = raw.trim();
  for (let i = 0; i < 10; i++) {
    clean = clean.replace(persianDigits[i], i.toString()).replace(arabicDigits[i], i.toString());
  }
  clean = clean.replace(/\D/g, "");

  if (clean.startsWith("989") && clean.length === 12) {
    clean = "0" + clean.substring(2);
  } else if (clean.startsWith("00989") && clean.length === 14) {
    clean = "0" + clean.substring(4);
  } else if (clean.startsWith("9") && clean.length === 10) {
    clean = "0" + clean;
  }

  if (/^09\d{9}$/.test(clean)) {
    return clean;
  }
  return null;
}

function maskPhoneNumber(phone: string): string {
  if (phone.length === 11) {
    return `${phone.substring(0, 4)}***${phone.substring(7)}`;
  }
  return phone;
}

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

// In-memory cache for rate-limiting and quick lookup
const otpStore = new Map<string, OtpEntry>();
const sessions = new Map<string, { phoneNumber: string; createdAt: number }>();

// Stateless HMAC token functions to guarantee persistent sessions across Vercel Serverless instances
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.GEMINI_API_KEY || "eblaghyar_judicial_secret_token_key";
}

function createSignedSessionToken(phoneNumber: string): string {
  const secret = getSessionSecret();
  const payload = JSON.stringify({ phoneNumber, createdAt: Date.now() });
  const base64Payload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(base64Payload).digest("hex");
  return `tok_${base64Payload}.${signature}`;
}

function verifySignedSessionToken(token: string): { phoneNumber: string; createdAt: number } | null {
  if (!token || !token.startsWith("tok_")) return null;
  const parts = token.slice(4).split(".");
  if (parts.length !== 2) return null;
  const [base64Payload, signature] = parts;
  const secret = getSessionSecret();
  const expectedSignature = crypto.createHmac("sha256", secret).update(base64Payload).digest("hex");
  if (signature !== expectedSignature) return null;
  try {
    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString());
    // Valid for 30 days
    if (Date.now() - payload.createdAt > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function sendKavenegarSms(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; message: string; isDevSimulated?: boolean }> {
  const apiKey = process.env.KAVENEGAR_API_KEY?.trim();

  if (!apiKey) {
    console.log(`\n========================================`);
    console.log(`[کاوه نگار - Kavenegar SMS Simulator]`);
    console.log(`📱 گیرنده (شماره موبایل): ${phoneNumber}`);
    console.log(`🔑 کد تایید یکبار مصرف (OTP): ${code}`);
    console.log(`⏰ مدت اعتبار: ۲ دقیقه (۱۲۰ ثانیه)`);
    console.log(`💡 جهت ارسال واقعی پیامک، متغیر KAVENEGAR_API_KEY را در تنظیمات Vercel یا .env وارد نمایید.`);
    console.log(`========================================\n`);

    return {
      success: true,
      message: "کد تایید ارسال شد (شبیه‌ساز کاوه نگار فعال است)",
      isDevSimulated: true,
    };
  }

  try {
    const template = process.env.KAVENEGAR_TEMPLATE?.trim();
    if (template) {
      const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(phoneNumber)}&token=${encodeURIComponent(code)}&template=${encodeURIComponent(template)}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      if (data?.return?.status === 200) {
        return { success: true, message: "پیامک با موفقیت از طریق کاوه نگار ارسال گردید" };
      } else {
        throw new Error(data?.return?.message || "خطا در وب‌سرویس اعتبارسنجی کاوه نگار");
      }
    } else {
      const message = `سامانه هوشمند تحلیل ابلاغیه قضایی\nکد تایید ورود: ${code}\n(اعتبار: ۲ دقیقه)`;
      const sender = process.env.KAVENEGAR_SENDER?.trim() || "";
      const params = new URLSearchParams({
        receptor: phoneNumber,
        message: message,
      });
      if (sender) {
        params.append("sender", sender);
      }

      const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = (await res.json()) as any;
      if (data?.return?.status === 200) {
        return { success: true, message: "پیامک با موفقیت به شماره همراه ارسال شد" };
      } else {
        throw new Error(data?.return?.message || "خطا در ارسال پیامک کاوه نگار");
      }
    }
  } catch (err: any) {
    console.error("Kavenegar SMS Error:", err);
    throw new Error(err?.message || "خطا در ارتباط با وب‌سرویس پیامکی کاوه نگار");
  }
}

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("متغیر محیطی GEMINI_API_KEY تنظیم نشده است. لطفاً در پنل Vercel آن را اضافه فرمایید.");
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

// Fallback models in case of temporary 503 / high demand spikes
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
  } catch (e) {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const substring = clean.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(substring);
      } catch (innerErr) {
        // Fall through
      }
    }
    console.error("[cleanAndParseJSON error] Failed parsing. Preview:", clean.slice(0, 300));
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
// Express Application & Router Setup
// ==========================================

const app = express();

// Lightweight CORS support
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Middleware to support base64 uploads of PDFs and images up to 50mb
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Normalize Vercel Rewrites: handle cases where Vercel retains x-matched-path
app.use((req, _res, next) => {
  const matchedPath = (req.headers["x-matched-path"] as string) || (req.headers["x-original-url"] as string);
  if (matchedPath && matchedPath.startsWith("/api")) {
    req.url = matchedPath;
  }
  next();
});

const apiRouter = express.Router();

// Root API info endpoint
apiRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "EblaghYar API",
    runtime: "vercel-serverless",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    runtime: "serverless-compatible",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// Phone Number Login & Kavenegar OTP Routes
// ==========================================

// Request OTP SMS
apiRouter.post("/auth/send-otp", async (req, res) => {
  try {
    const { phoneNumber: rawPhone } = req.body || {};
    const phoneNumber = normalizeIranianPhoneNumber(rawPhone);

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "شماره همراه وارد شده نامعتبر است. لطفاً شماره ۱۱ رقمی معتبر (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد فرمایید.",
      });
    }

    const now = Date.now();
    const existing = otpStore.get(phoneNumber);

    // Check 60-second rate limiting cooldown
    if (existing && now - existing.lastSentAt < 60000) {
      const remainingSeconds = Math.ceil((60000 - (now - existing.lastSentAt)) / 1000);
      return res.status(429).json({
        success: false,
        error: `لطفاً ${remainingSeconds} ثانیه دیگر جهت درخواست مجدد کد تایید شکیبا باشید.`,
        cooldownRemaining: remainingSeconds,
      });
    }

    // Generate secure 5-digit verification code
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const expiresAt = now + 2 * 60 * 1000; // 2 minutes

    // Store in memory
    otpStore.set(phoneNumber, {
      code,
      expiresAt,
      attempts: 0,
      lastSentAt: now,
    });

    // Send SMS via Kavenegar
    const smsResult = await sendKavenegarSms(phoneNumber, code);

    return res.json({
      success: true,
      message: smsResult.message,
      phoneNumber: maskPhoneNumber(phoneNumber),
      cooldownSeconds: 60,
      expiresInSeconds: 120,
      isDevSimulated: smsResult.isDevSimulated || false,
      devCode: smsResult.isDevSimulated ? code : undefined,
    });
  } catch (err: any) {
    console.error("Error in /api/auth/send-otp:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "خطا در ارسال پیامک کد تایید با کاوه نگار. لطفاً مجدداً تلاش فرمایید.",
    });
  }
});

// Verify OTP SMS
apiRouter.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phoneNumber: rawPhone, code: rawCode } = req.body || {};
    const phoneNumber = normalizeIranianPhoneNumber(rawPhone);

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "شماره همراه نامعتبر است.",
      });
    }

    // Normalize digits in code
    const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    let code = (rawCode || "").toString().trim();
    for (let i = 0; i < 10; i++) {
      code = code.replace(persianDigits[i], i.toString());
    }
    code = code.replace(/\D/g, "");

    if (!code || code.length < 4 || code.length > 6) {
      return res.status(400).json({
        success: false,
        error: "کد تایید وارد شده نامعتبر است.",
      });
    }

    const record = otpStore.get(phoneNumber);
    const now = Date.now();

    if (!record) {
      return res.status(400).json({
        success: false,
        error: "کد تاییدی برای این شماره ثبت نشده یا منقضی شده است. لطفاً مجدداً درخواست کد دهید.",
      });
    }

    if (now > record.expiresAt) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({
        success: false,
        error: "مهلت اعتبار کد تایید به پایان رسیده است. لطفاً کد جدید دریافت کنید.",
      });
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({
        success: false,
        error: "تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً کد تایید جدید درخواست نمایید.",
      });
    }

    if (record.code !== code) {
      return res.status(400).json({
        success: false,
        error: "کد تایید وارد شده نادرست است. لطفاً دوباره بررسی کنید.",
      });
    }

    // Successful verification -> Generate stateless HMAC signed session token
    otpStore.delete(phoneNumber);
    const sessionToken = createSignedSessionToken(phoneNumber);
    sessions.set(sessionToken, {
      phoneNumber,
      createdAt: now,
    });

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        phoneNumber,
        maskedPhone: maskPhoneNumber(phoneNumber),
        role: "کاربر حقیقی",
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Error in /api/auth/verify-otp:", err);
    return res.status(500).json({
      success: false,
      error: "خطا در بررسی کد تایید.",
    });
  }
});

// Check Current Auth Session
apiRouter.get("/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json({ authenticated: false, user: null });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  // Try in-memory session first, then verify via cryptographic HMAC signature
  let sessionData = sessions.get(token);
  if (!sessionData) {
    const verified = verifySignedSessionToken(token);
    if (verified) {
      sessionData = verified;
      sessions.set(token, verified);
    }
  }

  if (!sessionData) {
    return res.json({ authenticated: false, user: null });
  }

  return res.json({
    authenticated: true,
    user: {
      phoneNumber: sessionData.phoneNumber,
      maskedPhone: maskPhoneNumber(sessionData.phoneNumber),
      role: "کاربر حقیقی",
      loggedInSince: sessionData.createdAt,
    },
  });
});

// Logout
apiRouter.post("/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    sessions.delete(token);
  }
  return res.json({ success: true, message: "خروج موفقیت‌آمیز بود" });
});

// Analyze judicial notice (PDF / Image / Text)
apiRouter.post("/analyze", async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText } = req.body || {};

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: "لطفاً فایل پی‌دی‌اف، تصویر ابلاغیه یا متن آن را ارسال کنید." });
    }

    const ai = getGeminiClient();

    const parts: any[] = [];

    if (fileBase64 && mimeType) {
      const cleanBase64 = fileBase64.includes(",")
        ? fileBase64.split(",")[1]
        : fileBase64;

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
              description: "سطح فوریت و حساسیت پرونده (high=فوری و حیاتی با خطر جلب یا انقضای موعد، medium=متوسط، low=عادی/اطلاع‌رسانی)",
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
                userRole: { type: Type.STRING, description: "سمت و نقش شخص در این ابلاغیه (مثلاً: متهم، خواهان، مطلع، محکوم‌علیه و...)" },
                otherParties: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "طرفین دیگر یا شاکی/خواهان/مشترکین در صورت درج در متن",
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
                calculationRule: { type: Type.STRING, description: "نحوه احتساب مواعد طبق قانون آیین دادرسی (روز ابلاغ و اقدام جزء مهلت نیست)" },
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
                  stage: { type: Type.STRING, description: "مرحله رسیدگی (مثلاً: تحقیقات مقدماتی دادسرا، دادگاه بدوی، اجرای احکام، دفاتر خدمات قضایی)" },
                  description: { type: Type.STRING, description: "شرح کامل کار به زبان ساده" },
                  locationOrMethod: { type: Type.STRING, description: "کجا باید برود یا در چه سامانه‌ای ثبت کند (مثلاً سامانه ثنا / عدل ایران / شعبه دادگاه)" },
                  legalReference: { type: Type.STRING, description: "استناد دقیق به ماده قانونی مربوطه در قوانین ایران (مثلاً: ماده ۱۹۰ قانون آیین دادرسی کیفری)" },
                  timingAdvice: { type: Type.STRING, description: "توصیه زمانی مهم برای جلوگیری از انقضای مهلت و مواعد قانونی" },
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

// Dedicated AI Draft Generator Route
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
۱. رعایت کامل اصول نگارش لوایح دادگستری ایران (شروع با بسمه تعالی، عنوان شعبه، مشخصات طرفین، مقدمه مودبانه، شرح استدلال و مستندات قانونی دقیق مانند قوانین آیین دادرسی و مدنی/مجازات، خواسته‌ها و تقاضا، منضمات و امضا).
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
              description: "بندهای استدلال حقوقی و دفاعیات ماهوی/شکلی",
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
              description: "متن کامل، آماده، زیبا و دارای فرمت استاندارد قضایی با شروع و پایان",
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

// Chat with legal assistant about this notice
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
لطفاً در پاسخ خود، ضمن در نظر گرفتن کل پرونده، به طور موشکافانه و دقیق بر همین بخش و آثار و الزامات قانونی آن بر اساس قوانین ایران (آیین دادرسی مدنی، کیفری، اجرای احکام و...) تمرکز کنید و راهکارهای اجرایی دقیق ارائه دهید.
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
        ? "سرویس هوش مصنوعی در حال حاضر با ترافیک بالایی روبرو است. لطفاً چند لحظه دیگر دوباره سوال خود را ارسال یا روی «تلاش مجدد» کلیک کنید."
        : error?.message || "خطا در برقراری ارتباط با دستیار حقوقی",
    });
  }
});

// Mount the API Router on "/api" (and fallback on "/" in Vercel Serverless if prefix stripped)
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
