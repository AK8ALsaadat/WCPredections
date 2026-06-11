type EventPayload = {
  type: string;
  data: unknown;
};

const clients = new Set<(payload: EventPayload) => void>();

export function subscribe(fn: (payload: EventPayload) => void) {
  clients.add(fn);
  return () => clients.delete(fn);
}

export function publish(payload: EventPayload) {
  for (const fn of clients) {
    try {
      fn(payload);
    } catch {
      // ignore
    }
  }
}

export default {
  subscribe,
  publish,
};