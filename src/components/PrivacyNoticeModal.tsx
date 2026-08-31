import React from "react";
import {
  X,
  ShieldCheck,
  Lock,
  EyeOff,
  Scale,
  Building,
  CheckCircle2,
  FileText,
  AlertCircle,
} from "lucide-react";

interface PrivacyNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyNoticeModal: React.FC<PrivacyNoticeModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3D3B38]/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Modal Card */}
      <div
        id="legal-privacy-modal"
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-10 border border-[#E5E2D9] overflow-hidden text-right max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#4A4844] text-base">
                بیانیه حقوقی، سلب مسئولیت و حفظ حریم خصوصی
              </h3>
              <p className="text-xs text-[#7A7874] mt-0.5">
                شفافیت قانونی، انطباق با قوانین جمهوری اسلامی ایران و حراست از اسناد کاربران
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] transition-colors cursor-pointer"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 space-y-4 text-xs sm:text-sm text-[#3D3B38] leading-relaxed overflow-y-auto">
          {/* Article 55 & Legal Disclaimer */}
          <div className="p-4 rounded-2xl bg-[#FAF2ED] border border-[#E8CEBF] text-[#8B4513]">
            <div className="flex items-start gap-2.5">
              <Scale className="w-5 h-5 shrink-0 text-[#8B4513] mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-[#8B4513] mb-1">
                  سلب مسئولیت قانونی (انطباق با ماده ۵۵ قانون وکالت)
                </h4>
                <p className="text-xs leading-relaxed text-[#72380F]">
                  این سامانه یک ابزار <strong>فناوری حقوقی (LegalTech)</strong>، دستیار تحلیلی و آموزشی مبتنی بر هوش مصنوعی است و صرفاً با هدف <strong>ساده‌سازی اصطلاحات حقوقی، کاهش اضطراب عمومی و استخراج مواعد قانونی</strong> طراحی گردیده است. خروجی‌های این نرم‌افزار به منزله مشاوره رسمی حقوقی، قبول وکالت یا جایگزین وکیل پایه یک دادگستری و مراجع رسمی قضایی نبوده و برای اقدامات نهایی در پرونده‌های دارای بار مالی یا کیفری، مشورت با وکلای دادگستری توصیه می‌شود.
                </p>
              </div>
            </div>
          </div>

          {/* Independence from Judiciary Portal */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9]">
            <Building className="w-5 h-5 text-[#7A8C70] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-[#4A4844] mb-0.5">استقلال سامانه از مراجع حاکمیتی</h4>
              <p className="text-xs text-[#5C5A55] leading-relaxed">
                این نرم‌افزار یک محصول هوشمند مستقل است و به وب‌سایت رسمی قوه قضائیه (عدل‌ایران / ثنا) یا سازمان‌های دولتی وابستگی اداری ندارد و صرفاً اسناد ورودی بارگذاری‌شده توسط خود کاربر را تحلیل و ساده‌سازی می‌کند.
              </p>
            </div>
          </div>

          {/* Data Privacy & Non-storage */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9]">
            <Lock className="w-5 h-5 text-[#7A8C70] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-[#4A4844] mb-0.5">
                حفظ محرمانگی اسناد (قانون جرایم رایانه‌ای)
              </h4>
              <p className="text-xs text-[#5C5A55] leading-relaxed">
                فایل‌های ابلاغیه و اسناد قضایی آپلود شده پس از تحلیل آنی در حافظه آزاد شده و روی هیچ پایگاه‌داده همگانی ذخیره دائم نمی‌شوند. تاریخچه پرونده‌ها منحصراً در حافظه محلی مرورگر خود کاربر نگهداری شده و هر زمان با یک کلیک قابل حذف است.
              </p>
            </div>
          </div>

          {/* Legal SMS Communications */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9]">
            <CheckCircle2 className="w-5 h-5 text-[#7A8C70] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-[#4A4844] mb-0.5">
                احراز هویت و ارتباطات پیامکی قانونی
              </h4>
              <p className="text-xs text-[#5C5A55] leading-relaxed">
                ارسال پیامک‌های تایید شماره همراه از طریق بستر مجاز و ثبت‌شده اپراتور پیامکی کاوه‌نگار مطابق با ضوابط ساماندهی ارتباطات پیامکی کشور انجام می‌پذیرد.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#7A7874]">
            منطبق بر قوانین آیین دادرسی و تجارت الکترونیکی ایران
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#7A8C70] hover:bg-[#68795F] text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer shadow-xs"
          >
            متوجه شدم و تایید می‌کنم
          </button>
        </div>
      </div>
    </div>
  );
};
