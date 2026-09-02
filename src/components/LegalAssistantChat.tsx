import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Scale,
  Sparkles,
  Bot,
  User,
  Loader2,
  RefreshCcw,
  HelpCircle,
  Tag,
  FileSearch,
  BookOpen,
  Clock,
  Building2,
  FileText,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { JudicialNoticeAnalysis, ChatMessage, SectionQueryContext } from "../types";

interface LegalAssistantChatProps {
  analysis: JudicialNoticeAnalysis | null;
  activeSectionContext?: SectionQueryContext | null;
  onClearSectionContext?: () => void;
  onOpenClauseInquiry?: () => void;
}

export const LegalAssistantChat: React.FC<LegalAssistantChatProps> = ({
  analysis,
  activeSectionContext,
  onClearSectionContext,
  onOpenClauseInquiry,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("eblaghyar_chat_messages");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load chat from localStorage", e);
    }
    return [
      {
        id: "welcome-1",
        role: "assistant",
        content: analysis
          ? `سلام! من مشاور حقوقی هوش مصنوعی شما هستم. ابلاغیه شما با موضوع **«${analysis.caseDetails.subject || 'پرونده قضایی'}»** بررسی شد. چه سوال یا ابهامی درباره این ابلاغیه یا مواعد قانونی آن دارید؟`
          : `سلام! من مشاور حقوقی هوش مصنوعی شما هستم. لطفاً ابتدا ابلاغیه خود را بارگذاری کنید یا سوال حقوقی خود را بپرسید تا با استناد به قوانین موضوعه ایران راهنمایی‌تان کنم.`,
        timestamp: new Date().toLocaleTimeString("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("همه بخش‌ها");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<{
    text: string;
    sectionContext?: { sectionTitle: string; sectionSnippet: string };
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Save messages to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("eblaghyar_chat_messages", JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat to localStorage", e);
    }
  }, [messages]);

  const handleClearChat = () => {
    const welcomeMsg: ChatMessage = {
      id: "welcome-" + Date.now(),
      role: "assistant",
      content: analysis
        ? `سلام! گفتگو پاک‌سازی شد. درباره ابلاغیه با موضوع **«${analysis.caseDetails.subject || 'پرونده قضایی'}»** چه سوال دیگری دارید؟`
        : `سلام! گفتگو پاک‌سازی شد. سوال حقوقی خود را بپرسید.`,
      timestamp: new Date().toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages([welcomeMsg]);
    try {
      localStorage.removeItem("eblaghyar_chat_messages");
    } catch (e) {}
  };

  // Suggested questions based on notice
  const quickQuestionsByTopic: Record<string, string[]> = {
    "همه بخش‌ها": [
      "اگر در مهلت مقرر اقدام نکنم دقیقاً چه عواقبی طبق قانون دارد؟",
      "آیا می‌توانم به جای مراجعه حضوری، وکیل بفرستم یا لایحه الکترونیک ثبت کنم؟",
      "چگونه در دفتر خدمات الکترونیک قضایی نوبت بگیرم و ثبت نام کنم؟",
      "آیا این رای یا اخطاریه قابل اعتراض در دادگاه تجدیدنظر یا دیوان است؟",
    ],
    "مهلت‌ها و مواعد": [
      "نحوه دقیق محاسبه مهلت قانونی (با احتساب روزهای تعطیل و روز ابلاغ) چگونه است؟",
      "اگر به دلیل موجه (بیماری یا حادثه) در مهلت نرسم، چگونه لایحه عذر موجه ثبت کنم؟",
      "چگونه از قاضی یا دادیار تقاضای استمهال (تمدید مهلت) کنم؟",
    ],
    "نقش و حقوق من": [
      "به عنوان متهم/خوانده چه حقوقی در اولین جلسه رسیدگی دارم؟",
      "آیا این ابلاغیه برای من سوء پیشینه یا محرومیت از حقوق اجتماعی ایجاد می‌کند؟",
      "آیا می‌توانم از حق سکوت یا درخواست مهلت جهت معرفی وکیل استفاده کنم؟",
    ],
    "اقدامات دادسرا و دادگاه": [
      "در شعبه دادسرا یا دادگاه دقیقاً چه مراحلی طی می‌شود و چه بگویم؟",
      "آیا قاضی در این مرحله می‌تواند قرار وثیقه یا کفالت صادر کند؟",
      "چگونه لایحه دفاعیه خود را در سامانه خودکاربری یا دفتر خدمات ثبت کنم؟",
    ],
    "لایحه و دفاع": [
      "چه مدارک و مستنداتی باید ضمیمه لایحه دفاعیه نمایم؟",
      "آیا نیاز است لایحه توسط وکیل دادگستری بازنویسی یا مهر شود؟",
      "چگونه متن لایحه را متناسب با ادعای طرف مقابل تغییر دهم؟",
    ],
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Handle external contextual prompt
  useEffect(() => {
    if (activeSectionContext?.suggestedPrompt) {
      setInput(activeSectionContext.suggestedPrompt);
      inputRef.current?.focus();
    }
  }, [activeSectionContext]);

  const handleSendMessage = async (
    textToSend?: string,
    sectionContextOverride?: { sectionTitle: string; sectionSnippet: string }
  ) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    setError(null);
    const activeSection =
      sectionContextOverride ||
      (activeSectionContext
        ? {
            sectionTitle: activeSectionContext.sectionTitle,
            sectionSnippet: activeSectionContext.sectionSnippet,
          }
        : undefined);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      sectionTag:
        activeSection?.sectionTitle ||
        (selectedTopic !== "همه بخش‌ها" ? selectedTopic : undefined),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-8), // send last 8 for context
          contextAnalysis: analysis,
          userQuestion: query,
          sectionContext: activeSection,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "خطا در دریافت پاسخ از دستیار حقوقی");
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date().toLocaleTimeString("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        sectionTag: activeSection?.sectionTitle,
      };

      setMessages((prev) => [...prev, botMsg]);
      setLastFailedQuery(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "خطا در پاسخ‌گویی به سوال حقوقی.");
      setLastFailedQuery({ text: query, sectionContext: activeSection });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentQuestions =
    quickQuestionsByTopic[selectedTopic] || quickQuestionsByTopic["همه بخش‌ها"];

  return (
    <div
      id="legal-chat-section"
      className="w-full max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl border border-[#E5E2D9] shadow-sm overflow-hidden print:hidden"
    >
      {/* Chat Header */}
      <div className="p-3.5 sm:p-5 border-b border-[#E5E2D9] bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="font-bold text-[#4A4844] text-xs sm:text-base">
                مشاور حقوقی هوش مصنوعی (پرسش جزئی و تخصصی)
              </h3>
              <span className="text-[10px] bg-[#F0F4EF] text-[#5A6D52] border border-[#D5DFD0] font-semibold px-2 py-0.5 rounded-full">
                مسلط به قوانین ایران
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#7A7874] mt-0.5">
              پاسخ به سوالات جزئی درباره هر بخش از ابلاغیه، مواد قانونی، راهنمایی حضور در شعبه و تنظیم لایحه.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-center justify-end">
          {onOpenClauseInquiry && (
            <button
              id="btn-open-clause-inquiry"
              onClick={onOpenClauseInquiry}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs text-[#5A6D52] bg-[#F0F4EF] hover:bg-[#E2EBE0] border border-[#D5DFD0] px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
              title="پرسش درباره بند یا عبارت خاص از ابلاغیه"
            >
              <FileSearch className="w-3.5 h-3.5" />
              <span>موشکافی بند خاص</span>
            </button>
          )}

          {messages.length > 0 && (
            <button
              id="btn-clear-chat"
              onClick={handleClearChat}
              className="flex items-center gap-1 text-xs text-[#7A7874] hover:text-[#3D3B38] px-2.5 py-1.5 rounded-xl hover:bg-[#F3F1ED] transition-colors cursor-pointer"
              title="شروع مجدد گفتگو"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span className="text-[11px]">پاک‌سازی</span>
            </button>
          )}
        </div>
      </div>

      {/* Focus Topics Filter Bar */}
      <div className="px-3.5 sm:px-4 py-2 bg-[#FAF8F5]/80 border-b border-[#E5E2D9] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] sm:text-[11px] font-bold text-[#7A7874] shrink-0 ml-1">
          موضوع:
        </span>
        {Object.keys(quickQuestionsByTopic).map((topic) => (
          <button
            key={topic}
            onClick={() => setSelectedTopic(topic)}
            className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedTopic === topic
                ? "bg-[#7A8C70] text-white shadow-xs"
                : "bg-white text-[#5C5A55] border border-[#E5E2D9] hover:border-[#7A8C70]"
            }`}
          >
            {topic}
          </button>
        ))}
      </div>

      {/* Active Section Context Banner if triggered externally */}
      {activeSectionContext && (
        <div className="px-4 py-2.5 bg-[#F0F4EF] border-b border-[#D5DFD0] flex items-center justify-between gap-2 text-xs text-[#3D4839]">
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-[#7A8C70]" />
            <span>
              تمرکز روی بخش: <strong className="font-bold">{activeSectionContext.sectionTitle}</strong>
            </span>
          </div>
          {onClearSectionContext && (
            <button
              onClick={onClearSectionContext}
              className="text-[11px] text-[#7A7874] hover:text-[#3D3B38] underline cursor-pointer"
            >
              حذف فیلتر بخش
            </button>
          )}
        </div>
      )}

      {/* Messages Container */}
      <div className="p-4 sm:p-6 min-h-[280px] max-h-[500px] overflow-y-auto space-y-4 bg-[#FBFAF7]/50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6 px-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#E5E2D9] text-[#7A8C70] flex items-center justify-center">
              <HelpCircle className="w-7 h-7" />
            </div>
            <div>
              <p className="font-bold text-[#4A4844] text-sm sm:text-base">
                درباره کدام بخش از ابلاغیه سوال یا ابهام حقوقی دارید؟
              </p>
              <p className="text-xs text-[#7A7874] mt-1 max-w-md">
                می‌توانید یکی از سوالات پرکاربرد زیر را انتخاب کرده یا سوال جزئی خود را بنویسید:
              </p>
            </div>

            {/* Quick suggested chips */}
            <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-right">
              {currentQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(q)}
                  className="p-3 text-xs text-[#5C5A55] hover:text-[#3D3B38] bg-white hover:bg-[#F0F4EF]/80 border border-[#E5E2D9] hover:border-[#7A8C70] rounded-2xl transition-all shadow-xs text-right cursor-pointer leading-relaxed"
                >
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 text-xs font-bold ${
                  msg.role === "user"
                    ? "bg-[#4A4844] text-[#FAF8F5]"
                    : "bg-[#7A8C70] text-white shadow-xs"
                }`}
              >
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-xs ${
                  msg.role === "user"
                    ? "bg-[#4A4844] text-[#FAF8F5] rounded-tr-xs"
                    : "bg-white text-[#3D3B38] border border-[#E5E2D9] rounded-tl-xs"
                }`}
              >
                {msg.sectionTag && (
                  <div
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mb-2 ${
                      msg.role === "user"
                        ? "bg-[#3D3B38] text-[#E5E2D9]"
                        : "bg-[#F0F4EF] text-[#5A6D52] border border-[#D5DFD0]"
                    }`}
                  >
                    بخش: {msg.sectionTag}
                  </div>
                )}

                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none text-[#3D3B38]">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                <div
                  className={`text-[10px] mt-1.5 ${
                    msg.role === "user" ? "text-[#C4C0B6] text-left" : "text-[#7A7874] text-right"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2.5 text-xs text-[#7A7874] p-2">
            <div className="w-8 h-8 rounded-xl bg-[#7A8C70] text-white flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div className="bg-white border border-[#E5E2D9] p-3 rounded-2xl flex items-center gap-2 shadow-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#7A8C70]" />
              <span>در حال جستجو در قوانین و نگارش پاسخ حقوقی دقیق...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-[#FAF0ED] border border-[#E9C8BC] rounded-2xl text-[#8B4513] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#8B4513]" />
              <span>{error}</span>
            </div>
            {lastFailedQuery && (
              <button
                type="button"
                onClick={() => handleSendMessage(lastFailedQuery.text, lastFailedQuery.sectionContext)}
                disabled={isLoading}
                className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#8B4513] hover:bg-[#72380F] disabled:bg-[#C4A496] text-white rounded-xl font-bold text-[11px] transition-colors shrink-0 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <RefreshCcw className="w-3 h-3" />
                <span>تلاش مجدد</span>
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3.5 sm:p-4 border-t border-[#E5E2D9] bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            id="chat-query-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="سوال حقوقی خود را اینجا بنویسید (مثلاً: آیا با این ابلاغیه من ممنوع‌الخروج می‌شوم؟ مواد قانونی دفاع من چیست؟)..."
            className="flex-1 rounded-2xl border border-[#D1CEC4] bg-[#FBFAF7] p-3.5 text-xs sm:text-sm text-[#3D3B38] placeholder:text-[#A8A59D] focus:outline-hidden focus:ring-2 focus:ring-[#7A8C70]/30 focus:border-[#7A8C70] resize-none font-sans leading-relaxed"
          />

          <button
            id="btn-send-chat"
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-12 px-5 bg-[#7A8C70] hover:bg-[#68795F] disabled:bg-[#D1CEC4] text-white rounded-2xl font-bold flex items-center justify-center transition-colors shrink-0 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-[#7A8C70]/20"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 rotate-180" />}
          </button>
        </form>
        <p className="text-[11px] text-[#7A7874] mt-2 text-center">
          پاسخ‌ها بر مبنای قوانین رسمی جمهوری اسلامی ایران (آیین دادرسی مدنی، کیفری و مجازات اسلامی) ارائه می‌شوند.
        </p>
      </div>
    </div>
  );
};
