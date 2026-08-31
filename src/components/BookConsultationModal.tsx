import React, { useState } from 'react';
import {
  X,
  PhoneCall,
  FileText,
  Building,
  Clock,
  CheckCircle2,
  Scale,
  Calendar,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Send,
  CreditCard,
} from 'lucide-react';
import {
  Lawyer,
  ConsultationType,
  ConsultationBookingRequest,
  JudicialNoticeAnalysis,
  AuthUser,
} from '../types';

interface BookConsultationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lawyer: Lawyer | null;
  currentAnalysis?: JudicialNoticeAnalysis | null;
  currentUser?: AuthUser | null;
  onSuccessBooking?: (booking: ConsultationBookingRequest) => void;
}

export const BookConsultationModal: React.FC<BookConsultationModalProps> = ({
  isOpen,
  onClose,
  lawyer,
  currentAnalysis,
  currentUser,
  onSuccessBooking,
}) => {
  if (!isOpen || !lawyer) return null;

  const [consultationType, setConsultationType] = useState<ConsultationType>('phone15');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState(currentUser?.phoneNumber || '');
  const [userNotes, setUserNotes] = useState('');
  const [attachNoticeSummary, setAttachNoticeSummary] = useState(true);
  const [preferredDate, setPreferredDate] = useState('امروز / در اولین فرصت');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('همین الان (فوری)');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<ConsultationBookingRequest | null>(null);

  const getFee = (type: ConsultationType): number => {
    switch (type) {
      case 'phone15':
        return lawyer.phoneFee15Min;
      case 'phone30':
        return lawyer.phoneFee30Min;
      case 'documentReview':
        return lawyer.documentReviewFee;
      case 'inPerson':
        return lawyer.inPersonFee;
      default:
        return lawyer.phoneFee15Min;
    }
  };

  const handleBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPhone.trim()) return;

    setIsSubmitting(true);

    setTimeout(() => {
      const newBooking: ConsultationBookingRequest = {
        id: `BOOK-${Date.now().toString().slice(-6)}`,
        lawyerId: lawyer.id,
        lawyerName: lawyer.fullName,
        userName: userName.trim() || 'کاربر گرامی',
        userPhone: userPhone.trim(),
        consultationType,
        preferredDate,
        preferredTimeSlot,
        caseSubject: currentAnalysis?.caseDetails.subject,
        caseNumber: currentAnalysis?.caseDetails.caseNumber,
        caseSummary: attachNoticeSummary ? currentAnalysis?.summaryInSimpleWords : undefined,
        userNotes: userNotes.trim(),
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        amount: getFee(consultationType),
      };

      setConfirmedBooking(newBooking);
      setIsSubmitting(false);
      setIsSuccess(true);
      if (onSuccessBooking) {
        onSuccessBooking(newBooking);
      }
    }, 800);
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setConfirmedBooking(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-[#3D3B38]/60 backdrop-blur-xs animate-in fade-in duration-200 text-right overflow-y-auto">
      <div
        id="book-consultation-modal"
        className="relative w-full max-w-xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-[#E5E2D9] overflow-hidden max-h-[94vh] sm:max-h-[92vh] flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
              <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#4A4844] text-xs sm:text-base truncate">
                درخواست مشاوره با {lawyer.fullName}
              </h3>
              <p className="text-[11px] sm:text-xs text-[#7A7874] mt-0.5 truncate">
                {lawyer.licenseType} • شماره پروانه {lawyer.licenseNumber}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1.5 sm:p-2 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] transition-colors cursor-pointer shrink-0"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-[#3D3B38]">
          {isSuccess && confirmedBooking ? (
            /* Success State */
            <div className="py-4 sm:py-6 text-center space-y-3 sm:space-y-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#EBF0E8] text-[#5A6D52] flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#3D3B38]">
                درخواست مشاوره با موفقیت ثبت شد
              </h4>
              <p className="text-xs sm:text-sm text-[#5C5A55] max-w-md mx-auto leading-relaxed">
                کد رهگیری شما: <strong className="font-mono text-[#5A6D52]">{confirmedBooking.id}</strong>
                <br />
                {confirmedBooking.consultationType.startsWith('phone')
                  ? 'وکیل اطلاعات و خلاصه ابلاغیه شما را دریافت نموده و به زودی از طریق خط امن با شماره شما تماس خواهد گرفت.'
                  : 'درخواست شما برای وکیل ارسال شد و پیامک هماهنگی نوبت به زودی به شماره شما ارسال می‌شود.'}
              </p>

              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] text-xs text-right space-y-2.5 sm:space-y-3 max-w-md mx-auto">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#5A6D52] font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#7A8C70]" />
                    <span>مرحله ۱: ارسال اطلاعات و خلاصه پرونده به پنل وکیل</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#5A6D52] font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#7A8C70]" />
                    <span>مرحله ۲: بررسی اولیه موضوع و تایید نوبت توسط وکیل</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#8B4513] font-bold text-xs">
                    <Clock className="w-4 h-4 text-[#8B4513] animate-spin" />
                    <span>مرحله ۳: در صف تماس امن (حداکثر تا ۳ دقیقه آینده)</span>
                  </div>
                </div>

                <div className="border-t border-[#E5E2D9] pt-2.5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#7A7874]">وکیل پاسخگو:</span>
                    <span className="font-bold text-[#4A4844]">{lawyer.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7A7874]">نوع خدمت:</span>
                    <span className="font-medium text-[#4A4844]">
                      {consultationType === 'phone15' && 'مشاوره تلفنی ۱۵ دقیقه'}
                      {consultationType === 'phone30' && 'مشاوره تلفنی ۳۰ دقیقه'}
                      {consultationType === 'documentReview' && 'بررسی پرونده و تنظیم لایحه'}
                      {consultationType === 'inPerson' && 'مشاوره حضوری در دفتر وکیل'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7A7874]">شماره تماس شما:</span>
                    <span className="font-mono font-bold text-[#4A4844]">{confirmedBooking.userPhone}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#E5E2D9] pt-2">
                    <span className="text-[#7A7874]">مبلغ:</span>
                    <span className="font-bold text-[#5A6D52]">{getFee(consultationType).toLocaleString('fa-IR')} تومان</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleResetAndClose}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#7A8C70] hover:bg-[#68795F] text-white font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl transition-colors cursor-pointer shadow-md"
                >
                  بازگشت به تحلیل ابلاغیه
                </button>
              </div>
            </div>
          ) : (
            /* Booking Form */
            <form onSubmit={handleBooking} className="space-y-4 sm:space-y-5">
              {/* Lawyer Brief Info Card */}
              <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#E8EFE5] text-[#5A6D52] font-bold flex items-center justify-center text-xs sm:text-sm shrink-0">
                    {lawyer.fullName.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs sm:text-sm text-[#4A4844] flex items-center gap-1.5 truncate">
                      <span>{lawyer.fullName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EBF0E8] text-[#5A6D52] font-semibold shrink-0">
                        {lawyer.experienceYears} سال سابقه
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mt-0.5 truncate">
                      {lawyer.province}، {lawyer.city} {lawyer.courtDistrict ? `• ${lawyer.courtDistrict}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-xs font-bold text-[#B8860B] flex items-center gap-1 justify-end">
                    <span>★</span>
                    <span>{lawyer.rating}</span>
                  </div>
                  <span className="text-[10px] text-[#7A7874]">{lawyer.satisfactionRate}% رضایت</span>
                </div>
              </div>

              {/* Consultation Type Selector */}
              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-2">
                  انتخاب نوع مشاوره:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                  {/* Phone 15 min */}
                  <div
                    onClick={() => setConsultationType('phone15')}
                    className={`p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all ${
                      consultationType === 'phone15'
                        ? 'border-[#7A8C70] bg-[#FAFBF9] ring-2 ring-[#7A8C70]/20'
                        : 'border-[#E5E2D9] bg-white hover:border-[#D5D2C9]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#4A4844] flex items-center gap-1.5">
                        <PhoneCall className="w-3.5 h-3.5 text-[#7A8C70]" />
                        مشاوره تلفنی (۱۵ دقیقه)
                      </span>
                      {lawyer.availableForImmediateCall && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          فوری
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mb-2">
                      پاسخگویی سریع به سوالات فوری و بررسی وضعیت اولیه
                    </p>
                    <div className="text-left font-bold text-xs text-[#5A6D52]">
                      {lawyer.phoneFee15Min.toLocaleString('fa-IR')} تومان
                    </div>
                  </div>

                  {/* Phone 30 min */}
                  <div
                    onClick={() => setConsultationType('phone30')}
                    className={`p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all ${
                      consultationType === 'phone30'
                        ? 'border-[#7A8C70] bg-[#FAFBF9] ring-2 ring-[#7A8C70]/20'
                        : 'border-[#E5E2D9] bg-white hover:border-[#D5D2C9]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#4A4844] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#7A8C70]" />
                        مشاوره تفصیلی (۳۰ دقیقه)
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mb-2">
                      بررسی کامل جوانب حقوقی و نقشه راه دفاع
                    </p>
                    <div className="text-left font-bold text-xs text-[#5A6D52]">
                      {lawyer.phoneFee30Min.toLocaleString('fa-IR')} تومان
                    </div>
                  </div>

                  {/* Document Review & Layehe */}
                  <div
                    onClick={() => setConsultationType('documentReview')}
                    className={`p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all ${
                      consultationType === 'documentReview'
                        ? 'border-[#7A8C70] bg-[#FAFBF9] ring-2 ring-[#7A8C70]/20'
                        : 'border-[#E5E2D9] bg-white hover:border-[#D5D2C9]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#4A4844] flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#7A8C70]" />
                        بررسی پرونده و تنظیم لایحه
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mb-2">
                      تنظیم لایحه رسمی جهت ثبت در دفاتر خدمات قضایی
                    </p>
                    <div className="text-left font-bold text-xs text-[#5A6D52]">
                      {lawyer.documentReviewFee.toLocaleString('fa-IR')} تومان
                    </div>
                  </div>

                  {/* In Person */}
                  <div
                    onClick={() => setConsultationType('inPerson')}
                    className={`p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all ${
                      consultationType === 'inPerson'
                        ? 'border-[#7A8C70] bg-[#FAFBF9] ring-2 ring-[#7A8C70]/20'
                        : 'border-[#E5E2D9] bg-white hover:border-[#D5D2C9]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#4A4844] flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-[#7A8C70]" />
                        مشاوره حضوری در دفتر وکیل
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mb-2">
                      دیدار حضوری، تحویل اسناد و مذاکره برای وکالت
                    </p>
                    <div className="text-left font-bold text-xs text-[#5A6D52]">
                      {lawyer.inPersonFee.toLocaleString('fa-IR')} تومان
                    </div>
                  </div>
                </div>
              </div>

              {/* Attach AI Notice Summary Toggle */}
              {currentAnalysis && (
                <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#FAF8F5] border border-[#EBE8E0] flex items-start gap-2.5 sm:gap-3">
                  <input
                    type="checkbox"
                    id="attach-summary"
                    checked={attachNoticeSummary}
                    onChange={(e) => setAttachNoticeSummary(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded text-[#7A8C70] focus:ring-[#7A8C70] accent-[#7A8C70] cursor-pointer shrink-0"
                  />
                  <label htmlFor="attach-summary" className="text-xs cursor-pointer">
                    <span className="font-bold text-[#4A4844] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#7A8C70]" />
                      ارسال خودکار خلاصه هوشمند ابلاغیه برای وکیل
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-[#7A7874] mt-0.5 leading-relaxed">
                      خلاصه موعد قانونی، موضوع پرونده ({currentAnalysis.caseDetails.subject || 'ابلاغیه جاری'}) و مرجع صادرکننده برای وکیل ارسال می‌شود تا زمان مشاوره ذخیره شود.
                    </p>
                  </label>
                </div>
              )}

              {/* User Contact Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#4A4844] mb-1">
                    نام و نام خانوادگی (اختیاری):
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="مثال: علی رضایی"
                    className="w-full px-3.5 py-2 sm:py-2.5 rounded-xl border border-[#E5E2D9] text-xs focus:outline-none focus:border-[#7A8C70] focus:ring-1 focus:ring-[#7A8C70]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4A4844] mb-1">
                    شماره همراه جهت تماس وکیل: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="09123456789"
                    className="w-full px-3.5 py-2 sm:py-2.5 rounded-xl border border-[#E5E2D9] text-xs font-mono text-center focus:outline-none focus:border-[#7A8C70] focus:ring-1 focus:ring-[#7A8C70]"
                  />
                </div>
              </div>

              {/* User Notes */}
              <div>
                <label className="block text-xs font-bold text-[#4A4844] mb-1">
                  توضیحات کوتاه یا سوال مشخص شما از وکیل:
                </label>
                <textarea
                  rows={2}
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="مثلاً: ابلاغیه برای مهلت ۵ روزه دادسرا است و می‌خواهم بدانم آیا برای جلسه اول نیاز به حضور خودم است یا خیر..."
                  className="w-full px-3.5 py-2 sm:py-2.5 rounded-xl border border-[#E5E2D9] text-xs focus:outline-none focus:border-[#7A8C70] focus:ring-1 focus:ring-[#7A8C70]"
                />
              </div>

              {/* Office Address for in-person */}
              {consultationType === 'inPerson' && (
                <div className="p-3 rounded-xl sm:rounded-2xl bg-[#FBFAF7] border border-[#E5E2D9] text-xs">
                  <span className="font-bold text-[#4A4844] flex items-center gap-1 mb-1">
                    <Building className="w-3.5 h-3.5 text-[#7A8C70]" />
                    نشانی دفتر وکیل:
                  </span>
                  <p className="text-[#5C5A55] text-[11px] leading-relaxed">
                    {lawyer.officeAddress}
                  </p>
                </div>
              )}

              {/* Fast Response Guarantee Banner */}
              <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#F0F4EF] border border-[#D5DFD0] flex items-center gap-2 text-xs text-[#5A6D52]">
                <ShieldCheck className="w-4 h-4 text-[#7A8C70] shrink-0" />
                <div className="leading-relaxed text-[11px] sm:text-xs">
                  <strong className="text-[#3D4839]">تضمین پاسخگویی ۳ دقیقه‌ای:</strong> در صورت عدم پاسخگویی وکیل، درخواست خودکار به وکیل آماده‌باش بعدی ارجاع داده می‌شود.
                </div>
              </div>

              {/* Submit Button & Total */}
              <div className="pt-2 border-t border-[#E5E2D9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center justify-between sm:block">
                  <span className="text-[11px] text-[#7A7874] block">مبلغ قابل پرداخت:</span>
                  <span className="font-bold text-sm text-[#5A6D52]">
                    {getFee(consultationType).toLocaleString('fa-IR')} تومان
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !userPhone.trim()}
                  className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-[#7A8C70] hover:bg-[#68795F] disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span>در حال برقراری ارتباط با وکیل...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>تایید و هماهنگی مشاوره فوری</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
