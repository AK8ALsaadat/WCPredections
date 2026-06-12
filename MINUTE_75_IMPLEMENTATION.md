# تقرير تطبيق نظام الدقيقة 75 والتحديثات الحية ✅

## 📋 الملخص

تم تطبيق نظام متكامل للتحديثات الحية والدقيقة 75:
- ✅ **Real-time updates** للأهداف
- ✅ **منطق الدقيقة 75** لبونص التوقع الصحيح  
- ✅ **حالات انتقال** واضحة للبونص
- ✅ **API endpoint** للـ Server-Sent Events

---

## 📁 الملفات المُضافة

### 1. **`src/app/api/matches/[matchId]/events/route.ts`** (نقطة نهاية جديدة)
```
المسار: /api/matches/{matchId}/events
النوع: Server-Sent Events (SSE)
الغرض: بث تحديثات المباراة الحية
```

**الأحداث:**
- `match-status` - التحديث الأولي
- `scorers-update` - تحديثات الأهداف الحية (كل 5 ثوان)
- `minute-75-reached` - وصلنا الدقيقة 75
- `match-finished` - انتهاء المباراة

**الميزات:**
- Polling كل 5 ثوان
- إعادة اتصال تلقائية عند قطع الاتصال
- معالجة الأخطاء والتنظيف

---

### 2. **`src/lib/use-match-events.ts`** (React Hook جديد)
```
الاستخدام: useMatchEvents(matchId, onEvent, enabled?)
```

**الميزات:**
- الاستماع لأحداث المباراة
- إعادة الاتصال التلقائي
- Cleanup عند إلغاء المكون
- Type-safe events

**مثال الاستخدام:**
```typescript
useMatchEvents(matchId, (event) => {
  if (event.type === 'scorers-update') {
    // تحديث النقاط real-time
  }
  if (event.type === 'minute-75-reached') {
    // تطبيق بونص التوقع الصحيح
  }
});
```

---

### 3. **`src/lib/perfect-bonus-timing.ts`** (منطق جديد)
```
الدوال:
- getPerfectPredictionBonusState()      - حالة البونص
- shouldApplyPerfectBonusNow()          - هل نطبق البونص الآن
- calculatePerfectBonusWithMinute()     - حساب النقاط
```

**حالات البونص:**
- `not-eligible` - قبل الدقيقة 75 أو النتيجة خاطئة
- `pending` - بعد الدقيقة 75 لكن المباراة لم تنته
- `confirmed` - المباراة انتهت
- `cancelled` - تم إلغاء هدف من VAR

---

### 4. **`src/app/api/matches/[matchId]/events/route.ts`** (API endpoint)
دالة جديدة في scoring.service.ts:
```typescript
calculatePerfectPredictionBonusWithMinute()
```

---

## 📝 الملفات المُحدثة

### 1. **`src/services/football-api/types.ts`**
```diff
export type ExternalMatchScorer = {
  playerApiId: string;
  goals: number;
  playerName?: string;
  teamApiId?: string;
+ /** دقيقة الهدف (null إذا لم تكن متوفرة) */
+ minute?: number | null;
};
```

---

### 2. **`src/services/scoring.service.ts`**
إضافات:
```typescript
// ثابت جديد
export const PERFECT_PREDICTION_MIN_MINUTE = 75;

// دوال جديدة
export function getScorerGoalsBeforeMinute(...)

export function calculatePerfectPredictionBonusWithMinute(
  isExactScore: boolean,
  scorerPicks: [...],
  matchTime: Date,
  matchStatus: string,
  options?: {...}
): number
```

---

### 3. **`src/services/prediction.service.ts`**
تحديثات:
```typescript
// Import جديد
import { calculatePerfectPredictionBonusWithMinute, PERFECT_PREDICTION_MIN_MINUTE }

// تعديل recalculateMatchScoring()
// استخدام calculatePerfectPredictionBonusWithMinute بدلاً من القديم
bonusPoints = calculatePerfectPredictionBonusWithMinute(
  isExact,
  picks.map((sp) => ({...})),
  match.matchTime,
  match.status,
  { ignorePositionMultiplier }
);
```

