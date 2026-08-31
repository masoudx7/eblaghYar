import { JudicialNoticeAnalysis } from '../types';

/**
 * Utility to convert Jalali (Shamsi) date to Gregorian date
 */
function jalaliToGregorian(jYear: number, jMonth: number, jDay: number): [number, number, number] {
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  const jy = jYear - 979;
  const jm = jMonth - 1;
  const jd = jDay - 1;

  let jDayNo = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jm; ++i) jDayNo += jDaysInMonth[i];
  jDayNo += jd;

  let gDayNo = jDayNo + 79;

  let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
  gDayNo = gDayNo % 146097;

  let leap = true;
  if (gDayNo >= 36525) {
    gDayNo--;
    gy += 100 * Math.floor(gDayNo / 36524);
    gDayNo = gDayNo % 36524;

    if (gDayNo >= 365) gDayNo++;
    else leap = false;
  }

  gy += 4 * Math.floor(gDayNo / 1461);
  gDayNo %= 1461;

  if (gDayNo >= 366) {
    leap = false;
    gDayNo--;
    gy += Math.floor(gDayNo / 365);
    gDayNo = gDayNo % 365;
  }

  let i = 0;
  for (; i < 12; i++) {
    const daysInM = (i === 1 && leap) ? 29 : gDaysInMonth[i];
    if (gDayNo < daysInM) break;
    gDayNo -= daysInM;
  }
  const gm = i + 1;
  const gd = gDayNo + 1;

  return [gy, gm, gd];
}

/**
 * Parses a date string which might be Shamsi (e.g. 1403/08/15 or ۱۴۰۳/۰۸/۱۵) or Gregorian
 */
export function parseDateToGregorian(dateStr?: string): Date | null {
  if (!dateStr) return null;

  // Convert Persian numbers to English
  const englishStr = dateStr
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .trim();

  // Match YYYY/MM/DD or YYYY-MM-DD
  const parts = englishStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (parts) {
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10);
    const day = parseInt(parts[3], 10);

    // If year is Shamsi (typically between 1300 and 1500)
    if (year >= 1300 && year <= 1500) {
      const [gy, gm, gd] = jalaliToGregorian(year, month, day);
      return new Date(gy, gm - 1, gd, 9, 0, 0); // 9:00 AM default
    } else if (year >= 2000) {
      return new Date(year, month - 1, day, 9, 0, 0);
    }
  }

  // Fallback: try standard Date parsing
  const parsed = new Date(englishStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a Date object to ICS iCalendar format (YYYYMMDDTHHMMSSZ)
 */
function formatICSDate(date: Date): string {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escapes characters for ICS fields
 */
function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Calculates target deadline date based on analysis
 */
function calculateTargetDate(analysis: JudicialNoticeAnalysis): Date {
  const noticeDate = parseDateToGregorian(analysis.caseDetails.noticeDate);
  const days = analysis.deadlines.durationDays || 5;

  if (noticeDate) {
    const target = new Date(noticeDate);
    target.setDate(target.getDate() + Number(days));
    target.setHours(9, 0, 0, 0);
    return target;
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + Number(days));
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}

/**
 * Generates an iCalendar (.ics) string for the judicial notice deadline
 */
export function generateJudicialNoticeICS(analysis: JudicialNoticeAnalysis): string {
  const now = new Date();
  const dtStamp = formatICSDate(now);
  const uid = `eblaghyar-deadline-${Date.now()}@eblaghyar.ir`;

  const deadline = analysis.deadlines;
  const caseDetails = analysis.caseDetails;

  const eventDate = calculateTargetDate(analysis);
  const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000); // 1 hour duration

  const summary = `🚨 آخرین مهلت قانونی ابلاغیه دادگاه: ${caseDetails.subject || 'رسیدگی قضایی'}`;
  
  const description = [
    `عنوان ابلاغیه: ${caseDetails.subject || 'ابلاغیه دادگستری'}`,
    `مرجع صادرکننده: ${caseDetails.issuingAuthority || 'قوه قضائیه'}`,
    `شماره ابلاغیه / کلاسه پرونده: ${caseDetails.noticeNumber || caseDetails.caseNumber || 'ندارد'}`,
    `شرح مهلت مقرر: ${deadline.deadlineDescription || `${deadline.durationDays || 5} روز`}`,
    `مستند قانونی: ${deadline.legalBasis || 'قانون آیین دادرسی'}`,
    `----------------------------------------`,
    `اقدام فوری مورد نیاز:`,
    `${analysis.actionItems.map((item, idx) => `${idx + 1}. [گام ${item.step}] ${item.title}: ${item.description}`).join('\n')}`,
    `----------------------------------------`,
    `عواقب عدم اقدام: ${analysis.consequencesOfInaction.join(' | ') || 'صدور حکم غیابی یا صدور دستور جلب'}`,
    `استخراج شده توسط سامانه ابلاغ‌یار (EblaghYar.ir)`
  ].join('\n');

  const location = caseDetails.issuingAuthority || 'دفتر خدمات الکترونیک قضایی / شعبه رسیدگی‌کننده';

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EblaghYar//Judicial Notice Reminder//FA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:مواعد قانونی ابلاغ‌یار',
    'X-WR-TIMEZONE:Asia/Tehran',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatICSDate(eventDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // 2 Days Before Alert
    'BEGIN:VALARM',
    'TRIGGER:-P2D',
    'ACTION:DISPLAY',
    `DESCRIPTION:یادآوری: فقط ۲ روز تا پایان مهلت قانونی ابلاغیه باقی مانده است!`,
    'END:VALARM',
    // 1 Day Before Alert
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:هشدار فوری: فردا آخرین مهلت قانونی ابلاغیه است!`,
    'END:VALARM',
    // 2 Hours Before Alert
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:مهلت نهایی اقدام برای ابلاغیه دادگاه امروز است.`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return icsLines.join('\r\n');
}

/**
 * Downloads the .ics file in browser
 */
export function downloadICSFile(analysis: JudicialNoticeAnalysis): void {
  const icsContent = generateJudicialNoticeICS(analysis);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const fileName = `moed-eblagh-${analysis.caseDetails.caseNumber || 'ghazayi'}.ics`;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Creates a direct Google Calendar Web link to add event with 1 click
 */
export function getGoogleCalendarLink(analysis: JudicialNoticeAnalysis): string {
  const deadline = analysis.deadlines;
  const caseDetails = analysis.caseDetails;

  const eventDate = calculateTargetDate(analysis);
  const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000);

  const formatGCalDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const title = encodeURIComponent(`🚨 مهلت قانونی ابلاغیه: ${caseDetails.subject || 'رسیدگی دادگاه'}`);
  const details = encodeURIComponent(
    `مرجع: ${caseDetails.issuingAuthority || 'قوه قضائیه'}\n` +
    `کلاسه/شماره: ${caseDetails.noticeNumber || caseDetails.caseNumber || 'ثبت شده'}\n` +
    `شرح مهلت: ${deadline.deadlineDescription}\n` +
    `عواقب عدم اقدام: ${analysis.consequencesOfInaction.join(' | ')}\n\n` +
    `استخراج شده با ابلاغ‌یار (EblaghYar.ir)`
  );
  const location = encodeURIComponent(caseDetails.issuingAuthority || 'دفتر خدمات الکترونیک قضایی');
  const dates = `${formatGCalDate(eventDate)}/${formatGCalDate(endDate)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
}
