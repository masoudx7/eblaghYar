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
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
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

---

## دستورات اجرایی

```bash
# نصب وابستگی‌ها
npm install

# اجرای محیط توسعه (لوکال)
npm run dev

# ساخت نسخه پروداکشن
npm run build

# اجرای نسخه پروداکشن
npm start
```

---

## نحوه دیپلوی در Vercel

1. پروژه را به گیت‌هاب پوش کنید.
2. در داشبورد [Vercel](https://vercel.com) گزینه **Add New Project** را زده و ریپازیتوری را انتخاب نمایید.
3. در بخش **Environment Variables** سه متغیر `GEMINI_API_KEY`، `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` را تعریف کنید.
4. دکمه **Deploy** را بزنید؛ تنظیمات لازم در `vercel.json` از پیش انجام شده است.
