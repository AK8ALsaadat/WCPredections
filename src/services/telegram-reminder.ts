import { prisma } from "@/lib/prisma";

// يفضل مستقبلاً وضع التوكن في ملف .env
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8866001197:AAHY3Ju-isvCM_RYvgqn04kbLsOntWxwThE";

// معرف القروب الخاص بك
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-5422156036"; 

const PREDICTION_DEADLINE_MINUTES = 90;
const REMINDER_MINUTES_BEFORE_DEADLINE = 15;
// التذكير بيكون قبل المباراة بـ 105 دقائق
const NOTIFY_MINUTES_BEFORE_MATCH = PREDICTION_DEADLINE_MINUTES + REMINDER_MINUTES_BEFORE_DEADLINE; 

// نحفظ المباريات اللي أرسلنا لها تنبيه عشان ما نزعج الناس ونرسل مرتين
const notifiedMatches = new Set<string>();

async function sendTelegramMessage(text: string) {
  if (!TELEGRAM_CHAT_ID) {
    console.warn("⚠️ لم يتم تحديد TELEGRAM_CHAT_ID. يرجى إضافته ليعمل البوت.");
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("❌ فشل إرسال رسالة تيليجرام:", await res.text());
    } else {
      console.log("✅ تم إرسال رسالة التذكير بنجاح!");
    }
  } catch (error) {
    console.error("❌ خطأ في الاتصال بتيليجرام:", error);
  }
}

async function checkMatchesAndNotify() {
  const now = new Date();
  
  // نبحث عن المباريات اللي تبدأ خلال 103 إلى 110 دقائق من الآن
  const minTime = new Date(now.getTime() + (NOTIFY_MINUTES_BEFORE_MATCH - 2) * 60000);
  const maxTime = new Date(now.getTime() + (NOTIFY_MINUTES_BEFORE_MATCH + 5) * 60000);

  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      matchTime: { gte: minTime, lte: maxTime }
    },
    include: { homeTeam: true, awayTeam: true }
  });

  for (const match of upcomingMatches) {
    if (notifiedMatches.has(match.id)) continue;

    const message = `🚨 <b>تذكير بإغلاق التوقعات!</b> 🚨\n\n⚽️ ${match.homeTeam.name} 🆚 ${match.awayTeam.name}\n⏳ باقي 15 دقيقة فقط ويقفل التوقع على هذه المباراة!\n\nلا تفوت الفرصة، ادخل وتوقع الحين 👇`;
    await sendTelegramMessage(message);
    notifiedMatches.add(match.id);
  }
}

console.log(`🤖 بوت التذكير شغال... بينبه قبل الديدلاين بـ ${REMINDER_MINUTES_BEFORE_DEADLINE} دقيقة.`);
checkMatchesAndNotify();
setInterval(checkMatchesAndNotify, 60 * 1000); // يفحص كل دقيقة
