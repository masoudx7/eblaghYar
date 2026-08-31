import { JudicialNoticeAnalysis } from "../types";

export interface DefenseDraftOptions {
  draftType:
    | "defense_denial" // لایحه دفاعیه ماهوی و انکار اتهام / ادعا
    | "extension_request" // تقاضای استمهال و مهلت مطالعه پرونده
    | "procedural_objection" // ایراد شکلی و عدم صلاحیت / نقص ادله
    | "settlement_proposal" // تقاضای سازش و اعلام رضایت / ارجاع به داوری
    | "general_response"; // پاسخ عمومی و اعلام حضور در موعد
  userCustomFacts?: string; // توضیحات تکمیلی یا دفاعیات خاص کاربر
  attachedEvidences?: string[]; // ضمائم و مدارک پیوست
  userFullName?: string; // نام و نام خانوادگی متقاضی
  userNationalCode?: string; // کد ملی
  lawyerName?: string; // نام وکیل انتخابی در صورت وجود
}

export interface GeneratedDefenseDraft {
  id: string;
  draftType: string;
  typeTitle: string;
  recipientAuthority: string;
  subjectLine: string;
  caseIdentifiers: {
    caseNumber: string;
    archiveNumber: string;
    noticeNumber: string;
  };
  parties: {
    petitioner: string; // نام تنظیم‌کننده / متقاضی
    respondentOrPlaintiff: string; // طرف مقابل
  };
  preamble: string; // مقدمه و اعلام حضور
  legalArguments: string[]; // بندهای استدلال حقوقی و دفاعیات
  statutoryReferences: string[]; // استناد به مواد قانون
  petitionsAndRequests: string[]; // خواسته‌ها و تقاضاهای مشخص از قاضی
  attachmentsList: string[]; // فهرست پیوست‌ها و منضمات
  closingGreeting: string; // امضا و خاتمه
  fullFormattedText: string; // متن کامل و پیوسته آماده پرینت یا کپی
  lawyerReviewAdvice: string; // توصیه وکیل برای اصلاح نهایی
}

/**
 * Generates an intelligent, structured defense draft based on Iranian Judicial Formats
 */
