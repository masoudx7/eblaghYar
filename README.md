# ابلاغ‌یار (EblaghYar) - سامانه هوشمند تحلیل ابلاغیه‌های قضایی ثنا

ابلاغ‌یار یک سامانه تحت وب هوشمند بر پایه هوش مصنوعی (Google Gemini) و React/Express است که ابلاغیه‌ها و احضاریه‌های قضایی سامانه ثنا را بررسی کرده، به زبان ساده بازنویسی نموده، مواعد قانونی، اقدامات ضروری، عواقب عدم اقدام و نمونه لایحه دفاعیه اولیه را استخراج می‌کند.

---

## ویژگی‌های اصلی
- ⚖️ **تحلیل فوق‌دقیق ابلاغیه‌ها:** پشتیبانی از فایل‌های تصویری، PDF و متن خام ابلاغیه.
- 🔒 **احراز هویت ناشناس مبتنی بر دستگاه (Device-Based):** عدم نیاز به شماره موبایل، لاگین یا ثبت‌نام؛ حفظ حداکثری حریم خصوصی حقوقی.
- ⚡ **مدیریت سهمیه در Supabase:** ۳ تحلیل رایگان برای هر دستگاه و قابلیت ارتقا به نسخه نامحدود پرمیوم.
- 📅 **محاسبه مواعد قانونی:** استخراج دقیق مهلت حضور یا اعتراض طبق قانون آیین دادرسی و امکان خروجی به تقویم گوگل و iCal.
- 📝 **پیش‌نویس لایحه دفاعیه:** تولید لایحه دفاعیه استاندارد و مستند به مواد قانونی در فرمت متنی و چاپی.
- 💬 **مشاور هوشمند حقوقی:** گفت‌وگوی تعاملی و پرسش درباره بندها و اصطلاحات خاص ابلاغیه.

---

## پیش‌نیازها و متغیرهای محیطی (.env)

فایل `.env.example` را به `.env` کپی کرده و مقادیر زیر را تکمیل کنید:

```env
NODE_ENV="production" # در سرور Vercel وب برابر production
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
SUPABASE_URL="https://your-web-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-web-supabase-service-role-key"
SUPABASE_ANON_KEY="your-web-supabase-anon-key"
APP_URL="https://tahlil-yar.ir"
ZARINPAL_MERCHANT_ID="your-zarinpal-36-char-merchant-id"
DISABLE_LEGACY_PAYMENT="false" # فقط روی پروژه Vercel وب برابر "true" قرار دهید
WEB_ONLY="false" # فقط روی پروژه Vercel وب برابر "true" قرار دهید
PORT=3000
```

### ساخت جداول در Supabase (SQL Editor)

در پنل دیتابیس Supabase وارد بخش **SQL Editor** شوید و اسکریپت زیر را اجرا فرمایید:

```sql
-- جدول دستگاه‌ها
CREATE TABLE IF NOT EXISTS devices (
    device_id UUID PRIMARY KEY,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    free_tokens INT DEFAULT 3 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- جدول لاگ مصرف
CREATE TABLE IF NOT EXISTS usage_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE,
    tokens_used INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ایندکس‌گذاری جهت افزایش سرعت استعلام
CREATE INDEX IF NOT EXISTS idx_devices_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_device ON usage_logs(device_id);
```

### آماده‌سازی جداول نسخه وب و اندروید در Supabase

> **جداسازی کامل محیط وب و اندروید:** دیتابیس نسخه وب روی یک پروژه Supabase مجزا از نسخه اندروید قرار دارد و متغیرهای محیطی جدید وب فقط روی پروژه Vercel دامنه وب (`https://tahlil-yar.ir`) تنظیم می‌شوند.

#### الف) پروژه Supabase وب (ترتیب اجباری اجرای اسکریپت‌ها در SQL Editor)
اسکریپت‌های زیر همگی با `IF NOT EXISTS` (کاملاً idempotent) طراحی شده‌اند؛ آن‌ها را **به ترتیب زیر** در **SQL Editor** پروژه Supabase وب اجرا کنید:
1. `supabase/web_payments.sql`: ایجاد جداول `profiles` و `payments`، تریگر ساخت خودکار پروفایل هنگام ثبت‌نام در `auth.users` و سیاست‌های پایه RLS.
2. `supabase/web_payments_v2.sql`: افزودن ستون idempotency پرداخت (`granted_at`)، جدول `web_usage_logs`، ایندکس‌های کارایی و تابع اتمیک `increment_profile_credits`.
3. `supabase/web_features_v3.sql`: ایجاد جدول تاریخچه ابلاغیه‌های کاربر (`web_analyses`) با سیاست‌های RLS مجزا برای خواندن/حذف امن توسط مالک حساب.

```bash
psql "$WEB_DATABASE_URL" -f supabase/web_payments.sql
psql "$WEB_DATABASE_URL" -f supabase/web_payments_v2.sql
psql "$WEB_DATABASE_URL" -f supabase/web_features_v3.sql
```

