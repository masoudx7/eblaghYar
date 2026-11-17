import React, { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  X,
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  webLogin,
  webRegister,
  webForgotPassword,
  webUpdatePassword,
  webFetchMe,
  fetchWebConfig,
  WebUserProfile,
} from "../services/webAuth";

export type AuthTab = "login" | "register" | "forgot" | "recovery";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AuthTab;
  onAuthSuccess: (user: WebUserProfile) => void;
  onPasswordUpdated?: (message: string) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = "login",
  onAuthSuccess,
  onPasswordUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Optional Cloudflare Turnstile CAPTCHA state
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
      setTurnstileToken(null);
      if (initialTab === "recovery") {
        setPassword("");
        setConfirmPassword("");
      }
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || Capacitor.isNativePlatform()) return;
    let cancelled = false;
    fetchWebConfig().then((cfg) => {
      if (!cancelled) {
        setTurnstileSiteKey(cfg.turnstileSiteKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Mount / unmount Turnstile widget on register / forgot tabs if configured
  useEffect(() => {
    const needsTurnstile = Boolean(
      isOpen &&
      turnstileSiteKey &&
      (activeTab === "register" || activeTab === "forgot")
    );

    const cleanupWidget = () => {
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
      setTurnstileToken(null);
    };

    if (!needsTurnstile) {
      cleanupWidget();
      return;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile || !turnstileSiteKey) {
        return;
      }
      cleanupWidget();
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        theme: "light",
        language: "fa",
        callback: (token: string) => {
          setTurnstileToken(token);
        },
        "expired-callback": () => {
          setTurnstileToken(null);
        },
        "error-callback": () => {
          setTurnstileToken(null);
        },
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src*="challenges.cloudflare.com/turnstile"]'
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = renderWidget;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", renderWidget);
        return () => {
          cancelled = true;
          existingScript.removeEventListener("load", renderWidget);
          cleanupWidget();
        };
      }
    }

    return () => {
      cancelled = true;
      cleanupWidget();
    };
  }, [isOpen, activeTab, turnstileSiteKey]);

  if (!isOpen) return null;

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
    setTurnstileToken(null);
  };

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (activeTab === "recovery") {
      if (password.length < 8) {
        setErrorMsg("رمز عبور جدید باید حداقل ۸ کاراکتر باشد.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("تکرار رمز عبور با رمز عبور جدید مطابقت ندارد.");
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await webUpdatePassword(password);
        const profile = await webFetchMe();
        if (profile) {
          onAuthSuccess(profile);
        }
        onPasswordUpdated?.(res.message);
        setSuccessMsg(res.message);
        setPassword("");
        setConfirmPassword("");
      } catch (err: any) {
        setErrorMsg(err?.message || "تغییر رمز عبور ناموفق بود.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    if (!validateEmail(trimmedEmail)) {
      setErrorMsg("لطفاً یک نشانی ایمیل معتبر وارد کنید.");
      return;
    }

    if (activeTab === "register") {
      if (!trimmedName || trimmedName.length < 2) {
        setErrorMsg("لطفاً نام و نام خانوادگی خود را (حداقل ۲ حرف) وارد کنید.");
        return;
      }
      if (password.length < 8) {
        setErrorMsg("رمز عبور باید حداقل ۸ کاراکتر باشد.");
        return;
      }
    } else if (activeTab === "login") {
      if (!password) {
        setErrorMsg("لطفاً رمز عبور خود را وارد کنید.");
        return;
      }
    }

    if (turnstileSiteKey && (activeTab === "register" || activeTab === "forgot") && !turnstileToken) {
      setErrorMsg("لطفاً تأییدیه امنیتی (من ربات نیستم) را تکمیل کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeTab === "login") {
        const res = await webLogin(trimmedEmail, password);
        if (res.user) {
          onAuthSuccess(res.user);
          onClose();
        }
      } else if (activeTab === "register") {
        const res = await webRegister(trimmedName, trimmedEmail, password, turnstileToken);
        if (!res.requiresEmailVerification && res.user) {
          onAuthSuccess(res.user);
          onClose();
        } else {
          setSuccessMsg(
            res.message ||
              "ثبت‌نام انجام شد. لینک تأیید به ایمیل شما ارسال گردید؛ پس از کلیک روی لینک ایمیل می‌توانید وارد شوید."
          );
          setPassword("");
        }
      } else if (activeTab === "forgot") {
        const res = await webForgotPassword(trimmedEmail, turnstileToken);
        setSuccessMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.");
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
          setTurnstileToken(null);
        } catch {
          // ignore
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#E5E2D9] relative overflow-hidden text-right">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-slate-900 via-blue-600 to-slate-800" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shadow-xs shrink-0">
              {activeTab === "login" && <LogIn className="w-5 h-5" />}
              {activeTab === "register" && <UserPlus className="w-5 h-5" />}
              {(activeTab === "forgot" || activeTab === "recovery") && <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-[#3D3B38]">
                {activeTab === "login" && "ورود به حساب ابلاغ‌یار"}
                {activeTab === "register" && "ساخت حساب کاربری وب"}
                {activeTab === "forgot" && "بازیابی رمز عبور"}
                {activeTab === "recovery" && "تنظیم رمز عبور جدید"}
              </h2>
              <p className="text-xs text-[#7A7874] mt-0.5">
                {activeTab === "login" && "برای دسترسی به اعتبار و اشتراک وب خود وارد شوید"}
                {activeTab === "register" && "فقط با ایمیل و رمز عبور (بدون نیاز به شماره موبایل)"}
                {activeTab === "forgot" && "لینک تغییر رمز عبور به ایمیل شما ارسال می‌شود"}
                {activeTab === "recovery" && "لینک بازیابی تأیید شد؛ رمز عبور جدید حساب را تعیین کنید"}
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

        {/* Tabs */}
        {activeTab !== "recovery" && (
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#FAF8F5] border border-[#E5E2D9] rounded-2xl mb-5">
            <button
              type="button"
              onClick={() => switchTab("login")}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "login"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              ورود
            </button>
            <button
              type="button"
              onClick={() => switchTab("register")}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "register"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              ثبت‌نام
            </button>
            <button
              type="button"
              onClick={() => switchTab("forgot")}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "forgot"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              فراموشی رمز
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#8B4513]" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "recovery" ? (
            <>
              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-1.5">
                  رمز عبور جدید
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="حداقل ۸ کاراکتر"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    className="w-full pr-10 pl-10 py-2.5 text-sm text-left bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 text-slate-900 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-1.5">
                  تکرار رمز عبور جدید
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="تکرار رمز عبور جدید"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    className="w-full pr-10 pl-3.5 py-2.5 text-sm text-left bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 text-slate-900 transition-all"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {activeTab === "register" && (
                <div>
                  <label className="block text-xs font-bold text-[#4A4844] mb-1.5">
                    نام و نام خانوادگی
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="مثلاً: علی رضایی"
                      required
                      disabled={isSubmitting}
                      className="w-full pr-10 pl-3.5 py-2.5 text-sm bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 text-slate-900 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-1.5">
                  ایمیل
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    disabled={isSubmitting}
                    className="w-full pr-10 pl-3.5 py-2.5 text-sm text-left bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 text-slate-900 transition-all"
                  />
                </div>
              </div>

              {activeTab !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#4A4844]">
                      رمز عبور
                    </label>
                    {activeTab === "login" && (
                      <button
                        type="button"
                        onClick={() => switchTab("forgot")}
                        className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                      >
                        رمز عبور را فراموش کرده‌اید؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={activeTab === "register" ? "حداقل ۸ کاراکتر" : "••••••••"}
                      required
                      minLength={activeTab === "register" ? 8 : undefined}
                      disabled={isSubmitting}
                      className="w-full pr-10 pl-10 py-2.5 text-sm text-left bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 text-slate-900 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                      aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {activeTab === "register" && (
                    <p className="text-[11px] text-[#7A7874] mt-1">
                      رمز عبور باید حداقل ۸ کاراکتر و ترکیبی مطمئن باشد.
                    </p>
                  )}
                </div>
              )}

              {turnstileSiteKey && (activeTab === "register" || activeTab === "forgot") && (
                <div className="flex justify-center pt-1">
                  <div ref={turnstileContainerRef} />
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال پردازش...</span>
              </>
            ) : (
              <>
                {activeTab === "login" && (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>ورود به حساب</span>
                  </>
                )}
                {activeTab === "register" && (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>ثبت‌نام و ارسال لینک تأیید</span>
                  </>
                )}
                {activeTab === "forgot" && (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>ارسال لینک بازیابی رمز</span>
                  </>
                )}
                {activeTab === "recovery" && (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>ثبت رمز عبور جدید</span>
                  </>
                )}
              </>
            )}
          </button>

          {activeTab === "recovery" && successMsg && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              ادامه در سامانه ابلاغ‌یار
            </button>
          )}
        </form>

        <div className="mt-5 pt-4 border-t border-[#EBE8E0] text-center text-[11px] text-[#7A7874] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>احراز هویت امن بدون شماره موبایل و پیامک</span>
        </div>
      </div>
    </div>
  );
};
