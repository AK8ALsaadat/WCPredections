import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Server-Sent Events endpoint للحصول على تحديثات المباراة الحية
 * 
 * الأهداف (scorers) تُرسل real-time
 * النقاط الكاملة تُحدّث عند:
 * - بعد الدقيقة 75 (للبونص)
 * - عند نهاية المباراة (تأكيد نهائي)
 * 
 * Usage: EventSource('/api/matches/{matchId}/events')
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  // التحقق من أن المباراة موجودة
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, matchTime: true },
  });

  if (!match) {
    return NextResponse.json(
      { error: 'المباراة غير موجودة' },
      { status: 404 }
    );
  }

  // إنشاء response stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // تحديث أولي: النقاط والأهداف الحالية
        const currentMatch = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            matchScorers: {
              include: { player: { select: { name: true, position: true } } },
            },
          },
        });

        if (currentMatch) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'match-status',
                data: {
                  status: currentMatch.status,
                  homeScore: currentMatch.homeScore,
                  awayScore: currentMatch.awayScore,
                  matchTime: currentMatch.matchTime,
                  scorers: currentMatch.matchScorers,
                },
              })}\n\n`
            )
          );
        }

        // استمع للتحديثات (polling بسيط كل 5 ثوان)
        const pollInterval = setInterval(async () => {
          try {
            const updated = await prisma.match.findUnique({
              where: { id: matchId },
              include: {
                matchScorers: {
                  include: {
                    player: { select: { name: true, position: true } },
                  },
                },
              },
            });

            if (updated) {
              // تحديث الأهداف الحية
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'scorers-update',
                    data: {
                      scorers: updated.matchScorers,
                      homeScore: updated.homeScore,
                      awayScore: updated.awayScore,
                      status: updated.status,
                    },
                  })}\n\n`
                )
              );

              // التحقق من الدقيقة 75 (تقريبي: 45+ دقيقة من البداية)
              const matchStartTime = new Date(updated.matchTime).getTime();
              const minutesElapsed = (Date.now() - matchStartTime) / (1000 * 60);

              if (minutesElapsed >= 75) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'minute-75-reached',
                      data: { minutesElapsed },
                    })}\n\n`
                  )
                );
              }

              // تحديث عند انتهاء المباراة
              if (updated.status === 'FINISHED') {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'match-finished',
                      data: {
                        finalScore: {
                          home: updated.homeScore,
                          away: updated.awayScore,
                        },
                        scorers: updated.matchScorers,
                      },
                    })}\n\n`
                  )
                );
                clearInterval(pollInterval);
              }
            }
          } catch (err) {
            console.error('خطأ في polling التحديثات:', err);
            clearInterval(pollInterval);
          }
        }, 5000); // polling كل 5 ثوان

        // Cleanup عند قطع الاتصال
        req.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
          controller.close();
        });
      } catch (err) {
        console.error('خطأ في EventStream:', err);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
