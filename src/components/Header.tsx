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
    <header className="border-b border-[#E5E2D9] bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div
          id="brand-logo"
          onClick={onReset}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group shrink-0"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 shrink-0">
            <Scale className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-black text-[#3D3B38] text-base sm:text-lg leading-none tracking-tight">
                ابلاغ‌یار
              </h1>
              <span className="hidden md:inline-flex text-[10px] font-bold bg-[#F0F4EF] text-[#5A6D52] border border-[#D5DFD0] px-2 py-0.5 rounded-full items-center gap-1">
                <span>سامانه هوشمند تحلیل ابلاغیه</span>
              </span>
            </div>
            <p className="text-[11px] text-[#7A7874] hidden lg:block mt-0.5">
              تحلیل آنی و هوشمند ابلاغیه‌های قضایی سامانه ثنا
            </p>
          </div>
        </div>

        {/* Actions & Coin Token Badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Coin Token Badge */}
          <div 
            id="token-coin-badge"
            onClick={onOpenCoinModal}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200/80 px-2.5 sm:px-3 py-1 rounded-full shadow-xs cursor-pointer hover:bg-amber-100/70 transition-all group"
            title={isPremium ? "حساب پرمیوم نامحدود فعال است (کلیک برای خرید سکه)" : `${freeTokens} تحلیل رایگان باقیمانده (کلیک برای خرید سکه و ارتقا)`}
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 flex items-center justify-center text-white shadow-xs shrink-0 ring-2 ring-amber-100 group-hover:scale-105 transition-transform">
              {isPremium ? (
                <Crown className="w-3 h-3 text-amber-950" />
              ) : (
                <Coins className="w-3 h-3 text-amber-950" />
              )}
            </div>
            <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1">
              {isPremium ? (
                <span className="text-[11px] sm:text-xs text-amber-800 font-black">پریمیوم</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-amber-900">{toPersianDigits(freeTokens)}</span>
                  <span className="text-[10px] sm:text-xs text-amber-700/80 font-semibold hidden sm:inline">سکه</span>
                </div>
              )}
            </div>
          </div>

          {hasActiveResult && (
            <button
              id="new-analysis-btn"
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#5A6D52] bg-[#F0F4EF] hover:bg-[#E2EBE0] border border-[#D5DFD0] rounded-xl transition-colors cursor-pointer"
              title="بارگذاری و تحلیل ابلاغیه جدید"
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A8C70]" />
              <span className="hidden sm:inline">ابلاغیه جدید</span>
              <span className="sm:hidden text-[11px]">جدید</span>
            </button>
          )}

          <button
            id="history-btn"
            onClick={onOpenHistory}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-[#5C5A55] hover:text-[#3D3B38] hover:bg-[#F3F1ED] border border-[#E5E2D9] rounded-xl transition-colors relative cursor-pointer"
            title="تاریخچه تحلیل‌های شما"
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A8C70]" />
            <span className="hidden md:inline">تاریخچه</span>
            {historyCount > 0 && (
              <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full bg-[#7A8C70] text-white text-[9px] sm:text-[10px] font-bold">
                {toPersianDigits(historyCount)}
              </span>
            )}
          </button>

          <button
            id="privacy-btn"
            onClick={onOpenPrivacy}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] rounded-xl transition-colors cursor-pointer"
            title="حریم خصوصی و امنیت"
          >
            <ShieldCheck className="w-4 h-4 text-[#7A8C70]" />
            <span>قوانین و حریم خصوصی</span>
          </button>
        </div>
      </div>
    </header>
  );
};
