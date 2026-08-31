export interface LegalActionItem {
  step: number;
  title: string;
  stage?: string; // مرحله دادرسی (مثلاً: دادسرا، دادگاه بدوی، اجرای احکام، دفاتر خدمات الکترونیک قضایی)
  description: string;
  locationOrMethod: string; // کجا باید برود یا در چه سامانه‌ای ثبت کند
  legalReference?: string; // استناد به مواد قانونی ایران (مثلاً: ماده ۱۹۰ و ۱۸۰ قانون آیین دادرسی کیفری)
  timingAdvice?: string; // توصیه زمانی جهت جلوگیری از انقضای مهلت
  practicalTip?: string; // نکته کاربردی و تجربی در محاکم ایران
  requiredDocuments?: string[]; // مدارک مورد نیاز
}

export interface JudicialNoticeAnalysis {
  id?: string;
  title: string;
  summaryInSimpleWords: string;
  urgencyLevel: 'high' | 'medium' | 'low'; // فوریت بالا (مثلا احضار با اخطار جلب یا مهلت رو به اتمام)، متوسط، عادی
  urgencyReason: string;
  caseDetails: {
    noticeNumber?: string;
    caseNumber?: string;
    archiveNumber?: string;
    issuingAuthority: string; // مرجع صادرکننده (مثلا شعبه ۳ دادیاری دادسرای عمومی و انقلاب...)
    caseType: 'کیفری' | 'حقوقی' | 'خانواده' | 'شورای حل اختلاف' | 'اجرای احکام' | 'دیوان عدالت اداری' | 'نامشخص';
    userRole: string; // نقش شما (مثلا: متهم، شاکی، خواهان، خوانده، مطلع، محکوم‌علیه، ...)
    otherParties?: string[]; // طرف مقابل / سایر اشخاص
    subject: string; // موضوع اتهام یا خواسته دعوا
    noticeDate?: string; // تاریخ صدور / ابلاغ
  };
  deadlines: {
    durationDays?: number; // تعداد روز مهلت
    deadlineDescription: string; // شرح مهلت (مثلا: ۵ روز از تاریخ درج در سامانه ابلاغ جهت حضور...)
    legalBasis: string; // مستند قانونی (مثلا: ماده ۱۷۸ قانون آیین دادرسی کیفری)
    calculationRule: string; // نحوه محاسبه موعد (روز ابلاغ و اقدام جزء مهلت نیست و تعطیلات رسمی)
    isCritical: boolean;
  };
  actionItems: LegalActionItem[];
  consequencesOfInaction: string[]; // عواقب عدم اقدام (مثلا صدور دستور جلب، محکومیت غیابی، مسدودی حساب)
  glossary: {
    term: string;
    plainMeaning: string;
  }[];
  sampleDraftLayehe?: {
    title: string;
    description: string;
    draftText: string;
  };
  importantNotes: string[];
}

export interface AnalysisHistoryItem {
  id: string;
  date: string;
  fileName: string;
  summary: string;
  authority: string;
  urgency: 'high' | 'medium' | 'low';
  analysis: JudicialNoticeAnalysis;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sectionTag?: string; // برچسب بخشی که سوال درباره آن پرسیده شده
}

export interface SectionQueryContext {
  sectionTitle: string;
  sectionSnippet: string;
  suggestedPrompt?: string;
}

export interface AuthUser {
  phoneNumber: string;
  maskedPhone: string;
  role?: string;
  verifiedAt?: string;
  loggedInSince?: number;
}

export type LawyerSpecialty =
  | 'ملکی و اراضی'
  | 'کیفری و جرایم'
  | 'چک و اسناد تجاری'
  | 'خانواده و مهریه'
  | 'قراردادها و شرکت‌ها'
  | 'کار و دیوان عدالت اداری'
  | 'انحصار وراثت و ارث'
  | 'عمومی و حقوقی';

export type LawyerLicenseType =
  | 'پایه یک کانون وکلای دادگستری (اسکودا)'
  | 'پایه یک مرکز وکلای قوه قضائیه';

export type ConsultationType = 'phone15' | 'phone30' | 'documentReview' | 'inPerson';

export interface Lawyer {
  id: string;
  fullName: string;
  avatarUrl?: string;
  gender: 'male' | 'female';
  licenseType: LawyerLicenseType;
  licenseNumber: string;
  province: string;
  city: string;
  courtDistrict?: string; // مجتمع‌های قضایی نزدیک یا منطقه شهرداری
  experienceYears: number;
  specialties: LawyerSpecialty[];
  rating: number; // e.g. 4.9
  reviewsCount: number;
  satisfactionRate: number; // درصد رضایت e.g. 98%
  isOnline: boolean;
  availableForImmediateCall: boolean;
  phoneFee15Min: number; // تومان
  phoneFee30Min: number; // تومان
  inPersonFee: number; // تومان
  documentReviewFee: number; // تومان
  bio: string;
  officeAddress: string;
  verifiedBadge: boolean;
}

export interface ConsultationBookingRequest {
  id: string;
  lawyerId: string;
  lawyerName: string;
  userPhone: string;
  userName: string;
  consultationType: ConsultationType;
  preferredDate?: string;
  preferredTimeSlot?: string;
  caseSubject?: string;
  caseSummary?: string;
  caseNumber?: string;
  userNotes?: string;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'completed';
  amount: number;
}

