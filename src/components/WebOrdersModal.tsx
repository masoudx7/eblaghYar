import React, { useState, useEffect } from "react";
import {
  X,
  ReceiptText,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Sparkles,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import {
  WebOrderItem,
  WebPaymentStatusResponse,
  fetchWebOrders,
  recheckWebPayment,
} from "../services/webAuth";

interface WebOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  onPaymentRecovered: (res: WebPaymentStatusResponse) => Promise<void> | void;
  onActivateSingleToken: (token: string, order: WebOrderItem) => void;
}

const toPersianDigits = (value: string | number): string => {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(value).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
};

const PRODUCT_LABELS: Record<string, string> = {
  single: "تحلیل تکی (مهمان)",
  pack_5: "بسته ۵ ابلاغی",
  pack_10: "بسته ۱۰ ابلاغی",
};

export const WebOrdersModal: React.FC<WebOrdersModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  onPaymentRecovered,
  onActivateSingleToken,
}) => {
  const [orders, setOrders] = useState<WebOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadOrders = async (specificOrderId?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchWebOrders(deviceId, specificOrderId);
      setOrders(list);
      if (specificOrderId && list.length === 0) {
        setErrorMsg("سفارشی با این شناسه در حساب یا مرورگر شما یافت نشد.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "دریافت فهرست سفارش‌ها با خطا مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setNoticeMsg(null);
    setErrorMsg(null);
    setLookupOrderId("");
    loadOrders();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setNoticeMsg(null);
    loadOrders(lookupOrderId.trim() || undefined);
  };

  const handleRecheck = async (orderId: string) => {
    setRecheckingId(orderId);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await recheckWebPayment(orderId, deviceId);
      if (res.status === "paid") {
        setNoticeMsg("پرداخت شما در استعلام مجدد از زرین‌پال تأیید شد و حق دسترسی فعال گردید.");
        await onPaymentRecovered(res);
      } else {
        setNoticeMsg(res.message || "تراکنش در درگاه زرین‌پال تأیید نشده است.");
      }
      await loadOrders(lookupOrderId.trim() || undefined);
    } catch (err: any) {
      setErrorMsg(err?.message || "بررسی مجدد سفارش انجام نشد.");
    } finally {
      setRecheckingId(null);
    }
  };

  const handleCopy = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[#E5E2D9] relative overflow-hidden text-right my-auto max-h-[90vh] flex flex-col">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-slate-900 via-blue-600 to-slate-800" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#3D3B38]">سفارش‌ها و بازیابی خرید وب</h2>
              <p className="text-xs text-[#7A7874] mt-0.5">
                پیگیری تراکنش‌های در انتظار، بررسی مجدد درگاه زرین‌پال و بازیابی تحلیل تکی
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual order_id search */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              dir="ltr"
              value={lookupOrderId}
              onChange={(e) => setLookupOrderId(e.target.value)}
              placeholder="شناسه سفارش (Order ID) برای جست‌وجو یا بازیابی..."
              className="w-full pr-9 pl-3 py-2 text-xs text-left bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:border-blue-600 font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              جست‌وجو
            </button>
            {lookupOrderId && (
              <button
                type="button"
                onClick={() => {
                  setLookupOrderId("");
                  loadOrders();
                }}
                className="px-3 py-2 bg-[#FAF8F5] hover:bg-[#EFECE4] border border-[#E5E2D9] text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                همه
              </button>
            )}
          </div>
        </form>

        {errorMsg && (
          <div className="mb-3 p-3 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs font-bold flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {noticeMsg && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-bold flex items-start gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{noticeMsg}</span>
          </div>
        )}

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center text-xs text-[#7A7874] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
              <span>در حال دریافت فهرست سفارش‌ها...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-10 text-center bg-[#FAF8F5] border border-[#E5E2D9] rounded-2xl px-4">
              <p className="text-sm font-bold text-[#4A4844]">هیچ سفارشی برای این حساب یا مرورگر ثبت نشده است.</p>
              <p className="text-xs text-[#7A7874] mt-1">
                اگر قبلاً با همین مرورگر خرید تکی انجام داده‌اید یا کد سفارش دارید، آن را در کادر بالا وارد کنید.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isPaid = order.status === "paid";
              const isPending = order.status === "pending";
              const isUngrantedPaid = isPaid && order.granted === false;
              const canRecheck = !isPaid || isUngrantedPaid;
              const canActivateToken =
                isPaid && order.product === "single" && !order.entitlement_used && Boolean(order.entitlement_token);

              return (
                <div
                  key={order.order_id}
                  className="p-4 rounded-2xl border border-[#E5E2D9] bg-[#FBFAF7] space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs sm:text-sm text-[#3D3B38]">
                        {PRODUCT_LABELS[order.product] || order.product}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                          isUngrantedPaid
                            ? "bg-amber-100 text-amber-900"
                            : isPaid
                            ? "bg-emerald-100 text-emerald-800"
                            : isPending
                            ? "bg-amber-100 text-amber-900"
                            : "bg-[#FAF0ED] text-[#8B4513]"
                        }`}
                      >
                        {isUngrantedPaid ? (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>پرداخت موفق (در انتظار اعمال سهمیه)</span>
                          </>
                        ) : isPaid ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>پرداخت موفق</span>
                          </>
                        ) : isPending ? (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>در انتظار تایید</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            <span>ناموفق</span>
                          </>
                        )}
                      </span>
                    </div>

                    <span className="text-xs font-black text-slate-900 tabular-nums">
                      {toPersianDigits(Math.round(order.amount_rials / 10).toLocaleString("en-US"))} تومان
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7A7874]">
                    <div className="flex items-center gap-1.5">
                      <span>کد سفارش:</span>
                      <span dir="ltr" className="font-mono text-[#3D3B38]">
                        {order.order_id.slice(0, 8)}...
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.order_id, `ord-${order.order_id}`)}
                        className="p-1 rounded hover:bg-[#E5E2D9]/60 cursor-pointer"
                        title="کپی شناسه کامل سفارش"
                      >
                        {copiedId === `ord-${order.order_id}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {order.ref_id && (
                      <div className="flex items-center gap-1 font-bold text-emerald-900">
                        <span>کد پیگیری:</span>
                        <span dir="ltr" className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                          {order.ref_id}
                        </span>
                      </div>
                    )}

                    <span>
                      {new Date(order.paid_at || order.created_at).toLocaleDateString("fa-IR")}
                    </span>
                  </div>

                  {(canRecheck || canActivateToken) && (
                    <div className="pt-2 border-t border-[#EBE8E0] flex flex-wrap items-center gap-2">
                      {canRecheck && (
                        <button
                          type="button"
                          onClick={() => handleRecheck(order.order_id)}
                          disabled={recheckingId === order.order_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8F7732] hover:bg-[#776326] disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          {recheckingId === order.order_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCcw className="w-3.5 h-3.5" />
                          )}
                          <span>بررسی مجدد پرداخت</span>
                        </button>
                      )}

                      {canActivateToken && order.entitlement_token && (
                        <button
                          type="button"
                          onClick={() => {
                            onActivateSingleToken(order.entitlement_token!, order);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>فعال‌سازی تحلیل تکی آماده</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
