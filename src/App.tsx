import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App as CapApp } from "@capacitor/app";
import { Header } from "./components/Header";
import { UploadZone } from "./components/UploadZone";
import { AnalysisResult } from "./components/AnalysisResult";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PrivacyNoticeModal } from "./components/PrivacyNoticeModal";
import { DefenseDraftModal } from "./components/DefenseDraftModal";
import { CoinPurchaseModal } from "./components/CoinPurchaseModal";
import { WebPaywallModal } from "./components/WebPaywallModal";
import { AuthModal } from "./components/AuthModal";
import {
  JudicialNoticeAnalysis,
  AnalysisHistoryItem,
} from "./types";
import { SampleNotice } from "./sampleData";
import { getApiUrl } from "./utils/apiHelper";
import {
  WebUserProfile,
  WebProductKey,
  WebPaymentReceipt,
  webFetchMe,
  webLogout,
  webRefreshSession,
  getStoredWebSession,
  getStoredEntitlementToken,
  saveEntitlementToken,
  clearEntitlementToken,
  getStoredWebPaymentReceipt,
  saveWebPaymentReceipt,
  clearWebPaymentReceipt,
  consumeWebAuthRedirectParams,
  consumeWebPaymentRedirectParams,
  fetchWebPaymentStatus,
} from "./services/webAuth";
import { Scale, AlertCircle, ArrowUp, RefreshCcw, Crown, Sparkles, X, CheckCircle2, ReceiptText } from "lucide-react";

const HISTORY_STORAGE_KEY = "judicial_notice_analysis_history";
const DEVICE_ID_KEY = "eblaghyar_device_id";

import { Device } from "@capacitor/device";
import { Preferences } from "@capacitor/preferences";

