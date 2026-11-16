# گزارش آزمون و تثبیت نهایی نسخه وب ابلاغ‌یار (`TEST_REPORT.md`)

این سند سناریوهای پذیرش، امنیت و کنترل عدم رگرسیون نسخه وب (`https://tahlil-yar.ir`) در برابر نسخه اندروید/کافه‌بازار را مستندسازی می‌کند.

---

## ۱. بررسی بیلد، تایپ‌اسکریپت و امنیت باندل فرانت‌اند

| مورد بررسی | روش بررسی | نتیجه |
| :--- | :--- | :--- |
| تایپ‌چک سراسری TypeScript | `npm run lint` (`tsc --noEmit`) | ✅ پاس (بدون خطا) |
| بیلد تولید کلاینت Vite | `npm run build` (`vite build`) | ✅ پاس (بدون خطا) |
| عدم نشت کلیدهای محرمانه به فرانت‌اند | جست‌وجوی سورس `src/` و باندل `dist/` برای `GEMINI_API_KEY`، `SUPABASE_SERVICE_ROLE_KEY`، `SUPABASE_ANON_KEY` و `ZARINPAL_MERCHANT_ID` | ✅ صفر مورد نشت (فقط `VITE_API_BASE_URL` اختیاری در `src/utils/apiHelper.ts`) |
| محدودیت نرخ درخواست (Rate Limit per-IP) | میان‌افزار `createIpRateLimiter` مبتنی بر هدرهای `cf-connecting-ip` و `x-forwarded-for` روی `/api/web/auth/*`، `/api/web/payment/*` و `/api/web/analyze` | ✅ فعال (پاسخ `429 RATE_LIMIT_EXCEEDED` با هدرهای `X-RateLimit-*` و `Retry-After`) |
| اعتبارسنجی ورودی‌ها | بررسی فرمت ایمیل، طول رمز، UUID در `order_id` و `x-entitlement-token`، الگوی `deviceId` و `Authority`، و allowlist نوع فایل‌ها و محصولات از `WEB_PRODUCTS` | ✅ پیاده‌سازی‌شده روی تمام مسیرهای `/api/web/*` |

---

## ۲. ماتریس سناریوهای پرداخت، تحلیل و ایزوله‌سازی

