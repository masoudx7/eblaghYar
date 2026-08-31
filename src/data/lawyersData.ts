import { Lawyer, LawyerSpecialty } from '../types';

export const PROVINCES_LIST = [
  'همه استان‌ها',
  'تهران',
  'البرز',
  'خراسان رضوی',
  'اصفهان',
  'فارس',
  'آذربایجان شرقی',
  'خوزستان',
  'مازندران',
  'گیلان',
  'قم',
  'کرمانشاه',
  'یزد',
];

export const SPECIALTIES_LIST: LawyerSpecialty[] = [
  'ملکی و اراضی',
  'کیفری و جرایم',
  'چک و اسناد تجاری',
  'خانواده و مهریه',
  'قراردادها و شرکت‌ها',
  'کار و دیوان عدالت اداری',
  'انحصار وراثت و ارث',
  'عمومی و حقوقی',
];

export const INITIAL_LAWYERS: Lawyer[] = [
  {
    id: 'lawyer-1',
    fullName: 'دکتر علیرضا رستمی',
    gender: 'male',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۲۱۴۸۵',
    province: 'تهران',
    city: 'تهران',
    courtDistrict: 'مجتمع قضایی شهید بهشتی، ونک و میرداماد',
    experienceYears: 16,
    specialties: ['ملکی و اراضی', 'قراردادها و شرکت‌ها', 'چک و اسناد تجاری'],
    rating: 4.9,
    reviewsCount: 128,
    satisfactionRate: 99,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 250000,
    phoneFee30Min: 450000,
    inPersonFee: 800000,
    documentReviewFee: 500000,
    bio: 'دکترای حقوق خصوصی از دانشگاه تهران، عضو هیات علمی، تخصص ویژه در دعاوی ملکی پیچیده، الزام به تنظیم سند، دعاوی شهرداری و قراردادهای مشارکت در ساخت.',
    officeAddress: 'تهران، میدان ونک، خیابان ملاصدرا، پلاک ۶۴، طبقه ۳',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-2',
    fullName: 'سرکار خانم مریم سعادتمند',
    gender: 'female',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۱۸۷۹۰',
    province: 'تهران',
    city: 'تهران',
    courtDistrict: 'مجتمع قضایی خانواده یک (محلاتی) و ونک',
    experienceYears: 12,
    specialties: ['خانواده و مهریه', 'انحصار وراثت و ارث', 'عمومی و حقوقی'],
    rating: 4.9,
    reviewsCount: 154,
    satisfactionRate: 98,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 200000,
    phoneFee30Min: 380000,
    inPersonFee: 700000,
    documentReviewFee: 400000,
    bio: 'کارشناس ارشد حقوق جزا و جرم‌شناسی، سابقه بیش از ۱۲ سال دفاع تخصصی در دعاوی خانواده، وصول مهریه، حضانت فرزندان، تقسیم ترکه و انحصار وراثت.',
    officeAddress: 'تهران، خیابان شریعتی، بالاتر از پل رومی، ساختمان پزشکان و وکلا، طبقه ۲',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-3',
    fullName: 'استاد محمدرضا کاظمی‌فر',
    gender: 'male',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۱۳۲۱۰',
    province: 'تهران',
    city: 'تهران',
    courtDistrict: 'دادسرا و دادگاه انقلاب و مجتمع قضایی کارکنان دولت',
    experienceYears: 22,
    specialties: ['کیفری و جرایم', 'چک و اسناد تجاری', 'قراردادها و شرکت‌ها'],
    rating: 5.0,
    reviewsCount: 210,
    satisfactionRate: 100,
    isOnline: true,
    availableForImmediateCall: false,
    phoneFee15Min: 300000,
    phoneFee30Min: 550000,
    inPersonFee: 1000000,
    documentReviewFee: 700000,
    bio: 'قاضی اسبق دادگستری، وکیل تخصصی جرایم اقتصادی، کلاهبرداری، خیانت در امانت، جرایم رایانه‌ای و دعاوی سنگین بانکی و ارزی.',
    officeAddress: 'تهران، خیابان ولیعصر، تقاطع مطهری، برج سپهر، طبقه ۸',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-4',
    fullName: 'دکتر فاطمه محمدزاده',
    gender: 'female',
    licenseType: 'پایه یک مرکز وکلای قوه قضائیه',
    licenseNumber: '۲۹۸۴۱',
    province: 'البرز',
    city: 'کرج',
    courtDistrict: 'مجتمع قضایی شهید بهشتی کرج و فردیس',
    experienceYears: 9,
    specialties: ['ملکی و اراضی', 'چک و اسناد تجاری', 'کار و دیوان عدالت اداری'],
    rating: 4.8,
    reviewsCount: 84,
    satisfactionRate: 96,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 180000,
    phoneFee30Min: 320000,
    inPersonFee: 500000,
    documentReviewFee: 350000,
    bio: 'کارشناس ارشد حقوق اقتصادی، مسلط به قوانین کار و تامین اجتماعی، وصول مطالبات چک و سفته و دعاوی اداره کار و شهرداری.',
    officeAddress: 'کرج، میدان شهدا، خیابان بهار، برج اداری مهر، طبقه ۴',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-5',
    fullName: 'سید حسین حسینی‌تبار',
    gender: 'male',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۱۴۰۹۲',
    province: 'خراسان رضوی',
    city: 'مشهد',
    courtDistrict: 'مجتمع قضایی امام خمینی و شهید کلاهدوز مشهد',
    experienceYears: 14,
    specialties: ['ملکی و اراضی', 'کیفری و جرایم', 'خانواده و مهریه'],
    rating: 4.9,
    reviewsCount: 96,
    satisfactionRate: 97,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 220000,
    phoneFee30Min: 400000,
    inPersonFee: 650000,
    documentReviewFee: 400000,
    bio: 'وکیل پایه یک دادگستری استان خراسان رضوی، با بیش از ۷۰۰ پرونده موفق در حوزه دعاوی املاک آستان قدس، قراردادهای مشارکت، دعاوی کیفری و اسناد رسمی.',
    officeAddress: 'مشهد، بلوار سجاد، بین بهار و گلستان، ساختمان اداری آراد، طبقه ۵',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-6',
    fullName: 'مهدی رحیمی نجف‌آبادی',
    gender: 'male',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۱۶۳۴۰',
    province: 'اصفهان',
    city: 'اصفهان',
    courtDistrict: 'مجتمع قضایی ۲۲ بهمن و دادگستری نیکبخت اصفهان',
    experienceYears: 11,
    specialties: ['قراردادها و شرکت‌ها', 'چک و اسناد تجاری', 'کار و دیوان عدالت اداری'],
    rating: 4.8,
    reviewsCount: 72,
    satisfactionRate: 98,
    isOnline: false,
    availableForImmediateCall: false,
    phoneFee15Min: 190000,
    phoneFee30Min: 350000,
    inPersonFee: 600000,
    documentReviewFee: 380000,
    bio: 'مشاور حقوقی شرکت‌های صنعتی استان اصفهان، متخصص در تنظیم قراردادهای تجاری، وصول مطالبات چک و دفاع در هیات‌های حل اختلاف مالیاتی و اداره کار.',
    officeAddress: 'اصفهان، چهارباغ بالا، مجتمع تجاری اداری کوثر، فاز ۲، طبقه ۳',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-7',
    fullName: 'الهام قوامی شیرازی',
    gender: 'female',
    licenseType: 'پایه یک مرکز وکلای قوه قضائیه',
    licenseNumber: '۲۵۱۲۰',
    province: 'فارس',
    city: 'شیراز',
    courtDistrict: 'مجتمع قضایی ملاصدرا و دادگاه تجدیدنظر استان فارس',
    experienceYears: 10,
    specialties: ['خانواده و مهریه', 'ملکی و اراضی', 'انحصار وراثت و ارث'],
    rating: 4.9,
    reviewsCount: 88,
    satisfactionRate: 99,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 200000,
    phoneFee30Min: 360000,
    inPersonFee: 650000,
    documentReviewFee: 400000,
    bio: 'وکیل پایه یک با تمرکز تخصصی بر دعاوی ملکی شیراز، تفکیک و افراز اراضی، وصول مهریه و تقسیم ماترک ارث با سال‌ها تجربه پیروزی در پرونده‌های حقوقی.',
    officeAddress: 'شیراز، خیابان زند، نبش خیابان هفت تیر، برج اداری زند، طبقه ۶',
    verifiedBadge: true,
  },
  {
    id: 'lawyer-8',
    fullName: 'بابک نوبخت تبریزی',
    gender: 'male',
    licenseType: 'پایه یک کانون وکلای دادگستری (اسکودا)',
    licenseNumber: '۱۷۵۵۰',
    province: 'آذربایجان شرقی',
    city: 'تبریز',
    courtDistrict: 'مجتمع قضایی شهید قاضی طباطبایی تبریز',
    experienceYears: 13,
    specialties: ['کیفری و جرایم', 'چک و اسناد تجاری', 'قراردادها و شرکت‌ها'],
    rating: 4.8,
    reviewsCount: 64,
    satisfactionRate: 96,
    isOnline: true,
    availableForImmediateCall: true,
    phoneFee15Min: 210000,
    phoneFee30Min: 390000,
    inPersonFee: 700000,
    documentReviewFee: 450000,
    bio: 'وکیل مدافع در دعاوی کیفری، خیانت در امانت، چک صیادی، دفاع در دعاوی تجاری و بازرگانی و تنظیم لوایح تخصصی تجدیدنظرخواهی و دیوان عالی کشور.',
    officeAddress: 'تبریز، خیابان آبرسان، برج بلور، طبقه ۹',
    verifiedBadge: true,
  },
];

