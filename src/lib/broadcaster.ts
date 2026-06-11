type EventPayload = { type: string; data: any };

const clients = new Set<(payload: EventPayload) => void>();

export function subscribe(fn: (payload: EventPayload) => void) {
  clients.add(fn);
  return () => clients.delete(fn);
}

export function publish(payload: EventPayload) {
  for (const fn of clients) {
    try {
      fn(payload);
    } catch (e) {
      // ignore
    }
  }
}

export default { subscribe, publish };
