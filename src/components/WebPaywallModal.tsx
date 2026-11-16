import React, { useState, useEffect } from "react";
import {
  X,
  FileCheck2,
  Layers,
  Crown,
  ShieldCheck,
  AlertCircle,
  Loader2,
  LogIn,
  ArrowLeft,
} from "lucide-react";
import {
  DEFAULT_WEB_PRODUCTS,
  WebProductKey,
  WebProductsMap,
  WebUserProfile,
  fetchWebProducts,
  requestWebPayment,
  getStoredWebSession,
} from "../services/webAuth";

interface WebPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  webUser: WebUserProfile | null;
  hasSingleEntitlement: boolean;
  onRequireAuth: (product: WebProductKey) => void;
  autoTriggerProduct?: WebProductKey | null;
  onAutoTriggerHandled?: () => void;
}

const toPersianDigits = (value: string | number): string => {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(value).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
};

const formatRialsAsToman = (rials: number): string => {
  const toman = Math.round(rials / 10);
  return toPersianDigits(toman.toLocaleString("en-US"));
};

const formatRials = (rials: number): string => {
  return toPersianDigits(rials.toLocaleString("en-US"));
};

export const WebPaywallModal: React.FC<WebPaywallModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  webUser,
  hasSingleEntitlement,
  onRequireAuth,
  autoTriggerProduct = null,
  onAutoTriggerHandled,
}) => {
  const [products, setProducts] = useState<WebProductsMap>(DEFAULT_WEB_PRODUCTS);
  const [loadingProduct, setLoadingProduct] = useState<WebProductKey | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    let cancelled = false;
    fetchWebProducts().then((fetched) => {
      if (!cancelled && fetched) {
        setProducts(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleBuy = async (product: WebProductKey) => {
    setErrorMsg(null);

    if (product === "pack_10" || product === "annual") {
      const session = getStoredWebSession();
      if (!webUser || !session?.access_token) {
        onRequireAuth(product);
        return;
      }
    }

    if (product === "single" && !deviceId) {
      setErrorMsg("شناسه مرورگر آماده نیست. لطفاً یک لحظه صبر کنید یا صفحه را نوسازی نمایید.");
      return;
    }

    setLoadingProduct(product);
    try {
      const res = await requestWebPayment(product, deviceId);
      window.location.href = res.paymentUrl;
    } catch (err: any) {
      if (err?.code === "AUTH_REQUIRED") {
        setLoadingProduct(null);
        onRequireAuth(product);
        return;
      }
      setErrorMsg(err?.message || "خطا در اتصال به درگاه پرداخت زرین‌پال. لطفاً دوباره تلاش کنید.");
      setLoadingProduct(null);
    }
  };

  useEffect(() => {
    if (!isOpen || !autoTriggerProduct || !webUser) return;
    const target = autoTriggerProduct;
    onAutoTriggerHandled?.();
    handleBuy(target);
  }, [isOpen, autoTriggerProduct, webUser]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[#E5E2D9] relative overflow-hidden text-right my-auto">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-slate-900 via-blue-600 to-slate-800" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-[#3D3B38]">
              انتخاب طرح و پرداخت نسخه وب
            </h2>
            <p className="text-xs sm:text-sm text-[#7A7874] mt-1">
              {webUser
                ? `واردشده با حساب ${webUser.full_name || webUser.email} · اعتبار فعلی: ${toPersianDigits(webUser.credits)} تحلیل`
                : "تحلیل تکی بدون ثبت‌نام قابل خرید است؛ بسته‌ها و اشتراک سالیانه روی حساب کاربری ذخیره می‌شوند."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loadingProduct !== null}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ready single entitlement notice inside modal */}
        {hasSingleEntitlement && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-bold leading-relaxed">
            ۱ تحلیل تکی پرداخت‌شده از قبل روی این مرورگر آماده است؛ می‌توانید مودال را ببندید و مستقیماً ابلاغیه خود را بارگذاری کنید یا اعتبار بیشتری تهیه نمایید.
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-5 p-3.5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs sm:text-sm font-bold flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#8B4513]" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* 3 Product Cards from WEB_PRODUCTS */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Card 1: تحلیل تکی — بدون ثبت‌نام */}
            <div className="p-5 rounded-2xl border border-[#E5E2D9] bg-[#FAF8F5] hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-4 h-4 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="font-black text-[#3D3B38] text-sm">
                      تحلیل تکی — بدون ثبت‌نام
                    </h3>
                    <p className="text-[11px] text-[#7A7874]">
                      مهمان · یک‌بارمصرف روی مرورگر فعلی
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#5E5B55] leading-relaxed mb-4">
                  ابتدا پرداخت امن انجام می‌شود و بلافاصله پس از بازگشت از درگاه، ابلاغیه را آپلود و تحلیل می‌کنید.
                </p>

                <div className="mb-4 pb-3 border-b border-[#E5E2D9] flex items-baseline justify-between">
                  <span className="text-lg font-black text-slate-900 tabular-nums">
                    {formatRialsAsToman(products.single.amountRials)}{" "}
                    <span className="text-xs font-bold text-[#7A7874]">تومان</span>
                  </span>
                  <span className="text-[11px] text-[#7A7874] tabular-nums">
                    ({formatRials(products.single.amountRials)} ریال)
                  </span>
                </div>
              </div>

              <button
                id="web-pay-single-btn"
                type="button"
                disabled={loadingProduct !== null}
                onClick={() => handleBuy("single")}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingProduct === "single" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال اتصال به درگاه...</span>
                  </>
                ) : (
                  <>
                    <span>پرداخت و بارگذاری ابلاغیه</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Card 2: بسته ۱۰ ابلاغی */}
            <div className="p-5 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50/70 to-yellow-50/60 hover:border-amber-400 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-amber-100" />
                  </div>
                  <div>
                    <h3 className="font-black text-amber-950 text-sm">
                      بسته ۱۰ ابلاغی
                    </h3>
                    <p className="text-[11px] text-amber-800/80">
                      {toPersianDigits(products.pack_10.credits)} تحلیل · بدون انقضای زمانی
                    </p>
                  </div>
                </div>

                <p className="text-xs text-amber-900/85 leading-relaxed mb-4">
                  مناسب پرونده‌های چندمرحله‌ای؛ اعتبار به حساب کاربری شما اضافه می‌شود و در هر دستگاهی قابل استفاده است.
                </p>

                <div className="mb-4 pb-3 border-b border-amber-200/80 flex items-baseline justify-between">
                  <span className="text-lg font-black text-amber-950 tabular-nums">
                    {formatRialsAsToman(products.pack_10.amountRials)}{" "}
                    <span className="text-xs font-bold text-amber-800">تومان</span>
                  </span>
                  <span className="text-[11px] text-amber-800/80 tabular-nums">
                    ({formatRials(products.pack_10.amountRials)} ریال)
                  </span>
                </div>
              </div>

              <button
                id="web-pay-pack10-btn"
                type="button"
                disabled={loadingProduct !== null}
                onClick={() => handleBuy("pack_10")}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingProduct === "pack_10" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال اتصال به درگاه...</span>
                  </>
                ) : !webUser ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>ورود و خرید بسته ۱۰ ابلاغی</span>
                  </>
                ) : (
                  <>
                    <span>خرید بسته ۱۰ ابلاغی</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 3: سالیانه (روزی ۳ ابلاغ) */}
          <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50/80 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                <Crown className="w-5 h-5 text-blue-100" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">
                    سالیانه (روزی {toPersianDigits(products.annual.dailyLimit)} ابلاغ)
                  </h3>
                  <span className="text-[11px] font-bold text-blue-700">
                    {toPersianDigits(products.annual.durationDays)} روزه
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  امکان تحلیل تا {toPersianDigits(products.annual.dailyLimit)} ابلاغیه در هر روز به مدت یک سال کامل روی حساب کاربری وب شما.
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-base font-black text-slate-900 tabular-nums">
                    {formatRialsAsToman(products.annual.amountRials)}{" "}
                    <span className="text-xs font-bold text-slate-600">تومان</span>
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    ({formatRials(products.annual.amountRials)} ریال)
                  </span>
                </div>
              </div>
            </div>

            <button
              id="web-pay-annual-btn"
              type="button"
              disabled={loadingProduct !== null}
              onClick={() => handleBuy("annual")}
              className="w-full sm:w-auto py-3 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {loadingProduct === "annual" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال اتصال...</span>
                </>
              ) : !webUser ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>ورود و خرید اشتراک سالیانه</span>
                </>
              ) : webUser.is_annual_active ? (
                <>
                  <Crown className="w-4 h-4" />
                  <span>تمدید ۱ ساله اشتراک</span>
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4" />
                  <span>خرید اشتراک سالیانه</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#EBE8E0] text-center text-[11px] text-[#7A7874] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>پرداخت امن و مستقیم از طریق درگاه بانکی زرین‌پال</span>
        </div>
      </div>
    </div>
  );
};
