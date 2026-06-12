# ✅ تحقق شامل من ميزات الـ Double والـ Bold

## 📋 المتطلبات المطلوبة:
1. ✅ الـ Double والـ Bold يشتغلون 100%
2. ✅ منع استخدامهما معاً على نفس المباراة
3. ✅ عرض جميل عندما يرى المستخدم توقعه الحالي/السابق
4. ✅ عرض جميل عندما يرى المستخدمون الآخرون التوقعات

---

## 🔄 الـ Validation Logic (منع الـ Double والـ Bold معاً)

### 1. **Backend Validation** ✅
**الملف:** `src/services/prediction.service.ts` (سطر ~432)

```typescript
// ✅ منع استخدام الـ Double والـ Bold معاً على نفس المباراة
if (isDouble && data.boldPlayerId) {
  throw new Error(
    "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً على نفس المباراة"
  );
}
```

**النتيجة:** أي محاولة للتعديل على التنبؤ بـ Double والـ Bold معاً سيرجع خطأ من الخادم.

---

### 2. **Frontend UI Validation** ✅
**الملف:** `src/app/(main)/predict/[matchId]/page.tsx` (سطر ~658)

```typescript
// ✅ منع الـ Double عند تفعيل الـ Bold والعكس
const boldCheckboxDisabled =
  boldCommitted ||
  (boldLimits != null && !boldLimits.canUse && !boldLimits.onThisMatch) ||
  isDouble; // ← منع البطاقة الجريئة إذا كان الـ Double مفعل

const doubleCheckboxDisabled =
  doubleCommitted ||
  (doubleLimits != null &&
    !doubleLimits.canEnable &&
    !doubleLimits.onThisMatch) ||
  boldEnabled; // ← منع الـ Double إذا كانت البطاقة الجريئة مفعلة
```

**النتيجة:**
- عند تفعيل الـ Double → الـ Bold checkbox يصبح معطل (disabled)
- عند تفعيل الـ Bold → الـ Double checkbox يصبح معطل (disabled)

---

### 3. **رسائل تحذيرية ذكية** ✅

#### الـ Double:
```typescript
<p className="text-sm text-muted">
  {doubleCommitted
    ? t.predict.doubleLocked
    : boldEnabled
    ? t.predict.doubleAndBoldConflict  // ← "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً"
    : t.predict.doubleHint}
</p>
```

#### الـ Bold:
```typescript
<p className="text-sm text-muted">
  {boldCommitted
    ? t.predict.boldLocked
    : isDouble
    ? t.predict.doubleAndBoldConflict  // ← "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً"
    : t.predict.boldScorerBet.hint}
</p>
```

---

## 📺 العرض الجميل للبطاقات

### 1. **في صفحة توقع المستخدم الحالي** ✅
**الملف:** `src/app/(main)/matches/[id]/page.tsx` (سطر ~250)

```typescript
<div className="grid gap-3 sm:grid-cols-2">
  <div>
    <p className="text-sm text-muted">{t.matches.score}</p>
    <div className="flex items-center gap-2">
      <p className="text-xl font-bold">
        {m.userPrediction.predHome} - {m.userPrediction.predAway}
      </p>
      {m.userPrediction.isDouble && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center 
          rounded-md bg-warning/20 px-1.5 text-xs font-bold text-warning 
          ring-1 ring-warning/30">
          2×
        </span>
      )}
    </div>
  </div>
  
  {m.userBoldScorerBet && (
    <div>
      <p className="text-sm text-muted">{t.matches.featureBold}</p>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 items-center gap-0.5 rounded-md 
          bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-400 
          ring-1 ring-amber-500/25">
          <span aria-hidden>✦</span>
          <span>{m.userBoldScorerBet.player.name}</span>
        </span>
      </div>
    </div>
  )}
</div>
```

**الشكل النهائي:**
```
النتيجة المتوقعة
2 - 1    [2×]          ← الـ Double badge

البطاقة الجريئة
✦ Mbappe             ← الـ Bold badge
```

---

### 2. **في قائمة توقعات الدوري** ✅
**الملف:** `src/components/matches/LeaguePredictionsList.tsx` (سطر ~52)

