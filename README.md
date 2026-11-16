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

### آماده‌سازی جداول نسخه وب (`supabase/web_payments.sql`)

> **جداسازی محیط وب و اندروید:** دیتابیس نسخه وب روی یک پروژه Supabase مجزا از نسخه اندروید قرار دارد و متغیرهای محیطی جدید فقط روی پروژه Vercel دامنه وب (`https://tahlil-yar.ir`) تنظیم می‌شوند.

برای ایجاد جداول نسخه وب (`profiles` و `payments`)، تریگر ساخت خودکار پروفایل هنگام ثبت‌نام در `auth.users` و تنظیمات امنیتی RLS (بدون تغییر در جداول `devices` و `usage_logs`)، فایل `supabase/web_payments.sql` را در پروژه Supabase وب اجرا کنید:

**روش ۱: از طریق پنل Supabase (SQL Editor)**
1. در داشبورد پروژه Supabase وب وارد بخش **SQL Editor** شوید و روی **New query** کلیک کنید.
2. محتوای کامل فایل `supabase/web_payments.sql` را کپی کرده و در ویرایشگر قرار دهید.
3. روی دکمه **Run** کلیک کنید. (این اسکریپت با `IF NOT EXISTS` نوشته شده و اجرای مجدد آن خطایی ایجاد نمی‌کند.)

**روش ۲: از طریق خط فرمان (`psql` یا Supabase CLI)**
```bash
psql "$DATABASE_URL" -f supabase/web_payments.sql
```

> **نکته امنیتی:** دسترسی نوشتن در جدول `profiles` (از جمله ستون `credits`) و تمام دسترسی‌های جدول `payments` تنها از طریق کلید `SUPABASE_SERVICE_ROLE_KEY` در بک‌اند مجاز است و کاربران کلاینت صرفاً امکان خواندن (`SELECT`) ردیف پروفایل خود را دارند.

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
   - آدرس‌های `https://tahlil-yar.ir/**` و `http://localhost:3000/**` را به **Redirect URLs** اضافه کنید تا لینک‌های تأیید ایمیل و بازیابی رمز از پشت Cloudflare بدون خطا به برنامه برگردند.

---

## راهنمای استقرار (Deploy) نسخه وب روی Vercel و Cloudflare

> **مهم — جداسازی کامل از نسخه اندروید (کافه‌بازار):** پروژه وب با دامنه `https://tahlil-yar.ir` باید روی یک پروژه **Vercel** مجزا (جدا از `eblagh-yar.vercel.app`) و متصل به یک پروژه **Supabase** جداگانه مستقر شود تا جدول `devices` و کاربران اندروید هیچ تغییری نکنند.

### ۱. ساخت پروژه Vercel وب
1. در پنل Vercel یک پروژه جدید بسازید (جدا از پروژه قدیمی `eblagh-yar.vercel.app`).
2. مخزن گیت‌هاب را متصل کرده و در **Settings → Git** مقدار **Production Branch** را برابر نام برنچ نسخه وب (`[BRANCH]`) قرار دهید.
3. تنظیمات بیلد را مطابق `vercel.json` قرار دهید (`Build Command: npm run build`، `Output Directory: dist`).

### ۲. تنظیم دامنه در Cloudflare (`tahlil-yar.ir`)
در پنل Cloudflare دامنه `tahlil-yar.ir`، رکوردهای DNS زیر را **حتماً در حالت `DNS only` (ابر خاکستری)** ثبت کنید تا گواهی SSL و بازگشت درگاه بدون تداخل پروکسی صادر شود:

| نوع رکورد (Type) | نام (Name) | مقدار (Target / Content) | وضعیت Proxy |
| :--- | :--- | :--- | :--- |
| `A` | `@` | `76.76.21.21` | **DNS only** (خاموش) |
| `CNAME` | `www` | `cname.vercel-dns.com` | **DNS only** (خاموش) |

سپس در پروژه Vercel وب به بخش **Settings → Domains** بروید و هر دو دامنه `tahlil-yar.ir` و `www.tahlil-yar.ir` را اضافه و تأیید کنید.

### ۳. متغیرهای محیطی (Environment Variables) در پروژه Vercel وب
در **Settings → Environment Variables** پروژه Vercel وب (فقط روی این پروژه، نه پروژه قدیمی بازار)، مقادیر زیر را برای محیط **Production** ثبت کنید:

- `NODE_ENV` = `production`
- `APP_URL` = `https://tahlil-yar.ir`
- `WEB_ONLY` = `true`
- `DISABLE_LEGACY_PAYMENT` = `true`
- `GEMINI_API_KEY` = کلید جمینای سمت سرور
- `SUPABASE_URL` = آدرس پروژه Supabase جدید وب
- `SUPABASE_SERVICE_ROLE_KEY` = کلید Service Role پروژه Supabase جدید وب
- `SUPABASE_ANON_KEY` = کلید Anon پروژه Supabase جدید وب
- `ZARINPAL_MERCHANT_ID` = مرچنت کد ۳۶ کاراکتری زرین‌پال

> **نکته امنیتی:** هیچ‌کدام از کلیدهای `GEMINI_API_KEY`، `SUPABASE_SERVICE_ROLE_KEY`، `SUPABASE_ANON_KEY` و `ZARINPAL_MERCHANT_ID` نباید با پیشوند `VITE_` تعریف شوند؛ تمام ارتباطات حساس منحصراً از طریق سرور Express (`/api/web/*`) انجام می‌شود.

### ۴. چک‌لیست نهایی پروژه Supabase جدید وب
- [ ] اجرای کامل اسکریپت `supabase/web_payments.sql` در **SQL Editor** (ایجاد جداول `profiles` و `payments`، تریگر ثبت‌نام و سیاست‌های RLS).
- [ ] تنظیم **Authentication → URL Configuration → Site URL** روی `https://tahlil-yar.ir`.
- [ ] افزودن `https://tahlil-yar.ir/**` و `http://localhost:3000/**` به **Redirect URLs**.
- [ ] فعال‌سازی و تنظیم **Custom SMTP** (مانند Brevo یا Resend) در **Authentication → Emails → SMTP Settings**.

### ۵. تأیید درگاه زرین‌پال و قیمت‌های نهایی
1. پس از دیپلوی موفق و بالا آمدن `https://tahlil-yar.ir` با گواهی SSL معتبر، دامنه را در پنل پذیرندگان زرین‌پال ثبت و تأیید کنید.
2. پیش از انتشار عمومی، مبالغ آزمایشی `TODO` در آبجکت `WEB_PRODUCTS` فایل `api/app.ts` (به ریال) را با قیمت‌های نهایی جایگزین کرده و مجدداً دیپلوی کنید.



