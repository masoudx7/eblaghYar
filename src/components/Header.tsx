import React from "react";
import {
  Scale,
  ShieldCheck,
  History,
  FileText,
  Coins,
  Crown,
} from "lucide-react";

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenPrivacy: () => void;
  historyCount: number;
  onReset: () => void;
  hasActiveResult: boolean;
  freeTokens: number;
  isPremium: boolean;
  onOpenCoinModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHistory,
  onOpenPrivacy,
  historyCount,
  onReset,
  hasActiveResult,
  freeTokens,
  isPremium,
  onOpenCoinModal,
}) => {
  const toPersianDigits = (str: string | number) => {
    const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(str).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
  };

  return (
    <header className="border-b border-slate-100 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div
          id="brand-logo"
          onClick={onReset}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group shrink-0"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 shrink-0">
            <Scale className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-black text-slate-900 text-base sm:text-lg leading-none tracking-tight">
                ابلاغ‌یار
              </h1>
              <span className="hidden md:inline-flex text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full items-center gap-1">
                <span>سامانه هوشمند</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden lg:block mt-0.5">
              تحلیل آنی و هوشمند ابلاغیه‌های قضایی ثنا
            </p>
          </div>
        </div>

        {/* Actions & Coin Token Badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Coin Token Badge */}
          <div 
            id="token-coin-badge"
            onClick={onOpenCoinModal}
            className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 sm:px-3 py-1 rounded-full shadow-xs cursor-pointer hover:bg-slate-200 transition-all group"
            title={isPremium ? "حساب پرمیوم نامحدود فعال است" : `${freeTokens} تحلیل رایگان باقیمانده`}
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              {isPremium ? (
                <Crown className="w-3 h-3 text-amber-950" />
              ) : (
                <Coins className="w-3 h-3 text-white" />
              )}
            </div>
            <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
              {isPremium ? (
                <span className="text-[11px] sm:text-xs text-slate-900 font-black">پریمیوم</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-slate-900">{toPersianDigits(freeTokens)}</span>
                  <span className="text-[10px] sm:text-xs text-slate-500 font-semibold hidden sm:inline">سکه</span>
                </div>
              )}
            </div>
          </div>

          {hasActiveResult && (
            <button
              id="new-analysis-btn"
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
              title="بارگذاری و تحلیل ابلاغیه جدید"
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
              <span className="hidden sm:inline">ابلاغیه جدید</span>
              <span className="sm:hidden text-[11px]">جدید</span>
            </button>
          )}

          <button
            id="history-btn"
            onClick={onOpenHistory}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors relative cursor-pointer"
            title="تاریخچه تحلیل‌های شما"
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
            <span className="hidden md:inline">تاریخچه</span>
            {historyCount > 0 && (
              <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full bg-slate-900 text-white text-[9px] sm:text-[10px] font-bold">
                {toPersianDigits(historyCount)}
              </span>
            )}
          </button>

          <button
            id="privacy-btn"
            onClick={onOpenPrivacy}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="حریم خصوصی و امنیت"
          >
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <span>حریم خصوصی</span>
          </button>
        </div>
      </div>
    </header>
  );
};