#### ب) پروژه Supabase اندروید (هات‌فیکس ضدتقلب خرید کافه‌بازار / مایکت)
در پروژه Supabase قدیمی (مربوط به اپلیکیشن اندروید و `eblagh-yar.vercel.app`) اسکریپت زیر را اجرا کنید تا مصرف توکن خرید فقط یک بار مجاز باشد:
```bash
psql "$ANDROID_DATABASE_URL" -f supabase/android_purchases.sql
```

> **نکته امنیتی:** دسترسی نوشتن در جدول `profiles` (از جمله ستون `credits`)، تمام دسترسی‌های جدول `payments` و ثبت `consumed_purchase_tokens` تنها از طریق کلید `SUPABASE_SERVICE_ROLE_KEY` در بک‌اند مجاز است.

### تنظیم SMTP رایگان در Supabase (برای ایمیل تأیید و بازیابی رمز)

سرویس ایمیل پیش‌فرض Supabase دارای محدودیت شدید ارسال (حدود ۲ ایمیل در ساعت و احتمال قرار گرفتن در پوشه اسپم) است. برای عملکرد پایدار ثبت‌نام و بازیابی رمز در نسخه وب، حتماً یک سرویس SMTP رایگان (مانند **Brevo** یا **Resend**) را متصل کنید:

1. در داشبورد **Supabase** به مسیر **Authentication → Emails → SMTP Settings** (یا **Project Settings → Authentication → SMTP Settings**) بروید و گزینه **Enable Custom SMTP** را فعال کنید.
2. یکی از سرویس‌های زیر را وارد کنید:

- **گزینه ۱ — Brevo (رایگان تا ۳۰۰ ایمیل در روز):**
  - **Sender email:** ایمیل تأییدشده شما در Brevo
  - **Sender name:** `ابلاغ‌یار`
  - **Host:** `smtp-relay.brevo.com`
  - **Port:** `587`
  - **Username:** ایمیل حساب Brevo شما
  - **Password:** کلید SMTP تولیدشده در پنل Brevo (`SMTP & API`)

- **گزینه ۲ — Resend (رایگان تا ۳,۰۰۰ ایمیل در ماه / ۱۰۰ ایمیل در روز):**
  - **Sender email:** ایمیل دامنه تأییدشده در Resend
  - **Sender name:** `ابلاغ‌یار`
  - **Host:** `smtp.resend.com`
  - **Port:** `465` (یا `587`)
  - **Username:** `resend`
  - **Password:** کلید API دریافتی از پنل Resend (`re_...`)

3. در بخش **Authentication → URL Configuration**:
   - مقدار **Site URL** را برابر `https://tahlil-yar.ir` قرار دهید.
   - آدرس‌های `https://tahlil-yar.ir/**` و `http://localhost:3000/**` را به **Redirect URLs** اضافه کنید تا لینک‌های تأیید ایمیل، تغییر رمز و بازیابی حساب بدون خطا به برنامه برگردند.

---

## راهنمای استقرار (Deploy) نسخه وب روی Vercel و Cloudflare

> **مهم — جداسازی کامل از نسخه اندروید (کافه‌بازار):** پروژه وب با دامنه `https://tahlil-yar.ir` باید روی یک پروژه **Vercel** مجزا (جدا از `eblagh-yar.vercel.app`) و متصل به پروژه **Supabase وب** مستقر شود تا جدول `devices` و کاربران اندروید هیچ تغییری نکنند.

### ۱. ساخت پروژه Vercel وب
1. در پنل Vercel یک پروژه جدید بسازید (جدا از پروژه قدیمی `eblagh-yar.vercel.app`).
2. مخزن گیت‌هاب را متصل کرده و در **Settings → Git** مقدار **Production Branch** را روی برنچ نسخه وب (پس از ادغام در `web`) قرار دهید.
3. تنظیمات بیلد را مطابق `vercel.json` قرار دهید (`Build Command: npm run build`، `Output Directory: dist`).

### ۲. تنظیم دامنه در Cloudflare (`tahlil-yar.ir`)
در پنل Cloudflare دامنه `tahlil-yar.ir`، رکوردهای DNS زیر را **در حالت `DNS only` (ابر خاکستری)** ثبت کنید تا گواهی SSL و بازگشت درگاه بدون تداخل پروکسی صادر شود:

| نوع رکورد (Type) | نام (Name) | مقدار (Target / Content) | وضعیت Proxy |
| :--- | :--- | :--- | :--- |
| `A` | `@` | `76.76.21.21` | **DNS only** (خاموش) |
| `CNAME` | `www` | `cname.vercel-dns.com` | **DNS only** (خاموش) |

> **هشدار امنیتی IP واقعی کلاینت (`TRUST_CF_HEADER`):**
> تا زمانی که رکوردهای Cloudflare روی حالت **DNS only** هستند، مقدار `TRUST_CF_HEADER` را حتماً برابر `"false"` نگه دارید تا سرور برای تشخیص IP محدودیت نرخ (`Rate Limit`) فقط به `x-vercel-forwarded-for` اعتماد کند و امکان جعل هدر `cf-connecting-ip` وجود نداشته باشد. تنها در صورتی که پروکسی Cloudflare (ابر نارنجی) را فعال کردید، `TRUST_CF_HEADER="true"` را تنظیم کنید.

