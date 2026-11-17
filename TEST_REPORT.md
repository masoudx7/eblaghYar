# گزارش آزمون، سخت‌سازی امنیتی و تثبیت نهایی نسخه وب و هات‌فیکس اندروید (`TEST_REPORT.md`)

این سند خلاصه اصلاحات امنیتی، تکمیل محصول، تست‌های خودکار اجراشده (`Vitest + Supertest`) و وضعیت عدم رگرسیون نسخه وب (`https://tahlil-yar.ir`) در برابر نسخه اندروید/کافه‌بازار را ثبت می‌کند.

---

## ۱. نتایج واقعی بیلد، تایپ‌چک، تست خودکار و امنیت باندل

| مورد بررسی | دستور اجراشده | نتیجه واقعی |
| :--- | :--- | :--- |
| تایپ‌چک سراسری TypeScript | `npm run lint` (`tsc --noEmit`) | ✅ پاس — کد خروج `0` بدون هیچ خطای تایپی در `api/`، `src/` و `tests/` |
| تست‌های یکپارچه و امنیتی | `npm test` (`vitest run`) | ✅ پاس — **۴ فایل تست، ۱۹ تست از ۱۹ تست پاس (0 شکست)** |
| بیلد تولید کلاینت Vite | `npm run build` (`vite build`) | ✅ پاس — ۱۷۲۵ ماژول کامپایل شد (`dist/` آماده استقرار) |
| اسکن عدم نشت کلید محرمانه در کلاینت | `grep -rnE "GEMINI_API_KEY\|SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY\|ZARINPAL_MERCHANT_ID\|UPSTASH_REDIS_REST_TOKEN\|TURNSTILE_SECRET_KEY\|BAZAAR_*" src dist` | ✅ صفر مورد نشت (`NO_SECRETS_FOUND`) |

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
   - برگشت خودکار اعتبار یا توکن تکی (`refundWebAccessUnit`) هنگام `IRRELEVANT_CONTENT` (۴۰۰) یا خطای Gemini (`5xx`) همراه با ثبت لاگ `analyze_refund`.
   - اعمال دقیق سقف ۳ تحلیل روزانه روی پلن سالیانه و بازگشت `403 DAILY_LIMIT_REACHED` در تحلیل چهارم.
   - ذخیره و مدیریت تاریخچه سرور-ساید (`/api/web/analyses`) و تغییر رمز عبور کاربر لاگین‌شده (`POST /api/web/auth/update-password`).
   - اعتبارسنجی اختیاری Cloudflare Turnstile هنگام ست شدن `TURNSTILE_SECRET_KEY` و عبور تمیز هنگام تنظیم‌نشدن آن.

---

## ۳. بهبودهای تکمیلی محصول و زیرساخت وب

- **سخت‌سازی فرانت‌اند ابزارهای هوش مصنوعی:** تمام کامپوننت‌های وب (`DefenseDraftModal.tsx`، `LegalAssistantChat.tsx`، `ClauseInquiryModal.tsx`، `AnalysisResult.tsx`) در حالت وب هدرهای احراز هویت/توکن وب را ارسال کرده، خطای `402`/`403` را به Paywall هدایت می‌کنند و برای تحلیل نمونه (`isSampleAnalysis`) دکمه‌های AI را قفل می‌کنند.
- **حذف‌نشدن تصادفی توکن تکی در فرانت (`App.tsx`):** `clearEntitlementToken()` فقط زمانی اجرا می‌شود که سرور صراحتاً `error === "ENTITLEMENT_CONSUMED"` را برگرداند؛ در خطاهای شبکه یا سرور، توکن مهمان از دست نمی‌رود.
- **بازیابی رمز عبور و محافظت ربات:** تب `"recovery"` به `AuthModal.tsx` برای لینک `?auth=recovery`، مسیر `POST /api/web/auth/update-password` و ویجت اختیاری Cloudflare Turnstile اضافه شدند.
- **سوابق پرداخت و تحلیل سرور-ساید:** `WebOrdersModal.tsx` با دکمه دسترسی از `Header.tsx`، جست‌وجوی دستی سفارش مهمان، دکمه «بررسی مجدد پرداخت» در بنر خطا و نمایش/بازیابی توکن تکی مصرف‌نشده پیاده‌سازی شد.
- **کنترل حجم دقیق Base64 برای Vercel (`UploadZone.tsx`):** اعتبارسنجی پیش‌ازارسال بر مبنای سقف ۴.۵ مگابایت بدنه JSON (شامل رشد ۳۳ درصدی Base64 و فشرده‌سازی مجدد تصاویر پس از enhance).
- **CI خودکار:** ورک‌فلوی `.github/workflows/web-ci.yml` برای اجرای خودکار `lint`، `test`، `build` و اسکن کلیدهای محرمانه در پوش‌ها و PRها روی برنچ `web` ایجاد شد.

---

## ۴. چک‌لیست عدم رگرسیون نسخه اندروید و هسته Gemini

- [x] `src/services/billing.ts` بدون تغییر
- [x] شاخه `bazaar` در `src/services/paymentRouter.ts` بدون تغییر
- [x] پوشه `android/` و فایل `capacitor.config.ts` و `.github/workflows/android-build.yml` بدون تغییر
- [x] کامپوننت `src/components/CoinPurchaseModal.tsx` بدون تغییر
- [x] پرامپت‌ها و `responseSchema` در `runAnalysis()` بیت‌به‌بیت دست‌نخورده
- [x] فایل `supabase/web_payments.sql` دست‌نخورده (مهاجرت‌های تکمیلی در `web_payments_v2.sql`، `web_features_v3.sql` و `android_purchases.sql`)
- [x] رفتار `/api/analyze` و جدول `devices` در حالت `WEB_ONLY=false` حفظ شده و خرید درون‌برنامه‌ای در بک‌اند با Poolakey/Replay Protection امن شده است
