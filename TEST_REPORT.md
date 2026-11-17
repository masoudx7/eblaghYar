# گزارش آزمون، سخت‌سازی امنیتی و تثبیت نهایی نسخه وب و هات‌فیکس اندروید (`TEST_REPORT.md`)

این سند خلاصه اصلاحات امنیتی، تکمیل محصول، تست‌های خودکار اجراشده (`Vitest + Supertest`) و وضعیت آماده لانچ عمومی نسخه وب (`https://tahlil-yar.ir`) همراه با حفظ عدم رگرسیون نسخه اندروید/کافه‌بازار را ثبت می‌کند.

---

## ۱. نتایج واقعی بیلد، تایپ‌چک، تست خودکار و امنیت باندل

| مورد بررسی | دستور اجراشده | نتیجه واقعی |
| :--- | :--- | :--- |
| تایپ‌چک سراسری TypeScript | `npm run lint` (`tsc --noEmit`) | ✅ پاس — کد خروج `0` بدون هیچ خطای تایپی در `api/`، `src/` و `tests/` |
| تست‌های یکپارچه و امنیتی | `npm test` (`vitest run`) | ✅ پاس — **۵ فایل تست، ۲۴ تست از ۲۴ تست پاس (0 شکست)** |
| بیلد تولید کلاینت Vite | `npm run build` (`vite build`) | ✅ پاس — ۱۹۰۴ ماژول کامپایل شد (`dist/` آماده استقرار) |
| اسکن عدم نشت کلید محرمانه در کلاینت | `grep -rnE "GEMINI_API_KEY\|SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY\|ZARINPAL_MERCHANT_ID\|UPSTASH_REDIS_REST_TOKEN\|TURNSTILE_SECRET_KEY\|CRON_SECRET\|RECONCILE_SECRET\|BAZAAR_[A-Z_]+" src dist` | ✅ صفر مورد نشت (`NO_SECRETS_FOUND`) |

---

## ۲. پوشش تست‌های خودکار (`tests/`)

۱. **`tests/security-and-rate-limit.test.ts` (۵ تست):**
   - مسدودسازی `/api/analyze` و `/api/device-status` با `403 WEB_ONLY_MODE` در حالت `WEB_ONLY=true`.
   - محافظت کامل `POST /api/generate-defense-draft` و `POST /api/chat` در حالت `WEB_ONLY=true` (`402 PAYMENT_REQUIRED` بدون اعتبار؛ `200` با اعتبار یا توکن معتبر وب **بدون کسر مجدد اعتبار**).
   - نادیده‌گرفتن هدر جعلی `cf-connecting-ip` وقتی `TRUST_CF_HEADER !== "true"` و اولویت `x-vercel-forwarded-for`.
   - نرخ‌محدودسازی توزیع‌شده با Upstash Redis REST (`429 RATE_LIMIT_EXCEEDED`) و Fallback ایمن به حافظه در زمان اختلال Redis.
   - محاسبه تاریخ ریست روزانه دقیقاً در منطقه زمانی `Asia/Tehran` (مثلاً عبور از نیمه‌شب تهران در ساعت `21:00 UTC`).

۲. **`tests/android-payment-hotfix.test.ts` (۴ تست):**
   - رد درخواست‌های بدون امضا یا با امضای نامعتبر روی `/api/activate-premium` و `/api/buy-coins` (`403`).
   - تأیید امضای RSA-SHA1 رسید Poolakey، تطبیق `developerPayload` با `deviceId`، نادیده‌گرفتن دستکاری کلاینت و استفاده از `ANDROID_COIN_PRODUCTS` سمت سرور.
   - جلوگیری از Replay Attack در مصرف مجدد `purchaseToken` (`409 PURCHASE_ALREADY_CONSUMED` + جدول `consumed_purchase_tokens`).
   - حذف کامل Mock در `/api/payment/zarinpal/*` (پاسخ `503` در نبود `ZARINPAL_MERCHANT_ID`)، تأیید واقعی کد `100` زرین‌پال و عدم شارژ مضاعف در تکرار Callback.

۳. **`tests/web-payments.test.ts` (۵ تست):**
   - خواندن قیمت منحصراً از `WEB_PRODUCTS`، رد خرید بسته/سالیانه برای مهمان بدون لاگین (`401`)، اجازه خرید `single` برای مهمان با `deviceId`.
   - اعطای دقیقاً یک‌بار (`granted_at` atomic lock) بین کد `100` زرین‌پال، تکرار Callback و کد `101` همزمان با `/recheck`.
   - رد `Authority` جعلی و کنترل مالکیت (`403`) در `/api/web/payment/status` و `/api/web/payment/recheck`.
   - بازیابی سفارش `failed -> paid` از طریق `POST /api/web/payment/recheck` پس از گذشت حداقل ۶۰ ثانیه.
   - فهرست‌کردن سفارش‌ها و بازیابی توکن تکی پرداخت‌شده مصرف‌نشده از `GET /api/web/orders`.

