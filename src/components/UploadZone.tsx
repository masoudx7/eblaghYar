import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Type,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  ShieldCheck,
  EyeOff,
  Sliders,
  Scale,
  SunMedium,
} from "lucide-react";
import { SAMPLE_NOTICES, SampleNotice } from "../sampleData";

interface UploadZoneProps {
  onAnalyze: (fileBase64: string | null, mimeType: string | null, rawText: string | null, fileName: string) => void;
  onSelectSample: (sample: SampleNotice) => void;
  isLoading: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onAnalyze,
  onSelectSample,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");
  const [textInput, setTextInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isEnhancingImage, setIsEnhancingImage] = useState(false);
  const [isImageEnhanced, setIsImageEnhanced] = useState(false);
  const [isPrivacyShieldActive, setIsPrivacyShieldActive] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to mask sensitive information (National ID, Phone numbers, case party names)
  const maskSensitiveText = (text: string): string => {
    // Mask 10-digit National IDs (Persian and English digits)
    let masked = text.replace(/(?:\b|\s)[0-9]{10}(?:\b|\s)/g, " [کد ملی محفوظ] ");
    masked = masked.replace(/(?:\b|\s)[۰-۹]{10}(?:\b|\s)/g, " [کد ملی محفوظ] ");
    // Mask mobile numbers
    masked = masked.replace(/(?:09|۰۹)[0-9۰-۹]{9}/g, " [شماره همراه محفوظ] ");
    return masked;
  };

