import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Header } from "./components/Header";
import { UploadZone } from "./components/UploadZone";
import { AnalysisResult } from "./components/AnalysisResult";
import { LegalAssistantChat } from "./components/LegalAssistantChat";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PrivacyNoticeModal } from "./components/PrivacyNoticeModal";
import { ClauseInquiryModal } from "./components/ClauseInquiryModal";
import { DefenseDraftModal } from "./components/DefenseDraftModal";
import {
  JudicialNoticeAnalysis,
  AnalysisHistoryItem,
  SectionQueryContext,
} from "./types";
import { SampleNotice } from "./sampleData";
import { getApiUrl } from "./utils/apiHelper";
import { Scale, AlertCircle, ArrowUp, RefreshCcw, Crown, Sparkles, X } from "lucide-react";

const HISTORY_STORAGE_KEY = "judicial_notice_analysis_history";
const DEVICE_ID_KEY = "eblaghyar_device_id";

export default function App() {
  const [currentAnalysis, setCurrentAnalysis] = useState<JudicialNoticeAnalysis | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [showPremiumPrompt, setShowPremiumPrompt] = useState<boolean>(false);
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

  // Section query & clause modal state
  const [activeSectionContext, setActiveSectionContext] = useState<SectionQueryContext | null>(null);
  const [clauseModalState, setClauseModalState] = useState<{
    isOpen: boolean;
    initialClause: string;
    initialQuestion: string;
    sectionTitle: string;
  }>({
    isOpen: false,
    initialClause: "",
    initialQuestion: "",
    sectionTitle: "",
  });

  // 1. Device-based Anonymous Auth Initialization (UUID)
  useEffect(() => {
    try {
      let storedDeviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!storedDeviceId) {
        storedDeviceId = uuidv4();
        localStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
      }
      setDeviceId(storedDeviceId);
    } catch (e) {
      console.error("Failed to access localStorage for deviceId:", e);
      const generated = uuidv4();
      setDeviceId(generated);
    }
  }, []);

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

      // ارسال درخواست به همراه هدر x-device-id
      const res = await fetch(getApiUrl("/api/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": currentDeviceId,
        },
        body: JSON.stringify({ fileBase64, mimeType, rawText }),
      });

      const json = await res.json().catch(() => null);

      // بررسی وضعیت ۴۰۳ و اتمام توکن‌های رایگان (LIMIT_REACHED)
      if (res.status === 403 && json?.error === "LIMIT_REACHED") {
        setShowPremiumPrompt(true);
        setError(null);
        return;
      }

      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.message || json?.error || `خطا در تحلیل ابلاغیه قضایی (${res.status})`);
      }

      const analysisData: JudicialNoticeAnalysis = json.data;
      setCurrentAnalysis(analysisData);
      saveToHistory(analysisData, fileName);
      setLastAnalyzePayload(null);

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
    alert("به زودی: اتصال به درگاه پرداخت جهت فعال‌سازی حساب نامحدود پرمیوم برای این دستگاه.");
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
    setActiveSectionContext(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectHistoryItem = (item: AnalysisHistoryItem) => {
    setCurrentAnalysis(item.analysis);
    setCurrentFileName(item.fileName);
    setShowPremiumPrompt(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.error(e);
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

  const scrollToChat = () => {
    const chatElement = document.getElementById("legal-chat-section");
    if (chatElement) {
      chatElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleAskSectionQuestion = (
    question: string,
    sectionContext: { sectionTitle: string; sectionSnippet: string }
  ) => {
    setActiveSectionContext({
      sectionTitle: sectionContext.sectionTitle,
      sectionSnippet: sectionContext.sectionSnippet,
      suggestedPrompt: question,
    });
    scrollToChat();
  };

  const handleOpenClauseModal = (
    initialClause = "",
    initialQuestion = "",
    sectionTitle = "بند یا عبارت خاص از ابلاغیه"
  ) => {
    setClauseModalState({
      isOpen: true,
      initialClause,
      initialQuestion,
      sectionTitle,
    });
  };

  const handleSendClauseToMainChat = (
    query: string,
    sectionContext?: { sectionTitle: string; sectionSnippet: string }
  ) => {
    if (sectionContext) {
      setActiveSectionContext({
        sectionTitle: sectionContext.sectionTitle,
        sectionSnippet: sectionContext.sectionSnippet,
        suggestedPrompt: query,
      });
    }
    scrollToChat();
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
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
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

        {/* کارت اعلان پایان توکن‌های رایگان (در بالای صفحه بارگذاری) */}
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
                      پایان سقف تحلیل‌های رایگان (۳ ابلاغیه)
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-[#8F7732]/10 text-[#8F7732] text-[11px] font-bold">
                      دستگاه جاری
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#6E5D2A] leading-relaxed max-w-2xl">
                    شما از ۳ فرصت تحلیل رایگان ابلاغیه در این دستگاه استفاده نموده‌اید. برای تحلیل نامحدود ابلاغیه‌ها، تنظیم پیش‌نویس لوایح و مشورت نامحدود با دستیار حقوقی، نسخه پرمیوم را فعال فرمایید.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto pt-2 sm:pt-0">
                <button
                  id="btn-buy-premium-banner"
                  onClick={handleBuyPremium}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#8F7732] hover:bg-[#776326] text-white font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-[#FFF2B2]" />
                  <span>خرید نسخه پرمیوم</span>
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
              onOpenChat={scrollToChat}
              onAskSectionQuestion={handleAskSectionQuestion}
              onOpenClauseModal={handleOpenClauseModal}
              onOpenDefenseDraft={() => setIsDefenseDraftOpen(true)}
            />

            {/* AI Legal Assistant Chat */}
            <LegalAssistantChat
              analysis={currentAnalysis}
              activeSectionContext={activeSectionContext}
              onClearSectionContext={() => setActiveSectionContext(null)}
              onOpenClauseInquiry={() => handleOpenClauseModal()}
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

      {/* Clause Inquiry Modal */}
      <ClauseInquiryModal
        isOpen={clauseModalState.isOpen}
        onClose={() => setClauseModalState((prev) => ({ ...prev, isOpen: false }))}
        analysis={currentAnalysis}
        initialClause={clauseModalState.initialClause}
        initialQuestion={clauseModalState.initialQuestion}
        sectionTitle={clauseModalState.sectionTitle}
        onSendToMainChat={handleSendClauseToMainChat}
      />

      {/* Defense Draft Modal */}
      {currentAnalysis && (
        <DefenseDraftModal
          isOpen={isDefenseDraftOpen}
          onClose={() => setIsDefenseDraftOpen(false)}
          analysis={currentAnalysis}
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
