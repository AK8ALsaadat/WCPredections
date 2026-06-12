/** خريطة رموز دول ISO إلى أكوادها */
const COUNTRY_CODES: Record<string, string> = {
  // Group A
  "قطر": "qa",
  "qatar": "qa",
  "السعودية": "sa",
  "saudi arabia": "sa",
  "الإمارات": "ae",
  "uae": "ae",
  "united arab emirates": "ae",
  
  // Group B
  "إيران": "ir",
  "iran": "ir",
  "أمريكا": "us",
  "الولايات المتحدة": "us",
  "united states": "us",
  "ويلز": "gb-wls",
  "wales": "gb-wls",
  
  // Group C
  "المكسيك": "mx",
  "mexico": "mx",
  "بولندا": "pl",
  "poland": "pl",
  "السنغال": "sn",
  "senegal": "sn",
  "أرجنتينا": "ar",
  "argentina": "ar",
  
  // Group D
  "فرنسا": "fr",
  "france": "fr",
  "ديناماركا": "dk",
  "denmark": "dk",
  "بيرو": "pe",
  "peru": "pe",
  "تونس": "tn",
  "tunisia": "tn",
  
  // Group E
  "إسبانيا": "es",
  "spain": "es",
  "ألمانيا": "de",
  "germany": "de",
  "اليابان": "jp",
  "japan": "jp",
  "كوستاريكا": "cr",
  "costa rica": "cr",
  
  // Group F
  "بلجيكا": "be",
  "belgium": "be",
  "كندا": "ca",
  "canada": "ca",
  "المغرب": "ma",
  "morocco": "ma",
  "كرواتيا": "hr",
  "croatia": "hr",
  
  // Group G
  "البرازيل": "br",
  "brazil": "br",
  "سويسرا": "ch",
  "switzerland": "ch",
  "صربيا": "rs",
  "serbia": "rs",
  "الكاميرون": "cm",
  "cameroon": "cm",
  
  // Group H
  "البرتغال": "pt",
  "portugal": "pt",
  "أوروغواي": "uy",
  "uruguay": "uy",
  "غانا": "gh",
  "ghana": "gh",
  "كوريا الجنوبية": "kr",
  "south korea": "kr",
  "korea": "kr",
  
  // Also add some common team names
  "samir": "sa",
  "alba": "xx", // لا يوجد رمز قياسي
};

/**
 * احصل على رابط العلم الرسمي للدولة
 * @param countryName - اسم الدولة (عربي أو إنجليزي)
 * @returns رابط صورة العلم
 */
export function getFlagUrl(countryName?: string | null): string | null {
  if (!countryName) return null;
  
  const normalized = countryName.toLowerCase().trim();
  let code = COUNTRY_CODES[normalized];
  
  // إذا لم نجد الدولة، جرب الأحرف الأولى (للأسماء الطويلة)
  if (!code && normalized.length > 2) {
    code = COUNTRY_CODES[normalized.substring(0, 2)];
  }
  
  // إذا لم تجد، تحقق من أسماء بديلة شهيرة
  if (!code) {
    // حاول إزالة الكلمات الشائعة مثل "country" أو "team"
    const cleaned = normalized
      .replace(/^(the\s+|team\s+|country\s+|national\s+team\s+)/i, "")
      .trim();
    code = COUNTRY_CODES[cleaned];
  }
  
  // إذا فشل كل شيء، لا تُرجع اسماً خاطئاً
  if (!code || code === "xx") {
    // تسجيل الأخطاء لمساعدة في التصحيح
    if (typeof window === "undefined") {
      console.warn(`[Country Warning] Unknown country name: "${countryName}"`);
    }
    return null;
  }
  
  // استخدام flagcdn.com API
  return `https://flagcdn.com/w80/${code}.png`;
}

/**
 * احصل على emoji العلم للدولة (كبديل سريع)
 */
export function getFlagEmoji(countryName?: string | null): string {
  if (!countryName) return "";
  
  const normalized = countryName.toLowerCase().trim();
  let code = COUNTRY_CODES[normalized];
  
  // جرب الأحرف الأولى
  if (!code && normalized.length > 2) {
    code = COUNTRY_CODES[normalized.substring(0, 2)];
  }
  
  // حاول إزالة الكلمات الشائعة
  if (!code) {
    const cleaned = normalized
      .replace(/^(the\s+|team\s+|country\s+|national\s+team\s+)/i, "")
      .trim();
    code = COUNTRY_CODES[cleaned];
  }
  
  if (!code || code === "xx") return "🏴";
  
  // تحويل كود الدولة إلى emoji
  if (code === "gb-wls") return "🏴󠁧󠁢󠁷󠁬󠁳󠁿"; // Wales flag
  
  try {
    const codePoints = code
      .toUpperCase()
      .split("")
      .map(c => 127397 + c.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return "🏴"; // fallback
  }
}

/** قائمة بجميع الدول المشاركة مع أكوادها */
export const PARTICIPATING_COUNTRIES = {
  qa: "قطر",
  sa: "السعودية",
  ae: "الإمارات",
  ir: "إيران",
  us: "أمريكا",
  mx: "المكسيك",
  pl: "بولندا",
  sn: "السنغال",
  ar: "أرجنتينا",
  fr: "فرنسا",
  dk: "الدنمارك",
  pe: "بيرو",
  tn: "تونس",
  es: "إسبانيا",
  de: "ألمانيا",
  jp: "اليابان",
  cr: "كوستاريكا",
  be: "بلجيكا",
  ca: "كندا",
  ma: "المغرب",
  hr: "كرواتيا",
  br: "البرازيل",
  ch: "سويسرا",
  rs: "صربيا",
  cm: "الكاميرون",
  pt: "البرتغال",
  uy: "أوروغواي",
  gh: "غانا",
  kr: "كوريا الجنوبية",
};
