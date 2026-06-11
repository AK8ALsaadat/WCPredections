import { NextResponse } from 'next/server';
import { subscribe } from '@/lib/broadcaster';

type EventPayload = {
  type: string;
  data: unknown;
};

export async function GET() {
  let unsub: (() => void) | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: EventPayload) => {
        const s = `event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`;
        controller.enqueue(encoder.encode(s));
      };

      unsub = subscribe(send);

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 20_000);

      controller.enqueue(encoder.encode('retry: 2000\n\n'));
    },

    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      if (unsub) unsub();
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