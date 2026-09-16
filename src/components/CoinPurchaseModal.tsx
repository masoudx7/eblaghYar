import React, { useState } from "react";
import { Coins, Crown, Check, Sparkles, X, ShieldAlert } from "lucide-react";
import { getApiUrl } from "../utils/apiHelper";

interface CoinPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  isPremium: boolean;
  freeTokens: number;
  onSuccessUpdate: (tokens: number, isPremium: boolean) => void;
}

export const CoinPurchaseModal: React.FC<CoinPurchaseModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  isPremium,
  freeTokens,
  onSuccessUpdate,
}) => {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toPersianDigits = (str: string | number) => {
    const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(str).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
  };

  const handleBuyCoins = async (count: number, packageName: string) => {
    try {
      setLoadingType(`coins_${count}`);
      setSuccessMessage(null);
      const res = await fetch(getApiUrl("/api/buy-coins"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ deviceId, coinCount: count }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setSuccessMessage(`با موفقیت ${toPersianDigits(count)} سکه (${packageName}) به حساب شما اضافه شد!`);
        onSuccessUpdate(data.free_tokens ?? (freeTokens + count), isPremium);
        setTimeout(() => {
          setSuccessMessage(null);
          setLoadingType(null);
          onClose();
        }, 1500);
      } else {
        alert(data?.message || "خطا در خرید سکه");
        setLoadingType(null);
      }
    } catch (err) {
      console.error(err);
      alert("خطا در ارتباط با سرور");
      setLoadingType(null);
    }
  };

  const handleActivatePremium = async () => {
    try {
      setLoadingType("premium");
      setSuccessMessage(null);
      const res = await fetch(getApiUrl("/api/activate-premium"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setSuccessMessage("نسخه پرمیوم نامحدود با موفقیت برای این دستگاه فعال شد!");
        onSuccessUpdate(freeTokens, true);
        setTimeout(() => {
          setSuccessMessage(null);
          setLoadingType(null);
          onClose();
        }, 1500);
      } else {
        alert(data?.message || "خطا در فعال‌سازی پرمیوم");
        setLoadingType(null);
      }
    } catch (err) {
      console.error(err);
      alert("خطا در ارتباط با سرور");
      setLoadingType(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[#E5E2D9] relative overflow-hidden text-right">
        {/* Header background accent */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600" />

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#3D3B38]">
                خرید سکه و ارتقای حساب
              </h2>
              <p className="text-xs text-[#7A7874] mt-0.5">
                موجودی فعلی: {toPersianDigits(freeTokens)} سکه {isPremium ? "| پرمیوم فعال 👑" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {/* Coin Packs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-amber-900 text-sm">بسته ۵ عددی سکه</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-200/60 text-amber-900 font-bold rounded-md">۵ تحلیل</span>
                </div>
                <p className="text-xs text-amber-800/80 mb-4">مناسب برای تحلیل چند ابلاغیه اضافی بدون محدودیت زمانی</p>
              </div>
              <button
                disabled={loadingType !== null}
                onClick={() => handleBuyCoins(5, "بسته ۵ عددی")}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                <span>{loadingType === "coins_5" ? "در حال پردازش..." : "خرید ۵ سکه (۴۹,۰۰۰ تومان)"}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100/60 hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 bg-amber-500 text-white text-[10px] font-black px-3 py-0.5 rounded-br-xl shadow-xs">
                پیشنهاد اقتصادی
              </div>
              <div>
                <div className="flex items-center justify-between mb-2 mt-1">
                  <span className="font-black text-amber-950 text-sm">بسته ۱۵ عددی سکه</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-300/80 text-amber-950 font-bold rounded-md">۱۵ تحلیل</span>
                </div>
                <p className="text-xs text-amber-900/80 mb-4">به همراه تخفیف ویژه برای بررسی کامل پرونده‌های چند مرحله‌ای</p>
              </div>
              <button
                disabled={loadingType !== null}
                onClick={() => handleBuyCoins(15, "بسته ۱۵ عددی")}
                className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-amber-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Coins className="w-4 h-4 text-amber-200" />
                <span>{loadingType === "coins_15" ? "در حال پردازش..." : "خرید ۱۵ سکه (۱۱۹,۰۰۰ تومان)"}</span>
              </button>
            </div>
          </div>

          {/* Premium Unlimited Option */}
          <div className="p-5 rounded-2xl border-2 border-[#8F7732] bg-gradient-to-r from-[#FAF6EC] to-[#F5EEDC] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#8F7732] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Crown className="w-6 h-6 text-[#FFF5D0]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-[#4A4844] text-base">نسخه پرمیوم نامحدود</h4>
                  {isPremium && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      فعال روی این دستگاه ✓
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E5D2A] mt-0.5 leading-relaxed">
                  تحلیل نامحدود تمامی ابلاغیه‌ها، تنظیم پیش‌نویس لوایح دفاعیه کامل و مشورت بدون محدودیت با دستیار حقوقی.
                </p>
              </div>
            </div>
            {!isPremium && (
              <button
                disabled={loadingType !== null}
                onClick={handleActivatePremium}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#8F7732] hover:bg-[#776326] disabled:bg-stone-400 text-white font-bold text-xs transition-all shadow-xs cursor-pointer shrink-0 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-[#FFF2B2]" />
                <span>{loadingType === "premium" ? "در حال فعال‌سازی..." : "ارتقا به پرمیوم (۱۹۹,۰۰۰ ت)"}</span>
              </button>
            )}
          </div>
        </div>

        <div className="text-center pt-2 border-t border-[#E5E2D9]">
          <p className="text-[11px] text-[#7A7874]">
            تمامی خریدها و تراکنش‌ها بر روی شناسه امن این دستگاه ثبت و بلافاصله اعمال می‌شوند.
          </p>
        </div>
      </div>
    </div>
  );
};
