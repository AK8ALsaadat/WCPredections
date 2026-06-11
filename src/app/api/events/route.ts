import { NextResponse } from 'next/server';
import { subscribe } from '@/lib/broadcaster';

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: { type: string; data: any }) => {
        const s = `event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`;
        controller.enqueue(encoder.encode(s));
      };

      const unsub = subscribe(send);

      // keep-alive comment every 20s
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 20_000);

      controller.enqueue(
        encoder.encode('retry: 2000\n\n')
      );

      // cleanup on cancel
      controller.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        unsub();
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