/**
 * Match relevant lawyers based on notice analysis results
 */
export function matchLawyersForNotice(
  subject: string,
  issuingAuthority: string,
  lawyers: Lawyer[] = INITIAL_LAWYERS
): Lawyer[] {
  const normSubject = subject.toLowerCase();
  const normAuthority = issuingAuthority.toLowerCase();

  // Determine likely specialty
  let targetSpecialty: LawyerSpecialty | null = null;
  if (
    normSubject.includes('ملک') ||
    normSubject.includes('زمین') ||
    normSubject.includes('سند') ||
    normSubject.includes('تخلیه') ||
    normSubject.includes('اجاره') ||
    normSubject.includes('خلع ید') ||
    normSubject.includes('تصرف')
  ) {
    targetSpecialty = 'ملکی و اراضی';
  } else if (
    normSubject.includes('کیفر') ||
    normSubject.includes('اتهام') ||
    normSubject.includes('کلاهبرداری') ||
    normSubject.includes('جلب') ||
    normSubject.includes('خیانت') ||
    normSubject.includes('سرقت') ||
    normSubject.includes('دادسرا') ||
    normSubject.includes('جرم')
  ) {
    targetSpecialty = 'کیفری و جرایم';
  } else if (
    normSubject.includes('چک') ||
    normSubject.includes('سفته') ||
    normSubject.includes('طلب') ||
    normSubject.includes('مطالبه وجه') ||
    normSubject.includes('صیاد')
  ) {
    targetSpecialty = 'چک و اسناد تجاری';
  } else if (
    normSubject.includes('مهریه') ||
    normSubject.includes('طلاق') ||
    normSubject.includes('نفقه') ||
    normSubject.includes('تمکین') ||
    normSubject.includes('حضانت') ||
    normSubject.includes('خانواده')
  ) {
    targetSpecialty = 'خانواده و مهریه';
  } else if (
    normSubject.includes('ارث') ||
    normSubject.includes('ترکه') ||
    normSubject.includes('انحصار وراثت') ||
    normSubject.includes('ماترک')
  ) {
    targetSpecialty = 'انحصار وراثت و ارث';
  } else if (
    normSubject.includes('کارگر') ||
    normSubject.includes('کارفرما') ||
    normSubject.includes('اداره کار') ||
    normSubject.includes('دیوان عدالت') ||
    normSubject.includes('بیمه')
  ) {
    targetSpecialty = 'کار و دیوان عدالت اداری';
  }

  // Detect Province/City from issuing authority
  let detectedProvince: string | null = null;
  if (
    normAuthority.includes('تهران') ||
    normAuthority.includes('بهشتی') ||
    normAuthority.includes('محلاتی') ||
    normAuthority.includes('میرداماد')
  ) {
    detectedProvince = 'تهران';
  } else if (normAuthority.includes('مشهد') || normAuthority.includes('خراسان')) {
    detectedProvince = 'خراسان رضوی';
  } else if (normAuthority.includes('اصفهان')) {
    detectedProvince = 'اصفهان';
  } else if (normAuthority.includes('شیراز') || normAuthority.includes('فارس')) {
    detectedProvince = 'فارس';
  } else if (normAuthority.includes('کرج') || normAuthority.includes('البرز')) {
    detectedProvince = 'البرز';
  } else if (normAuthority.includes('تبریز') || normAuthority.includes('آذربایجان')) {
    detectedProvince = 'آذربایجان شرقی';
  }

  // Sort with priorities: match specialty > match province > rating
  return [...lawyers].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (targetSpecialty) {
      if (a.specialties.includes(targetSpecialty)) scoreA += 10;
      if (b.specialties.includes(targetSpecialty)) scoreB += 10;
    }

    if (detectedProvince) {
      if (a.province === detectedProvince) scoreA += 5;
      if (b.province === detectedProvince) scoreB += 5;
    }

    if (a.isOnline) scoreA += 2;
    if (b.isOnline) scoreB += 2;

    scoreA += a.rating;
    scoreB += b.rating;

    return scoreB - scoreA;
  });
}
