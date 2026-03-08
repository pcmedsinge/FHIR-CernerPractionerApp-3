# Design Notes — Pending Polish (Phase 5)

## Core Philosophy
> "As a practitioner my eyes are trained to see only what is CRITICAL, ACTIONABLE, and RELEVANT."
> "Don't use words, use colors."
> Every pixel must earn its clinical value.

## Pending Design Improvements

### 1. Chrome Tax — Header + Banner Consolidation
- **Current**: AppShell header (44px) + PatientBanner (~40px) = ~90px non-clinical chrome
- **Fix**: Merge into single 36px clinical header (patient name+age+gender left, practitioner+actions right)
- **Impact**: Recovers ~50px for clinical data on every screen

### 2. Visual Language Upgrade
- **Current**: Flat bordered rectangles everywhere (Bootstrap-with-Tailwind aesthetic)
- **Fix**: Introduce subtle depth layers, glass/blur effects on sticky elements, modern card styling
- **Impact**: Futuristic look without sacrificing information density

### 3. DataQualityFooter Cleanup
- **Current**: Shows token count, timestamps, error list — technical metadata
- **Fix**: Remove or collapse into a single status dot. Practitioner doesn't need "382 tokens"
- **Impact**: Reclaims footer space

### 4. Scrollbar Minimization
- **Current**: `overflow-y-auto` on explore zone. Requirement.md says "no scrollbars"
- **Fix**: Smart collapsing, pagination, or viewport-aware layout to minimize scroll
- **Impact**: Closer to original requirement

### 5. Theming Consistency
- **Current**: Components use hardcoded Tailwind classes like `bg-red-50`, `text-amber-700`
- **Fix**: Map all severity/status colors to CSS custom properties for easy dark mode + white-label
- **Impact**: Dark mode becomes a toggle, not a rewrite

### 6. Dark/Ambient Mode
- **Deferred to Phase 5**
- CSS custom properties + `.dark` class toggle
- Critical for: night shifts, OR dimmed rooms, practitioner preference

### 7. Micro-interactions
- **Current**: Only `animate-pulse` on critical items
- **Fix**: Subtle transitions on card state changes, risk score updates, data refresh
- **Impact**: Polished feel without visual noise

## Design Principles (Carry Forward to ALL Phases)
1. **Zero-chrome**: Every pixel earns its clinical value
2. **Signal-to-noise**: Quiet when safe, loud when critical
3. **Color IS language**: Severity → background, border, glow — never text labels
4. **Density over scrolling**: More info per viewport pixel
5. **Scalable vocabulary**: Same visual primitives across all features
6. **Performance is UX**: Sub-second Tier 1, <3s total