export default function App() {
  const [currentAnalysis, setCurrentAnalysis] = useState<JudicialNoticeAnalysis | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("");
  const [freeTokens, setFreeTokens] = useState<number>(2);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [dailyRemaining, setDailyRemaining] = useState<number>(3);
  const [dailyUsed, setDailyUsed] = useState<number>(0);
  const [isCoinModalOpen, setIsCoinModalOpen] = useState<boolean>(false);
  const [isWebPaywallOpen, setIsWebPaywallOpen] = useState<boolean>(false);
  const [webUser, setWebUser] = useState<WebUserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [webAuthNotice, setWebAuthNotice] = useState<string | null>(null);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<string | null>(null);
  const [hasSingleEntitlement, setHasSingleEntitlement] = useState<boolean>(
    () => !Capacitor.isNativePlatform() && Boolean(getStoredEntitlementToken())
  );
  const [webPaymentReceipt, setWebPaymentReceipt] = useState<WebPaymentReceipt | null>(
    () => (!Capacitor.isNativePlatform() ? getStoredWebPaymentReceipt() : null)
  );
  const [webPaymentFailed, setWebPaymentFailed] = useState<boolean>(false);
  const [pendingWebProduct, setPendingWebProduct] = useState<WebProductKey | null>(null);
  const [autoTriggerWebProduct, setAutoTriggerWebProduct] = useState<WebProductKey | null>(null);

  const refreshWebUser = async () => {
    if (Capacitor.isNativePlatform()) return;
    const profile = await webFetchMe();
    setWebUser(profile);
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const { authNotice } = consumeWebAuthRedirectParams();
    if (authNotice) {
      setWebAuthNotice(authNotice);
    }
    const { paymentStatus, orderId } = consumeWebPaymentRedirectParams();
    if (paymentStatus === "failed") {
      setWebPaymentFailed(true);
    } else if (paymentStatus === "success" && orderId) {
      setPendingPaymentOrderId(orderId);
    }
    webFetchMe().then((profile) => {
      if (profile) {
        setWebUser(profile);
      }
    });
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !pendingPaymentOrderId || !deviceId) return;
    let cancelled = false;
    fetchWebPaymentStatus(pendingPaymentOrderId, deviceId).then(async (statusRes) => {
      if (cancelled) return;
      setPendingPaymentOrderId(null);
      if (!statusRes) return;
      if (statusRes.status === "failed") {
        setWebPaymentFailed(true);
        return;
      }
      if (statusRes.status !== "paid") return;

      const receipt: WebPaymentReceipt = {
        order_id: statusRes.order_id,
        product: statusRes.product,
        ref_id: statusRes.ref_id || null,
        paid_at: statusRes.paid_at || null,
      };
      saveWebPaymentReceipt(receipt);
      setWebPaymentReceipt(receipt);
      setWebPaymentFailed(false);
      setShowPremiumPrompt(false);
      setIsWebPaywallOpen(false);

      if (statusRes.product === "single" && statusRes.entitlement_token && !statusRes.entitlement_used) {
        saveEntitlementToken(statusRes.entitlement_token);
        setHasSingleEntitlement(true);
        setCurrentAnalysis(null);
      } else if (statusRes.product === "pack_10" || statusRes.product === "annual") {
        await refreshWebUser();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pendingPaymentOrderId, deviceId]);

  const handleWebLogout = async () => {
    await webLogout();
    setWebUser(null);
  };

  const fetchDeviceStatus = async (devId: string, fp?: string) => {
    try {
      const headers: Record<string, string> = {
        "x-device-id": devId,
      };
      if (fp || deviceFingerprint) {
        headers["x-device-fingerprint"] = fp || deviceFingerprint;
      }
      const res = await fetch(getApiUrl("/api/device-status"), {
        headers,
      });
      const canonicalId = res.headers.get("x-canonical-device-id");
      if (canonicalId && canonicalId !== devId) {
        setDeviceId(canonicalId);
        localStorage.setItem(DEVICE_ID_KEY, canonicalId);
        if (Capacitor.isNativePlatform()) {
          Preferences.set({ key: DEVICE_ID_KEY, value: canonicalId }).catch(() => {});
        }
        devId = canonicalId;
      }

      const data = await res.json().catch(() => null);
      if (data && data.success) {
        if (typeof data.free_tokens === "number") setFreeTokens(data.free_tokens);
        if (typeof data.is_premium === "boolean") setIsPremium(data.is_premium);
        if (typeof data.daily_remaining === "number") setDailyRemaining(data.daily_remaining);
        if (typeof data.daily_used === "number") setDailyUsed(data.daily_used);
      }
    } catch (e) {
      console.warn("Failed to fetch device status:", e);
    }
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform() && deviceId) {
      fetchDeviceStatus(deviceId, deviceFingerprint);
    }
  }, [deviceId]);
  const [showPremiumPrompt, setShowPremiumPrompt] = useState<boolean>(false);
  const [dismissedLowTokenWarning, setDismissedLowTokenWarning] = useState<boolean>(false);
  const [lastAnalyzePayload, setLastAnalyzePayload] = useState<{
    fileBase64: string | null;
    mimeType: string | null;
    rawText: string | null;
    fileName: string;
  } | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isDefenseDraftOpen, setIsDefenseDraftOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 1. Device-based Anonymous Auth Initialization with Fingerprint & Preferences (survives reinstall)
  useEffect(() => {
    async function initDevice() {
      try {
        let storedDeviceId = "";
        if (Capacitor.isNativePlatform()) {
          const prefRes = await Preferences.get({ key: DEVICE_ID_KEY });
          storedDeviceId = prefRes.value || "";
        }
        if (!storedDeviceId) {
          storedDeviceId = localStorage.getItem(DEVICE_ID_KEY) || "";
        }

        let fingerprint = "web_browser";
        try {
          const info = await Device.getInfo();
          const deviceIdInfo = await Device.getId();
          fingerprint = `${info.manufacturer || 'unknown'}_${info.model || 'unknown'}_${info.platform || 'web'}_${deviceIdInfo.identifier || 'id'}`;
        } catch (e) {
          fingerprint = `web_${navigator.userAgent.substring(0, 40)}`;
        }
        setDeviceFingerprint(fingerprint);

        if (!storedDeviceId) {
          storedDeviceId = uuidv4();
        }

        localStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
        if (Capacitor.isNativePlatform()) {
          await Preferences.set({ key: DEVICE_ID_KEY, value: storedDeviceId });
        }

        setDeviceId(storedDeviceId);
        if (Capacitor.isNativePlatform()) {
          fetchDeviceStatus(storedDeviceId, fingerprint);
        }
      } catch (e) {
        console.error("Failed to initialize device ID/Preferences:", e);
        const generated = uuidv4();
        setDeviceId(generated);
      }
    }
    initDevice();
  }, []);

  // 1.1 Capacitor native platform initialization (StatusBar, SplashScreen, BackButton)
  useEffect(() => {
    let backListener: any = null;
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide().catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#1e3a8a" }).catch(() => {});

      CapApp.addListener("backButton", () => {
        if (isHistoryOpen) {
          setIsHistoryOpen(false);
        } else if (isPrivacyOpen) {
          setIsPrivacyOpen(false);
        } else if (isDefenseDraftOpen) {
          setIsDefenseDraftOpen(false);
        } else if (currentAnalysis) {
          if (window.confirm("آیا می‌خواهید از تحلیل فعلی خارج شوید؟")) {
            setCurrentAnalysis(null);
            setCurrentFileName("");
          }
        } else {
          if (window.confirm("آیا می‌خواهید از برنامه خارج شوید؟")) {
            CapApp.exitApp();
          }
        }
      }).then((listener) => {
        backListener = listener;
      }).catch(() => {});

      return () => {
        if (backListener && typeof backListener.remove === "function") {
          backListener.remove();
        }
      };
    }
  }, [isHistoryOpen, isPrivacyOpen, isDefenseDraftOpen, currentAnalysis]);

  // 2. Load analysis history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load analysis history:", e);
    }
  }, []);

  // 3. Handle scroll to top visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const saveToHistory = (analysis: JudicialNoticeAnalysis, fileName: string) => {
    const newItem: AnalysisHistoryItem = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      fileName,
      summary: analysis.summaryInSimpleWords,
      authority: analysis.caseDetails?.issuingAuthority || "مرجع قضایی",
      urgency: analysis.urgencyLevel,
      analysis,
    };

    const updated = [newItem, ...history.filter((h) => h.id !== newItem.id)].slice(0, 20);
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to persist history:", e);
    }
  };

  const handleAnalyze = async (
    fileBase64: string | null,
    mimeType: string | null,
    rawText: string | null,
    fileName: string
  ) => {
    setIsLoading(true);
    setError(null);
    setShowPremiumPrompt(false);
    setCurrentFileName(fileName);
    setLastAnalyzePayload({ fileBase64, mimeType, rawText, fileName });

    try {
      // اطمینان از وجود شناسه دستگاه
      let currentDeviceId = deviceId;
      if (!currentDeviceId) {
        try {
          currentDeviceId = localStorage.getItem(DEVICE_ID_KEY) || uuidv4();
          localStorage.setItem(DEVICE_ID_KEY, currentDeviceId);
        } catch {
          currentDeviceId = uuidv4();
        }
        setDeviceId(currentDeviceId);
      }

      if (!Capacitor.isNativePlatform()) {
        // مسیر تحلیل نسخه وب (فقط با پرداخت / اعتبار / اشتراک)
        const sendWebAnalyze = (accessToken?: string | null, entitlementTok?: string | null) => {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-device-id": currentDeviceId,
          };
          if (deviceFingerprint) {
            headers["x-device-fingerprint"] = deviceFingerprint;
          }
          if (accessToken) {
            headers["Authorization"] = `Bearer ${accessToken}`;
          }
          if (entitlementTok) {
            headers["x-entitlement-token"] = entitlementTok;
          }
          return fetch(getApiUrl("/api/web/analyze"), {
            method: "POST",
            headers,
            body: JSON.stringify({ fileBase64, mimeType, rawText }),
          });
        };

        const session = getStoredWebSession();
        const entitlementToken = getStoredEntitlementToken();
        let res = await sendWebAnalyze(session?.access_token, entitlementToken);

        if (res.status === 402 && session?.refresh_token) {
          const refreshed = await webRefreshSession(session.refresh_token);
          if (refreshed?.session?.access_token) {
            res = await sendWebAnalyze(refreshed.session.access_token, entitlementToken);
          }
        }

        const json = await res.json().catch(() => null);

        if (res.status === 402) {
          if (entitlementToken) {
            clearEntitlementToken();
            setHasSingleEntitlement(false);
          }
          setShowPremiumPrompt(true);
          setIsWebPaywallOpen(true);
          setError(null);
          return;
        }

        if (res.status === 403 && json?.error === "DAILY_LIMIT_REACHED") {
          setError(
            json?.message ||
              "سقف روزانه اشتراک یک‌ساله شما تکمیل شده است. سهمیه روزانه شما فردا مجدداً شارژ خواهد شد."
          );
          setShowPremiumPrompt(false);
          await refreshWebUser();
          return;
        }

        if (!res.ok || !json?.success || !json?.data) {
          throw new Error(json?.message || json?.error || `خطا در تحلیل ابلاغیه قضایی (${res.status})`);
        }

        if (json.accessMode === "entitlement") {
          clearEntitlementToken();
          setHasSingleEntitlement(false);
        }

        const analysisData: JudicialNoticeAnalysis = json.data;
        setCurrentAnalysis(analysisData);
        saveToHistory(analysisData, fileName);
        setLastAnalyzePayload(null);
        await refreshWebUser();

        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // ارسال درخواست به همراه هدر x-device-id و x-device-fingerprint (نسخه اندروید)
      const res = await fetch(getApiUrl("/api/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": currentDeviceId,
          ...(deviceFingerprint ? { "x-device-fingerprint": deviceFingerprint } : {}),
        },
        body: JSON.stringify({ fileBase64, mimeType, rawText }),
      });

      const json = await res.json().catch(() => null);

      // بررسی وضعیت ۴۰۳: سقف روزانه اکانت دائم یا اتمام توکن رایگان
      if (res.status === 403) {
        if (json?.error === "DAILY_LIMIT_REACHED") {
          setError(json?.message || "سقف روزانه اکانت یک ساله شما (۳ ابلاغیه در روز) تکمیل شده است. سهمیه روزانه شما فردا مجدداً شارژ خواهد شد.");
          setShowPremiumPrompt(false);
          await fetchDeviceStatus(currentDeviceId);
          return;
        } else if (json?.error === "LIMIT_REACHED") {
          setShowPremiumPrompt(true);
          setError(null);
          return;
        }
      }

      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.message || json?.error || `خطا در تحلیل ابلاغیه قضایی (${res.status})`);
      }

      const analysisData: JudicialNoticeAnalysis = json.data;
      setCurrentAnalysis(analysisData);
      saveToHistory(analysisData, fileName);
      setLastAnalyzePayload(null);
      await fetchDeviceStatus(currentDeviceId);

      // انتقال به ابتدای صفحه جهت مشاهده تحلیل
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error("Analyze error:", err);
      setError(err.message || "متأسفانه در تحلیل ابلاغیه خطایی رخ داد. لطفاً مجدداً امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryAnalyze = () => {
    if (lastAnalyzePayload) {
      handleAnalyze(
        lastAnalyzePayload.fileBase64,
        lastAnalyzePayload.mimeType,
        lastAnalyzePayload.rawText,
        lastAnalyzePayload.fileName
      );
    }
  };

  const handleBuyPremium = () => {
    if (!Capacitor.isNativePlatform()) {
      setIsWebPaywallOpen(true);
    } else {
      setIsCoinModalOpen(true);
    }
  };

  const handleSelectSample = (sample: SampleNotice) => {
    setError(null);
    setShowPremiumPrompt(false);
    setCurrentFileName(sample.name);
    setCurrentAnalysis(sample.precomputedAnalysis);
    saveToHistory(sample.precomputedAnalysis, sample.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setCurrentAnalysis(null);
    setCurrentFileName("");
    setError(null);
    setShowPremiumPrompt(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectHistoryItem = (item: AnalysisHistoryItem) => {
    setCurrentAnalysis(item.analysis);
    setCurrentFileName(item.fileName);
    setShowPremiumPrompt(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    const confirmed = window.confirm(
      "آیا مطمئن هستید که می‌خواهید تمام تاریخچه تحلیل‌های خود را پاک کنید؟\n\n(توجه: موجودی سکه و اشتراک پرمیوم شما دست‌نخورده باقی خواهد ماند و این عمل فقط سوابق ذخیره‌شده روی مرورگر را پاک می‌کند.)"
    );
    if (confirmed) {
      setHistory([]);
      try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };



  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#3D3B38] font-['Vazirmatn',sans-serif]">
      {/* Top Header */}
      <Header
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        historyCount={history.length}
        onReset={handleReset}
        hasActiveResult={!!currentAnalysis}
        freeTokens={freeTokens}
        isPremium={isPremium}
        dailyRemaining={dailyRemaining}
        onOpenCoinModal={() => setIsCoinModalOpen(true)}
        hasSingleEntitlement={!Capacitor.isNativePlatform() ? hasSingleEntitlement : false}
        onOpenWebPaywall={!Capacitor.isNativePlatform() ? () => setIsWebPaywallOpen(true) : undefined}
        webUser={!Capacitor.isNativePlatform() ? webUser : null}
        onOpenAuthModal={!Capacitor.isNativePlatform() ? () => setIsAuthModalOpen(true) : undefined}
        onWebLogout={!Capacitor.isNativePlatform() ? handleWebLogout : undefined}
        onRefreshWebUser={!Capacitor.isNativePlatform() ? refreshWebUser : undefined}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* اعلان وضعیت تأیید ایمیل / بازیابی رمز در نسخه وب */}
        {!Capacitor.isNativePlatform() && webAuthNotice && (
          <div className="max-w-4xl mx-auto mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{webAuthNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setWebAuthNotice(null)}
              className="p-1.5 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
              aria-label="بستن اعلان"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* بنر آماده بودن ۱ تحلیل تکی پرداخت‌شده در نسخه وب (پایدار پس از رفرش صفحه) */}
        {!Capacitor.isNativePlatform() && hasSingleEntitlement && !currentAnalysis && (
          <div
            id="web-single-entitlement-banner"
            className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 shadow-xs animate-in fade-in"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <p className="text-sm sm:text-base font-black text-emerald-900">
                  ۱ تحلیل آماده است؛ ابلاغیه را بارگذاری کنید
                </p>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  فایل تصویر یا PDF ابلاغیه ثنا را در کادر زیر انتخاب کنید و دکمه «شروع تحلیل هوشمند ابلاغیه» را بزنید.
                </p>
                {webPaymentReceipt?.product === "single" && webPaymentReceipt.ref_id && (
                  <div className="pt-2 mt-2 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <ReceiptText className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>کد پیگیری پرداخت (Ref ID):</span>
                      <span dir="ltr" className="font-mono font-black tabular-nums bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                        {webPaymentReceipt.ref_id}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-800">
                      برای پشتیبانی و بازیابی خرید نگه دارید
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* بنر رسید پرداخت موفق بسته ۱۰ ابلاغی یا اشتراک سالیانه (یا نمایش Ref ID) */}
        {!Capacitor.isNativePlatform() &&
          webPaymentReceipt &&
          (!hasSingleEntitlement || webPaymentReceipt.product !== "single") && (
            <div
              id="web-payment-receipt-banner"
              className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 shadow-xs animate-in fade-in"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-black text-emerald-900">
                      {webPaymentReceipt.product === "pack_10"
                        ? "پرداخت بسته ۱۰ ابلاغی با موفقیت انجام شد و اعتبار به حساب شما اضافه گردید."
                        : webPaymentReceipt.product === "annual"
                        ? "پرداخت اشتراک سالیانه (روزی ۳ ابلاغ) با موفقیت انجام و برای حساب شما فعال شد."
                        : "پرداخت تحلیل تکی با موفقیت ثبت شد."}
                    </p>
                    {webPaymentReceipt.ref_id && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-900">
                        <ReceiptText className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="font-bold">کد پیگیری (Ref ID):</span>
                        <span dir="ltr" className="font-mono font-black tabular-nums bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                          {webPaymentReceipt.ref_id}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800">
                          — برای پشتیبانی و بازیابی خرید نگه دارید
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearWebPaymentReceipt();
                    setWebPaymentReceipt(null);
                  }}
                  className="p-1.5 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
                  aria-label="بستن رسید پرداخت"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        {/* بنر خطای پرداخت وب (?payment=failed) + تلاش مجدد */}
        {!Capacitor.isNativePlatform() && webPaymentFailed && (
          <div
            id="web-payment-failed-banner"
            className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#8B4513] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">پرداخت در درگاه بانکی ناموفق بود یا لغو شد</p>
                <p className="text-xs sm:text-sm mt-0.5 text-[#6B3410]">
                  هیچ خریدی نهایی نشده است. در صورت کسر وجه از حساب بانکی، مبلغ طی ۷۲ ساعت به حساب شما بازمی‌گردد. می‌توانید مجدداً اقدام کنید.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setWebPaymentFailed(false);
                  setIsWebPaywallOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#8B4513] hover:bg-[#72380F] text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
              <button
                type="button"
                onClick={() => setWebPaymentFailed(false)}
                className="p-2 rounded-xl text-[#8B4513] hover:bg-[#F2DFD8] transition-colors cursor-pointer"
                aria-label="بستن خطای پرداخت"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* پیام خطای پردازش هوش مصنوعی */}
        {error && (
          <div className="max-w-4xl mx-auto mb-6 p-4 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#8B4513] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">خطا در پردازش هوش مصنوعی</p>
                <p className="text-xs sm:text-sm mt-0.5 text-[#6B3410]">{error}</p>
              </div>
            </div>
            {lastAnalyzePayload && (
              <button
                onClick={handleRetryAnalyze}
                disabled={isLoading}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#8B4513] hover:bg-[#72380F] disabled:bg-[#C4A496] text-white rounded-xl font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
            )}
          </div>
        )}

        {/* هشدار ملایم اتمام رو به پایان توکن‌ها (فقط نسخه اندروید) */}
        {Capacitor.isNativePlatform() && !isPremium && freeTokens > 0 && freeTokens < 2 && history.length > 0 && !dismissedLowTokenWarning && !showPremiumPrompt && (
          <div
            id="banner-low-tokens"
            className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 bg-gradient-to-r from-amber-50/90 to-yellow-50/90 border border-amber-200 rounded-2xl shadow-xs text-right animate-in fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <Sparkles className="w-5 h-5 text-amber-100" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-amber-950 text-sm sm:text-base">
                    اعتبار رو به پایان است ({freeTokens} تحلیل باقی‌مانده)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900 text-[10px] font-extrabold">
                    رو به اتمام
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                  تعداد تحلیل‌های رایگان شما در این دستگاه رو به اتمام است. برای جلوگیری از توقف، می‌توانید سکه یا اشتراک پرمیوم تهیه کنید.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => setIsCoinModalOpen(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>افزایش سکه و پرمیوم</span>
              </button>
              <button
                onClick={() => setDismissedLowTokenWarning(true)}
                className="p-2 text-amber-800 hover:bg-amber-100/80 rounded-xl transition-colors cursor-pointer"
                title="بستن موقت"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* کارت اعلان نیاز به پرداخت یا اتمام توکن‌ها */}
        {showPremiumPrompt && (
          <div
            id="banner-limit-reached"
            className="max-w-4xl mx-auto mb-6 p-5 sm:p-6 bg-gradient-to-r from-[#FAF6EC] to-[#F5EEDC] border border-[#E5DBBF] rounded-2xl sm:rounded-3xl shadow-xs text-right animate-in fade-in"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#8F7732] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Crown className="w-6 h-6 text-[#FFF5D0]" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-[#4A4844]">
                      {!Capacitor.isNativePlatform()
                        ? "نیاز به تهیه اعتبار یا اشتراک برای تحلیل"
                        : "پایان سقف تحلیل‌های رایگان (۲ ابلاغیه)"}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-[#8F7732]/10 text-[#8F7732] text-[11px] font-bold">
                      {!Capacitor.isNativePlatform() ? "نسخه وب" : "دستگاه جاری"}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#6E5D2A] leading-relaxed max-w-2xl">
                    {!Capacitor.isNativePlatform()
                      ? "تحلیل ابلاغیه در نسخه وب نیازمند پرداخت است. می‌توانید تحلیل تکی خریداری کنید یا وارد حساب کاربری دارای اعتبار / اشتراک یک‌ساله خود شوید."
                      : "شما از ۲ فرصت تحلیل رایگان ابلاغیه در این دستگاه استفاده نموده‌اید. برای تحلیل نامحدود ابلاغیه‌ها و تنظیم پیش‌نویس لوایح دفاعیه، نسخه پرمیوم را فعال فرمایید."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto pt-2 sm:pt-0">
                {!Capacitor.isNativePlatform() && !webUser && (
                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-white border border-[#D8CBA6] hover:bg-[#FAF6EC] text-[#4A4844] font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0"
                  >
                    ورود به حساب
                  </button>
                )}
                <button
                  id="btn-buy-premium-banner"
                  onClick={handleBuyPremium}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#8F7732] hover:bg-[#776326] text-white font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-[#FFF2B2]" />
                  <span>{!Capacitor.isNativePlatform() ? "خرید تحلیل / اشتراک" : "خرید نسخه پرمیوم"}</span>
                </button>
                <button
                  onClick={() => setShowPremiumPrompt(false)}
                  className="p-2.5 rounded-xl text-[#8F7732] hover:bg-[#EBE3CD] transition-colors cursor-pointer"
                  title="بستن پیام"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {!currentAnalysis ? (
          <UploadZone
            onAnalyze={handleAnalyze}
            onSelectSample={handleSelectSample}
            isLoading={isLoading}
          />
        ) : (
          <div className="space-y-8">
            <AnalysisResult
              analysis={currentAnalysis}
              onOpenDefenseDraft={() => setIsDefenseDraftOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E2D9] bg-white py-6 mt-12 text-xs text-[#7A7874] print:hidden">
        <div className="max-w-6xl mx-auto px-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#7A8C70]" />
              <span className="font-semibold text-[#4A4844]">
                سامانه هوشمند تحلیل و ساده‌سازی ابلاغیه قضایی
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPrivacyOpen(true)}
                className="text-[#5A6D52] hover:text-[#3D4839] font-medium underline underline-offset-4 cursor-pointer"
              >
                بیانیه حقوقی، سلب مسئولیت و حفظ حریم خصوصی
              </button>
            </div>
          </div>

          <div className="p-3 bg-[#FAF8F5] border border-[#EBE8E0] rounded-2xl text-[11px] text-[#7A7874] leading-relaxed flex items-start gap-2.5">
            <Scale className="w-4 h-4 text-[#8B4513] shrink-0 mt-0.5" />
            <p>
              <strong>سلب مسئولیت حقوقی (ماده ۵۵ قانون وکالت):</strong> این سامانه به عنوان ابزار فناوری حقوقی (LegalTech) جهت ارتقای سواد حقوقی و درک آسان‌تر مفاد ابلاغیه‌ها طراحی شده است. تحلیل‌های تولیدشده جنبه مشورتی و آگاهی‌بخشی داشته و جایگزین مستقیم وکیل پایه یک دادگستری و تصمیمات مراجع قضایی جمهوری اسلامی ایران نمی‌باشد.
            </p>
          </div>
        </div>
      </footer>

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectHistoryItem={handleSelectHistoryItem}
        onClearHistory={handleClearHistory}
        onDeleteHistoryItem={handleDeleteHistoryItem}
      />

      {/* Privacy Notice Modal */}
      <PrivacyNoticeModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
      {/* Coin Purchase Modal (Native Android only) */}
      {Capacitor.isNativePlatform() && (
        <CoinPurchaseModal
          isOpen={isCoinModalOpen}
          onClose={() => setIsCoinModalOpen(false)}
          deviceId={deviceId}
          isPremium={isPremium}
          freeTokens={freeTokens}
          dailyRemaining={dailyRemaining}
          dailyUsed={dailyUsed}
          onSuccessUpdate={(tokens, premium) => {
            setFreeTokens(tokens);
            setIsPremium(premium);
            setShowPremiumPrompt(false);
            if (deviceId) fetchDeviceStatus(deviceId);
          }}
        />
      )}

      {/* Web Paywall Modal (Web only) */}
      {!Capacitor.isNativePlatform() && (
        <WebPaywallModal
          isOpen={isWebPaywallOpen}
          onClose={() => {
            setIsWebPaywallOpen(false);
            setAutoTriggerWebProduct(null);
          }}
          deviceId={deviceId}
          webUser={webUser}
          hasSingleEntitlement={hasSingleEntitlement}
          onRequireAuth={(product) => {
            setPendingWebProduct(product);
            setIsWebPaywallOpen(false);
            setIsAuthModalOpen(true);
          }}
          autoTriggerProduct={autoTriggerWebProduct}
          onAutoTriggerHandled={() => setAutoTriggerWebProduct(null)}
        />
      )}

      {/* Defense Draft Modal */}
      {currentAnalysis && (
        <DefenseDraftModal
          isOpen={isDefenseDraftOpen}
          onClose={() => setIsDefenseDraftOpen(false)}
          analysis={currentAnalysis}
        />
      )}

      {/* Web-only Auth Modal */}
      {!Capacitor.isNativePlatform() && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => {
            setIsAuthModalOpen(false);
            setPendingWebProduct(null);
          }}
          onAuthSuccess={(user) => {
            setWebUser(user);
            setWebAuthNotice(null);
            if (pendingWebProduct) {
              const targetProduct = pendingWebProduct;
              setPendingWebProduct(null);
              setAutoTriggerWebProduct(targetProduct);
              setIsWebPaywallOpen(true);
            }
          }}
        />
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 left-6 p-3 rounded-full bg-[#4A4844] text-[#FAF8F5] shadow-lg hover:bg-[#3D3B38] transition-all z-40 print:hidden cursor-pointer"
          title="بازگشت به بالای صفحه"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
