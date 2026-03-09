# Acuity Scoring — How the Score is Calculated

> **Reference document** for the Patient Trajectory Intelligence feature.
> All computation is pure math — zero API calls, <50ms execution.

---

## Overview

The **Acuity Score** (0–100) is a composite indicator of patient severity.  
Higher = sicker. It is computed from **4 additive layers**:

```
Acuity = min( VitalScore + RiskBonus + ConditionBonus + InsightBonus, 100 )
```

---

## Layer 1 — Vital Signs Deviation (up to ~33 pts)

Each vital is scored by how far it deviates from a clinically normal midpoint.

| Vital            | Normal Mid | Half-Range | Weight |
|------------------|-----------|------------|--------|
| Heart Rate       | 78 bpm    | ±22        | 15     |
| Systolic BP      | 118 mmHg  | ±22        | 15     |
| SpO₂             | 97%       | ±3         | 15     |
| Respiratory Rate | 16 /min   | ±4         | 12     |
| Temperature      | 36.8°C    | ±0.7       | 10     |

### Per-vital formula

```
deviation = min( |value − mid| / halfRange, 3.0 )   // capped at 3×
contribution = deviation × weight
```

**SpO₂ exception:** Only scores when *below* normal (lower = worse). If SpO₂ ≥ 97, contribution = 0.

### Normalization

```
vitalScore = min( (sumOfContributions / sumOfWeights) × 33, 100 )
```

If no vitals data is available, a default score of **25** is used.

### Example

| Vital       | Value      | Deviation                        | × Weight | Contribution |
|-------------|-----------|----------------------------------|----------|-------------|
| BP (sys)    | 209 mmHg  | min(|209−118|/22, 3) = 3.0        | × 15     | 45.0        |
| Temperature | 41°C      | min(|41−36.8|/0.7, 3) = 3.0       | × 10     | 30.0        |
| Heart Rate  | 110 bpm   | min(|110−78|/22, 3) = 1.45        | × 15     | 21.8        |
| SpO₂        | 94%       | min(|94−97|/3, 3) = 1.0           | × 15     | 15.0        |
| Resp Rate   | 22 /min   | min(|22−16|/4, 3) = 1.5           | × 12     | 18.0        |

Sum = 129.8, totalWeight = 67 → `(129.8 / 67) × 33 ≈ 64`

---

## Layer 2 — Risk Score Bonuses (up to ~53 pts)

Pre-computed clinical risk scores add fixed bonuses:

| Risk Score     | Condition                | Bonus             |
|----------------|------------------------|--------------------|
| NEWS2          | Always (if computed)   | `total × 3`, max 25 |
| qSOFA          | If sepsis risk = true  | +15                |
| ASCVD          | If 10yr risk > 20%     | +8                 |
| CHA₂DS₂-VASc  | If score ≥ 4           | +5                 |

### Example

NEWS2 total = 9 → bonus = min(9×3, 25) = **25**  
qSOFA sepsis risk = true → **+15**  
Total risk bonus = **40**

---

## Layer 3 — Condition Severity (up to 12 pts)

Based on the maximum severity flag across active conditions:

| Severity   | Bonus |
|-----------|-------|
| Critical  | +12   |
| High      | +8    |
| Moderate  | +4    |
| Low/None  | +0    |

---

## Layer 4 — Clinical Insights (uncapped contribution)

Each AI-generated or rule-based clinical insight adds points:

| Insight Severity | Per Insight |
|-----------------|-------------|
| Critical         | +6          |
| Warning          | +3          |
| Info             | +0          |

### Example

2 critical insights + 1 warning = (2×6) + (1×3) = **15**

---

## Final Calculation Example

| Layer               | Points |
|---------------------|--------|
| Vital Signs         | 64     |
| Risk Scores (NEWS2 + qSOFA) | 40 |
| Condition Severity  | 8      |
| Insights (2 crit)   | 12     |
| **Total**           | **100** (capped) |

---

## Severity Labels

| Acuity Range | Label        |
|-------------|--------------|
| ≥ 70        | High Acuity  |
| 45 – 69     | Moderate     |
| 20 – 44     | Low-Moderate |
| 0 – 19      | Stable       |

## Trend Direction

Computed by comparing current acuity to the average of predicted 12h values:

| Condition                              | Trend      |
|----------------------------------------|-----------|
| Current ≥ 70 OR predicted avg ≥ 70    | Critical   |
| Predicted avg > current + 5            | Worsening  |
| Predicted avg < current − 5            | Improving  |
| Otherwise                              | Stable     |

---

## Source

Implementation: `src/services/trajectory/trajectoryEngine.ts`  
UI Component: `src/features/trajectory/AcuityDrivers.tsx`
