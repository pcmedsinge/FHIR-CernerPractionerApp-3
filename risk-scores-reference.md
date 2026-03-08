# Risk Scores — Quick Reference Guide

This document explains each clinical risk score used in the Command Center Dashboard,
what vitals/data feed into them, how they're scored, and what the results mean clinically.

---

## Table of Contents

1. [NEWS2 — National Early Warning Score 2](#1-news2--national-early-warning-score-2)
2. [qSOFA — Quick Sequential Organ Failure Assessment](#2-qsofa--quick-sequential-organ-failure-assessment)
3. [ASCVD — 10-Year Cardiovascular Risk](#3-ascvd--10-year-cardiovascular-risk)
4. [CHA₂DS₂-VASc — Stroke Risk in Atrial Fibrillation](#4-cha₂ds₂-vasc--stroke-risk-in-atrial-fibrillation)
5. [Data Source Matrix — What Feeds What](#5-data-source-matrix--what-feeds-what)
6. [Severity Mapping — How Badges Are Colored](#6-severity-mapping--how-badges-are-colored)

---

## 1. NEWS2 — National Early Warning Score 2

### What It Is
A bedside scoring system used in hospitals (mainly UK, adopted globally) to detect
**acute clinical deterioration** — basically "is this patient getting sicker right now?"

Developed by the Royal College of Physicians (2017). Used primarily for **inpatient** monitoring.

### Who It Applies To
Any hospitalized adult patient. Not designed for children, pregnancy, or end-of-life care.

### Input Parameters (7 total)

| # | Parameter              | What It Measures                          | Score Range | Our Data Source        |
|---|------------------------|-------------------------------------------|-------------|------------------------|
| 1 | **Respiratory Rate**   | Breaths per minute                        | 0–3         | Vitals: RR             |
| 2 | **SpO₂**               | Oxygen saturation percentage              | 0–3         | Vitals: SpO2           |
| 3 | **Supplemental O₂**    | Is the patient on oxygen?                 | 0–2         | ❌ Not available*       |
| 4 | **Temperature**        | Body temperature in °C                    | 0–3         | Vitals: Temperature    |
| 5 | **Systolic BP**        | Systolic blood pressure in mmHg           | 0–3         | Vitals: BP (systolic)  |
| 6 | **Heart Rate**         | Beats per minute                          | 0–3         | Vitals: HR             |
| 7 | **Consciousness**      | AVPU scale (Alert/Voice/Pain/Unresponsive)| 0 or 3      | ❌ Not available*       |

*These require clinical assessment or device data not in standard vitals observations.

### Scoring Thresholds (each parameter)

**Respiratory Rate (breaths/min):**
| Value      | Score |
|------------|-------|
| ≤ 8        | 3     |
| 9–11       | 1     |
| 12–20      | 0 ✓   |
| 21–24      | 2     |
| ≥ 25       | 3     |

**SpO₂ (%, Scale 1 — no hypercapnic failure):**
| Value      | Score |
|------------|-------|
| ≤ 91%      | 3     |
| 92–93%     | 2     |
| 94–95%     | 1     |
| ≥ 96%      | 0 ✓   |

**Supplemental Oxygen:**
| Value      | Score |
|------------|-------|
| On O₂      | 2     |
| Room air   | 0 ✓   |

**Temperature (°C):**
| Value      | Score |
|------------|-------|
| ≤ 35.0     | 3     |
| 35.1–36.0  | 1     |
| 36.1–38.0  | 0 ✓   |
| 38.1–39.0  | 1     |
| ≥ 39.1     | 2     |

**Systolic BP (mmHg):**
| Value      | Score |
|------------|-------|
| ≤ 90       | 3     |
| 91–100     | 2     |
| 101–110    | 1     |
| 111–219    | 0 ✓   |
| ≥ 220      | 3     |

**Heart Rate (bpm):**
| Value      | Score |
|------------|-------|
| ≤ 40       | 3     |
| 41–50      | 1     |
| 51–90      | 0 ✓   |
| 91–110     | 1     |
| 111–130    | 2     |
| ≥ 131      | 3     |

**Consciousness (AVPU):**
| Value              | Score |
|--------------------|-------|
| A (Alert)          | 0 ✓   |
| V, P, or U         | 3     |

### Total Score Interpretation

| Total Score | Risk Level   | Clinical Response                                      |
|-------------|-------------|--------------------------------------------------------|
| 0           | Low         | Routine monitoring (every 12 hours minimum)            |
| 1–4         | Low         | Increase monitoring frequency, inform nurse-in-charge   |
| 3 (single)* | Low-Medium  | Urgent bedside review by clinician                     |
| 5–6         | Medium      | Urgent response — doctor review within 1 hour          |
| ≥ 7         | **High**    | Emergency response — immediate senior/critical care    |

*If ANY single parameter scores 3, the level is automatically bumped to "Low-Medium" even if the total is low.

### Minimum Data Requirement
Our implementation requires **at least 3 of 7 parameters** to calculate. Missing parameters are listed as "data gaps."

---

## 2. qSOFA — Quick Sequential Organ Failure Assessment

### What It Is
A rapid bedside screening tool for **sepsis** — "does this patient potentially have a
life-threatening infection causing organ dysfunction?" It's intentionally simple: just 3 criteria,
no lab tests needed.

Published by Singer et al., JAMA 2016. Part of the Sepsis-3 definitions.

### Who It Applies To
Any adult patient with suspected infection. Used in emergency departments and wards.

### Input Parameters (3 total)

| # | Parameter              | Threshold       | Points | Our Data Source        |
|---|------------------------|-----------------|--------|------------------------|
| 1 | **Respiratory Rate**   | ≥ 22 br/min     | +1     | Vitals: RR             |
| 2 | **Systolic BP**        | ≤ 100 mmHg      | +1     | Vitals: BP (systolic)  |
| 3 | **GCS (consciousness)**| < 15 (altered)  | +1     | ❌ Not available*       |

*Glasgow Coma Scale requires bedside assessment; not in standard vital signs observations.

### Score Interpretation

| Score | Meaning                                                 |
|-------|---------------------------------------------------------|
| 0     | Low risk — standard care                                |
| 1     | Monitor closely — one risk factor present               |
| **≥ 2** | **Sepsis likely** — warrants full SOFA assessment, blood cultures, antibiotics consideration |

### Key Clinical Point
qSOFA is a **screening** tool, not diagnostic. A score ≥ 2 means "investigate sepsis further"
— it doesn't confirm sepsis. The full SOFA score (which requires lab values) is used for diagnosis.

### In Our App
Since we lack GCS data, the maximum possible score from vitals alone is **2** (high RR + low SBP).
This is still clinically useful — if both are triggered, it's a strong signal.

---

## 3. ASCVD — 10-Year Cardiovascular Risk

### What It Is
The **Pooled Cohort Equations** from the 2013 ACC/AHA guidelines. Estimates the probability
of having a heart attack or stroke within the next 10 years. Used for **primary prevention** decisions
(should this patient start a statin? aspirin? lifestyle intervention?).

Published by Goff DC Jr et al., Circulation 2014.

### Who It Applies To
Adults aged **40–79** WITHOUT known cardiovascular disease (no prior heart attack, stroke, etc.).

### Input Parameters (9 total)

| # | Parameter              | Type            | Our Data Source                    |
|---|------------------------|-----------------|------------------------------------|
| 1 | **Age**                | Number (40-79)  | Patient demographics (birthDate)   |
| 2 | **Sex**                | Male/Female     | Patient demographics (gender)      |
| 3 | **Race**               | White/AA/Other  | ❌ Not reliably in FHIR Patient*    |
| 4 | **Total Cholesterol**  | mg/dL           | ❌ Would need lab Observations*     |
| 5 | **HDL Cholesterol**    | mg/dL           | ❌ Would need lab Observations*     |
| 6 | **Systolic BP**        | mmHg            | Vitals: BP (systolic)              |
| 7 | **On BP Treatment**    | Yes/No          | Approximated from HTN condition    |
| 8 | **Has Diabetes**       | Yes/No          | Conditions: Diabetes flag          |
| 9 | **Current Smoker**     | Yes/No          | ❌ Would need Social History*       |

*Our app currently cannot provide these. Without total cholesterol and HDL, the score **cannot be calculated** (returns null).

### Risk Categories

| 10-Year Risk   | Category       | Clinical Action                                        |
|----------------|----------------|--------------------------------------------------------|
| < 5%           | Low            | Lifestyle counseling                                   |
| 5–7.4%         | Borderline     | Consider risk enhancers; shared decision on statin     |
| 7.5–19.9%      | Intermediate   | Moderate-intensity statin recommended                  |
| **≥ 20%**      | **High**       | High-intensity statin strongly recommended             |

### Important Note for Our App
**ASCVD will almost always return `null` (not calculable)** in our current implementation because
we don't fetch lab values (total cholesterol, HDL) from the FHIR server. This would require
querying `Observation` resources with LOINC codes for lipid panels — a future enhancement.

### How the Math Works (simplified)
The equations use log-transformed values of age, cholesterol, HDL, and SBP, multiplied by
race/sex-specific coefficients, then passed through an exponential survival function.
Different coefficient sets exist for: White Female, AA Female, White Male, AA Male.

---

## 4. CHA₂DS₂-VASc — Stroke Risk in Atrial Fibrillation

### What It Is
A scoring system to estimate **annual stroke risk** in patients with **atrial fibrillation (AFib)**.
Used to decide whether a patient needs anticoagulation (blood thinners like warfarin or DOACs).

The name is an acronym for each risk factor:
- **C** = Congestive Heart Failure (+1)
- **H** = Hypertension (+1)
- **A₂** = Age ≥ 75 (+**2**)
- **D** = Diabetes (+1)
- **S₂** = Stroke/TIA history (+**2**)
- **V** = Vascular disease (+1)
- **A** = Age 65-74 (+1)
- **Sc** = Sex category — female (+1)

Published by Lip GY et al., Chest 2010.

### Who It Applies To
Patients with **non-valvular atrial fibrillation** only. Our app shows it when an AFib
condition is detected in the patient's problem list.

### Input Parameters & Points

| Letter | Risk Factor                     | Points | Our Data Source                 |
|--------|---------------------------------|--------|---------------------------------|
| C      | CHF / LV dysfunction            | +1     | Conditions: CHF flag            |
| H      | Hypertension                    | +1     | Conditions: Hypertension flag   |
| A₂     | Age ≥ 75                        | +2     | Patient demographics            |
| D      | Diabetes mellitus               | +1     | Conditions: Diabetes flag       |
| S₂     | Prior Stroke / TIA              | +2     | Conditions: Stroke/TIA flag     |
| V      | Vascular disease (MI, PAD)      | +1     | Conditions: Vascular disease flag |
| A      | Age 65–74                       | +1     | Patient demographics            |
| Sc     | Female sex                      | +1     | Patient demographics            |

**Maximum possible score: 9**

### Score Interpretation

| Score  | Risk Level   | Annual Stroke Risk | Anticoagulation Guidance                     |
|--------|-------------|-------------------|----------------------------------------------|
| 0      | Low         | ~0%               | No therapy (or aspirin)                       |
| 1      | Moderate    | ~1.3%             | Consider anticoagulation (shared decision)    |
| **≥ 2** | **High**   | 2.2% – 15.2%     | **Anticoagulation recommended** (DOAC/warfarin) |

### Approximate Annual Stroke Risk by Score

| Score | Annual Risk |
|-------|-------------|
| 0     | 0%          |
| 1     | 1.3%        |
| 2     | 2.2%        |
| 3     | 3.2%        |
| 4     | 4.0%        |
| 5     | 6.7%        |
| 6     | 9.8%        |
| 7     | 9.6%        |
| 8     | 6.7%        |
| 9     | 15.2%       |

### In Our App
CHA₂DS₂-VASc is one of the **most reliably calculable** scores because it depends on:
- Patient demographics (age, sex) — always available
- Conditions (CHF, HTN, DM, stroke, vascular disease) — fetched from the problem list

No vitals or labs are needed. If the patient has AFib and we have age + sex, we can almost
always produce a score.

---

## 5. Data Source Matrix — What Feeds What

This is the key reference: which vital signs and data points feed into which risk scores.

### Vitals → Risk Scores

| Vital Sign         | LOINC Code  | NEWS2 | qSOFA | ASCVD | CHA₂DS₂-VASc |
|--------------------|-------------|:-----:|:-----:|:-----:|:-------------:|
| Heart Rate         | 8867-4      | ✅    |       |       |               |
| Respiratory Rate   | 9279-1      | ✅    | ✅    |       |               |
| SpO₂               | 2708-6      | ✅    |       |       |               |
| Temperature        | 8310-5      | ✅    |       |       |               |
| Systolic BP        | 8480-6      | ✅    | ✅    | ✅    |               |
| Blood Pressure     | 85354-9     | (sys) | (sys) | (sys) |               |

### Demographics → Risk Scores

| Demographic        | NEWS2 | qSOFA | ASCVD | CHA₂DS₂-VASc |
|--------------------|:-----:|:-----:|:-----:|:-------------:|
| Age                |       |       | ✅    | ✅ (65-74: +1, ≥75: +2) |
| Sex                |       |       | ✅    | ✅ (female: +1) |
| Race               |       |       | ✅*   |               |

*Defaults to "white" equations if unknown.

### Conditions → Risk Scores

| Condition               | NEWS2 | qSOFA | ASCVD   | CHA₂DS₂-VASc |
|-------------------------|:-----:|:-----:|:-------:|:-------------:|
| CHF                     |       |       |         | ✅ (+1)       |
| Hypertension            |       |       | ✅ (BP tx) | ✅ (+1)    |
| Diabetes                |       |       | ✅      | ✅ (+1)       |
| Stroke / TIA            |       |       |         | ✅ (+2)       |
| Vascular disease        |       |       |         | ✅ (+1)       |
| Atrial Fibrillation     |       |       |         | (qualifier*)  |

*AFib is not a scoring factor itself — it's the **reason** you calculate CHA₂DS₂-VASc.

### Data We DON'T Have (Gaps)

| Missing Data             | Affects     | How to Get It                              |
|--------------------------|-------------|--------------------------------------------|
| Supplemental O₂          | NEWS2       | Device integration or nursing flowsheet     |
| Consciousness (AVPU/GCS) | NEWS2, qSOFA| Bedside assessment, not a standard vital    |
| Total Cholesterol        | ASCVD       | Lab Observation (LOINC: 2093-3)            |
| HDL Cholesterol          | ASCVD       | Lab Observation (LOINC: 2085-9)            |
| Smoking Status           | ASCVD       | Social History Observation                  |
| Race                     | ASCVD       | Patient.extension (US Core Race)            |

---

## 6. Severity Mapping — How Badges Are Colored

Each risk score maps to a unified severity level used for badge colors in the UI:

### NEWS2 → Badge

| NEWS2 Level  | Badge Severity | Badge Color  |
|--------------|---------------|--------------|
| High (≥7)    | Critical      | Red          |
| Medium (5-6) | High          | Orange       |
| Low-Medium   | Moderate      | Yellow       |
| Low (0-4)    | Low           | Green        |

### qSOFA → Badge

| qSOFA Score  | Badge Severity | Badge Color  |
|--------------|---------------|--------------|
| ≥ 2 (sepsis) | Critical      | Red          |
| 0-1          | Low           | Green        |

### ASCVD → Badge

| ASCVD Level     | Badge Severity | Badge Color  |
|-----------------|---------------|--------------|
| High (≥20%)     | High          | Orange       |
| Intermediate    | Moderate      | Yellow       |
| Borderline/Low  | Low           | Green        |

### CHA₂DS₂-VASc → Badge

| Risk Level   | Badge Severity | Badge Color  |
|--------------|---------------|--------------|
| High (≥2)    | High          | Orange       |
| Moderate (1) | Moderate      | Yellow       |
| Low (0)      | Low           | Green        |

### Overall Patient Severity
The **worst** (highest) severity across all calculable scores determines the patient card's
overall severity badge. Priority order: Critical > High > Moderate > Low > Unknown.

---

## Quick Cheat Sheet

| Score         | Purpose                    | Key Inputs                          | Red Flag              |
|---------------|----------------------------|-------------------------------------|-----------------------|
| **NEWS2**     | "Getting sicker right now?" | HR, RR, SpO₂, Temp, SBP            | Total ≥ 7             |
| **qSOFA**     | "Sepsis?"                  | RR ≥ 22, SBP ≤ 100, GCS < 15       | Score ≥ 2             |
| **ASCVD**     | "Heart attack in 10 years?"| Age, sex, cholesterol, SBP, smoking | Risk ≥ 20%            |
| **CHA₂DS₂-VASc** | "Stroke risk with AFib?"| Age, sex, CHF, HTN, DM, stroke hx  | Score ≥ 2             |

---

*Document generated for CernerPractionerApp-3 — last updated March 2026*