| # | سناریو | رفتار مورد انتظار و منطق پیاده‌سازی‌شده | وضعیت بررسی کد / چک عملیاتی در استیجینگ |
| :-: | :--- | :--- | :--- |
| **۱** | **پرداخت موفق (`single` / `pack_10` / `annual`)** | `POST /api/web/payment/request` قیمت را فقط از `WEB_PRODUCTS` می‌خواند و سفارش `pending` می‌سازد ← بازگشت زرین‌پال به `GET /api/web/payment/verify?Authority=...&Status=OK` ← فراخوانی واقعی `verify.json` با `amount_rials` سفارش ← با کد `100` تغییر اتمیک `pending -> paid`، ذخیره `ref_id`، اعطای `entitlement_token` / افزودن ۱۰ اعتبار / فعال‌سازی ۳۶۵ روزه و ریدایرکت به `/?payment=success&order_id=...`. در UI `ref_id` با متن «برای پشتیبانی و بازیابی خرید نگه دارید» نمایش داده می‌شود. | ✅ مسیر کد تأیید شد؛ تست زنده پس از ست شدن `ZARINPAL_MERCHANT_ID` و تأیید دامنه انجام شود. |
| **۲** | **انصراف یا پرداخت ناموفق** | در صورت `Status !== OK` یا کد غیر از `100`/`101` از زرین‌پال، وضعیت سفارش `failed` ثبت می‌شود (بدون اعطای اعتبار یا اشتراک)، به `/?payment=failed&order_id=...` ریدایرکت می‌شود و در UI پیام فارسی + دکمه «تلاش مجدد» نمایش داده می‌شود. | ✅ مسیر کد و UI بنر `#web-payment-failed-banner` تأیید شد. |
| **۳** | **تکرار Callback زرین‌پال (Idempotency)** | ۱) اگر سفارش قبلاً `paid` شده باشد، ریدایرکت مستقیم بدون اعطای مجدد.<br>۲) در `verify.json` کد `100` تغییر `status` شرطی `.eq("status", "pending")` دارد و در همزمانی فقط یک درخواست اعطا انجام می‌دهد.<br>۳) در کد `101` زرین‌پال فقط همگام‌سازی وضعیت/ref_id انجام می‌شود و هیچ اعتبار یا اشتراک مجددی اعطا نمی‌گردد. | ✅ حفاظت دوگانه در `api/app.ts` تأیید شد. |
| **۴** | **Callback جعلی و دستکاری پارامترها** | ۱) سفارش منحصراً بر اساس `Authority` پیدا می‌شود (پارامترهای جعلی مثل مبلغ یا محصول از کوئری خوانده نمی‌شود).<br>۲) `Authority` نامعتبر/ناموجود به `/?payment=failed` ریدایرکت می‌شود.<br>۳) در `/api/web/payment/status` بدون تطابق `user_id` یا `device_id` پاسخ `403` و برای `order_id` غیراستاندارد پاسخ `400` برمی‌گردد. | ✅ محافظت سمت سرور تأیید شد. |
| **۵** | **خطای AI یا سند نامربوط بدون کسر اعتبار/سهمیه** | در `POST /api/web/analyze` ابتدا نوع دسترسی (`annual` / `credits` / `entitlement`) بررسی می‌شود، سپس `runAnalysis()` اجرا می‌گردد. کسر اتمیک `credits`، افزایش `daily_analyses_count` یا علامت‌گذاری `entitlement_used = true` **فقط پس از پاسخ `ok: true`** از `runAnalysis()` انجام می‌شود. در `IRRELEVANT_CONTENT` (400) یا خطای Gemini (503/500) هیچ مصرفی ثبت نمی‌شود. | ✅ ترتیب اجرا در `POST /api/web/analyze` تأیید شد. |
| **۶** | **تحلیل تکی مهمان (`single` — اول پرداخت بعد آپلود)** | مهمان بدون پرداخت ← `402 PAYMENT_REQUIRED` و باز شدن `WebPaywallModal`. پس از خرید و بازگشت موفق ← ذخیره `entitlement_token` در `localStorage` و نمایش بنر «۱ تحلیل آماده است؛ ابلاغیه را بارگذاری کنید» (پایدار پس از رفرش صفحه). با آپلود ابلاغیه، اولین تحلیل موفق (`accessMode: "entitlement"`) توکن را یک‌بارمصرف (`entitlement_used = true`) کرده و از `localStorage` پاک می‌کند. ارسال مجدد یا `deviceId` دیگر ← `402`. | ✅ جریان فرانت (`App.tsx`, `webAuth.ts`) و بک‌اند (`api/app.ts`) تأیید شد. |
| **۷** | **بسته ۱۰ ابلاغی و سالیانه با لاگین** | کلیک مهمان روی `pack_10` یا `annual` در `WebPaywallModal` ابتدا `AuthModal` را باز می‌کند و پس از ورود موفق ادامه خرید با هدر `Authorization: Bearer` انجام می‌شود. در `/api/web/analyze` برای `pack_10` دقیقاً ۱ واحد کسر و برای `annual` تا ۳ تحلیل در روز مجاز و در تحلیل چهارم (در نبود اعتبار اضافه) `403 DAILY_LIMIT_REACHED` برگردانده می‌شود. موجودی هدر پس از رفرش از `/api/web/auth/me` بازیابی می‌شود. | ✅ مسیر کد، `AuthModal`، `WebPaywallModal` و `Header` تأیید شد. |
| **۸** | **`WEB_ONLY=true` ← غیرفعال شدن مسیرهای legacy (`403`)** | روی پروژه Vercel وب با `WEB_ONLY=true` و `DISABLE_LEGACY_PAYMENT=true`، فراخوانی `POST /api/analyze` پاسخ `403 WEB_ONLY_MODE` و فراخوانی `/api/activate-premium`، `/api/buy-coins`، `/api/payment/zarinpal/*` پاسخ `403 LEGACY_PAYMENT_DISABLED` می‌دهند. همچنین در وب هیچ فراخوانی به `/api/device-status` و هیچ UI رایگان/سکه وجود ندارد. | ✅ گاردهای `requireLegacyAnalyzeEnabled` و `requireLegacyPaymentEnabled` و ایزوله‌سازی `!Capacitor.isNativePlatform()` تأیید شد. |
| **۹** | **`WEB_ONLY=false` ← رفتار فعلی بدون رگرسیون** | در محیط نیتیو (`Capacitor.isNativePlatform() === true`) و بک‌اند فعلی (`WEB_ONLY=false`, `DISABLE_LEGACY_PAYMENT=false`): `/api/analyze` با `checkDeviceAccess` و جدول `devices` + `usage_logs`، تابع مشترک `runAnalysis` با همان پرامپت‌ها و `responseSchema`، فایل `src/services/billing.ts`، شاخه `bazaar` در `paymentRouter.ts`، `CoinPurchaseModal.tsx`، پوشه `android/` و `capacitor.config.ts` بدون هیچ تغییری کار می‌کنند. | ✅ بررسی diff فایل‌های حساس و عدم تغییر آن‌ها تأیید شد. |

---

## ۳. چک‌لیست نهایی عدم رگرسیون پروژه قدیمی (کافه‌بازار / اندروید)

- [x] فایل `src/services/billing.ts` بدون تغییر
- [x] شاخه `bazaar` در `src/services/paymentRouter.ts` بدون تغییر
- [x] پوشه `android/` و فایل `capacitor.config.ts` بدون تغییر
- [x] کامپوننت `src/components/CoinPurchaseModal.tsx` بدون تغییر
- [x] پرامپت‌ها و `responseSchema` در `runAnalysis()` عیناً مشابه نسخه قبلی
- [x] رفتار `/api/analyze` و جدول `devices` در حالت `WEB_ONLY=false` بدون تغییر
- [x] دیتابیس و پروژه Vercel نسخه وب کاملاً مجزا از نسخه اندروید (`eblagh-yar.vercel.app`) تعریف شده‌اند
