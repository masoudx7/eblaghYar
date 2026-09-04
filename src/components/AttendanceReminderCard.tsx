import React, { useState, useEffect } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  ExternalLink,
  ShieldCheck,
  Volume2,
  Info
} from "lucide-react";
import { JudicialNoticeAnalysis } from "../types";
import {
  calculateTargetDate,
  downloadICSFile,
  getGoogleCalendarLink
} from "../utils/calendarExport";

interface AttendanceReminderCardProps {
  analysis: JudicialNoticeAnalysis;
}

const REMINDERS_STORAGE_KEY = "eblaghyar_attendance_reminders";

export const AttendanceReminderCard: React.FC<AttendanceReminderCardProps> = ({
  analysis,
}) => {
  const reminderId =
    analysis.caseDetails.noticeNumber ||
    analysis.caseDetails.caseNumber ||
    analysis.caseDetails.archiveNumber ||
    "current_notice";

  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [notificationStatusMsg, setNotificationStatusMsg] = useState<string | null>(null);
  const [hasTested, setHasTested] = useState<boolean>(false);

  // Calculate target appearance/deadline date and 2-day reminder date
  const targetDate = calculateTargetDate(analysis);
  const reminderDate = new Date(targetDate.getTime() - 2 * 24 * 60 * 60 * 1000);
  reminderDate.setHours(9, 0, 0, 0); // 9:00 AM 2 days prior

  const now = new Date();
  const msUntilReminder = reminderDate.getTime() - now.getTime();
  const daysUntilReminder = Math.ceil(msUntilReminder / (1000 * 60 * 60 * 24));
  const isPast = daysUntilReminder < 0;

  // Format Persian dates
  const formatFaDate = (date: Date) => {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(date);
    } catch {
      return date.toLocaleDateString("fa-IR");
    }
  };

  const targetDateStr = formatFaDate(targetDate);
  const reminderDateStr = formatFaDate(reminderDate);

  // Check stored status on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!("Notification" in window)) {
        setNotificationPermission("unsupported");
      } else {
        setNotificationPermission(Notification.permission);
      }

      try {
        const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[reminderId]?.enabled) {
            setIsEnabled(true);
          }
        }
      } catch (err) {
        console.error("Failed to read reminders from localStorage:", err);
      }
    }
  }, [reminderId]);

  // Handle Toggle Switch
  const handleToggle = async () => {
    const nextState = !isEnabled;
    setIsEnabled(nextState);

    // Save to localStorage
    try {
      const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      if (nextState) {
        parsed[reminderId] = {
          enabled: true,
          noticeNumber: analysis.caseDetails.noticeNumber,
          caseNumber: analysis.caseDetails.caseNumber,
          subject: analysis.caseDetails.subject,
          targetDate: targetDate.toISOString(),
          reminderDate: reminderDate.toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        delete parsed[reminderId];
      }
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.error("Failed to save reminder:", e);
    }

    if (nextState) {
      // Request Notification Permission if supported
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          try {
            const perm = await Notification.requestPermission();
            setNotificationPermission(perm);
            if (perm === "granted") {
              setNotificationStatusMsg("مجوز اعلان با موفقیت ثبت شد. ۲ روز قبل از موعد حضور پیام یادآوری دریافت خواهید کرد.");
              new Notification("🔔 یادآور ابلاغ‌یار فعال شد", {
                body: `یادآوری پرونده «${analysis.caseDetails.subject || "ابلاغیه دادگاه"}» برای ۲ روز قبل از موعد حضور (تاریخ ${reminderDateStr}) فعال گردید.`,
                icon: "/favicon.ico",
              });
            } else {
              setNotificationStatusMsg("مجوز اعلان مرورگر رد شد؛ لطفاً فایل تقویم را به گوشی خود اضافه کنید تا آلارم روی موبایل به صدا درآید.");
            }
          } catch (err) {
            console.warn("Notification request failed:", err);
          }
        } else if (Notification.permission === "granted") {
          setNotificationStatusMsg("یادآور ۲ روز قبل از حضور فعال است و اعلان در این دستگاه نمایش داده می‌شود.");
          new Notification("🔔 یادآور ابلاغیه فعال شد", {
            body: `یادآوری برای تاریخ ${reminderDateStr} (۲ روز پیش از مهلت نهایی) تنظیم گردید.`,
            icon: "/favicon.ico",
          });
        } else {
          setNotificationStatusMsg("اعلان‌های مرورگر مسدود است. برای زنگ خوردن تلفن همراه، رویداد را به تقویم گوشی اضافه نمایید.");
        }
      }
    } else {
      setNotificationStatusMsg("یادآور برای این ابلاغیه خاموش شد.");
    }
  };

  // Test instant notification
  const handleTestNotification = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("🚨 تست یادآور ابلاغ‌یار", {
          body: `هشدار آزمایشی: ۲ روز تا زمان حضور در شعبه باقی مانده است! موضوع: ${analysis.caseDetails.subject || "رسیدگی قضایی"}`,
          icon: "/favicon.ico",
        });
        setHasTested(true);
      } else {
        Notification.requestPermission().then((perm) => {
          setNotificationPermission(perm);
          if (perm === "granted") {
            new Notification("🚨 تست یادآور ابلاغ‌یار", {
              body: `هشدار آزمایشی: ۲ روز تا زمان حضور در شعبه باقی مانده است! موضوع: ${analysis.caseDetails.subject || "رسیدگی قضایی"}`,
              icon: "/favicon.ico",
            });
            setHasTested(true);
          }
        });
      }
    }
  };

  return (
    <div
      id="attendance-reminder-section"
      className={`rounded-3xl border transition-all duration-200 p-5 sm:p-6 shadow-sm ${
        isEnabled
          ? "bg-gradient-to-b from-[#F2F6F0] to-[#FAF8F5] border-[#7A8C70]"
          : "bg-white border-[#E5E2D9]"
      }`}
    >
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E2D9]">
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              isEnabled
                ? "bg-[#7A8C70] text-white shadow-xs"
                : "bg-[#F3F1ED] text-[#7A7874]"
            }`}
          >
            {isEnabled ? (
              <BellRing className="w-5 h-5 animate-pulse" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-[#3D3B38]">
                یادآور زمان حضور و مواعد قانونی
              </h3>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isEnabled
                    ? "bg-[#E2EBE0] text-[#4A5D43] border-[#C3D4BF]"
                    : "bg-[#F3F1ED] text-[#7A7874] border-[#E5E2D9]"
                }`}
              >
                {isEnabled ? "روشن (فعال)" : "خاموش"}
              </span>
            </div>
            <p className="text-xs text-[#6B6862] mt-1 leading-relaxed">
              اطلاع‌رسانی هوشمند خودکار <strong>۲ روز قبل از موعد حضور</strong> در شعبه یا انقضای مهلت اعتراض
            </p>
          </div>
        </div>

        {/* Big Switch Button */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-semibold text-[#5C5A55]">
            {isEnabled ? "روشن" : "خاموش"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            id="reminder-toggle-btn"
            onClick={handleToggle}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              isEnabled ? "bg-[#7A8C70]" : "bg-[#D5D2C9]"
            }`}
          >
            <span className="sr-only">فعال‌سازی یادآور زمان حضور</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isEnabled ? "-translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pt-4 space-y-4">
        {/* Date Matrix Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Box 1: Deadline / Attendance Date */}
          <div className="p-4 rounded-2xl bg-white border border-[#E5E2D9] flex items-center gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6EC] text-[#8F7732] flex items-center justify-center shrink-0 border border-[#EBE4CF]">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-[#8F7732] block">
                زمان حضور / مهلت نهایی اقدام
              </span>
              <span className="text-sm font-bold text-[#3D3B38] truncate block mt-0.5">
                {targetDateStr}
              </span>
              <span className="text-[10px] text-[#7A7874] block mt-0.5">
                {analysis.deadlines.deadlineDescription || "مهلت قانونی تعیین شده در ابلاغیه"}
              </span>
            </div>
          </div>

          {/* Box 2: Reminder Trigger Date (2 Days Prior) */}
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-2xs transition-colors ${
              isEnabled
                ? "bg-[#F0F4EF] border-[#C3D4BF]"
                : "bg-[#FAF8F5] border-[#E5E2D9]"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isEnabled
                  ? "bg-[#7A8C70] text-white border-[#7A8C70]"
                  : "bg-white text-[#7A7874] border-[#E5E2D9]"
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-[#5A6D52] flex items-center gap-1">
                <span>زمان ارسال یادآور</span>
                <span className="bg-[#E2EBE0] text-[#4A5D43] px-1.5 py-0.2 rounded text-[10px] font-extrabold">
                  ۲ روز قبل
                </span>
              </span>
              <span className="text-sm font-bold text-[#2D382A] truncate block mt-0.5">
                {reminderDateStr}
              </span>
              <span className="text-[10px] text-[#6B6862] block mt-0.5">
                {!isPast ? (
                  daysUntilReminder === 0 ? (
                    "امروز موعد ارسال هشدار است!"
                  ) : (
                    `${daysUntilReminder} روز مانده تا ارسال اعلان`
                  )
                ) : (
                  "موعد یادآوری گذشته است"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Active Banner & Status */}
        {isEnabled ? (
          <div className="p-4 rounded-2xl bg-[#EAF2E8] border border-[#C5D9BF] space-y-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#5A6D52] shrink-0 mt-0.5" />
              <div className="text-xs text-[#3D4C37] leading-relaxed">
                <p className="font-bold">
                  یادآور ۲ روز قبل از زمان حضور با موفقیت فعال شد
                </p>
                <p className="mt-1 text-[#4F6347]">
                  در تاریخ <strong>{reminderDateStr}</strong> (ساعت ۹ صبح، دو روز قبل از انقضای مهلت) به شما اطلاع‌رسانی خواهد شد تا فرصت کافی برای هماهنگی با وکیل، تنظیم لایحه دفاعیه یا مراجعه به شعبه را داشته باشید.
                </p>
              </div>
            </div>

            {notificationStatusMsg && (
              <div className="p-2.5 bg-white/80 rounded-xl text-[11px] text-[#4F6347] border border-[#C5D9BF]/60 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 text-[#5A6D52]" />
                <span>{notificationStatusMsg}</span>
              </div>
            )}

            {/* Test button for reassurance */}
            {notificationPermission === "granted" && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  id="test-notification-btn"
                  onClick={handleTestNotification}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F4EEDC] text-[#4A5D43] border border-[#C3D4BF] rounded-xl text-xs font-medium cursor-pointer transition-colors shadow-2xs"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>تست آنی صدای اعلان در این دستگاه</span>
                </button>
                {hasTested && (
                  <span className="text-[11px] text-[#5A6D52] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    اعلان تستی ارسال شد!
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EBE8E0] text-xs text-[#7A7874] flex items-center gap-2.5">
            <BellOff className="w-4 h-4 text-[#8C8880] shrink-0" />
            <span>
              برای دریافت هشدار ۲ روز پیش از انقضای مهلت یا جلسه رسیدگی، دکمه <strong>«روشن»</strong> را فعال کنید.
            </span>
          </div>
        )}

        {/* Multi-channel Calendar Sync Buttons */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#4A4844] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#7A8C70]" />
              <span>پشتیبان‌گیری در تقویم تلفن همراه (آلارم ۲ روز قبل):</span>
            </span>
            <span className="text-[11px] text-[#7A7874] hidden sm:inline">
              تنظیم خودکار آلارم زنگ‌دار
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              id="reminder-download-ics"
              onClick={() => downloadICSFile(analysis)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F3F1ED] text-[#4A4844] border border-[#E5E2D9] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              title="مناسب برای آیفون، اندروید، سامسونگ و شیائومی با آلارم ۲ روز قبل"
            >
              <Download className="w-4 h-4 text-[#7A8C70]" />
              <span>افزودن به تقویم موبایل (با آلارم ۲ روز قبل)</span>
            </button>

            <a
              id="reminder-google-calendar"
              href={getGoogleCalendarLink(analysis)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-[#7A8C70] hover:bg-[#68795F] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              title="افزودن مستقیم به تقویم جیمیل و گوگل"
            >
              <ExternalLink className="w-4 h-4" />
              <span>ثبت مستقیم در تقویم گوگل (Google Calendar)</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