### ۳. متغیرهای محیطی (Environment Variables) در Vercel

#### الف) پروژه Vercel وب (`tahlil-yar.ir`)
در **Settings → Environment Variables** پروژه Vercel وب (فقط روی این پروژه) مقادیر زیر را برای **Production** ثبت کنید:

- `NODE_ENV` = `production`
- `APP_URL` = `https://tahlil-yar.ir`
- `WEB_ONLY` = `true`
- `DISABLE_LEGACY_PAYMENT` = `true`
- `GEMINI_API_KEY` = کلید جمینای سمت سرور
- `SUPABASE_URL` = آدرس پروژه Supabase جدید وب
- `SUPABASE_SERVICE_ROLE_KEY` = کلید Service Role پروژه Supabase جدید وب
- `SUPABASE_ANON_KEY` = کلید Anon پروژه Supabase جدید وب
- `ZARINPAL_MERCHANT_ID` = مرچنت کد ۳۶ کاراکتری زرین‌پال
- `TRUST_CF_HEADER` = `false` (در حالت DNS only)
- `UPSTASH_REDIS_REST_URL` = آدرس REST سرویس Upstash Redis (برای Rate-Limit توزیع‌شده روی Serverless Vercel)
- `UPSTASH_REDIS_REST_TOKEN` = توکن REST سرویس Upstash Redis
- `TURNSTILE_SITE_KEY` = کلید عمومی Cloudflare Turnstile (اختیاری برای ضدربات ثبت‌نام و بازیابی رمز)
- `TURNSTILE_SECRET_KEY` = کلید محرمانه Cloudflare Turnstile

#### ب) پروژه Vercel اندروید (`eblagh-yar.vercel.app`) — هات‌فیکس خرید بازار/مایکت
روی پروژه Vercel قدیمی (اندروید)، علاوه بر `WEB_ONLY=false` و `DISABLE_LEGACY_PAYMENT=false`، موارد زیر را ست کنید:
- `BAZAAR_RSA_PUBLIC_KEY` = کلید عمومی RSA برنامه در پیشخوان کافه‌بازار (برای تأیید امضای Poolakey)
- `MYKET_RSA_PUBLIC_KEY` = کلید عمومی RSA مایکت (در صورت انتشار در مایکت)
- `BAZAAR_DEVELOPER_API_TOKEN` و `ANDROID_PACKAGE_NAME` = توکن پیشخوان کافه‌بازار و شناسه پکیج جهت تأیید سرور-ساید مکمل

> **نکته امنیتی:** هیچ‌کدام از کلیدهای `GEMINI_API_KEY`، `SUPABASE_SERVICE_ROLE_KEY`، `SUPABASE_ANON_KEY`، `ZARINPAL_MERCHANT_ID`، `UPSTASH_REDIS_REST_TOKEN`، `TURNSTILE_SECRET_KEY` و `BAZAAR_*` نباید با پیشوند `VITE_` تعریف شوند.

### ۴. آزمون خودکار و CI
- برای اجرای تست‌های یکپارچه بک‌اند (امنیت، پرداخت زرین‌پال/بازار، رزرواسیون اتمیک، کپچا و نرخ درخواست):
  ```bash
  npm test
  ```
- ورک‌فلوی `.github/workflows/web-ci.yml` در هر Push/PR روی برنچ `web` به‌طور خودکار `npm run lint`، `npm test`، `npm run build` و اسکن عدم نشت کلیدهای محرمانه در `dist/` را اجرا می‌کند (بدون تغییر در `android-build.yml`).

### ۵. چک‌لیست نهایی راه‌اندازی عمومی وب
- [ ] اجرای به ترتیب `web_payments.sql` ← `web_payments_v2.sql` ← `web_features_v3.sql` روی پروژه Supabase وب.
- [ ] اجرای `android_purchases.sql` روی پروژه Supabase اندروید و ست کردن `BAZAAR_RSA_PUBLIC_KEY` روی پروژه Vercel اندروید.
- [ ] تنظیم **Authentication → URL Configuration → Site URL** روی `https://tahlil-yar.ir` و **Redirect URLs** شامل `https://tahlil-yar.ir/**`.
- [ ] فعال‌سازی و تنظیم **Custom SMTP** (Brevo یا Resend) در Supabase وب.
- [ ] ست کردن Upstash Redis (`UPSTASH_REDIS_REST_*`) و Turnstile روی پروژه Vercel وب.
- [ ] جایگزینی مبالغ آزمایشی `TODO` در آبجکت `WEB_PRODUCTS` فایل `api/app.ts` (به ریال) با قیمت‌های مصوب نهایی و تأیید دامنه در زرین‌پال.



