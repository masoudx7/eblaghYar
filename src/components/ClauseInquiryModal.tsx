import React, { useState } from "react";
import {
  X,
  Sparkles,
  HelpCircle,
  Scale,
  Send,
  Loader2,
  FileSearch,
  BookOpen,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  RefreshCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { JudicialNoticeAnalysis } from "../types";
import { safeFetchJson } from "../utils/apiHelper";

interface ClauseInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: JudicialNoticeAnalysis | null;
  initialClause?: string;
  initialQuestion?: string;
  sectionTitle?: string;
  onSendToMainChat?: (question: string, sectionContext?: { sectionTitle: string; sectionSnippet: string }) => void;
}

export const ClauseInquiryModal: React.FC<ClauseInquiryModalProps> = ({
  isOpen,
  onClose,
  analysis,
  initialClause = "",
  initialQuestion = "",
  sectionTitle = "بند یا عبارت خاص از ابلاغیه",
  onSendToMainChat,
}) => {
  const [clauseText, setClauseText] = useState(initialClause);
  const [question, setQuestion] = useState(initialQuestion);
  const [isLoading, setIsLoading] = useState(false);
  const [responseAnswer, setResponseAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync props when opening
  React.useEffect(() => {
    if (isOpen) {
      if (initialClause) setClauseText(initialClause);
      if (initialQuestion) setQuestion(initialQuestion);
      setResponseAnswer(null);
      setError(null);
    }
  }, [isOpen, initialClause, initialQuestion]);

  if (!isOpen) return null;

  const quickClauseQuestions = [
    "مفهوم دقیق این عبارت به زبان ساده چیست؟",
    "آیا این بند برای من عواقب یا بار مالی/کیفری دارد؟",
    "چگونه باید در برابر این بند پاسخ یا لایحه تنظیم کنم؟",
    "چه مستند قانونی یا ماده‌ای بر این بند حاکم است؟",
  ];

  const handleAskClause = async (customQ?: string) => {
    const finalQuestion = (customQ || question).trim();
    if (!finalQuestion) return;

    setIsLoading(true);
    setError(null);
    setResponseAnswer(null);

    try {
      const data = await safeFetchJson<{ success: boolean; answer: string; error?: string }>(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [],
            contextAnalysis: analysis,
            userQuestion: finalQuestion,
            sectionContext: {
              sectionTitle: sectionTitle || "بند مشخص از ابلاغیه قضایی",
              sectionSnippet: clauseText || "پرسش روی بخش انتخابی ابلاغیه",
            },
          }),
        }
      );

      if (!data.success || !data.answer) {
        throw new Error(data.error || "خطا در تحلیل بند حقوقی");
      }

      setResponseAnswer(data.answer);
    } catch (err: any) {
      console.error("Clause inquiry error:", err);
      setError(err.message || "خطا در دریافت پاسخ و تحلیل حقوقی.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransferToMainChat = () => {
    if (onSendToMainChat) {
      const fullQuery = clauseText
        ? `درباره این بند از ابلاغیه: «${clauseText}»\nسوال من: ${question || "توضیح کامل و راهنمایی حقوقی ارائه دهید."}`
        : question;
      onSendToMainChat(fullQuery, {
        sectionTitle: sectionTitle,
        sectionSnippet: clauseText,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#3D3B38]/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl z-10 border border-[#E5E2D9] max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden text-right my-auto">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSearch className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#4A4844] text-xs sm:text-base truncate">
                پرسش جزئی و موشکافی بند خاص
              </h3>
              <p className="text-[11px] sm:text-xs text-[#7A7874] truncate">
                {sectionTitle ? `بخش: ${sectionTitle}` : "طرح ابهام درباره عبارات سند قضایی"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 bg-[#FBFAF7]/40">
          {/* Clause Text Input/Display */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#4A4844]">
              متن یا عبارت مورد نظر از ابلاغیه:
            </label>
            <textarea
              rows={3}
              value={clauseText}
              onChange={(e) => setClauseText(e.target.value)}
              placeholder="مثلاً: «در صورت عدم حضور در موعد مقرر، دستور جلب صادر خواهد شد» یا هر جمله دیگر از ابلاغیه..."
              className="w-full rounded-xl sm:rounded-2xl border border-[#D1CEC4] bg-white p-3 sm:p-3.5 text-xs sm:text-sm text-[#3D3B38] placeholder:text-[#A8A59D] focus:outline-hidden focus:ring-2 focus:ring-[#7A8C70]/30 focus:border-[#7A8C70] leading-relaxed resize-none"
            />
          </div>

          {/* Quick Questions Pills */}
          <div className="space-y-1.5">
            <label className="block text-[10px] sm:text-[11px] font-bold text-[#7A7874]">
              سوالات پرتکرار و پیشنهادی برای این بند:
            </label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {quickClauseQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(q);
                    handleAskClause(q);
                  }}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs bg-white hover:bg-[#F0F4EF] text-[#5C5A55] hover:text-[#3D3B38] border border-[#E5E2D9] hover:border-[#7A8C70] transition-colors text-right cursor-pointer shadow-2xs"
                >
                  💡 {q}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Question Input */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-[#4A4844]">
              سوال شما درباره این بند:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAskClause();
                  }
                }}
                placeholder="سوال اختصاصی خود را بنویسید..."
                className="flex-1 rounded-xl sm:rounded-2xl border border-[#D1CEC4] bg-white p-2.5 sm:p-3 text-xs sm:text-sm text-[#3D3B38] placeholder:text-[#A8A59D] focus:outline-hidden focus:ring-2 focus:ring-[#7A8C70]/30 focus:border-[#7A8C70]"
              />
              <button
                type="button"
                onClick={() => handleAskClause()}
                disabled={isLoading || !question.trim()}
                className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-[#7A8C70] hover:bg-[#68795F] disabled:bg-[#D1CEC4] text-white rounded-xl sm:rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>تحلیل بند</span>
                    <Send className="w-3.5 h-3.5 rotate-180" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E5E2D9] flex items-center gap-3 text-xs text-[#5C5A55] shadow-xs">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#7A8C70] text-white flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4 animate-spin" />
              </div>
              <span>در حال موشکافی حقوقی بند با استناد به قوانین موضوعه ایران...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => handleAskClause()}
                disabled={isLoading}
                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#8B4513] hover:bg-[#72380F] disabled:bg-[#C4A496] text-white rounded-xl font-bold text-[11px] transition-colors shrink-0 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <RefreshCcw className="w-3 h-3" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          )}

          {/* AI Response Box */}
          {responseAnswer && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#4A4844] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#7A8C70]" />
                  <span>پاسخ و تحلیل تخصصی هوش مصنوعی:</span>
                </span>
                <span className="text-[10px] bg-[#F0F4EF] text-[#5A6D52] px-2 py-0.5 rounded-full font-semibold border border-[#D5DFD0]">
                  بر اساس قوانین ایران
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E5E2D9] p-3.5 sm:p-5 shadow-xs text-xs sm:text-sm text-[#3D3B38] leading-relaxed">
                <div className="prose prose-sm max-w-none text-[#3D3B38]">
                  <ReactMarkdown>{responseAnswer}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-[#E5E2D9] bg-[#FAF8F5] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] rounded-xl transition-colors cursor-pointer text-center"
          >
            بستن پنجره
          </button>

          {onSendToMainChat && (
            <button
              type="button"
              onClick={handleTransferToMainChat}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-[#F0F4EF] border border-[#D5DFD0] text-[#5A6D52] hover:text-[#3D4839] rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <span>ادامه این گفتگو در چت اصلی</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
