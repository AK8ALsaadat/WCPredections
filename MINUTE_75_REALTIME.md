# نظام التحديثات الحية والدقيقة 75 🚀

## الهندسة المعمارية

### 1. **جانب الخادم (Real-Time)**

#### API Endpoint: `/api/matches/[matchId]/events`
- **نوع**: Server-Sent Events (SSE)
- **التحديث الفاصل**: كل 5 ثوان
- **الأحداث المُرسلة**:

```javascript
{
  type: 'match-status',           // التحديث الأولي
  data: { status, homeScore, awayScore, scorers }
}

{
  type: 'scorers-update',         // تحديثات الأهداف الحية ✨
  data: { scorers, homeScore, awayScore, status }
}

{
  type: 'minute-75-reached',      // الدقيقة 75 وصلنا! 🎯
  data: { minutesElapsed }
}

{
  type: 'match-finished',         // المباراة انتهت ⏰
  data: { finalScore, scorers }
}
```

### 2. **جانب العميل (React Hook)**

```typescript
// src/lib/use-match-events.ts
useMatchEvents(matchId, (event) => {
  if (event.type === 'scorers-update') {
    // تحديث نقاط المستخدم والأهداف real-time
  }
  if (event.type === 'minute-75-reached') {
    // تطبيق بونص التوقع الصحيح إذا كانت النتيجة صح
  }
  if (event.type === 'match-finished') {
    // تأكيد نهائي لكل النقاط
  }
});
```

---

## نظام النقاط والدقيقة 75

### 🎯 منطق بونص التوقع الصحيح (Perfect Prediction)

```
الحالات:

قبل الدقيقة 75:
├─ النتيجة صح + كل الهدافين يسجلون الكمية الصح = 0 نقاط (في الانتظار)
├─ النتيجة خاطئة أو هداف واحد خاطئ = 0 نقاط

بعد الدقيقة 75 أو عند النهاية:
├─ النتيجة صح + كل الهدافين يسجلون الكمية الصح = +3 نقاط ✅
├─ النتيجة خاطئة أو هداف واحد خاطئ = 0 نقاط

بعد انتهاء المباراة (VAR):
├─ تم إلغاء هدف غيّر النتيجة = -3 نقاط (استرجاع البونص)
```

### 📊 حالات الانتقال

```
          match-status (أولي)
                ↓
          scorers-update (حي)
                ↓
          minute-75-reached (75 دقيقة)
                ↓
    +3 نقاط بونص (معلقة)
                ↓
          match-finished (نهاية)
                ↓
    تأكيد نهائي +3 نقاط
```

---

## مثال عملي

### السيناريو: برونو + هاي

#### توقع المستخدم:
- برونو: 2 هدف
- هاي: 1 هدف
- النتيجة: 3-0

#### التطور:

**الدقيقة 23:**
- برونو يسجل هدف أول
- تحديث: `scorers-update` يُرسل لكل المستخدمين
- النقاط: 0 (ننتظر الدقيقة 75)
- الحالة: `not-eligible` → `pending` (بعد الدقيقة 75)

**الدقيقة 45:**
- هاي يسجل هدف
- تحديث: `scorers-update`
- النقاط: 0 (ننتظر)

**الدقيقة 70:**
- برونو يسجل هدف ثاني
- تحديث: `scorers-update`
- النقاط: 0 (قريب من الدقيقة 75)

**الدقيقة 75:**
- تحديث: `minute-75-reached`
- النتيجة الحالية: 3-0 ✅ (صح)
- كل الهدافين: صح ✅
- **تطبيق البونص: +3 نقاط** 🎉
- الحالة: `pending`

**الدقيقة 85:**
- المباراة تنتهي
- تحديث: `match-finished`
- تأكيد النقاط: 3 نقاط (ثابتة)
- الحالة: `confirmed`

**السيناريو السيء (VAR في الإضافات):**
- يكتشفون أن البدء كان في وضع غير قانوني
- يلغون هدف برونو الثاني
- النتيجة الجديدة: 2-0 ≠ 3-0 ❌
- **استرجاع البونص: -3 نقاط** ⚠️
- النقاط النهائية: 0

---

## الملفات المُضافة

### 1. `src/app/api/matches/[matchId]/events/route.ts`
- SSE endpoint للتحديثات الحية
- polling كل 5 ثوان
- يُرسل أحداث للعميل

### 2. `src/lib/use-match-events.ts`
- React hook للاستماع للأحداث
- معالجة إعادة الاتصال تلقائياً
- TypeScript-safe

### 3. `src/lib/perfect-bonus-timing.ts`
- حساب الحالة (state)
- منطق الدقيقة 75
- تحديد متى نطبق البونص

### 4. `src/services/football-api/types.ts` (محدّث)
- أضفنا `minute?: number | null` لـ `ExternalMatchScorer`

### 5. `src/services/scoring.service.ts` (محدّث)
- `PERFECT_PREDICTION_MIN_MINUTE = 75`
- `getScorerGoalsBeforeMinute()` - تصفية الأهداف قبل الدقيقة

---

## كيفية الاستخدام في المكونات

### التحديثات الحية في صفحة المباراة

```typescript
// src/app/(main)/matches/[id]/page.tsx
import { useMatchEvents } from '@/lib/use-match-events';
import { getPerfectPredictionBonusState } from '@/lib/perfect-bonus-timing';

export default function MatchPage() {
  const [predictions, setPredictions] = useState(/* ... */);
  const [match, setMatch] = useState(/* ... */);

  useMatchEvents(matchId, (event) => {
    if (event.type === 'scorers-update') {
      // تحديث الأهداف والنقاط real-time
      setPredictions(prev => updatePredictionPoints(prev, event.data));
    }
    
    if (event.type === 'minute-75-reached') {
      // تطبيق بونص التوقع الصحيح
      const bonusState = getPerfectPredictionBonusState(
        match,
        prediction,
        scorerMatches
      );
      if (bonusState === 'pending') {
        applyScoringBonus();
      }
    }
    
    if (event.type === 'match-finished') {
      // تأكيد نهائي
      revalidateTag(`match-${matchId}`);
    }
  });

  return (
    <div>
      {/* عرض التحديثات الحية */}
      <LiveScorers scorers={event.data.scorers} />
      {/* عرض حالة البونص */}
      <PerfectBonusIndicator state={bonusState} />
    </div>
  );
}
```

---

## التطوير المستقبلي

### ✅ تم:
- SSE endpoint للتحديثات الحية
- React hook للاستماع للأحداث
- منطق الدقيقة 75
- حالات انتقال البونص

### 🔄 قريباً:
- إضافة `minute` field في database (يحتاج migration)
- تخزين دقائق الأهداف من API providers
- لوحة تحكم الليدربورد real-time
- إشعارات عند الدقيقة 75 والنهاية

### 📈 تحسينات الأداء:
- WebSocket بدلاً من SSE (أسرع)
- تقليل polling من 5 ثوان إلى 2 ثانية
- caching للأحداث المتكررة