۴. **`tests/web-analyze-and-auth.test.ts` (۵ تست):**
   - جلوگیری از Race Condition دو درخواست همزمان روی ۱ اعتبار یا ۱ `entitlement_token` (دقیقاً یک `200` و یک `402`).
   - برگشت خودکار اعتبار یا توکن تکی (`refundWebAccessUnit`) هنگام `IRRELEVANT_CONTENT` (۴۰۰) یا خطای Gemini (`5xx`) همراه با ثبت لاگ `refund`.
   - اعمال دقیق سقف ۳ تحلیل روزانه روی پلن سالیانه و بازگشت `403 DAILY_LIMIT_REACHED` در تحلیل چهارم.
   - ذخیره و مدیریت تاریخچه سرور-ساید (`/api/web/analyses`) و تغییر رمز عبور کاربر لاگین‌شده (`POST /api/web/auth/update-password`).
   - اعتبارسنجی اختیاری Cloudflare Turnstile هنگام ست شدن `TURNSTILE_SECRET_KEY` و عبور تمیز هنگام تنظیم‌نشدن آن.

۵. **`tests/web-launch-readiness.test.ts` (۵ تست):**
   - اعطای پاس ۲۴ ساعته (`ai_tools_until`) پس از تحلیل پرداخت‌شده برای استفاده از `/api/chat` و `/api/generate-defense-draft` حتی پس از مصرف توکن تکی، مسدودسازی استفاده از این پاس برای `/api/web/analyze`، و انقضای خودکار پس از ۲۴ ساعت.
   - عملکرد اندپوینت محافظت‌شده `/api/web/reconcile` (احراز هویت با `CRON_SECRET`، برگشت رزرواسیون‌های نیمه‌کاره `reserve` بدون لاگ پایانی، اعطای سفارش‌های `paid` بدون `granted_at`، پاک‌سازی تحلیل‌های قدیمی‌تر از ۹۰ روز و idempotency کامل اجرای مجدد).
   - پشتیبانی از `Idempotency-Key` در `POST /api/web/analyze` (بازگرداندن پاسخ کش‌شده در تکرار شبکه بدون کسر مجدد اعتبار یا فراخوانی مجدد Gemini و جلوگیری از استفاده کلید کاربر دیگر با `409`).
   - تمدید اتمیک اشتراک سالیانه در خریدهای همزمان از طریق تابع `extend_profile_annual` و پالایش کامل پیام خطاهای `500` جهت جلوگیری از نشت خطای خام سرور به کلاینت.
   - محافظت `entitlement_claim_id` در برابر پاک‌شدن اشتباهی یک Claim جدیدتر توسط بازپرداخت تأخیری یا Reconcile قدیمی.

---

## ۳. بهبودهای تکمیلی محصول و زیرساخت وب

- **چت و موشکافی بند خاص در نمای نتیجه (`AnalysisResult.tsx`):** کامپوننت‌های `LegalAssistantChat` و `ClauseInquiryModal` در بخش نتیجه تحلیل فعال و به `deviceId`، وضعیت قفل وب و پاس ۲۴ ساعته `ai_tools_until` متصل شدند و واژگان گمراه‌کننده «رایگان» در نسخه وب حذف گردید.
- **حداکثر زمان اجرای Gemini و کرون Vercel (`vercel.json` + `api/app.ts`):** سقف `maxDuration: 60` در `vercel.json`، بودجه ۴۵ ثانیه‌ای تلاش مجدد در `generateWithFallbackAndRetry` و جاب روزانه `/api/web/reconcile` پیکربندی شدند.
- **شفاف‌سازی سیاست نگهداری ۹۰ روزه (`PrivacyNoticeModal.tsx` + `README.md`):** آزادسازی فوری فایل‌های آپلودی، نگهداری محلی برای مهمان، و نگهداری ۹۰ روزه `web_analyses` برای کاربران لاگین‌شده مستند و پیاده‌سازی شد.
- **CI خودکار:** ورک‌فلوی `.github/workflows/web-ci.yml` برای اجرای خودکار `lint`، `test`، `build` و اسکن کلیدهای محرمانه (از جمله `CRON_SECRET` و `RECONCILE_SECRET`) در پوش‌ها و PRها روی برنچ `web` به‌روزرسانی شد.

---

## ۴. چک‌لیست عدم رگرسیون نسخه اندروید و هسته Gemini

- [x] `src/services/billing.ts` بدون تغییر
- [x] شاخه `bazaar` در `src/services/paymentRouter.ts` بدون تغییر
- [x] پوشه `android/` و فایل `capacitor.config.ts` و `.github/workflows/android-build.yml` بدون تغییر
- [x] کامپوننت `src/components/CoinPurchaseModal.tsx` بدون تغییر
- [x] پرامپت‌ها و `responseSchema` در `runAnalysis()` دست‌نخورده
- [x] فایل `supabase/web_payments.sql` دست‌نخورده (مهاجرت‌های تکمیلی در `web_payments_v2.sql`، `web_features_v3.sql`، `web_launch_v4.sql` و `android_purchases.sql`)
- [x] رفتار `/api/analyze` و جدول `devices` در حالت `WEB_ONLY=false` حفظ شده و خرید درون‌برنامه‌ای در بک‌اند با Poolakey/Replay Protection امن شده است
