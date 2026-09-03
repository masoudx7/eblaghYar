import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  Copy,
  Check,
  Download,
  Printer,
  Sparkles,
  Edit3,
  ShieldCheck,
  Scale,
  Send,
  AlertCircle,
  HelpCircle,
  Clock,
  BookOpen,
  User,
  Hash,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { JudicialNoticeAnalysis, AuthUser, Lawyer } from "../types";
import {
  buildDefenseDraft,
  DefenseDraftOptions,
  GeneratedDefenseDraft,
} from "../utils/defenseDraftGenerator";
import { safeFetchJson } from "../utils/apiHelper";

interface DefenseDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: JudicialNoticeAnalysis;
  currentUser: AuthUser | null;
}

export const DefenseDraftModal: React.FC<DefenseDraftModalProps> = ({
  isOpen,
  onClose,
  analysis,
  currentUser,
}) => {
  const [draftType, setDraftType] = useState<DefenseDraftOptions["draftType"]>("defense_denial");
  const [userFullName, setUserFullName] = useState<string>("");
  const [userNationalCode, setUserNationalCode] = useState<string>("");
  const [userCustomFacts, setUserCustomFacts] = useState<string>("");
  const [customEvidenceText, setCustomEvidenceText] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"preview" | "edit" | "sections">("preview");
  const [draft, setDraft] = useState<GeneratedDefenseDraft | null>(null);
  const [editableText, setEditableText] = useState<string>("");
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Initialize draft on mount / analysis change
  useEffect(() => {
    if (isOpen && analysis) {
      const initialDraft = buildDefenseDraft(analysis, {
        draftType: "defense_denial",
        userFullName: userFullName || undefined,
        userNationalCode: userNationalCode || undefined,
      });
      setDraft(initialDraft);
      setEditableText(initialDraft.fullFormattedText);
    }
  }, [isOpen, analysis]);

  if (!isOpen || !analysis) return null;

  const handleTypeChange = (newType: DefenseDraftOptions["draftType"]) => {
    setDraftType(newType);
    const newDraft = buildDefenseDraft(analysis, {
      draftType: newType,
      userFullName: userFullName || undefined,
      userNationalCode: userNationalCode || undefined,
      userCustomFacts: userCustomFacts || undefined,
      attachedEvidences: customEvidenceText
        ? customEvidenceText.split("\n").filter((l) => l.trim().length > 0)
        : undefined,
    });
    setDraft(newDraft);
    setEditableText(newDraft.fullFormattedText);
  };

  const handleRegenerateWithAI = async () => {
    setIsGeneratingAI(true);
    setAiError(null);
    try {
      const evidences = customEvidenceText
        ? customEvidenceText.split("\n").filter((l) => l.trim().length > 0)
        : undefined;

      const data = await safeFetchJson<{ success: boolean; draft?: any; error?: string }>(
        "/api/generate-defense-draft",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis,
            draftType,
            userCustomFacts,
            userFullName,
            userNationalCode,
            attachedEvidences: evidences,
          }),
        }
      );

      if (data.success && data.draft) {
        const aiDraft = data.draft;
        const formatted: GeneratedDefenseDraft = {
          id: `ai-draft-${Date.now()}`,
          draftType,
          typeTitle: aiDraft.title || "لایحه دفاعیه",
          recipientAuthority: aiDraft.recipientAuthority || analysis.caseDetails.issuingAuthority,
          subjectLine: aiDraft.title || "لایحه دفاعیه",
          caseIdentifiers: {
            caseNumber: analysis.caseDetails.caseNumber || "[شماره پرونده]",
            archiveNumber: analysis.caseDetails.archiveNumber || "[بایگانی]",
            noticeNumber: analysis.caseDetails.noticeNumber || "[شماره ابلاغیه]",
          },
          parties: {
            petitioner: userFullName || "[نام کاربر]",
            respondentOrPlaintiff: analysis.caseDetails.otherParties?.[0] || "طرف مقابل",
          },
          preamble: aiDraft.preamble || "",
          legalArguments: aiDraft.legalArguments || [],
          statutoryReferences: aiDraft.statutoryReferences || [],
          petitionsAndRequests: aiDraft.petitionsAndRequests || [],
          attachmentsList: aiDraft.attachmentsList || [],
          closingGreeting: "با تشکر و احترام",
          fullFormattedText: aiDraft.fullFormattedText,
          lawyerReviewAdvice: aiDraft.lawyerReviewAdvice || "بررسی نهایی توسط وکیل دادگستری الزامی است.",
        };

        setDraft(formatted);
        setEditableText(aiDraft.fullFormattedText);
      } else {
        throw new Error(data.error || "خطا در تنظیم لایحه با هوش مصنوعی");
      }
    } catch (err: any) {
      console.warn("AI draft generation fallback to local builder:", err);
      setAiError("ارتباط مستقیم با سرور هوش مصنوعی ناموفق بود؛ نسخه الگوی هوشمند محلی اعمال گردید.");
      const localDraft = buildDefenseDraft(analysis, {
        draftType,
        userFullName: userFullName || undefined,
        userNationalCode: userNationalCode || undefined,
        userCustomFacts: userCustomFacts || undefined,
      });
      setDraft(localDraft);
      setEditableText(localDraft.fullFormattedText);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([editableText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layehe-defaie-${analysis.caseDetails.caseNumber || "eblagh"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="fa">
        <head>
          <title>پیش‌نویس لایحه قضایی</title>
          <style>
            body { font-family: Tahoma, 'B Nazanin', sans-serif; padding: 40px; line-height: 2; font-size: 14pt; color: #000; }
            .header { text-align: center; margin-bottom: 30px; font-weight: bold; }
            .content { white-space: pre-wrap; text-align: justify; }
            .footer { margin-top: 50px; text-align: left; }
          </style>
        </head>
        <body>
          <div class="content">${editableText}</div>
          <script>window.print();</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-[#E5E2D9] my-auto flex flex-col max-h-[94vh] sm:max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#FAF8F5] border-b border-[#E5E2D9] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#7A8C70]/15 text-[#5A6D52] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-sm sm:text-lg font-bold text-[#4A4844] truncate">
                  تنظیم هوشمند پیش‌نویس لایحه دفاعیه
                </h3>
                <span className="hidden xs:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6EC] text-[#8F7732] border border-[#EBE4CF]">
                  فرم استاندارد دادگستری
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#7A7874] truncate hidden sm:block">
                تولید ساختار اولیه لایحه مستند به مواد قانونی جهت ویرایش، چاپ و بررسی نهایی توسط وکیل
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#7A7874] hover:text-[#4A4844] hover:bg-[#E5E2D9]/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar: Draft Types & Inputs */}
        <div className="p-3 sm:p-4 bg-[#FAF8F5]/50 border-b border-[#E5E2D9] space-y-3 shrink-0 overflow-y-auto max-h-56">
          {/* Select Type Buttons */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-[#5C5A55] mb-1.5">
              نوع لایحه یا پاسخ مورد نظر:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange("defense_denial")}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-center border transition-all cursor-pointer ${
                  draftType === "defense_denial"
                    ? "bg-[#7A8C70] text-white border-[#7A8C70] shadow-2xs"
                    : "bg-white text-[#5C5A55] border-[#E5E2D9] hover:bg-[#F0F4EF]"
                }`}
              >
                رد ادعا و دفاع ماهوی
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange("extension_request")}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-center border transition-all cursor-pointer ${
                  draftType === "extension_request"
                    ? "bg-[#7A8C70] text-white border-[#7A8C70] shadow-2xs"
                    : "bg-white text-[#5C5A55] border-[#E5E2D9] hover:bg-[#F0F4EF]"
                }`}
              >
                اعلام حضور و تقاضای مهلت
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange("procedural_objection")}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-center border transition-all cursor-pointer ${
                  draftType === "procedural_objection"
                    ? "bg-[#7A8C70] text-white border-[#7A8C70] shadow-2xs"
                    : "bg-white text-[#5C5A55] border-[#E5E2D9] hover:bg-[#F0F4EF]"
                }`}
              >
                ایراد عدم صلاحیت و نقص ادله
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange("settlement_proposal")}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-center border transition-all cursor-pointer ${
                  draftType === "settlement_proposal"
                    ? "bg-[#7A8C70] text-white border-[#7A8C70] shadow-2xs"
                    : "bg-white text-[#5C5A55] border-[#E5E2D9] hover:bg-[#F0F4EF]"
                }`}
              >
                پیشنهاد سازش و شورا
              </button>
            </div>
          </div>

          {/* Quick Customization Collapsible Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div>
              <label className="text-[10px] sm:text-[11px] font-bold text-[#7A7874] block mb-1">
                نام و نام خانوادگی متقاضی:
              </label>
              <input
                type="text"
                value={userFullName}
                onChange={(e) => setUserFullName(e.target.value)}
                placeholder="مثلاً: علی محمدی"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-[#E5E2D9] bg-white focus:outline-hidden focus:border-[#7A8C70]"
              />
            </div>

            <div>
              <label className="text-[10px] sm:text-[11px] font-bold text-[#7A7874] block mb-1">
                کد ملی:
              </label>
              <input
                type="text"
                value={userNationalCode}
                onChange={(e) => setUserNationalCode(e.target.value)}
                placeholder="مثلاً: ۰۰۱۲۳۴۵۶۷۸"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-[#E5E2D9] bg-white focus:outline-hidden focus:border-[#7A8C70] font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] sm:text-[11px] font-bold text-[#7A7874] block mb-1">
                دفاعیات خاص یا شرح ماجرا (اختیاری):
              </label>
              <input
                type="text"
                value={userCustomFacts}
                onChange={(e) => setUserCustomFacts(e.target.value)}
                placeholder="توضیح کوتاه دلیل عدم پذیرش ادعا..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-[#E5E2D9] bg-white focus:outline-hidden focus:border-[#7A8C70]"
              />
            </div>
          </div>
        </div>

        {/* Main Body: Tabs & Content */}
        <div className="flex-1 p-3.5 sm:p-5 overflow-y-auto space-y-3 sm:space-y-4">
          {/* Subheader & AI Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[#E5E2D9] overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === "preview"
                    ? "bg-white text-[#4A4844] shadow-2xs"
                    : "text-[#7A7874] hover:text-[#4A4844]"
                }`}
              >
                پیش‌نمایش لایحه
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  activeTab === "edit"
                    ? "bg-white text-[#4A4844] shadow-2xs"
                    : "text-[#7A7874] hover:text-[#4A4844]"
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>ویرایش متن</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("sections")}
                className={`px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === "sections"
                    ? "bg-white text-[#4A4844] shadow-2xs"
                    : "text-[#7A7874] hover:text-[#4A4844]"
                }`}
              >
                اجزای ساختاری و مواد قانونی
              </button>
            </div>

            <button
              type="button"
              id="btn-ai-regenerate-draft"
              disabled={isGeneratingAI}
              onClick={handleRegenerateWithAI}
              className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[#FAF6EC] hover:bg-[#F4EEDC] text-[#8F7732] border border-[#EBE4CF] text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              {isGeneratingAI ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#8F7732]" />
              )}
              <span>{isGeneratingAI ? "در حال تنظیم با هوش مصنوعی..." : "تنظیم پیشرفته با هوش مصنوعی"}</span>
            </button>
          </div>

          {aiError && (
            <div className="p-3 rounded-xl bg-[#FAF6EC] border border-[#EBE4CF] text-xs text-[#8F7732] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          {/* Lawyer Advice Warning Box */}
          {draft?.lawyerReviewAdvice && (
            <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#F0F4EF] border border-[#D5DFD0] flex items-start gap-2 text-xs text-[#3D4839]">
              <ShieldCheck className="w-4 h-4 text-[#7A8C70] shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-[#3D4839] block mb-0.5">توصیه مهم وکیل دادگستری قبل از ثبت لایحه:</strong>
                <span>{draft.lawyerReviewAdvice}</span>
              </div>
            </div>
          )}

          {/* Tab 1: Preview */}
          {activeTab === "preview" && (
            <div className="relative">
              <div className="p-4 sm:p-6 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] font-mono text-xs sm:text-sm text-[#3D3B38] leading-loose whitespace-pre-wrap selection:bg-[#7A8C70]/30 shadow-inner overflow-x-auto">
                {editableText}
              </div>
            </div>
          )}

          {/* Tab 2: Direct Editor */}
          {activeTab === "edit" && (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-[11px] sm:text-xs text-[#7A7874]">
                <span>متن را مستقیماً ویرایش کرده و نام‌ها یا توضیحات مورد نظر را جایگزین فرمایید:</span>
                <span>{editableText.length.toLocaleString("fa-IR")} کاراکتر</span>
              </div>
              <textarea
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                rows={12}
                className="w-full p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E5E2D9] bg-white font-mono text-xs sm:text-sm text-[#3D3B38] leading-relaxed focus:outline-hidden focus:border-[#7A8C70] focus:ring-1 focus:ring-[#7A8C70]"
              />
            </div>
          )}

          {/* Tab 3: Structural Breakdown */}
          {activeTab === "sections" && draft && (
            <div className="space-y-3 sm:space-y-4">
              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] space-y-2.5">
                <h4 className="text-xs font-bold text-[#4A4844] flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-[#7A8C70]" />
                  <span>استناد به مواد قانونی موضوعه:</span>
                </h4>
                <ul className="space-y-1.5 text-xs text-[#5C5A55]">
                  {draft.statutoryReferences.map((ref, i) => (
                    <li key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-[#F0EEE9]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7A8C70]"></span>
                      <strong className="text-[#3D4839]">{ref}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] space-y-2.5">
                <h4 className="text-xs font-bold text-[#4A4844] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#7A8C70]" />
                  <span>بندهای اصلی استدلال و دفاع:</span>
                </h4>
                <div className="space-y-2 text-xs text-[#5C5A55]">
                  {draft.legalArguments.map((arg, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-white border border-[#F0EEE9] leading-relaxed">
                      {arg}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] space-y-2">
                <h4 className="text-xs font-bold text-[#4A4844]">خواسته‌ها از قاضی پرونده:</h4>
                <ul className="space-y-1.5 text-xs text-[#5C5A55]">
                  {draft.petitionsAndRequests.map((req, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#5A6D52]" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-[#FAF8F5] border-t border-[#E5E2D9] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-copy-draft-modal"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-[#7A8C70] hover:bg-[#68795F] text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "کپی شد!" : "کپی متن لایحه"}</span>
            </button>

            <button
              type="button"
              id="btn-download-draft-txt"
              onClick={handleDownloadTxt}
              className="px-3 py-2 bg-white hover:bg-[#F0F4EF] text-[#5C5A55] border border-[#E5E2D9] rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>فایل متنی (.txt)</span>
            </button>

            <button
              type="button"
              id="btn-print-draft"
              onClick={handlePrint}
              className="px-3 py-2 bg-white hover:bg-[#F0F4EF] text-[#5C5A55] border border-[#E5E2D9] rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>چاپ / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
