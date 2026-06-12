import { useEffect, useRef, useCallback } from 'react';

export type MatchEventType =
  | 'match-status'
  | 'scorers-update'
  | 'minute-75-reached'
  | 'match-finished';

export type MatchEvent = {
  type: MatchEventType;
  data: unknown;
};

/**
 * Hook للاستماع لتحديثات المباراة الحية
 * 
 * @param matchId - معرّف المباراة
 * @param onEvent - callback عند حدوث حدث جديد
 * @param enabled - هل يكون الـ stream نشطاً
 * 
 * @example
 * useMatchEvents(matchId, (event) => {
 *   if (event.type === 'scorers-update') {
 *     // تحديث نقاط المستخدم
 *   }
 * });
 */
export function useMatchEvents(
  matchId: string,
  onEvent: (event: MatchEvent) => void,
  enabled: boolean = true
) {
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !matchId) return;

    try {
      eventSourceRef.current = new EventSource(
        `/api/matches/${matchId}/events`
      );

      eventSourceRef.current.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data) as MatchEvent;
          onEvent(data);
        } catch (err) {
          console.error('خطأ في parsing event:', err);
        }
      });

      eventSourceRef.current.addEventListener('error', () => {
        // إعادة محاولة بعد 3 ثوان
        setTimeout(connect, 3000);
      });
    } catch (err) {
      console.error('خطأ في الاتصال بـ EventSource:', err);
      setTimeout(connect, 3000);
    }
  }, [matchId, enabled, onEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return {
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    },
  };
}
