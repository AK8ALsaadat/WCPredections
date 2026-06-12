/**
 * ISR (Incremental Static Regeneration) - تحديث تلقائي كل 1 ساعة
 * مثالي للبيانات التي تتغير ببطء مثل المباريات والترتيب
 */
export const revalidateMatch = 3600; // 1 ساعة
export const revalidateRound = 3600; // 1 ساعة
export const revalidateLeaderboard = 1800; // 30 دقيقة

/**
 * محسّن استعلام قاعدة البيانات — جلب بيانات المباراة مع البيانات المرتبطة بكفاءة
 */
export async function getMatchDataOptimized(matchId: string, userId?: string) {
  // سيتم استبدال هذا بـ Prisma query محسّن
  // مثال: استخدام select محدد بدلاً من include كاملة
  return null;
}

/**
 * Stale-While-Revalidate (SWR) pattern
 * عرض البيانات القديمة بسرعة، ثم تحديثها في الخلفية
 */
export const swrConfig = {
  revalidate: 60, // إعادة التحقق كل 60 ثانية
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60 * 1000, // 1 دقيقة
};

/**
 * كاش الصور — ذاكرة تخزين مؤقتة للأعلام والشعارات
 */
export const imageCache = {
  flags: {
    revalidate: 86400, // 24 ساعة
    maxAge: 86400,
  },
  logos: {
    revalidate: 259200, // 3 أيام
    maxAge: 259200,
  },
};
