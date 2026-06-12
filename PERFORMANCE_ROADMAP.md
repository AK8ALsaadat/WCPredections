// Performance & Real-Time Improvements Roadmap

## 1. CACHING IMPROVEMENTS

### Current Situation
- Next.js cache tags used for revalidation
- Full prediction objects fetched repeatedly
- Leaderboard recalculated on every request

### Quick Wins (No DB changes needed)

// 1. Cache middleware for static content
// File: src/app/api/middleware.ts or next.config.ts
export const CACHE_CONFIG = {
  leaderboard: 'public, max-age=30, s-maxage=60', // 30s client, 60s CDN
  matches: 'public, max-age=60, s-maxage=120',     // 1min client, 2min CDN
  predictions: 'private, max-age=10',               // Only current user, 10s
};

### 2. Query Optimization

// File: src/lib/api-cache.ts or new file src/lib/db-queries.ts

// ❌ Current (slow): Fetches entire prediction object
const predictions = await prisma.prediction.findMany({
  where: { matchId },
  include: {
    match: { include: { homeTeam: true, awayTeam: true, ... } },
    user: true,
    ...
  },
});

// ✅ Better: Selective fields
const predictions = await prisma.prediction.findMany({
  where: { matchId },
  select: {
    id: true,
    userId: true,
    predHome: true,
    predAway: true,
    points: true,
    isDouble: true,
    // Don't fetch full match object, just IDs
  },
});

// Then batch fetch related data only if needed
const userIds = predictions.map(p => p.userId);
const users = await prisma.user.findMany({
  where: { id: { in: userIds } },
  select: { id: true, username: true, points: true },
});

---

## 2. REAL-TIME UPDATES (WebSocket/SSE)

### Option A: Server-Sent Events (SSE) - Simpler
// File: src/app/api/events/match-updates/route.ts

export async function GET(
  req: Request,
  { params }: { params: { matchId: string } }
) {
  const { matchId } = params;
  
  // Create response stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Subscribe to match updates via Broadcaster
      const unsubscribe = subscribe(
        `match-${matchId}`,
        (event: { type: string; data: any }) => {
          if (event.type === 'score-update' || event.type === 'goal-added') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        }
      );
      
      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

### Client Side
// File: src/lib/live-match-stream.ts

export function subscribeLiveMatch(
  matchId: string,
  onUpdate: (update: LiveMatchUpdate) => void
) {
  const eventSource = new EventSource(
    `/api/events/match-updates/${matchId}`
  );
  
  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    onUpdate(data);
  });
  
  return () => eventSource.close();
}

// Usage in component
useEffect(() => {
  const unsubscribe = subscribeLiveMatch(matchId, (update) => {
    if (update.type === 'goal-added') {
      // Recalculate prediction points immediately
      setPredictionPoints(prev => ({
        ...prev,
        scorerPoints: calculateNewScorerPoints(update),
      }));
    }
  });
  
  return unsubscribe;
}, [matchId]);

---

## 3. DATABASE QUERY BATCHING

// File: src/services/prediction.service.ts

// ❌ Slow: N+1 queries in loop
for (const prediction of predictions) {
  const scorers = await prisma.scorerPrediction.findMany({
    where: { userId: prediction.userId, matchId: prediction.matchId },
  });
  // Process each...
}

// ✅ Fast: Single batch query
const allScorers = await prisma.scorerPrediction.groupBy({
  by: ['userId', 'matchId'],
  where: {
    matchId,
    userId: { in: predictions.map(p => p.userId) },
  },
});

const scorersByUser = new Map<string, typeof allScorers>();
for (const group of allScorers) {
  const key = `${group.userId}|${group.matchId}`;
  scorersByUser.set(key, group);
}

---

## 4. INCREMENTAL STATIC REGENERATION (ISR)

// File: src/app/matches/[id]/page.tsx

export const revalidate = 30; // Regenerate every 30 seconds
export const dynamicParams = true;

// For leaderboard
// File: src/app/(main)/leaderboard/page.tsx

export const revalidate = 60; // Regenerate every 60 seconds

---

## 5. CLIENT-SIDE OPTIMIZATION

### Lazy Loading for Predictions
// File: src/components/predictions/PredictionHistoryCard.tsx

import { Suspense } from 'react';
import { lazy } from 'react';

const PointsBreakdown = lazy(() => 
  import('./MatchPointsBreakdown').then(m => ({ default: m.MatchPointsBreakdown }))
);

// Only load breakdown when user expands it
const [showBreakdown, setShowBreakdown] = useState(false);

return (
  <>
    ...
    {showBreakdown && (
      <Suspense fallback={<div>Loading...</div>}>
        <PointsBreakdown {...breakdownProps} />
      </Suspense>
    )}
  </>
);

---

## Implementation Priority

1. ✅ **Done:** Perfect bonus fix + Position data fetching
2. 🔴 **URGENT:** Query optimization (quick wins, <2 hours)
3. 🟡 **HIGH:** ISR configuration (1-2 hours)  
4. 🟡 **HIGH:** Real-time updates with SSE (4-6 hours)
5. 🟢 **MEDIUM:** Client-side lazy loading (2 hours)
6. 🔵 **LOW:** Advanced caching (Redis, etc.) - only if needed after above

---

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Leaderboard load | 2-5s | <500ms |
| Match details | 1-3s | <300ms |
| Prediction update | Manual only | Real-time (<500ms) |
| API response | Full objects | Selective fields |
| Database queries | N+1 patterns | Batch queries |
