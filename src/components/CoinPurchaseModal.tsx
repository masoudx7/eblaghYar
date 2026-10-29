// فایل: src/components/CoinPurchaseModal.tsx

import React, { useState } from "react";
import { Coins, Crown, Check, Sparkles, X, Store, Globe, ShieldCheck } from "lucide-react";
import { processDynamicPayment, getActiveStore, setActiveStore, StoreType } from "../services/paymentRouter";

interface CoinPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  isPremium: boolean;
  freeTokens: number;
  dailyRemaining?: number;
  dailyUsed?: number;
  onSuccessUpdate: (tokens: number, isPremium: boolean) => void;
}

export const CoinPurchaseModal: React.FC<CoinPurchaseModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  isPremium,
  freeTokens,
  dailyRemaining = 3,
  dailyUsed = 0,
  onSuccessUpdate,
}) => {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentStore, setCurrentStore] = useState<StoreType>(getActiveStore());

  if (!isOpen) return null;

  const toPersianDigits = (str: string | number) => {
    const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(str).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
  };

  const handleStoreChange = (store: StoreType) => {
    setActiveStore(store);
    setCurrentStore(store);
  };

  const handlePurchase = async (productType: 'coins_5' | 'coins_15' | 'premium', count?: number, packageName?: string) => {
    try {
      setLoadingType(productType);
      setSuccessMessage(null);

      const result = await processDynamicPayment(productType, deviceId);

      if (result && result.success) {
        if (productType === 'premium') {
          setSuccessMessage("اکانت دائم (سقف ۳ تحلیل ابلاغیه در هر روز) با موفقیت فعال شد!");
          onSuccessUpdate(freeTokens, true);
        } else if (count) {
          setSuccessMessage(`با موفقیت ${toPersianDigits(count)} سکه (${packageName}) به حساب شما اضافه شد!`);
          onSuccessUpdate(freeTokens + count, isPremium);
        }

        setTimeout(() => {
          setSuccessMessage(null);
          setLoadingType(null);
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      if (err.message !== 'CANCELLED') {
        alert(err.message || "خطا در فرآیند پرداخت. لطفاً دوباره تلاش کنید.");
      }
      setLoadingType(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[#E5E2D9] relative overflow-hidden text-right">
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600"/>
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
              <Coins className="w-5 h-5"/>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#3D3B38]">خرید سکه و ارتقای حساب</h2>
              <p className="text-xs text-[#7A7874] mt-0.5">
                موجودی فعلی: {toPersianDigits(freeTokens)} سکه {isPremium ? `| اکانت دائم فعال 👑 (سهمیه امروز: ${toPersianDigits(dailyRemaining)} از ۳)` : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Dynamic Gateway Selector */}
        <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-blue-600"/>
              <span>درگاه پرداخت هوشمند:</span>
            </span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">
              {currentStore === 'bazaar' ? 'کافه بازار' : 'وب (زرین‌پال)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleStoreChange('bazaar')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentStore === 'bazaar'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              کافه بازار
            </button>
            <button
              type="button"
              onClick={() => handleStoreChange('web')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentStore === 'web'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              وب (زرین‌پال)
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-5 h-5 text-emerald-600 shrink-0"/>
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* بسته ۵ عددی */}
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
                onClick={() => handlePurchase('coins_5', 5, "بسته ۵ عددی")}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Coins className="w-4 h-4"/>
                <span>{loadingType === "coins_5" ? "در حال پردازش..." : "خرید ۵ سکه (۷۹,۰۰۰ تومان)"}</span>
              </button>
            </div>

            {/* بسته ۱۵ عددی */}
            <div className="p-4 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100/60 hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 bg-amber-500 text-white text-[10px] font-black px-3 py-0.5 rounded-br-xl shadow-xs">پیشنهاد اقتصادی</div>
              <div>
                <div className="flex items-center justify-between mb-2 mt-1">
                  <span className="font-black text-amber-950 text-sm">بسته ۱۵ عددی سکه</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-300/80 text-amber-950 font-bold rounded-md">۱۵ تحلیل</span>
                </div>
                <p className="text-xs text-amber-900/80 mb-4">به همراه تخفیف ویژه برای بررسی کامل پرونده‌های چند مرحله‌ای</p>
              </div>
              <button
                disabled={loadingType !== null}
                onClick={() => handlePurchase('coins_15', 15, "بسته ۱۵ عددی")}
                className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-amber-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Coins className="w-4 h-4"/>
                <span>{loadingType === "coins_15" ? "در حال پردازش..." : "خرید ۱۵ سکه (۱۹۹,۰۰۰ تومان)"}</span>
              </button>
            </div>
          </div>

          {/* اکانت دائم با محدودیت ۳ ابلاغ در روز */}
          <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition-all flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Crown className="w-5 h-5 text-blue-200"/>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900 text-sm">اکانت دائم (سقف ۳ ابلاغ در روز)</span>
                  <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">دائم • ۳ ابلاغ در روز</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">تحلیل روزانه تا ۳ ابلاغیه در هر روز بدون محدودیت زمانی + تنظیم پیش‌نویس لوایح</p>
              </div>
            </div>
            <button
              disabled={loadingType !== null || isPremium}
              onClick={() => handlePurchase('premium')}
              className="w-full sm:w-auto py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Crown className="w-4 h-4"/>
              <span>{isPremium ? "اکانت دائم فعال است (۳ ابلاغ/روز) 👑" : loadingType === "premium" ? "در حال اتصال..." : "خرید اکانت دائم (۳۹۹,۰۰۰ تومان)"}</span>
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-[#7A7874] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600"/>
          <span>پرداخت امن متناسب با پلتفرم انتخابی شما (مایکت، کافه بازار یا زرین‌پال)</span>
        </div>
      </div>
    </div>
  );
};