export function buildDefenseDraft(
  analysis: JudicialNoticeAnalysis,
  options: DefenseDraftOptions
): GeneratedDefenseDraft {
  const caseDetails = analysis.caseDetails;
  const isCriminal = caseDetails.caseType === "کیفری";
  const userRole = caseDetails.userRole || (isCriminal ? "متهم" : "خوانده");
  const issuingAuthority = caseDetails.issuingAuthority || "شعبه رسیدگی‌کننده دادگستری";
  const caseNumber = caseDetails.caseNumber || "[شماره پرونده / کلاسه]";
  const archiveNumber = caseDetails.archiveNumber || "[شماره بایگانی شعبه]";
  const noticeNumber = caseDetails.noticeNumber || "[شماره ابلاغیه]";
  const userName = options.userFullName?.trim() || "[نام و نام خانوادگی کاربر]";
  const userNationalCode = options.userNationalCode?.trim() || "[کد ملی ۱۰ رقمی]";
  const subject = caseDetails.subject || "رسیدگی به موضوع مطروحه";

  let typeTitle = "لایحه دفاعیه و اعلام موضع";
  let preamble = "";
  const legalArguments: string[] = [];
  const statutoryReferences: string[] = [];
  const petitionsAndRequests: string[] = [];
  const attachmentsList: string[] = [];
  let lawyerReviewAdvice = "";

  // 1. Determine draft structure by chosen type
  switch (options.draftType) {
    case "extension_request":
      typeTitle = "لایحه اعلام حضور در موعد قانونی و تقاضای استمهال (مهلت) جهت مطالعه پرونده و معرفی وکیل";
      preamble = `احتراماً پیرو ابلاغیه شماره ${noticeNumber} در خصوص پرونده کلاسه ${caseNumber} (بایگانی ${archiveNumber}) مطروحه در آن شعبه محترم، اینجانب ${userName} دارای سمت «${userRole}»، ضمن اعلام حضور در فرجه قانونی و تأکید بر احترام کامل به احضاریه قضایی، مراتب زیر را به استحضار عالی می‌رساند:`;
      
      legalArguments.push(
        "اینجانب بلافاصله پس از رویت ابلاغیه در سامانه ابلاغ الکترونیک قضایی (ثنا)، جهت احقاق حق و دفاع از خویش در مهلت قانونی اقدام نموده‌ام.",
        "نظر به اینکه دستیابی به مستندات، فاکتورها و مدارک مثبته و همچنین هماهنگی و اعطای وکالت به وکیل دادگستری مستلزم سپری شدن زمان متعارف است، امکان ارائه دفاعیه جامع در اولین روز حضور میسور نبوده است.",
        isCriminal
          ? "مطابق با اصل برائت (اصل ۳۷ قانون اساسی) و ماده ۱۹۰ قانون آیین دادرسی کیفری ناظر بر حق بنیادین بهره‌مندی از وکیل و تدارک دفاع شایسته، اعطای فرصت کافی جهت تدارک دفاع از اصول دادرسی عادلانه است."
          : "طبق ماده آیین دادرسی مدنی و اصل تسلیط اصحاب دعوا بر دفاع و دسترسی به اسناد پرونده، اخذ مهلت جهت تدارک پاسخ دفاعی از حقوق مصرح قانونی است."
      );

      statutoryReferences.push(
        isCriminal ? "ماده ۱۹۰ و ۱۹۵ قانون آیین دادرسی کیفری" : "ماده ۲۸۹ قانون آیین دادرسی مدنی",
        "اصل ۳۷ و ۳۵ قانون اساسی جمهوری اسلامی ایران (حق دفاع و بهره‌مندی از وکیل)"
      );

      petitionsAndRequests.push(
        "تقاضای مطالعه کامل پرونده توسط اینجانب یا وکیل تعیینی.",
        "تقاضای اعطای استمهال و تجدید وقت / تمدید مهلت به مدت متعارف (مثلاً ۷ الی ۱۰ روز) جهت تنظیم و تقدیم لایحه جامع دفاعیه مستند."
      );

      lawyerReviewAdvice =
        "استمهال در دادسرا یا دادگاه بدوی معمولاً ۱ بار و برای مدت محدود پذیرفته می‌شود. حتماً در لایحه نهایی دلیل موجه (مانند ضرورت اخذ گواهی از اداره ثبت یا تنظیم قرارداد وکالت) را قید فرمایید.";
      break;

    case "procedural_objection":
      typeTitle = "لایحه ایراد شکلی و عدم صلاحیت محلی / ذاتی و نقص ادله اثباتی";
      preamble = `احتراماً در خصوص پرونده کلاسه ${caseNumber} موضوع اتهام/خواسته «${subject}»، اینجانب ${userName} به عنوان «${userRole}»، قبل از ورود در ماهیت دعوا و تبیین ادله، ایرادات شکلی و مقدماتی زیر را به استناد قوانین موضوعه به استحضار می‌رساند:`;

      legalArguments.push(
        "ایراد به عدم صلاحیت محلی / ذاتی: با عنایت به اینکه اقامتگاه اینجانب و نیز محل وقوع عمل ادعایی خارج از حوزه قضایی آن شعبه محترم می‌باشد، مستنداً به قوانین دادرسی، صلاحیت رسیدگی متعلق به مراجع حوزه اقامتگاه می‌باشد.",
        "ایراد به فقدان سمت و اهلیت: مدارک ارائه‌شده از سوی طرف مقابل واجد اشکال شکلی و فاقد ارکان لازم جهت انتساب ادعا یا احراز شرایط قانونی است.",
        "نقص دلایل و فقدان امارات قضایی: ادعای مطرح‌شده فاقد بینه شرعی یا مدارک محکمه‌پسند بوده و صرف ادعای بلادلیل نمی‌تواند موجد تکلیف قانونی برای اینجانب باشد."
      );

      statutoryReferences.push(
        isCriminal
          ? "مواد ۱۱۶، ۱۱۷ و ۳۱۶ قانون آیین دادرسی کیفری (صلاحیت محلی مراجع کیفری)"
          : "ماده ۸۴ قانون آیین دادرسی مدنی (بندهای ۱، ۲ و ۱۰ ناظر بر ایراد عدم صلاحیت و فقدان اهلیت)"
      );

      petitionsAndRequests.push(
        "صدور قرار عدم صلاحیت و ارجاع پرونده به حوزه قضایی صالح قانونی.",
        "در صورت رد ایراد شکلی، بررسی اولیه مدارک شاکی/خواهان و رفع نقص ادله."
      );

      lawyerReviewAdvice =
        "ایرادات شکلی حتماً باید در نخستین جلسه دادرسی یا اولین لایحه قبل از دفاع ماهوی مطرح شوند؛ در غیر این صورت ممکن است دادگاه ایراد را ساقط بداند.";
      break;

    case "settlement_proposal":
      typeTitle = "لایحه اعلام تمایل به حل و فصل مسالمت‌آمیز و ارجاع موضوع به شعبه شورای حل اختلاف / میانجی‌گری";
      preamble = `احتراماً در خصوص پرونده کلاسه ${caseNumber}، اینجانب ${userName} با احترام به مقام محترم قضایی و با هدف پیشگیری از اتلاف وقت دادگاه و برقراری صلح و سازش، مراتب زیر را اعلام می‌دارد:`;

      legalArguments.push(
        "اینجانب همواره معتقد به حل‌وفصل مسالمت‌آمیز اختلافات و رعایت حقوق طرفین بر پایه انصاف و گفتگو هستم.",
        "با عنایت به ماهیت موضوع دعوا، امکان مصالحه و توافق بر سر نحوه تسویه یا رفع سوءتفاهم میان طرفین کاملاً فراهم است.",
        "ارجاع موضوع به هیات‌های صلح یا شورای حل اختلاف می‌تواند در کوتاه‌ترین زمان بدون تحمیل هزینه‌های سنگین دادرسی به پرونده خاتمه دهد."
      );

      statutoryReferences.push(
        isCriminal
          ? "ماده ۸۲ قانون آیین دادرسی کیفری و آیین‌نامه میانجی‌گری در امور کیفری"
          : "ماده ۱۸۶ و ۱۸۸ قانون آیین دادرسی مدنی و قانون شوراهای حل اختلاف"
      );

      petitionsAndRequests.push(
        "ارجاع پرونده به شورای حل اختلاف یا واحد میانجی‌گری جهت تشکیل جلسه سازش.",
        "توقف موقت اقدامات تعقیبی یا اجرایی تا حصول نتیجه جلسه اصلاح ذات‌البین."
      );

      lawyerReviewAdvice =
        "پیشنهاد سازش به معنای اقرار به دین یا جرم نیست؛ حتماً تأکید شود که این پیشنهاد صرفاً با هدف حسن نیت و فیصله دادن مسالمت‌آمیز اختلاف ارائه می‌گردد.";
      break;

    case "defense_denial":
    default:
      typeTitle = "لایحه جامع دفاعیه در ماهیت و رد ادعا / اتهام انتسابی";
      preamble = `احتراماً پیرو ابلاغیه قضایی صادره در پرونده کلاسه ${caseNumber} موضوع «${subject}»، اینجانب ${userName} دارای کد ملی ${userNationalCode} به عنوان «${userRole}» پرونده، در دفاع از حقوق حقه خویش مراتب ذیل را مستنداً به استحضار عالی می‌رساند:`;

      legalArguments.push(
        `۱. رد صریح و قاطع ادعا: اینجانب هرگونه ادعا یا اتهام انتسابی در شکوائیه/دادخواست مبنی بر «${subject}» را اکیداً تکذیب نموده و آن را ناشی از سوءتفاهم یا طرح دعوای واهی می‌دانم.`,
        `۲. اصل برائت و عدم اثبات ارکان قانونی: به حکم اصل ۳۷ قانون اساسی جمهوری اسلامی ایران «اصل، برائت است و هیچ‌کس مجرم شناخته نمی‌شود مگر اینکه جرم او در دادگاه صالح ثابت گردد». طرف مقابل تاکنون هیچ‌گونه سند، شهادت شهود معتبر یا اماره قطعی دال بر اثبات ادعای خویش ارائه ننموده است.`,
        options.userCustomFacts
          ? `۳. شرح واقعیت از دیدگاه اینجانب:\n${options.userCustomFacts}`
          : `۳. مدارک و مستندات اینجانب شامل فاکتورها، تراکنش‌های بانکی و اسناد پیوست به روشنی بر صحت عملکرد و بی‌گناهی اینجانب دلالت تام دارند.`
      );

      statutoryReferences.push(
        isCriminal
          ? "اصل ۳۷ قانون اساسی، ماده ۴ و ۱۲۰ قانون مجازات اسلامی (قاعده درأ و اصل برائت)، ماده ۱۹۵ قانون آیین دادرسی کیفری"
          : "اصل ۳۷ قانون اساسی، ماده ۱۹۷ قانون آیین دادرسی مدنی و مواد ۱۲۵۷ و ۱۲۵۸ قانون مدنی (بار اثبات دعوا)"
      );

      petitionsAndRequests.push(
        isCriminal
          ? "صدور قرار منع تعقیب یا حکم برائت اینجانب از اتهام انتسابی."
          : "رد دعوای خواهان به دلیل بی‌پایه بودن و صدور حکم به بی‌حقی وی با احتساب کلیه خسارات دادرسی.",
        "دستور رسیدگی دقیق به مدارک و مستندات پیوست و عنداللزوم استعلام از مراجع ذی‌ربط."
      );

      lawyerReviewAdvice =
        "پیش از امضا و ارسال از طریق دفاتر خدمات الکترونیک قضایی، حتماً عبارات حساس را با وکیل چک کنید تا ناخواسته اقرار ضمنی در متن وجود نداشته باشد.";
      break;
  }

  // 2. Attachments handling
  if (options.attachedEvidences && options.attachedEvidences.length > 0) {
    attachmentsList.push(...options.attachedEvidences);
  } else {
    attachmentsList.push(
      "۱. تصویر مصدق ابلاغیه قضایی سامانه ثنا",
      "۲. کپی مصدق کارت ملی و شناسنامه",
      "۳. رسیدها، فاکتورها، پرینت حساب بانکی و مستندات دال بر صحت ادعا",
      "۴. استشهادیه محلی یا مشخصات شهود (در صورت وجود)"
    );
  }

  // 3. Build Full Formatted Output
  const fullFormattedText = `بسمه تعالی

به: ${issuingAuthority}
موضوع: ${typeTitle}
شماره پرونده / کلاسه: ${caseNumber}
شماره بایگانی شعبه: ${archiveNumber}
شماره ابلاغیه: ${noticeNumber}

مشخصات تقدیم‌کننده:
نام و نام خانوادگی: ${userName}
کد ملی: ${userNationalCode}
سمت در پرونده: ${userRole}

ریاست محترم و قضات ارجمند شعبه؛
با سلام و تحیات وافره؛

${preamble}

شرح دفاعیات و مبانی حقوقی:
${legalArguments.map((arg, idx) => `${idx + 1}. ${arg}`).join("\n\n")}

مستندات قانونی:
${statutoryReferences.map((ref, idx) => `• ${ref}`).join("\n")}

خواسته‌ها و تقاضای نهایی از مقام محترم قضایی:
با عنایت به شرح معروضه و اسناد ابرازی، از محضر عالی تقاضا دارد:
${petitionsAndRequests.map((req, idx) => `${idx + 1}- ${req}`).join("\n")}

پیوست‌ها و منضمات:
${attachmentsList.map((att) => `[ ] ${att}`).join("\n")}

با تجدید مراتب احترام و ادب
${userName} - ${userRole} پرونده
تاریخ: ............................
امضا / اثر انگشت: ............................
`;

  return {
    id: `draft-${Date.now()}`,
    draftType: options.draftType,
    typeTitle,
    recipientAuthority: issuingAuthority,
    subjectLine: typeTitle,
    caseIdentifiers: {
      caseNumber,
      archiveNumber,
      noticeNumber,
    },
    parties: {
      petitioner: userName,
      respondentOrPlaintiff: caseDetails.otherParties?.[0] || "طرف مقابل / مدعی",
    },
    preamble,
    legalArguments,
    statutoryReferences,
    petitionsAndRequests,
    attachmentsList,
    closingGreeting: `با تجدید مراتب احترام و ادب - ${userName}`,
    fullFormattedText,
    lawyerReviewAdvice,
  };
}
