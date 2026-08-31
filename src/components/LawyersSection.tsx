import React, { useState, useMemo } from 'react';
import {
  Scale,
  PhoneCall,
  Search,
  Filter,
  MapPin,
  Award,
  Clock,
  Sparkles,
  CheckCircle2,
  Calendar,
  Building,
  UserCheck,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react';
import {
  Lawyer,
  LawyerSpecialty,
  JudicialNoticeAnalysis,
  AuthUser,
} from '../types';
import {
  INITIAL_LAWYERS,
  PROVINCES_LIST,
  SPECIALTIES_LIST,
  matchLawyersForNotice,
} from '../data/lawyersData';

interface LawyersSectionProps {
  currentAnalysis?: JudicialNoticeAnalysis | null;
  currentUser?: AuthUser | null;
  onSelectLawyer: (lawyer: Lawyer) => void;
  isEmbeddedInAnalysis?: boolean;
}

export const LawyersSection: React.FC<LawyersSectionProps> = ({
  currentAnalysis,
  currentUser,
  onSelectLawyer,
  isEmbeddedInAnalysis = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('همه استان‌ها');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('همه تخصص‌ها');
  const [onlyAvailableNow, setOnlyAvailableNow] = useState(false);

  // Suggested matches based on current notice
  const matchedLawyers = useMemo(() => {
    if (currentAnalysis) {
      return matchLawyersForNotice(
        currentAnalysis.caseDetails.subject || '',
        currentAnalysis.caseDetails.issuingAuthority || '',
        INITIAL_LAWYERS
      );
    }
    return INITIAL_LAWYERS;
  }, [currentAnalysis]);

  // Filtered list
  const filteredLawyers = useMemo(() => {
    return matchedLawyers.filter((lawyer) => {
      // Province filter
      if (selectedProvince !== 'همه استان‌ها' && lawyer.province !== selectedProvince) {
        return false;
      }
      // Specialty filter
      if (
        selectedSpecialty !== 'همه تخصص‌ها' &&
        !lawyer.specialties.includes(selectedSpecialty as LawyerSpecialty)
      ) {
        return false;
      }
      // Only available now
      if (onlyAvailableNow && !lawyer.availableForImmediateCall) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = lawyer.fullName.toLowerCase().includes(q);
        const matchesCity = lawyer.city.toLowerCase().includes(q);
        const matchesBio = lawyer.bio.toLowerCase().includes(q);
        const matchesDistrict = (lawyer.courtDistrict || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCity && !matchesBio && !matchesDistrict) {
          return false;
        }
      }
      return true;
    });
  }, [matchedLawyers, selectedProvince, selectedSpecialty, onlyAvailableNow, searchQuery]);

  return (
    <div
      id="lawyers-network-section"
      className={`rounded-2xl sm:rounded-3xl border border-[#E5E2D9] bg-white overflow-hidden text-right ${
        isEmbeddedInAnalysis ? 'p-4 sm:p-7 shadow-sm mt-6 sm:mt-8' : 'p-4 sm:p-8 shadow-md'
      }`}
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#E5E2D9] pb-4 sm:pb-6 mb-4 sm:mb-6">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
            <Scale className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg text-[#3D3B38]">
                شبکه وکلای برگزیده دادگستری
              </h3>
              {isEmbeddedInAnalysis && (
                <span className="text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 rounded-full bg-[#FAF2ED] text-[#8B4513] font-bold border border-[#E8CEBF] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  پیشنهاد متناسب با این ابلاغیه
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-[#7A7874] mt-0.5">
              مشاوره تلفنی فوری، تنظیم لایحه دفاعیه تخصصی و ارزیابی پرونده توسط وکلای پایه یک
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#7A7874] absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام وکیل، شهر یا مجتمع قضایی..."
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#E5E2D9] text-xs focus:outline-none focus:border-[#7A8C70] focus:ring-1 focus:ring-[#7A8C70] bg-[#FAF8F5]"
            />
          </div>

          {/* Province Selector */}
          <div>
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2D9] text-xs focus:outline-none focus:border-[#7A8C70] bg-[#FAF8F5] cursor-pointer"
            >
              {PROVINCES_LIST.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </div>

          {/* Specialty Selector */}
          <div>
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2D9] text-xs focus:outline-none focus:border-[#7A8C70] bg-[#FAF8F5] cursor-pointer"
            >
              <option value="همه تخصص‌ها">همه تخصص‌ها</option>
              {SPECIALTIES_LIST.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Toggle Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[#7A7874]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAvailableNow}
              onChange={(e) => setOnlyAvailableNow(e.target.checked)}
              className="w-4 h-4 rounded text-[#7A8C70] focus:ring-[#7A8C70] accent-[#7A8C70] cursor-pointer"
            />
            <span className="text-[#4A4844] font-medium">
              فقط وکلای آماده پاسخگویی تلفنی فوری (همین الان)
            </span>
          </label>

          <span className="text-[11px] text-[#7A7874]">
            نمایش <strong>{filteredLawyers.length}</strong> وکیل پایه یک فعال
          </span>
        </div>
      </div>

      {/* Lawyers Cards Grid */}
      {filteredLawyers.length === 0 ? (
        <div className="py-12 text-center text-[#7A7874] space-y-2">
          <p className="font-semibold text-sm">وکیلی با فیلترهای انتخابی یافت نشد.</p>
          <button
            onClick={() => {
              setSelectedProvince('همه استان‌ها');
              setSelectedSpecialty('همه تخصص‌ها');
              setSearchQuery('');
              setOnlyAvailableNow(false);
            }}
            className="text-xs text-[#5A6D52] hover:underline cursor-pointer"
          >
            پاک کردن فیلترها و مشاهده همه وکلا
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredLawyers.map((lawyer) => (
            <div
              key={lawyer.id}
              className="p-5 rounded-2xl border border-[#E5E2D9] bg-[#FBFAF7] hover:bg-white hover:border-[#7A8C70]/50 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              {/* Lawyer Header */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8EFE5] text-[#5A6D52] font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                      {lawyer.fullName.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-sm text-[#3D3B38]">
                          {lawyer.fullName}
                        </h4>
                        {lawyer.verifiedBadge && (
                          <span title="پروانه تایید شده" className="inline-flex">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#7A8C70]" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#7A7874] mt-0.5">
                        {lawyer.licenseType} • پروانه {lawyer.licenseNumber}
                      </p>
                    </div>
                  </div>

                  {/* Rating & Status */}
                  <div className="text-left shrink-0">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold">
                      <span>★</span>
                      <span>{lawyer.rating}</span>
                      <span className="text-[10px] text-amber-700">({lawyer.reviewsCount})</span>
                    </div>
                    {lawyer.availableForImmediateCall && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700 font-bold justify-end">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        آماده تماس فوری
                      </div>
                    )}
                  </div>
                </div>

                {/* Specialties Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {lawyer.specialties.map((spec) => (
                    <span
                      key={spec}
                      className="text-[10px] px-2.5 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#E5E2D9] text-[#5C5A55] font-medium"
                    >
                      {spec}
                    </span>
                  ))}
                  <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#EBF0E8] text-[#5A6D52] font-bold">
                    {lawyer.experienceYears} سال تجربه
                  </span>
                </div>

                {/* Bio snippet */}
                <p className="text-xs text-[#5C5A55] leading-relaxed line-clamp-2">
                  {lawyer.bio}
                </p>

                {/* Location / Courts */}
                <div className="flex items-center gap-1.5 text-[11px] text-[#7A7874]">
                  <MapPin className="w-3.5 h-3.5 text-[#7A8C70] shrink-0" />
                  <span>
                    استان {lawyer.province}، شهر {lawyer.city}{' '}
                    {lawyer.courtDistrict ? `(${lawyer.courtDistrict})` : ''}
                  </span>
                </div>
              </div>

              {/* Action and Pricing Footer */}
              <div className="mt-4 pt-3.5 border-t border-[#EBE8E0] flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-[#7A7874] block">مشاوره تلفنی ۱۵ دقیقه:</span>
                  <span className="font-bold text-xs text-[#5A6D52]">
                    {lawyer.phoneFee15Min.toLocaleString('fa-IR')} تومان
                  </span>
                </div>

                <button
                  onClick={() => onSelectLawyer(lawyer)}
                  className="px-5 py-2.5 bg-[#7A8C70] hover:bg-[#68795F] text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>درخواست مشاوره فوری</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