```typescript
function FeatureBadges({
  row,
  isKnockout,
  t,
}: {
  row: LeagueMatchPredictionRow;
  isKnockout: boolean;
  t: Messages;
}) {
  const finishType = asFinishType(row.prediction?.predictedFinishType);
  const hasPenalty = Boolean(row.prediction?.predictedPenaltyWinnerTeamId);
  const hasBold = Boolean(row.boldScorerBet);
  const hasDouble = Boolean(row.prediction?.isDouble);

  if (!hasDouble && !hasBold && !(isKnockout && (finishType || hasPenalty))) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {hasDouble && (
        <span
          title={t.matches.featureDouble}
          className="inline-flex h-6 min-w-6 items-center justify-center 
            rounded-md bg-warning/20 px-1.5 text-[10px] font-bold text-warning 
            ring-1 ring-warning/30"
        >
          2×
        </span>
      )}
      {hasBold && (
        <span
          title={`${t.matches.featureBold}: ${row.boldScorerBet!.player.name}`}
          className="inline-flex h-6 items-center gap-0.5 rounded-md 
            bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-400 
            ring-1 ring-amber-500/25"
        >
          <span aria-hidden>✦</span>
          <span className="max-w-[4rem] truncate">
            {shortPlayerName(row.boldScorerBet!.player.name)}
          </span>
        </span>
      )}
    </div>
  );
}
```

**الشكل النهائي:**
```
@danger         1-0 vs 3-2    [2×] [✦ Mbappe]     ← عرض جميل للـ Double والـ Bold
@nawafmd        2-1 vs 1-2    [✦ Neymar]          ← بطاقة جريئة فقط
@player3        0-0 vs 1-0    [2×]                ← مضاعفة فقط
```

---

### 3. **في تفاصيل نقاط المباراة** ✅
**الملف:** `src/lib/match-points-breakdown.ts` (سطر ~328)

عند الضغط على "عرض التفاصيل":

```typescript
{
  id: "bold-scorer",
  label: messages.pointsBreakdown.pendingBold(row.boldScorerBet.player.name),
  detail: messages.pointsBreakdown.boldScorerDetail,
  points: 0,
}
```

**الشكل:**
```
بطاقة جريئة: Mbappe
±4 نقاط | مرة واحدة كل جولة
```

---

## 🎯 حالات الاستخدام

### حالة 1: تفعيل الـ Double فقط ✅
```
المضاعفة النقاط: ☑
البطاقة الجريئة: ☐ (معطل - لا يمكن التفعيل)
رسالة: "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً"
```

### حالة 2: تفعيل الـ Bold فقط ✅
```
المضاعفة النقاط: ☐ (معطل - لا يمكن التفعيل)
البطاقة الجريئة: ☑
رسالة: "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً"
```

### حالة 3: عدم تفعيل أي منهما ✅
```
المضاعفة النقاط: ☐
البطاقة الجريئة: ☐
كلاهما متاح للاستخدام
```

---

## 📊 رسائل الـ i18n المضافة

**الملفات:**
- `src/lib/i18n/ar.ts`
- `src/lib/i18n/en.ts`

```typescript
doubleAndBoldConflict: "ما تقدر تستخدم المضاعفة والبطاقة الجريئة معاً على نفس المباراة"
// English: "Can't use double and bold card on the same match"
```

---

## ✅ ملخص التحسينات

| الميزة | الحالة | الملف |
|-------|-------|------|
| منع Double + Bold معاً | ✅ Backend + UI | prediction.service.ts + predict page |
| عرض Double في توقعك | ✅ مع Badge | matches/[id]/page.tsx |
| عرض Bold في توقعك | ✅ مع Badge | matches/[id]/page.tsx |
| عرض Double في توقعات الآخرين | ✅ مع Badge | LeaguePredictionsList.tsx |
| عرض Bold في توقعات الآخرين | ✅ مع Badge | LeaguePredictionsList.tsx |
| رسائل تحذيرية | ✅ ذكية ديناميكية | predict page |
| Disabled states | ✅ عند تفعيل الآخر | predict page |
| i18n support | ✅ AR + EN | i18n files |

---

## 🚀 الحالة النهائية

**جميع المتطلبات المطلوبة تم تطبيقها بنجاح:**

✅ الـ Double والـ Bold يشتغلان 100%  
✅ منع استخدامهما معاً على نفس المباراة  
✅ عرض جميل عندما يرى المستخدم توقعه  
✅ عرض جميل عندما يرى المستخدمون الآخرون التوقعات  
✅ رسائل واضحة ومفيدة للمستخدم  
✅ بدون أخطاء في البناء  

---

**التاريخ:** 2026-06-12  
**الحالة:** ✅ مكتمل بنجاح  
**الاختبار:** ✅ بدون أخطاء
