import React, { useState } from "react";
import {
  Scale,
  ShieldCheck,
  History,
  FileText,
  Smartphone,
  User,
  LogOut,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { AuthUser } from "../types";

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenPrivacy: () => void;
  onOpenAuth: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  historyCount: number;
  onReset: () => void;
  hasActiveResult: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHistory,
  onOpenPrivacy,
  onOpenAuth,
  currentUser,
  onLogout,
  historyCount,
  onReset,
  hasActiveResult,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

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
                <span>سامانه هوشمند ابلاغیه و وکلا</span>
              </span>
            </div>
            <p className="text-[11px] text-[#7A7874] hidden lg:block mt-0.5">
              تحلیل آنی ابلاغیه‌های ثنا و اتصال هوشمند به وکلای پایه یک دادگستری
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

          {/* User Auth Section */}
          {currentUser ? (
            <div className="relative">
              <button
                id="user-profile-btn"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#F0F4EF] hover:bg-[#E2EBE0] border border-[#D5DFD0] rounded-xl text-xs font-medium text-[#4A4844] transition-all cursor-pointer shadow-2xs"
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#7A8C70] text-white flex items-center justify-center">
                  <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>
                <span className="font-mono text-xs font-bold text-[#3D3B38] hidden xs:inline sm:inline">
                  {toPersianDigits(currentUser.maskedPhone || currentUser.phoneNumber)}
                </span>
                <ChevronDown className="w-3 h-3 text-[#7A7874]" />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-56 bg-white border border-[#E5E2D9] rounded-2xl shadow-xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-3 bg-[#FAF8F5] rounded-xl mb-2 border border-[#EBE8E0]">
                      <div className="flex items-center gap-1.5 text-[#5A6D52] font-bold mb-1">
                        <CheckCircle2 className="w-4 h-4 text-[#7A8C70]" />
                        <span>وارد شده به سامانه</span>
                      </div>
                      <p className="text-[11px] text-[#7A7874]">
                        شماره همراه:{" "}
                        <strong className="font-mono text-[#3D3B38]">
                          {toPersianDigits(currentUser.phoneNumber)}
                        </strong>
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenHistory();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[#4A4844] hover:bg-[#F3F1ED] rounded-xl text-right transition-colors cursor-pointer"
                    >
                      <History className="w-4 h-4 text-[#7A8C70]" />
                      <span>مشاهده پرونده‌ها و تاریخچه</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[#8B4513] hover:bg-[#FAF0ED] rounded-xl text-right transition-colors cursor-pointer mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>خروج از حساب کاربری</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              id="login-btn"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white bg-[#7A8C70] hover:bg-[#68795F] rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>ورود با شماره همراه</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

