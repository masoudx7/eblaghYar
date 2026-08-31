import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Lock,
  MessageSquareCode,
} from "lucide-react";
import { AuthUser } from "../types";

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

export const PhoneAuthModal: React.FC<PhoneAuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isDevSimulated, setIsDevSimulated] = useState<boolean>(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus input on open or step change
  useEffect(() => {
    if (isOpen) {
      if (step === "phone") {
        setTimeout(() => phoneInputRef.current?.focus(), 150);
      } else {
        setTimeout(() => otpRefs.current[0]?.focus(), 150);
      }
    }
  }, [isOpen, step]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const toPersianDigits = (str: string | number) => {
    const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(str).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Replace Persian/Arabic numerals
    const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    let clean = val;
    for (let i = 0; i < 10; i++) {
      clean = clean.replace(persianDigits[i], i.toString());
    }
    clean = clean.replace(/\D/g, "");
    if (clean.length <= 11) {
      setPhoneNumber(clean);
      setError(null);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 10) {
      setError("لطفاً شماره همراه ۱۱ رقمی معتبر وارد فرمایید (مثال: ۰۹۱۲۳۴۵۶۷۸۹)");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "خطا در ارسال کد تایید با کاوه نگار");
      }

      setMaskedPhone(data.phoneNumber || phoneNumber);
      setCountdown(data.cooldownSeconds || 60);
      setIsDevSimulated(!!data.isDevSimulated);
      if (data.devCode) {
        setDevCode(data.devCode);
      }
      setStep("otp");
      setOtpDigits(["", "", "", "", ""]);
    } catch (err: any) {
      setError(err.message || "خطا در ارسال پیامک. لطفاً دوباره تلاش کنید.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    // Convert Persian digits if any
    const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    let clean = value;
    for (let i = 0; i < 10; i++) {
      clean = clean.replace(persianDigits[i], i.toString());
    }
    clean = clean.replace(/\D/g, "");

    // If user pastes full 5-digit code
    if (clean.length > 1) {
      const digits = clean.slice(0, 5).split("");
      const newDigits = [...otpDigits];
      digits.forEach((d, i) => {
        if (i < 5) newDigits[i] = d;
      });
      setOtpDigits(newDigits);
      if (digits.length === 5) {
        submitOtp(newDigits.join(""));
      } else {
        const nextIndex = Math.min(digits.length, 4);
        otpRefs.current[nextIndex]?.focus();
      }
      return;
    }

    const singleDigit = clean.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = singleDigit;
    setOtpDigits(newDigits);
    setError(null);

    // Auto advance focus
    if (singleDigit && index < 4) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto submit if all 5 digits are filled
    if (singleDigit && index === 4) {
      const fullCode = newDigits.join("");
      if (fullCode.length === 5) {
        submitOtp(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const submitOtp = async (codeToSubmit?: string) => {
    const code = codeToSubmit || otpDigits.join("");
    if (code.length < 4) {
      setError("لطفاً کد تایید ۵ رقمی ارسال شده را به طور کامل وارد نمایید.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "کد تایید وارد شده نادرست یا منقضی شده است.");
      }

      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      setError(err.message || "خطا در تایید کد. لطفاً دوباره تلاش نمایید.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseDevCode = () => {
    if (devCode) {
      const digits = devCode.split("");
      setOtpDigits(digits);
      submitOtp(devCode);
    }
  };

  const handleResetToPhoneStep = () => {
    setStep("phone");
    setError(null);
    setDevCode(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#3D3B38]/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        id="phone-auth-modal"
        className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] max-w-md w-full overflow-hidden shadow-2xl transition-all my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 bg-[#FDFBF7] border-b border-[#EBE8E0] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
              {step === "phone" ? (
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <MessageSquareCode className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#4A4844] text-xs sm:text-base truncate">
                {step === "phone" ? "ورود با شماره همراه" : "تایید کد پیامک شده"}
              </h3>
              <p className="text-[11px] sm:text-xs text-[#7A7874] mt-0.5 truncate">
                {step === "phone"
                  ? "ارسال کد یکبار مصرف (OTP) از طریق کاوه نگار"
                  : `کد تایید به شماره ${toPersianDigits(maskedPhone)} ارسال گردید`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#EBE8E0] transition-colors cursor-pointer shrink-0"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {error && (
            <div className="p-3 sm:p-3.5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {step === "phone" ? (
            /* Step 1: Phone Input Form */
            <form onSubmit={handleSendOtp} className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-2">
                  شماره تلفن همراه شما
                </label>
                <div className="relative flex items-center">
                  <input
                    ref={phoneInputRef}
                    id="phone-number-input"
                    type="tel"
                    dir="ltr"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="09123456789"
                    maxLength={11}
                    className="w-full pl-4 pr-12 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-[#D5DFD0] focus:border-[#7A8C70] focus:ring-2 focus:ring-[#7A8C70]/20 bg-[#FAF8F5] text-[#3D3B38] font-mono text-sm sm:text-base tracking-wider outline-hidden transition-all text-left"
                    disabled={isLoading}
                  />
                  <div className="absolute right-3 flex items-center gap-1 text-xs text-[#7A7874] pointer-events-none select-none font-sans border-l border-[#E5E2D9] pl-2">
                    <span>🇮🇷</span>
                    <span className="font-bold">+۹۸</span>
                  </div>
                </div>
                <p className="text-[10px] sm:text-[11px] text-[#7A7874] mt-1.5 leading-relaxed">
                  کد تایید ۵ رقمی از طریق پیامک امن کاوه نگار به این شماره ارسال خواهد شد.
                </p>
              </div>

              <div className="p-3 sm:p-3.5 bg-[#F0F4EF] border border-[#D5DFD0] rounded-xl sm:rounded-2xl text-xs text-[#5A6D52] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#7A8C70]" />
                <span className="text-[11px] sm:text-xs">
                  اطلاعات هویتی و ابلاغیه‌های شما کاملاً محرمانه بوده و در حساب امن شما ذخیره می‌گردد.
                </span>
              </div>

              <button
                type="submit"
                id="submit-phone-btn"
                disabled={isLoading || phoneNumber.length < 10}
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl bg-[#7A8C70] hover:bg-[#68795F] disabled:bg-[#C2CCC0] text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال ارسال پیامک کاوه نگار...</span>
                  </>
                ) : (
                  <>
                    <span>دریافت کد تایید ورود</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Step 2: OTP Verification Form */
            <div className="space-y-4 sm:space-y-6">
              {isDevSimulated && devCode && (
                <div className="p-2.5 sm:p-3 bg-[#FEF9E7] border border-[#F9E79F] rounded-xl sm:rounded-2xl text-xs text-[#7D6608] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B7950B] shrink-0" />
                    <span className="text-[11px] sm:text-xs">
                      شبیه‌ساز کاوه نگار: کد تایید:{" "}
                      <strong className="font-mono text-xs sm:text-sm tracking-wider">{devCode}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleUseDevCode}
                    className="text-[11px] font-bold text-[#7A8C70] hover:underline cursor-pointer self-end sm:self-auto"
                  >
                    درج خودکار کد
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-2.5 text-center">
                  کد تایید ۵ رقمی را وارد نمایید
                </label>
                <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 dir-ltr" dir="ltr">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el;
                      }}
                      id={`otp-input-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold text-[#3D3B38] bg-[#FAF8F5] border-2 border-[#D5DFD0] focus:border-[#7A8C70] focus:bg-white focus:ring-2 focus:ring-[#7A8C70]/20 rounded-xl sm:rounded-2xl outline-hidden transition-all shadow-2xs"
                      disabled={isLoading}
                    />
                  ))}
                </div>
              </div>

              {/* Countdown & Resend */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handleResetToPhoneStep}
                  className="text-[#7A7874] hover:text-[#3D3B38] hover:underline flex items-center gap-1 cursor-pointer text-[11px] sm:text-xs"
                >
                  <span>ویرایش شماره ({toPersianDigits(maskedPhone)})</span>
                </button>

                {countdown > 0 ? (
                  <span className="text-[#7A7874] font-medium text-[11px] sm:text-xs">
                    ارسال مجدد تا{" "}
                    <span className="font-bold font-mono text-[#7A8C70]">
                      {toPersianDigits(countdown)}
                    </span>{" "}
                    ثانیه
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={isLoading}
                    className="text-[#7A8C70] hover:text-[#68795F] font-bold flex items-center gap-1 hover:underline cursor-pointer text-[11px] sm:text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ارسال مجدد کد</span>
                  </button>
                )}
              </div>

              {/* Submit OTP Button */}
              <button
                type="button"
                id="verify-otp-btn"
                onClick={() => submitOtp()}
                disabled={isLoading || otpDigits.join("").length < 5}
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl bg-[#7A8C70] hover:bg-[#68795F] disabled:bg-[#C2CCC0] text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال بررسی کد تایید...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تایید و ورود به سامانه</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="p-3 sm:p-4 bg-[#F8F6F1] border-t border-[#EBE8E0] text-center text-[10px] sm:text-[11px] text-[#7A7874] flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#7A8C70] shrink-0" />
          <span>ارتباط امن رمزنگاری‌شده با وب‌سرویس پیامک کاوه نگار</span>
        </div>
      </div>
    </div>
  );
};