  // Transparent client-side image compressor for high-res camera photos to stay safely within Vercel 4.5MB payload limit
  const compressImageIfNeeded = (dataUrl: string, mimeType: string): Promise<string> => {
    return new Promise((resolve) => {
      if (!mimeType.startsWith("image/") || dataUrl.length < 3.2 * 1024 * 1024) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 2048;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  // Enhance image contrast via canvas for blurry or faint scanner prints
  const enhanceImageContrast = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;

          // Increase contrast and binarize faint text
          for (let i = 0; i < d.length; i += 4) {
            const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // Stretch contrast
            const contrast = 1.35;
            const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
            const newVal = Math.min(255, Math.max(0, factor * (avg - 128) + 128));

            d[i] = newVal;     // R
            d[i + 1] = newVal; // G
            d[i + 2] = newVal; // B
          }
          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  const handleApplyImageEnhancement = async () => {
    if (!selectedFileBase64 || !selectedMimeType?.startsWith("image/")) return;
    setIsEnhancingImage(true);
    try {
      const enhanced = await enhanceImageContrast(selectedFileBase64);
      setSelectedFileBase64(enhanced);
      setIsImageEnhanced(true);
    } finally {
      setIsEnhancingImage(false);
    }
  };

  const handleFileProcess = (file: File) => {
    setFileError(null);
    setIsImageEnhanced(false);

    const validTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
    ];

    if (!validTypes.includes(file.type) && !file.name.endsWith(".pdf")) {
      setFileError("لطفاً یک فایل PDF یا تصویر (JPG/PNG) بارگذاری کنید.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setFileError("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد.");
      return;
    }

    const mime = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    setSelectedFileName(file.name);
    setSelectedMimeType(mime);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      if (mime.startsWith("image/")) {
        try {
          const optimized = await compressImageIfNeeded(base64, mime);
          setSelectedFileBase64(optimized);
        } catch {
          setSelectedFileBase64(base64);
        }
      } else {
        if (file.size > 4.5 * 1024 * 1024) {
          setFileError(
            "حجم فایل PDF برای پردازش ابری بیش از ۴.۵ مگابایت است. لطفاً فایل با حجم کمتر یا تصویر صفحه‌ی اصلی ابلاغیه را بارگذاری کنید یا متن آن را در برگه «ورود مستقیم متن» قرار دهید."
          );
          return;
        }
        setSelectedFileBase64(base64);
      }
    };
    reader.onerror = () => {
      setFileError("خطا در خواندن فایل. لطفاً مجدداً تلاش کنید.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleStartAnalysis = () => {
    if (activeTab === "file") {
      if (!selectedFileBase64 || !selectedMimeType) {
        setFileError("لطفاً ابتدا فایل ابلاغیه را انتخاب کنید.");
        return;
      }
      onAnalyze(
        selectedFileBase64,
        selectedMimeType,
        null,
        selectedFileName || "ابلاغیه قضایی"
      );
    } else {
      if (!textInput.trim()) {
        setFileError("لطفاً متن ابلاغیه را وارد کنید.");
        return;
      }
      const textToAnalyze = isPrivacyShieldActive
        ? maskSensitiveText(textInput.trim())
        : textInput.trim();

      onAnalyze(null, null, textToAnalyze, "متن ابلاغیه قضایی");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Introduction Card */}
      <div className="bg-[#3D4839] text-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#52604D] relative overflow-hidden">
        <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-[#7A8C70]/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7A8C70]/30 border border-[#96A78D]/40 text-[#E2EBE0] text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#C4D5BD]" />
              <span>ابلاغ‌یار • دستیار هوشمند حقوقی و ابلاغیه‌های ثنا</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/20 text-[#D6D2C9] text-[11px]">
              <Scale className="w-3 h-3 text-[#A3B899]" />
              <span>مطابق آیین دادرسی و قوانین جاری ۱۴۰۵</span>
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mb-2 text-[#FAF8F5]">
            ابلاغیه دادگاه دریافت کرده‌اید و سردرگم هستید؟
          </h2>
          <p className="text-[#D6D2C9] text-sm sm:text-base leading-relaxed max-w-2xl">
            فایل PDF یا عکس ابلاغیه سامانه ثنا را بارگذاری کنید؛ در کمتر از ۵ ثانیه متوجه شوید شاکی هستید یا متهم، چند روز مهلت دارید، عواقب نرفتن چیست و برای دفاع چه باید بکنید.
          </p>
        </div>
      </div>

      {/* Main Upload Box */}
      <div className="bg-white rounded-3xl border border-[#E5E2D9] shadow-sm overflow-hidden">
        {/* Tab switch */}
        <div className="flex border-b border-[#E5E2D9] bg-[#FAF8F5] p-1 sm:p-1.5 gap-1">
          <button
            id="tab-file-upload"
            onClick={() => {
              setActiveTab("file");
              setFileError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-4 text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl transition-all cursor-pointer ${
              activeTab === "file"
                ? "bg-white text-[#3D3B38] shadow-xs border border-[#E5E2D9]"
                : "text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED]"
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A8C70]" />
            <span className="truncate">بارگذاری PDF یا تصویر</span>
          </button>

          <button
            id="tab-text-paste"
            onClick={() => {
              setActiveTab("text");
              setFileError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-4 text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl transition-all cursor-pointer ${
              activeTab === "text"
                ? "bg-white text-[#3D3B38] shadow-xs border border-[#E5E2D9]"
                : "text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED]"
            }`}
          >
            <Type className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A8C70]" />
            <span className="truncate">کپی و درج متن ابلاغیه</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-8">
          {activeTab === "file" ? (
            <div className="space-y-4">
              <div
                id="file-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 sm:p-10 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-[#7A8C70] bg-[#F0F4EF]"
                    : selectedFileName
                    ? "border-[#7A8C70] bg-[#F0F4EF]/60"
                    : "border-[#D1CEC4] hover:border-[#7A8C70] bg-[#FBFAF7] hover:bg-[#F3F1ED]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {selectedFileName ? (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#E2EBE0] text-[#5A6D52] flex items-center justify-center shadow-xs">
                      <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-[#3D3B38] text-sm sm:text-base break-all px-2">{selectedFileName}</p>
                      <p className="text-xs text-[#5A6D52] mt-0.5">فایل با موفقیت آماده تحلیل شد</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="text-xs text-[#7A7874] hover:text-[#3D3B38] underline mt-1 cursor-pointer"
                    >
                      تغییر فایل انتخابی
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#E2EBE0] text-[#7A8C70] flex items-center justify-center transition-transform hover:scale-105 shadow-xs">
                      <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-[#3D3B38] text-base sm:text-lg">
                        برای انتخاب فایل یا عکس ابلاغیه لمس کنید
                      </p>
                      <p className="text-xs sm:text-sm text-[#7A7874] mt-1 leading-relaxed">
                        پشتیبانی از PDF ثنا، اسکرین‌شات و تصاویر گوشی
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F0F4EF] border border-[#D5DFD0] rounded-xl text-xs font-bold text-[#5A6D52] mt-1 shadow-2xs">
                      <FileText className="w-3.5 h-3.5 text-[#7A8C70]" />
                      <span>انتخاب از حافظه گوشی یا رایانه</span>
                    </div>
                  </div>
                )}
              </div>

              {/* OCR Image Enhancer Helper (If image uploaded) */}
              {selectedFileName && selectedMimeType?.startsWith("image/") && (
                <div className="p-4 bg-[#FAF8F5] border border-[#EBE8E0] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#E2EBE0] text-[#5A6D52] flex items-center justify-center shrink-0">
                      <SunMedium className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#3D3B38]">
                        بهبود هوشمند کنتراست تصویر (OCR Boost)
                      </p>
                      <p className="text-[11px] text-[#7A7874]">
                        مناسب برای برگه‌های کم‌نور، پرینت‌های کم‌رنگ یا عکس‌های تار موبایل
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyImageEnhancement}
                    disabled={isEnhancingImage || isImageEnhanced}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isImageEnhanced
                        ? "bg-[#E2EBE0] text-[#5A6D52] border border-[#D5DFD0]"
                        : "bg-[#7A8C70] hover:bg-[#68795F] text-white shadow-2xs"
                    }`}
                  >
                    {isEnhancingImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>در حال شفاف‌سازی...</span>
                      </>
                    ) : isImageEnhanced ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>کنتراست تقویت شد</span>
                      </>
                    ) : (
                      <>
                        <Sliders className="w-3.5 h-3.5" />
                        <span>شفاف‌سازی و پررنگ کردن خطوط</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="notice-text-input" className="block text-sm font-semibold text-[#4A4844]">
                  متن کامل ابلاغیه یا پیامک قضایی را در کادر زیر جای‌گذاری کنید:
                </label>

                {/* Privacy Shield Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPrivacyShieldActive}
                    onChange={(e) => setIsPrivacyShieldActive(e.target.checked)}
                    className="w-4 h-4 text-[#7A8C70] rounded-md border-gray-300 focus:ring-[#7A8C70]"
                  />
                  <span className="text-xs font-bold text-[#5A6D52] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#7A8C70]" />
                    <span>سپر محرمانگی کدملی و شماره تماس</span>
                  </span>
                </label>
              </div>

              <textarea
                id="notice-text-input"
                rows={7}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="مثال: پیرو ابلاغیه شماره ... در پرونده کلاسه ... مقرر است ظرف مهلت ۵ روز جهت اخذ توضیح در شعبه ... حاضر شوید ..."
                className="w-full rounded-2xl border border-[#D1CEC4] bg-[#FBFAF7] p-4 text-sm text-[#3D3B38] placeholder:text-[#A8A59D] focus:outline-hidden focus:ring-2 focus:ring-[#7A8C70]/30 focus:border-[#7A8C70] font-sans leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-[#7A7874]">
                <span>می‌توانید متن را مستقیماً از پیامک ثنا یا سامانه عدل‌ایران کپی کنید.</span>
                {isPrivacyShieldActive && textInput.length > 0 && (
                  <span className="text-[#5A6D52] font-semibold flex items-center gap-1">
                    <EyeOff className="w-3 h-3" />
                    <span>کدملی و شماره‌ها خودکار فیلتر می‌شوند</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {fileError && (
            <div className="mt-4 p-3.5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs sm:text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#8B4513]" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Privacy & Legal Shield Info Banner */}
          <div className="mt-6 bg-[#FDFCFB] border border-[#F0EEE9] p-4 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#F0F4EF] text-[#5A6D52] rounded-xl flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4.5 h-4.5 text-[#7A8C70]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-[#3D3B38]">
                    پروتکل امنیت داده و محرمانگی (Ephemeral Processing)
                  </p>
                  <span className="text-[10px] bg-[#E2EBE0] text-[#5A6D52] px-2 py-0.2 rounded-full font-bold">
                    رمزنگاری‌شده
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#7A7874] mt-0.5">
                  اسناد و تصاویر در حافظه موقت پردازش شده و در دیتابیس عمومی ذخیره نمی‌شوند. اطلاعات هویتی محرمانه باقی می‌مانند.
                </p>
              </div>
            </div>

            {/* Article 55 Regulatory compliance note */}
            <div className="pt-2 border-t border-[#F0EEE9] flex items-center gap-2 text-[11px] text-[#8C8982]">
              <Scale className="w-3.5 h-3.5 text-[#7A8C70] shrink-0" />
              <span>
                <strong>مطابق ماده ۵۵ قانون وکالت:</strong> این سامانه ابزار پردازش متن و محاسبه مواعد است؛ بررسی تخصصی پرونده و دادخواست‌ها توسط وکلای پایه یک دادگستری انجام می‌شود.
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex justify-end">
            <button
              id="start-analysis-btn"
              onClick={handleStartAnalysis}
              disabled={isLoading || (activeTab === "file" && !selectedFileBase64) || (activeTab === "text" && !textInput.trim())}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 bg-[#7A8C70] hover:bg-[#68795F] disabled:bg-[#D1CEC4] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#7A8C70]/20 transition-all disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>در حال استخراج متن و تحلیل مواعد قانونی...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>تحلیل هوشمند ابلاغیه با ابلاغ‌یار</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Sample Selector */}
      <div className="bg-[#F9F7F2] border border-[#E5E2D9] rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#7A8C70]" />
            <h3 className="text-sm font-bold text-[#4A4844]">
              آزمایش سریع با نمونه‌های واقعی ابلاغیه‌های ثنا:
            </h3>
          </div>
          <span className="text-xs text-[#7A7874]">برای تست کلیک کنید</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {SAMPLE_NOTICES.map((sample) => (
            <button
              key={sample.id}
              id={`sample-btn-${sample.id}`}
              onClick={() => onSelectSample(sample)}
              className="text-right p-4 bg-white hover:bg-[#F0F4EF]/70 border border-[#E5E2D9] hover:border-[#7A8C70] rounded-2xl transition-all shadow-xs group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-[#3D3B38] group-hover:text-[#5A6D52]">
                    {sample.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FAF8F5] text-[#5C5A55] border border-[#E5E2D9]">
                    {sample.badge}
                  </span>
                </div>
                <p className="text-xs text-[#5C5A55] leading-relaxed line-clamp-2">
                  {sample.description}
                </p>
              </div>
              <div className="mt-3 text-[11px] text-[#5A6D52] font-semibold flex items-center gap-1">
                <span>مشاهده تحلیل فوری</span>
                <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

