import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  User,
  FileCheck,
  Scale,
  ListOrdered,
  BookOpen,
  FileText,
  Copy,
  Check,
  Printer,
  MessageSquare,
  Lightbulb,
  Info,
  ShieldAlert,
  HelpCircle,
  FileSearch,
  CheckSquare,
  Square,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Calendar,
  CalendarPlus,
  Download,
  ExternalLink,
} from "lucide-react";
import { JudicialNoticeAnalysis, LegalActionItem, Lawyer, AuthUser } from "../types";
import { LawyersSection } from "./LawyersSection";
import { downloadICSFile, getGoogleCalendarLink } from "../utils/calendarExport";

interface AnalysisResultProps {
  analysis: JudicialNoticeAnalysis;
  onOpenChat: () => void;
  onAskSectionQuestion?: (question: string, sectionContext: { sectionTitle: string; sectionSnippet: string }) => void;
  onOpenClauseModal?: (initialClause?: string, initialQuestion?: string, sectionTitle?: string) => void;
  onSelectLawyer?: (lawyer: Lawyer) => void;
  onOpenDefenseDraft?: () => void;
  currentUser?: AuthUser | null;
}

export const AnalysisResult: React.FC<AnalysisResultProps> = ({
  analysis,
  onOpenChat,
  onAskSectionQuestion,
  onOpenClauseModal,
  onSelectLawyer,
  onOpenDefenseDraft,
  currentUser,
}) => {
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const handleToggleStep = (stepNumber: number) => {
    setCompletedSteps((prev) =>
      prev.includes(stepNumber)
        ? prev.filter((s) => s !== stepNumber)
        : [...prev, stepNumber]
    );
  };

  const handleCopyDraft = () => {
    if (analysis.sampleDraftLayehe?.draftText) {
      navigator.clipboard.writeText(analysis.sampleDraftLayehe.draftText);
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2500);
    }
  };

  const handleCopySummary = () => {
    const textToCopy = `📌 خلاصه ابلاغیه قضایی:\n${analysis.title}\n\n📝 به زبان ساده:\n${analysis.summaryInSimpleWords}\n\n⏳ مهلت قانونی:\n${analysis.deadlines.deadlineDescription}\n\n🏛️ مرجع:\n${analysis.caseDetails.issuingAuthority}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const triggerSectionAsk = (question: string, sectionTitle: string, snippet: string) => {
    if (onAskSectionQuestion) {
      onAskSectionQuestion(question, {
        sectionTitle,
        sectionSnippet: snippet,
      });
    } else {
      onOpenChat();
    }
  };

  // Determine urgency styling with Natural Tones palette
  const urgencyConfig = {
    high: {
      bgColor: "bg-[#FAF2ED]",
      borderColor: "border-[#E8CEBF]",
      textColor: "text-[#8B4513]",
      badgeColor: "bg-[#8B4513] text-white",
      icon: AlertTriangle,
      label: "فوری و حساس (نیازمند اقدام سریع)",
    },
    medium: {
      bgColor: "bg-[#F7F4EC]",
      borderColor: "border-[#E2DCBD]",
      textColor: "text-[#6E5D2A]",
      badgeColor: "bg-[#8F7732] text-white",
      icon: Clock,
      label: "دارای مهلت مقرر (پیگیری در موعد)",
    },
    low: {
      bgColor: "bg-[#F0F4EF]",
      borderColor: "border-[#D5DFD0]",
      textColor: "text-[#5A6D52]",
      badgeColor: "bg-[#7A8C70] text-white",
      icon: Info,
      label: "اطلاع‌رسانی و روال عادی",
    },
  }[analysis.urgencyLevel || "medium"];

  const UrgencyIcon = urgencyConfig.icon;
  const totalSteps = analysis.actionItems.length;
  const completedCount = completedSteps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 print:space-y-4">
      {/* Top Action Bar */}
      <div className="bg-white border border-[#E5E2D9] p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-xs print:hidden space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#4A4844] border-b border-[#F0EEE9] pb-2.5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Scale className="w-4 h-4 text-[#7A8C70] shrink-0" />
            <span className="text-[11px] sm:text-xs">تحلیل حقوقی مستند به قوانین آیین دادرسی ایران</span>
          </div>
          <span className="text-[10px] text-[#7A7874] font-medium hidden sm:inline">ابزارهای سریع اقدام</span>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {/* Primary Action 1: Legal AI Consultation */}
          <button
            id="btn-goto-chat"
            onClick={onOpenChat}
            className="col-span-2 sm:col-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[#7A8C70] hover:bg-[#68795F] rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>مشاور حقوقی هوشمند (پرسش درباره این ابلاغیه)</span>
          </button>

          {/* Generate Defense Draft Button */}
          {onOpenDefenseDraft && (
            <button
              id="btn-open-defense-draft-top"
              onClick={onOpenDefenseDraft}
              className="col-span-2 sm:col-auto flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#5A6D52] hover:text-[#3D4839] bg-[#F0F4EF] hover:bg-[#E2EBE0] border border-[#D5DFD0] rounded-xl transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>تنظیم پیش‌نویس لایحه دفاعیه</span>
            </button>
          )}

          {/* Export to Calendar (ICS) */}
          <button
            id="btn-export-ics-top"
            onClick={() => downloadICSFile(analysis)}
            title="دانلود فایل تقویم ICS برای ذخیره موعد در تقویم گوشی یا اوت‌لوک"
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#8F7732] hover:text-[#6E5D2A] bg-[#FAF6EC] hover:bg-[#F4EEDC] border border-[#EBE4CF] rounded-xl transition-colors cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-[#8F7732]" />
            <span className="truncate">افزودن به تقویم (.ICS)</span>
          </button>

          {onOpenClauseModal && (
            <button
              id="btn-clause-inquiry-top"
              onClick={() => onOpenClauseModal("", "", "بند خاص از ابلاغیه")}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#5A6D52] hover:text-[#3D4839] bg-[#F0F4EF] hover:bg-[#E2EBE0] border border-[#D5DFD0] rounded-xl transition-colors cursor-pointer"
            >
              <FileSearch className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span className="truncate">موشکافی بند خاص</span>
            </button>
          )}

          <button
            id="btn-copy-summary"
            onClick={handleCopySummary}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#5C5A55] hover:text-[#3D3B38] hover:bg-[#F3F1ED] border border-[#E5E2D9] rounded-xl transition-colors cursor-pointer"
          >
            {copiedSummary ? <Check className="w-3.5 h-3.5 text-[#7A8C70]" /> : <Copy className="w-3.5 h-3.5 text-[#7A8C70]" />}
            <span>{copiedSummary ? "کپی شد" : "کپی خلاصه"}</span>
          </button>

          <button
            id="btn-print"
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#5C5A55] hover:text-[#3D3B38] hover:bg-[#F3F1ED] border border-[#E5E2D9] rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#7A8C70]" />
            <span>چاپ / PDF</span>
          </button>
        </div>
      </div>

      {/* Urgency & Main Title Card */}
      <div
        className={`rounded-2xl sm:rounded-3xl border p-4 sm:p-7 shadow-sm ${urgencyConfig.bgColor} ${urgencyConfig.borderColor}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${urgencyConfig.badgeColor}`}>
              <UrgencyIcon className="w-3.5 h-3.5" />
              <span>{urgencyConfig.label}</span>
            </span>
            <span className="text-xs text-[#7A7874] font-medium">
              نوع پرونده: {analysis.caseDetails.caseType}
            </span>
          </div>
          {analysis.caseDetails.noticeDate && (
            <span className="text-xs text-[#7A7874]">
              تاریخ ابلاغ / صدور: {analysis.caseDetails.noticeDate}
            </span>
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-[#4A4844] mb-4 leading-snug">
          {analysis.title}
        </h2>

        {/* In Simple Words Box with border-r-4 accent */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E5E2D9] border-r-4 border-r-[#7A8C70] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#4A4844] font-bold text-sm">
              <Lightbulb className="w-4 h-4 text-[#8F7732]" />
              <span>موضوع این ابلاغیه به زبان ساده و خودمانی:</span>
            </div>

            <button
              onClick={() =>
                triggerSectionAsk(
                  "توضیحات بیشتر و جزئیات حقوقی درباره موضوع این ابلاغیه را بیان کنید.",
                  "خلاصه و تحلیل موضوع ابلاغیه",
                  analysis.summaryInSimpleWords
                )
              }
              className="text-xs font-bold text-[#5A6D52] hover:text-[#3D4839] flex items-center gap-1 hover:underline cursor-pointer print:hidden"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>پرسش درباره این موضوع</span>
            </button>
          </div>

          <p className="text-[#5C5A55] text-sm sm:text-base leading-relaxed font-normal">
            {analysis.summaryInSimpleWords}
          </p>

          {analysis.urgencyReason && (
            <div className="mt-3.5 pt-3 border-t border-[#F0EEE9] text-xs text-[#7A7874] flex items-center gap-1.5">
              <span className="font-bold text-[#5C5A55]">دلیل فوریت:</span>
              <span>{analysis.urgencyReason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Case Identity Grid */}
      <div className="bg-white rounded-3xl border border-[#E5E2D9] p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#4A4844] flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#7A8C70]" />
            <span>شناسنامه و مشخصات پرونده قضایی</span>
          </h3>

          <button
            onClick={() =>
              triggerSectionAsk(
                `نقش من در این پرونده (${analysis.caseDetails.userRole}) است. چه اختیارات، تکالیف و حقوقی در دادگاه یا دادسرا دارم؟`,
                "سمت و نقش شما در پرونده",
                `سمت: ${analysis.caseDetails.userRole} | مرجع: ${analysis.caseDetails.issuingAuthority}`
              )
            }
            className="text-xs font-bold text-[#5A6D52] hover:text-[#3D4839] flex items-center gap-1 hover:underline cursor-pointer print:hidden"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>پرسش درباره حقوق و تکالیف نقش من</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#FBFAF7] border border-[#F0EEE9]">
            <div className="flex items-center gap-1.5 text-xs text-[#7A7874] mb-1.5">
              <User className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>نقش و سمت شما</span>
            </div>
            <p className="text-sm font-bold text-[#3D4839]">
              {analysis.caseDetails.userRole}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FBFAF7] border border-[#F0EEE9]">
            <div className="flex items-center gap-1.5 text-xs text-[#7A7874] mb-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>مرجع صادرکننده</span>
            </div>
            <p className="text-sm font-bold text-[#4A4844] line-clamp-2">
              {analysis.caseDetails.issuingAuthority}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FBFAF7] border border-[#F0EEE9]">
            <div className="flex items-center gap-1.5 text-xs text-[#7A7874] mb-1.5">
              <FileText className="w-3.5 h-3.5 text-[#7A8C70]" />
              <span>شماره پرونده / بایگانی</span>
            </div>
            <p className="text-sm font-bold text-[#4A4844] font-mono">
              {analysis.caseDetails.caseNumber || analysis.caseDetails.archiveNumber || "درج نشده"}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FBFAF7] border border-[#F0EEE9]">
            <div className="flex items-center gap-1.5 text-xs text-[#7A7874] mb-1.5">
              <Scale className="w-3.5 h-3.5 text-[#8F7732]" />
              <span>موضوع دعوا / شکایت</span>
            </div>
            <p className="text-sm font-bold text-[#4A4844] line-clamp-2">
              {analysis.caseDetails.subject}
            </p>
          </div>
        </div>

        {analysis.caseDetails.otherParties && analysis.caseDetails.otherParties.length > 0 && (
          <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#F0EEE9] flex items-center justify-between text-xs text-[#5C5A55]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#4A4844] shrink-0">طرفین دیگر پرونده:</span>
              <span>{analysis.caseDetails.otherParties.join("، ")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Deadlines & Legal Rules (مواعد قانونی) */}
      <div className="bg-white rounded-3xl border border-[#E5E2D9] p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#4A4844] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#8F7732]" />
            <span>مهلت‌های قانونی و نحوه محاسبه روزها</span>
          </h3>

          <button
            onClick={() =>
              triggerSectionAsk(
                `نحوه دقیق محاسبه مهلت قانونی (${analysis.deadlines.deadlineDescription}) بر اساس ${analysis.deadlines.legalBasis} چیست و اگر نرسم چه کنم؟`,
                "مهلت‌ها و مواعد قانونی",
                `${analysis.deadlines.deadlineDescription} - ${analysis.deadlines.legalBasis}`
              )
            }
            className="text-xs font-bold text-[#8F7732] hover:text-[#6E5D2A] flex items-center gap-1 hover:underline cursor-pointer print:hidden"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>پرسش درباره تمدید مهلت و عذر موجه</span>
          </button>
        </div>

        <div className="bg-[#FAF6EC] border border-[#EBE4CF] rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3.5">
            {analysis.deadlines.durationDays ? (
              <div className="w-16 h-16 rounded-2xl bg-[#8F7732] text-white flex flex-col items-center justify-center shrink-0 shadow-xs">
                <span className="text-2xl font-black leading-none">{analysis.deadlines.durationDays}</span>
                <span className="text-[10px] font-semibold mt-0.5">روز مهلت</span>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[#8F7732] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Clock className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1">
              <h4 className="font-bold text-[#4A4844] text-sm sm:text-base">
                {analysis.deadlines.deadlineDescription}
              </h4>
              <p className="text-xs text-[#8B4513] font-semibold mt-1">
                مستند قانونی: {analysis.deadlines.legalBasis}
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-[#EBE4CF] text-xs text-[#5C5A55] space-y-1">
            <div className="font-bold text-[#4A4844] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#8F7732]" />
              <span>قانون احتساب مواعد (نحوه شمارش روزها طبق قانون آیین دادرسی):</span>
            </div>
            <p className="leading-relaxed text-[#7A7874]">
              {analysis.deadlines.calculationRule}
            </p>
          </div>

          {/* Calendar Sync & ICS Export Box */}
          <div className="mt-4 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#EBE4CF] shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FAF6EC] text-[#8F7732] flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#4A4844]">
                    ثبت خودکار یادآور مهلت قانونی در تقویم (Reminder)
                  </h5>
                  <p className="text-[11px] text-[#7A7874]">
                    تنظیم آلارم برای ۲ روز و ۱ روز قبل از انقضای مهلت ابلاغیه
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 sm:pt-0">
                <button
                  type="button"
                  id="btn-download-ics"
                  onClick={() => downloadICSFile(analysis)}
                  className="px-3 py-2 rounded-xl bg-[#FAF6EC] hover:bg-[#F4EEDC] text-[#8F7732] border border-[#EBE4CF] text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود فایل تقویم (ICS)</span>
                </button>

                <a
                  id="link-google-calendar"
                  href={getGoogleCalendarLink(analysis)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-[#7A8C70] hover:bg-[#68795F] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>افزودن به گوگل کلندر</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>
              </div>
            </div>
            <p className="text-[10px] text-[#8C8982] leading-relaxed border-t border-[#F5F2EB] pt-2">
              💡 فایل <strong>.ics</strong> با تقویم موبایل (iOS Calendar، Samsung، تقویم فارسی و Google) سازگار است.
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Legal Roadmap & Action Items (راهنمایی گام‌به‌گام و نقشه راه اقدامات قانونی) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] p-4 sm:p-7 shadow-sm space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F0EEE9] pb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#4A4844] flex items-center gap-2">
              <ListOrdered className="w-4 h-4 sm:w-5 sm:h-5 text-[#7A8C70]" />
              <span>راهنمای گام‌به‌گام اقدامات قانونی و مراحل بعدی (قوانین ایران)</span>
            </h3>
            <p className="text-xs text-[#7A7874] mt-1 leading-relaxed">
              مراحل دقیق اداری و قضایی که باید به ترتیب طی کنید؛ می‌توانید موارد انجام‌شده را تیک بزنید.
            </p>
          </div>

          {/* Progress Tracker */}
          {totalSteps > 0 && (
            <div className="flex items-center justify-between sm:justify-start gap-3 bg-[#FAF8F5] px-3.5 py-2 rounded-xl sm:rounded-2xl border border-[#E5E2D9] shrink-0">
              <div className="text-right">
                <div className="text-[11px] font-bold text-[#4A4844]">
                  {completedCount} از {totalSteps} گام انجام شد
                </div>
                <div className="text-[10px] text-[#7A7874]">{progressPercent}٪ پیشرفت</div>
              </div>
              <div className="w-16 h-2 bg-[#E5E2D9] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7A8C70] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Step list */}
        <div className="space-y-3 sm:space-y-4">
          {analysis.actionItems.map((action: LegalActionItem, idx) => {
            const isDone = completedSteps.includes(action.step || idx + 1);

            return (
              <div
                key={idx}
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all ${
                  isDone
                    ? "bg-[#F0F4EF]/60 border-[#B7CEAF]"
                    : "bg-[#FBFAF7] border-[#E5E2D9] hover:border-[#7A8C70]"
                }`}
              >
                <div className="flex items-start gap-2.5 sm:gap-3.5">
                  {/* Interactive Checkbox / Step Badge */}
                  <button
                    onClick={() => handleToggleStep(action.step || idx + 1)}
                    className="mt-0.5 text-[#7A8C70] hover:text-[#5A6D52] transition-colors cursor-pointer shrink-0"
                    title={isDone ? "علامت‌گذاری به عنوان انجام نشده" : "علامت‌گذاری به عنوان انجام شده"}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#7A8C70] fill-[#F0F4EF]" />
                    ) : (
                      <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#7A8C70] text-white text-[11px] sm:text-xs font-bold flex items-center justify-center shadow-2xs">
                        {action.step || idx + 1}
                      </span>
                    )}
                  </button>

                  <div className="flex-1 space-y-2">
                    {/* Header line with stage tag and title */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h4
                          className={`font-bold text-xs sm:text-base ${
                            isDone ? "line-through text-[#7A7874]" : "text-[#4A4844]"
                          }`}
                        >
                          {action.title}
                        </h4>
                        {action.stage && (
                          <span className="text-[10px] bg-[#EBE7DF] text-[#5C5A55] px-2 py-0.5 rounded-md font-semibold">
                            {action.stage}
                          </span>
                        )}
                      </div>

                      {/* Question button for this specific step */}
                      <button
                        onClick={() =>
                          triggerSectionAsk(
                            `درباره گام «${action.title}»: چطور این اقدام را انجام دهم و چه نکاتی را در محاکم رعایت کنم؟`,
                            `گام ${action.step || idx + 1}: ${action.title}`,
                            action.description
                          )
                        }
                        className="text-[11px] sm:text-xs font-bold text-[#5A6D52] hover:text-[#3D4839] flex items-center gap-1 bg-white hover:bg-[#F0F4EF] border border-[#D5DFD0] px-2.5 py-1 rounded-xl transition-colors cursor-pointer print:hidden shadow-2xs self-start sm:self-auto"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>راهنمایی این گام</span>
                      </button>
                    </div>

                    {/* Step Description */}
                    <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
                      {action.description}
                    </p>

                    {/* Legal Reference & Timing Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      {action.legalReference && (
                        <div className="flex items-start gap-1.5 p-2 bg-white rounded-xl border border-[#E5E2D9] text-[#8B4513]">
                          <Scale className="w-3.5 h-3.5 text-[#8F7732] shrink-0 mt-0.5" />
                          <span>
                            <strong>استناد قانونی:</strong> {action.legalReference}
                          </span>
                        </div>
                      )}

                      {action.timingAdvice && (
                        <div className="flex items-start gap-1.5 p-2 bg-white rounded-xl border border-[#E5E2D9] text-[#6E5D2A]">
                          <Clock className="w-3.5 h-3.5 text-[#8F7732] shrink-0 mt-0.5" />
                          <span>
                            <strong>زمان‌بندی:</strong> {action.timingAdvice}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Practical Court Tip */}
                    {action.practicalTip && (
                      <div className="p-2.5 sm:p-3 bg-[#FAF6EC] rounded-xl border border-[#EBE4CF] text-xs text-[#5C5A55] flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-[#8F7732] shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[#6E5D2A] block mb-0.5">نکته تجربی در محاکم دادگستری:</strong>
                          <span>{action.practicalTip}</span>
                        </div>
                      </div>
                    )}

                    {/* Location & Required Docs */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1 text-xs text-[#7A7874]">
                      {action.locationOrMethod && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#5A6D52] bg-[#F0F4EF] px-2.5 py-1 rounded-full border border-[#D5DFD0]">
                          <Building2 className="w-3 h-3" />
                          <span>مرجع: {action.locationOrMethod}</span>
                        </span>
                      )}

                      {action.requiredDocuments && action.requiredDocuments.length > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-[#7A8C70]" />
                          <span>مدارک لازم: {action.requiredDocuments.join(" • ")}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consequences of Inaction (عواقب عدم اقدام) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] p-4 sm:p-7 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-bold text-[#8B4513] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-[#8B4513]" />
            <span>عواقب و خطرات پیگیری نکردن در مهلت مقرر</span>
          </h3>

          <button
            onClick={() =>
              triggerSectionAsk(
                "برای جلوگیری از این عواقب قانونی و توقیف حساب یا صدور حکم غیابی، چه راهکار فوری دارم؟",
                "عواقب عدم اقدام قانونی",
                analysis.consequencesOfInaction.join(" - ")
              )
            }
            className="text-[11px] sm:text-xs font-bold text-[#8B4513] hover:text-[#6E350E] flex items-center gap-1 hover:underline cursor-pointer print:hidden self-start sm:self-auto"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>راهکار جلوگیری از این عواقب</span>
          </button>
        </div>

        <p className="text-xs text-[#7A7874] leading-relaxed">
          در صورت عدم حضور یا عدم ارائه لایحه در موعد قانونی، طبق قوانین ایران موارد زیر رخ خواهد داد:
        </p>

        <ul className="space-y-2">
          {analysis.consequencesOfInaction.map((consequence, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#FAF0ED] border border-[#F3D7CD] text-xs sm:text-sm text-[#8B4513] leading-relaxed"
            >
              <AlertTriangle className="w-4 h-4 text-[#8B4513] shrink-0 mt-0.5" />
              <span>{consequence}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plain Language Glossary (واژه‌نامه اصطلاحات ابلاغیه) */}
      {analysis.glossary && analysis.glossary.length > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] p-4 sm:p-7 shadow-sm space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h3 className="text-sm sm:text-base font-bold text-[#4A4844] flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-[#7A8C70]" />
              <span>معنی اصطلاحات حقوقی این ابلاغیه (واژه‌نامه ساده)</span>
            </h3>
            <span className="text-[11px] sm:text-xs text-[#7A7874]">برای هر اصطلاح می‌توانید سوال بپرسید</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
            {analysis.glossary.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FBFAF7] border border-[#F0EEE9] hover:bg-[#F0F4EF]/50 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#4A4844] text-xs sm:text-sm">
                      «{item.term}»
                    </span>
                    <button
                      onClick={() =>
                        triggerSectionAsk(
                          `اصطلاح «${item.term}» در پرونده قضایی من دقیقاً چه تاثیری دارد و چه معنایی می‌دهد؟`,
                          `اصطلاح: ${item.term}`,
                          item.plainMeaning
                        )
                      }
                      className="text-[11px] text-[#5A6D52] hover:text-[#3D4839] font-semibold flex items-center gap-0.5 hover:underline cursor-pointer print:hidden"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>پرسش</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#5C5A55] leading-relaxed">
                    {item.plainMeaning}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample Draft Layehe & Defense Generator Box */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] p-4 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#4A4844] flex items-center gap-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[#7A8C70]" />
              <span>{analysis.sampleDraftLayehe?.title || "پیش‌نویس استاندارد لایحه دفاعیه / پاسخ به ابلاغیه"}</span>
            </h3>
            <p className="text-xs text-[#7A7874] mt-0.5 leading-relaxed">
              تنظیم متن حقوقی مستند به مواد قانون آیین دادرسی جهت ارائه به شعبه یا بررسی توسط وکیل
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {onOpenDefenseDraft && (
              <button
                type="button"
                id="btn-open-defense-builder-full"
                onClick={onOpenDefenseDraft}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#7A8C70] hover:bg-[#68795F] rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>سازنده و ویرایشگر پیشرفته لایحه</span>
              </button>
            )}

            <button
              id="btn-copy-layehe"
              onClick={handleCopyDraft}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#5C5A55] bg-[#FAF8F5] hover:bg-[#F0EEE9] border border-[#E5E2D9] rounded-xl transition-colors cursor-pointer"
            >
              {copiedDraft ? <Check className="w-3.5 h-3.5 text-[#7A8C70]" /> : <Copy className="w-3.5 h-3.5 text-[#7A8C70]" />}
              <span>{copiedDraft ? "کپی شد!" : "کپی متن"}</span>
            </button>
          </div>
        </div>

        {analysis.sampleDraftLayehe?.description && (
          <p className="text-xs text-[#7A7874] leading-relaxed">
            {analysis.sampleDraftLayehe.description}
          </p>
        )}

        <div className="bg-[#3D3B38] text-[#FAF8F5] p-3.5 sm:p-5 rounded-xl sm:rounded-2xl font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap selection:bg-[#7A8C70] overflow-x-auto">
          {analysis.sampleDraftLayehe?.draftText || `بسمه تعالی\nریاست محترم شعبه رسیدگی‌کننده\nبا سلام و احترام؛\nپیرو ابلاغیه شماره ${analysis.caseDetails.noticeNumber || "..."} در خصوص پرونده کلاسه ${analysis.caseDetails.caseNumber || "..."}، اینجانب ضمن اعلام حضور در موعد قانونی، بدین‌وسیله مراتب رد ادعای مطروحه و تقاضای مهلت جهت ارائه مستندات را به استحضار می‌رساند...`}
        </div>

        <div className="p-3 bg-[#FAF6EC] border border-[#EBE4CF] rounded-xl sm:rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#8F7732]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#8F7732] shrink-0" />
            <span>نیاز به تغییر استدلال‌ها، درج ایرادات شکلی یا استمهال دارید؟</span>
          </div>
          {onOpenDefenseDraft && (
            <button
              type="button"
              onClick={onOpenDefenseDraft}
              className="text-[#8F7732] hover:text-[#6E5D2A] font-bold underline underline-offset-4 cursor-pointer text-right"
            >
              انتخاب انواع دیگر لایحه (ایراد عدم صلاحیت، استمهال و...) ←
            </button>
          )}
        </div>
      </div>

      {/* Important Legal Notes */}
      {analysis.importantNotes && analysis.importantNotes.length > 0 && (
        <div className="bg-[#F0F4EF] border border-[#D5DFD0] rounded-3xl p-6 sm:p-7 shadow-sm">
          <h3 className="text-base font-bold text-[#3D4839] mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#7A8C70]" />
            <span>نکات طلایی و توصیه‌های وکلای دادگستری</span>
          </h3>

          <ul className="space-y-2">
            {analysis.importantNotes.map((note, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs sm:text-sm text-[#4A4844] leading-relaxed"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#7A8C70] mt-2 shrink-0"></span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Matching Lawyers Network Section */}
      {onSelectLawyer && (
        <LawyersSection
          currentAnalysis={analysis}
          currentUser={currentUser}
          onSelectLawyer={onSelectLawyer}
          isEmbeddedInAnalysis={true}
        />
      )}

      {/* Report Legal Compliance Disclaimer */}
      <div className="p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] text-xs text-[#7A7874] flex items-start gap-2.5">
        <Scale className="w-4 h-4 text-[#8B4513] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#4A4844]">تذکر قانونی:</strong> این گزارش تحلیلی صرفاً جهت ساده‌سازی اصطلاحات و استخراج مواعد قانونی تولید شده است. برای اتخاذ تصمیمات نهایی یا نگارش لوایح دارای آثار مالی و کیفری، مشاوره با وکیل پایه یک دادگستری توصیه می‌گردد.
        </p>
      </div>
    </div>
  );
};