---

## 🎯 السلوك الجديد

### قبل الدقيقة 75:
```
المباراة حية + أهداف تُسجل
├─ تحديث: scorers-update
├─ نقاط الأهداف: تُحسب عادي
└─ بونص التوقع الصحيح: 0 نقطة (في الانتظار)
```

### بعد الدقيقة 75:
```
المباراة حية + وصلنا الدقيقة 75
├─ تحديث: minute-75-reached
├─ النتيجة صح + كل هداف صح
└─ بونص التوقع الصحيح: +3 نقاط ✅ (معلقة)
```

### عند انتهاء المباراة:
```
المباراة انتهت
├─ تحديث: match-finished
├─ تأكيد نهائي لكل النقاط
└─ بونص التوقع الصحيح: +3 نقاط (مؤكدة)
```

### بعد انتهاء المباراة (VAR):
```
يكتشفون أن هدف غير صحيح
├─ تحديث: scorers-update (مع أهداف أقل)
├─ النتيجة الجديدة: لا تطابق التوقع
└─ بونص التوقع الصحيح: استرجاع -3 نقاط ⚠️
```

---

## 🚀 كيفية الاستخدام

### في مكون React:
```typescript
import { useMatchEvents } from '@/lib/use-match-events';
import { getPerfectPredictionBonusState } from '@/lib/perfect-bonus-timing';

export default function MatchPage() {
  const [predictions, setPredictions] = useState([]);
  
  useMatchEvents(matchId, (event) => {
    console.log('حدث جديد:', event.type);
    
    // تحديث real-time
    if (event.type === 'scorers-update') {
      // تحديث الأهداف والنقاط
      setPredictions(prev => updatePoints(prev, event.data.scorers));
    }
    
    // بعد الدقيقة 75
    if (event.type === 'minute-75-reached') {
      // تطبيق بونص التوقع الصحيح
      const state = getPerfectPredictionBonusState(match, prediction, scorerMatches);
      if (state === 'pending' || state === 'confirmed') {
        applyBonus();
      }
    }
    
    // انتهاء المباراة
    if (event.type === 'match-finished') {
      // تأكيد نهائي
      revalidateTag(`match-${matchId}`);
    }
  });
  
  return <div>...</div>;
}
```

---

## 📊 الحالات الاختبارية

### حالة 1: ✅ توقع مثالي يتم قبل 75
```
- التوقع: برونو 2 + هاي 1 = 3-0
- الفعلي (الدقيقة 23): برونو 1
- الفعلي (الدقيقة 45): هاي 1
- الفعلي (الدقيقة 70): برونو 1 (مجموع 2)
- النتيجة النهائية: 3-0 ✅
- النقاط: +3 بونص (بعد الدقيقة 75)
```

### حالة 2: ❌ توقع خاطئ
```
- التوقع: برونو 2 + هاي 1 = 3-0
- الفعلي: برونو 1 + هاي 2 = 2-1 ❌
- النقاط: 0 بونص
```

### حالة 3: ⚠️ VAR يلغي هدف
```
- التوقع: برونو 2 + هاي 1 = 3-0
- الفعلي (الدقيقة 75): 3-0 ✅ (+3 بونص)
- VAR (الدقيقة 85): يلغي هدف برونو
- الفعلي النهائي: 2-0 ❌
- النقاط: -3 (استرجاع البونص)
```

---

## ⚙️ التالي

### ✅ مكتمل:
- SSE endpoint للـ real-time
- React hook للاستماع
- منطق الدقيقة 75
- حالات انتقال واضحة

### 🔄 قريباً:
- [ ] إضافة `minute` field في database
- [ ] تخزين دقائق الأهداف من API providers
- [ ] لوحة تحكم real-time للـ leaderboard
- [ ] إشعارات عند الدقيقة 75

### 📈 تحسينات مستقبلية:
- WebSocket بدلاً من SSE (أسرع)
- تقليل polling من 5 إلى 2 ثانية
- Broadcasting للمستخدمين المتعددين
- Cache الأحداث بشكل ذكي
