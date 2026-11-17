# ابلاغ‌یار — نسخه وب (`tahlil-yar.ir`)

سامانه هوشمند تحلیل و ساده‌سازی ابلاغیه‌ها و اسناد قضایی ثنا مبتنی بر React، Express Serverless (Vercel)، Supabase و Google Gemini.

> **جداسازی کامل وب و اندروید:** این راهنما مخصوص نسخه وب روی دامنه **`https://tahlil-yar.ir`** است. نسخه اندروید روی پروژه Vercel و دیتابیس Supabase مجزا مستقر بوده و خارج از محدوده عملیات وب قرار دارد.

---

## ویژگی‌های نسخه وب
- **تحلیل پرداخت‌محور بدون سهمیه رایگان (`WEB_ONLY=true`):** تحلیل تکی مهمان (بدون نیاز به ثبت‌نام)، بسته ۱۰ عددی و اشتراک یک‌ساله (تا ۳ تحلیل در روز بر مبنای ساعت تهران `Asia/Tehran`).
- **پاس ۲۴ ساعته ابزارهای مشاوره و لایحه (`ai_tools_until`):** پس از هر تحلیل موفق (از جمله تحلیل تکی مهمان)، کاربر به مدت ۲۴ ساعت برای همان تحلیل به **چت مشاور حقوقی (`LegalAssistantChat`)**، **موشکافی بند خاص (`ClauseInquiryModal`)** و **سازنده لایحه دفاعیه (`DefenseDraftModal`)** دسترسی خواهد داشت (این مجوز برای اجرای مجدد `/api/web/analyze` قابل استفاده نیست).
- **ایمنی پرداخت و همگام‌سازی خودکار (`Reconciliation` + `Idempotency-Key`):**
  - ارسال `Idempotency-Key` در `/api/web/analyze` برای جلوگیری از کسر مضاعف در تکرار شبکه.
  - رزرو اتمیک و قفل منحصربه‌فرد `entitlement_claim_id` پیش از فراخوانی Gemini و برگشت خودکار در خطا یا سند نامربوط.
  - تمدید اتمیک اشتراک سالیانه در دیتابیس از طریق تابع `extend_profile_annual`.
  - جاب روزانه Vercel Cron روی مسیر محافظت‌شده `/api/web/reconcile` برای بازگشت رزرواسیون‌های نیمه‌کاره، اعطای سفارش‌های `paid` معوق (`granted_at IS NULL`) و پاک‌سازی داده‌های قدیمی.
- **سیاست نگهداری ۹۰ روزه و حریم خصوصی:** فایل‌های تصویر و PDF بلافاصله پس از پردازش از حافظه آزاد می‌شوند؛ تاریخچه کاربران مهمان فقط در مرورگر خودشان باقی می‌ماند و تاریخچه حساب‌های لاگین‌شده (`web_analyses`) جهت همگام‌سازی بین دستگاه‌ها حداکثر تا **۹۰ روز** نگهداری و سپس به‌طور خودکار حذف می‌شود (و هر زمان نیز با یک کلیک توسط کاربر قابل پاک‌سازی است).

---

## ۱. ترتیب اجباری اسکریپت‌های دیتابیس (Supabase وب)

در پنل **Supabase پروژه وب** ← **SQL Editor**، فایل‌های زیر را دقیقاً به ترتیب زیر اجرا کنید (همگی idempotent و قابل اجرای مجدد هستند):

1. `supabase/web_payments.sql` — ایجاد جداول `profiles` و `payments`، تریگر ساخت خودکار پروفایل و سیاست‌های پایه RLS.
2. `supabase/web_payments_v2.sql` — ستون `granted_at`، جدول `web_usage_logs`، ایندکس‌های کارایی و تابع `increment_profile_credits`.
3. `supabase/web_features_v3.sql` — جدول `web_analyses` و سیاست‌های RLS مالکیت کاربر.
4. `supabase/web_launch_v4.sql` — ستون `entitlement_claim_id` روی `payments`، تابع اتمیک `extend_profile_annual`، جدول `web_analyze_idempotency` و ایندکس‌های نگهداری ۹۰ روزه و پاس ۲۴ ساعته.

```bash
psql "$WEB_DATABASE_URL" -f supabase/web_payments.sql
psql "$WEB_DATABASE_URL" -f supabase/web_payments_v2.sql
psql "$WEB_DATABASE_URL" -f supabase/web_features_v3.sql
psql "$WEB_DATABASE_URL" -f supabase/web_launch_v4.sql
```

> ⚠️ **هشدار مهم:** فایل `supabase/android_purchases.sql` منحصراً مربوط به پروژه Supabase نسخه اندروید (کافه‌بازار/مایکت) است و **به هیچ وجه روی دیتابیس وب اجرا نشود.**

---

## ۲. تنظیم SMTP رایگان در Supabase (تأیید ایمیل و بازیابی رمز)

برای پایداری ارسال ایمیل‌های ثبت‌نام و بازیابی رمز عبور در نسخه وب، در پنل Supabase وب ← **Authentication → Emails → SMTP Settings** گزینه **Enable Custom SMTP** را با یکی از سرویس‌های زیر فعال کنید:

