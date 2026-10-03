import React from "react";
import {
  X,
  ShieldCheck,
  Lock,
  Scale,
  Building,
  CheckCircle2,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Modal Card */}
      <div
        id="legal-privacy-modal"
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-10 border border-slate-200 overflow-hidden text-right max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Scale className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                بیانیه حقوقی، سلب مسئولیت و حفظ حریم خصوصی
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                شفافیت قانونی، انطباق با قوانین و حراست از اسناد کاربران
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed overflow-y-auto">
          {/* Article 55 & Legal Disclaimer */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
            <div className="flex items-start gap-2.5">
              <Scale className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-amber-950 mb-1">
                  سلب مسئولیت قانونی (انطباق با ماده ۵۵ قانون وکالت)
                </h4>
                <p className="text-xs leading-relaxed text-amber-900">
                  این سامانه یک ابزار <strong>فناوری حقوقی (LegalTech)</strong>، دستیار تحلیلی و آموزشی مبتنی بر هوش مصنوعی است و صرفاً با هدف <strong>ساده‌سازی اصطلاحات حقوقی، کاهش اضطراب عمومی و استخراج مواعد قانونی</strong> طراحی گردیده است. خروجی‌های این نرم‌افزار به منزله مشاوره رسمی حقوقی، قبول وکالت یا جایگزین وکیل پایه یک دادگستری و مراجع رسمی قضایی نبوده و برای اقدامات نهایی در پرونده‌های دارای بار مالی یا کیفری، مشورت با وکلای دادگستری توصیه می‌شود.
                </p>
              </div>
            </div>
          </div>

          {/* Independence from Judiciary Portal */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <Building className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900 mb-0.5">استقلال سامانه از مراجع حاکمیتی</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                این نرم‌افزار یک محصول هوشمند مستقل است و به وب‌سایت رسمی قوه قضائیه (عدل‌ایران / ثنا) یا سازمان‌های دولتی وابستگی اداری ندارد و صرفاً اسناد ورودی بارگذاری‌شده توسط خود کاربر را تحلیل و ساده‌سازی می‌کند.
              </p>
            </div>
          </div>

          {/* Data Privacy & Non-storage */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900 mb-0.5">
                حفظ محرمانگی اسناد و حریم خصوصی
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                فایل‌های ابلاغیه و اسناد قضایی آپلود شده پس از تحلیل آنی در حافظه آزاد شده و روی هیچ پایگاه‌داده همگانی ذخیره دائم نمی‌شوند. تاریخچه پرونده‌ها منحصراً در حافظه محلی مرورگر خود کاربر نگهداری شده و هر زمان با یک کلیک قابل حذف است.
              </p>
            </div>
          </div>

          {/* Legal SMS Communications */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900 mb-0.5">
                ارتباطات امن و استاندارد
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                تمامی ارتباطات رمزنگاری شده و مطابق با ضوابط امنیت داده‌ها و تجارت الکترونیکی انجام می‌پذیرد.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            منطبق بر قوانین آیین دادرسی و تجارت الکترونیکی ایران
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer shadow-xs"
          >
            متوجه شدم و تایید می‌کنم
          </button>
        </div>
      </div>
    </div>
  );
};
