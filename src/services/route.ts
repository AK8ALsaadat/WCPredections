import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8866001197:AAHY3Ju-isvCM_RYvgqn04kbLsOntWxwThE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-5422156036";

const PREDICTION_DEADLINE_MINUTES = 10;
const REMINDER_MINUTES_BEFORE_DEADLINE = 15;
const NOTIFY_MINUTES_BEFORE_MATCH = PREDICTION_DEADLINE_MINUTES + REMINDER_MINUTES_BEFORE_DEADLINE; 

async function sendTelegramMessage(text: string) {
  if (!TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("Telegram error:", error);
  }
}

export async function GET() {
  try {
    const now = new Date();
    // المعادلة هنا تضمن عدم تكرار الرسالة إذا تفقدنا الرابط كل دقيقتين
    const minTime = new Date(now.getTime() + (NOTIFY_MINUTES_BEFORE_MATCH - 1) * 60000);
    const maxTime = new Date(now.getTime() + (NOTIFY_MINUTES_BEFORE_MATCH + 1) * 60000);

    const upcomingMatches = await prisma.match.findMany({
      where: {
        status: "SCHEDULED",
        matchTime: { gt: minTime, lte: maxTime }
      },
      include: { homeTeam: true, awayTeam: true }
    });

    if (upcomingMatches.length === 0) {
      return NextResponse.json({ success: true, message: "No matches right now" });
    }

    const allUsers = await prisma.user.findMany({ select: { id: true, username: true } });

    for (const match of upcomingMatches) {
      const predictions = await prisma.prediction.findMany({ where: { matchId: match.id }, select: { userId: true } });
      const predictedUserIds = new Set(predictions.map(p => p.userId));
      const missingUsers = allUsers.filter(u => !predictedUserIds.has(u.id));
      const missingText = missingUsers.length > 0 ? "\n\nالشباب اللي نايمين وما توقعوا للحين 😴:\n" + missingUsers.map(u => `@${u.username}`).join(" ، ") : "\n\nكفو! كل الشباب توقعوا هالمباراة 🔥";
      const message = `🚨 <b>تذكير بإغلاق التوقعات!</b> 🚨\n\n⚽️ ${match.homeTeam.name} 🆚 ${match.awayTeam.name}\n⏳ باقي 10 دقائق فقط ويقفل التوقع قبل البداية!\n\nلا تفوت الفرصة، ادخل وتوقع الحين 👇${missingText}`;
      await sendTelegramMessage(message);
    }
    return NextResponse.json({ success: true, notified: upcomingMatches.length });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}