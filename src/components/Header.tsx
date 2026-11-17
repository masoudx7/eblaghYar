import React, { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Scale,
  ShieldCheck,
  History,
  FileText,
  Coins,
  Crown,
  LogIn,
  LogOut,
  User,
  ChevronDown,
  RefreshCw,
  CreditCard,
  CheckCircle2,
  ReceiptText,
} from "lucide-react";
import { WebUserProfile } from "../services/webAuth";

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenPrivacy: () => void;
  historyCount: number;
  onReset: () => void;
  hasActiveResult: boolean;
  freeTokens: number;
  isPremium: boolean;
  dailyRemaining?: number;
  onOpenCoinModal: () => void;
  hasSingleEntitlement?: boolean;
  onOpenWebPaywall?: () => void;
  webUser?: WebUserProfile | null;
  onOpenAuthModal?: () => void;
  onWebLogout?: () => void;
  onRefreshWebUser?: () => void;
  onOpenWebOrders?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHistory,
  onOpenPrivacy,
  historyCount,
  onReset,
  hasActiveResult,
  freeTokens,
  isPremium,
  dailyRemaining = 3,
  onOpenCoinModal,
  hasSingleEntitlement = false,
  onOpenWebPaywall,
  webUser,
  onOpenAuthModal,
  onWebLogout,
  onRefreshWebUser,
  onOpenWebOrders,
}) => {
  const isNative = Capacitor.isNativePlatform();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNative) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNative]);

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

        {/* Actions & Native Coin Token Badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Native-only Coin Token Badge (removed on Web) */}
          {isNative && (
            <div 
              id="token-coin-badge"
              onClick={onOpenCoinModal}
              className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 sm:px-3 py-1 rounded-full shadow-xs cursor-pointer hover:bg-slate-200 transition-all group"
              title={isPremium ? `اکانت دائم فعال است (سهمیه امروز: ${toPersianDigits(dailyRemaining)} از ۳ ابلاغیه باقی‌مانده)` : `${freeTokens} تحلیل رایگان باقیمانده`}
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
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] sm:text-xs text-slate-900 font-black">دائم</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                      {toPersianDigits(dailyRemaining)} از ۳
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-black text-slate-900">{toPersianDigits(freeTokens)}</span>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-semibold hidden sm:inline">سکه</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Web-only Paywall / Ready Entitlement Button */}
          {!isNative && onOpenWebPaywall && (
            <button
              id="web-paywall-btn"
              type="button"
              onClick={onOpenWebPaywall}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-bold rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                hasSingleEntitlement
                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
              }`}
              title={
                hasSingleEntitlement
                  ? "۱ تحلیل تکی آماده استفاده است (کلیک برای مشاهده طرح‌ها)"
                  : "خرید تحلیل تکی، بسته ۱۰ ابلاغی یا اشتراک سالیانه"
              }
            >
              {hasSingleEntitlement ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  <span>۱ تحلیل آماده</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-700 shrink-0" />
                  <span className="hidden sm:inline">خرید تحلیل</span>
                  <span className="sm:hidden">تعرفه</span>
                </>
              )}
            </button>
          )}

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

          {/* Web-only Auth Button / User Account Menu (hidden on native Capacitor) */}
          {!isNative && onOpenAuthModal && (
            webUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  id="web-user-menu-btn"
                  type="button"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                  title="حساب کاربری وب"
                >
                  <User className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                  <span className="hidden sm:inline max-w-[90px] truncate">
                    {webUser.full_name || webUser.email.split("@")[0]}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/15 text-[10px] font-extrabold text-amber-300">
                    {webUser.is_annual_active
                      ? `سالیانه (${toPersianDigits(webUser.daily_remaining)}/۳)`
                      : `${toPersianDigits(webUser.credits)} اعتبار`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-white border border-[#E5E2D9] rounded-2xl shadow-xl p-3.5 text-right z-50 animate-in fade-in">
                    <div className="pb-2.5 mb-2.5 border-b border-slate-100">
                      <p className="text-xs font-black text-slate-900 truncate">
                        {webUser.full_name || "کاربر ابلاغ‌یار"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5" dir="ltr">
                        {webUser.email}
                      </p>
                    </div>

                    <div className="space-y-1.5 mb-3 bg-[#FAF8F5] border border-[#EBE8E0] rounded-xl p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">موجودی اعتبار وب:</span>
                        <span className="font-black text-slate-900">
                          {toPersianDigits(webUser.credits)} تحلیل
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">وضعیت اشتراک:</span>
                        <span
                          className={`font-bold ${
                            webUser.is_annual_active ? "text-emerald-700" : "text-slate-700"
                          }`}
                        >
                          {webUser.is_annual_active
                            ? `یک‌ساله فعال (${toPersianDigits(webUser.daily_remaining)} از ۳ امروز)`
                            : "عادی"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {onOpenWebPaywall && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenWebPaywall();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                          <span>خرید بسته یا تمدید اشتراک</span>
                        </button>
                      )}
                      {onOpenWebOrders && (
                        <button
                          id="web-user-orders-btn"
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenWebOrders();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        >
                          <ReceiptText className="w-3.5 h-3.5 text-slate-500" />
                          <span>سفارش‌های من و پیگیری خرید</span>
                        </button>
                      )}
                      {onRefreshWebUser && (
                        <button
                          type="button"
                          onClick={() => {
                            onRefreshWebUser();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                          <span>به‌روزرسانی موجودی</span>
                        </button>
                      )}
                      {onWebLogout && (
                        <button
                          id="web-logout-btn"
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onWebLogout();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-[#8B4513] hover:bg-[#FAF0ED] rounded-xl transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>خروج از حساب</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {onOpenWebOrders && (
                  <button
                    id="web-guest-orders-btn"
                    type="button"
                    onClick={onOpenWebOrders}
                    className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="پیگیری و بررسی مجدد سفارش پرداخت"
                  >
                    <ReceiptText className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden md:inline">پیگیری خرید</span>
                  </button>
                )}
                <button
                  id="web-login-btn"
                  type="button"
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
                  title="ورود یا ثبت‌نام نسخه وب"
                >
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-300" />
                  <span>ورود</span>
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  );
};