- **Brevo (رایگان تا ۳۰۰ ایمیل/روز):** `smtp-relay.brevo.com` پورت `587`
- **Resend (رایگان تا ۱۰۰ ایمیل/روز):** `smtp.resend.com` پورت `465` یا `587` با نام کاربری `resend`

سپس در **Authentication → URL Configuration**:
- **Site URL:** `https://tahlil-yar.ir`
- **Redirect URLs:** `https://tahlil-yar.ir/**` و `http://localhost:3000/**`

---

## ۳. متغیرهای محیطی (Environment Variables) در Vercel وب

فقط روی پروژه Vercel دامنه وب (`https://tahlil-yar.ir`) در **Settings → Environment Variables** موارد زیر را ثبت کنید (هیچ‌کدام نباید پیشوند `VITE_` داشته باشند):

| متغیر | توضیح |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://tahlil-yar.ir` |
| `WEB_ONLY` | `true` |
| `DISABLE_LEGACY_PAYMENT` | `true` |
| `GEMINI_API_KEY` | کلید API جمینای سمت سرور |
| `SUPABASE_URL` | آدرس پروژه Supabase وب |
| `SUPABASE_SERVICE_ROLE_KEY` | کلید Service Role پروژه Supabase وب |
| `SUPABASE_ANON_KEY` | کلید Anon پروژه Supabase وب |
| `ZARINPAL_MERCHANT_ID` | مرچنت کد ۳۶ کاراکتری زرین‌پال وب |
| `CRON_SECRET` | توکن محرمانه Vercel Cron برای احراز هویت `/api/web/reconcile` (ارسال خودکار به صورت `Bearer` توسط Vercel) |
| `RECONCILE_SECRET` | کلید جایگزین اختیاری برای فراخوانی دستی `POST /api/web/reconcile` |
| `TRUST_CF_HEADER` | `false` وقتی Cloudflare در حالت DNS only است (`true` فقط در صورت فعال کردن Proxy ابر نارنجی) |
| `UPSTASH_REDIS_REST_URL` | آدرس Upstash Redis برای Rate-Limit توزیع‌شده |
| `UPSTASH_REDIS_REST_TOKEN` | توکن Upstash Redis |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | کلیدهای Cloudflare Turnstile (اختیاری برای ضدربات ثبت‌نام و بازیابی رمز) |

---

## ۴. تنظیم Vercel، Cron و Cloudflare (`tahlil-yar.ir`)

1. **پروژه Vercel مجزا:** مخزن گیت‌هاب را به پروژه Vercel وب متصل کنید، **Production Branch** را روی برنچ `web` بگذارید (`Build Command: npm run build`، `Output Directory: dist`).
2. **زمان‌بندی و سقف اجرا (`vercel.json`):**
   - `api/index.ts` دارای `maxDuration: 60` ثانیه است و لایه Gemini دارای بودجه زمانی ۴۵ ثانیه (`GEMINI_RETRY_BUDGET_MS`) است تا در صورت خطا پیش از قطع اتصال سرور، سهمیه به‌موقع برگشت داده شود.
   - کرون روزانه Vercel روی `GET /api/web/reconcile` (ساعت `03:00 UTC` هر شب، سازگار با پلن Hobby و Pro) تنظیم شده است و با `CRON_SECRET` محافظت می‌شود.
3. **Cloudflare DNS:** رکوردهای `A (@ -> 76.76.21.21)` و `CNAME (www -> cname.vercel-dns.com)` را در حالت **DNS only** قرار دهید تا SSL و بازگشت درگاه زرین‌پال بدون تداخل انجام شود.

---

## ۵. تست، بیلد و CI خودکار

- اجرای محلی بررسی تایپ، تست‌ها و بیلد:
  ```bash
  npm ci
  npm run lint
  npm test
  npm run build
  ```
- ورک‌فلوی `.github/workflows/web-ci.yml` در هر Push و PR روی برنچ `web` به‌صورت خودکار `npm ci`، `npm run lint`، `npm test`، `npm run build` و اسکن عدم نشت کلیدهای محرمانه در `src/` و `dist/` را اجرا می‌کند.

---

## ۶. چک‌لیست نهایی پیش از لانچ عمومی وب

- [ ] اجرای به ترتیب `web_payments.sql` ← `web_payments_v2.sql` ← `web_features_v3.sql` ← `web_launch_v4.sql` روی پروژه Supabase وب.
- [ ] تنظیم `CRON_SECRET`، `UPSTASH_REDIS_REST_*`، `SUPABASE_*` و `GEMINI_API_KEY` روی پروژه Vercel وب.
- [ ] ست کردن **Custom SMTP** و **Redirect URLs** (`https://tahlil-yar.ir/**`) در Supabase وب.
- [ ] جایگزینی مبالغ موقت `TODO` در `WEB_PRODUCTS` فایل `api/app.ts` با قیمت‌های نهایی و ست کردن `ZARINPAL_MERCHANT_ID` تأییدشده روی دامنه `https://tahlil-yar.ir`.
