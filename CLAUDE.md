# Thread Blocker - Chrome Extension

## Project Overview
Chrome Extension for batch-blocking accounts on Threads (threads.com).
- Manifest V3, esbuild bundled (IIFE for content script, ESM for service worker)
- Load `dist/` directory in Chrome developer mode
- Build: `node esbuild.config.js`

## Tech Stack
- JavaScript (ES modules, bundled by esbuild)
- Chrome Extension APIs (storage, alarms, runtime messaging)
- Content Script + Service Worker architecture
- Pull model: CS polls SW via `chrome.runtime.sendMessage`, SW notifies CS via `chrome.storage.onChanged`

## Architecture
- `src/content/` - Content script (bundled to `dist/content.js` as IIFE)
- `src/background/` - Service worker (bundled to `dist/service-worker.js` as ESM)
- `src/shared/` - Shared constants and message types
- `styles/content.css` - Content script styles (copied to dist/)
- `tests/` - 104 tests across 6 suites (vitest)

## Content Script UI Injection Rules (MANDATORY)

These rules are NON-NEGOTIABLE. Every content script UI task MUST follow them.

### Hard Rules
1. **NEVER guess website styles or DOM structure.** If you don't know, produce a debug script to gather info.
2. **NEVER write visual code before establishing mount strategy.** Order: mount strategy -> Shadow DOM -> then visuals.
3. **NEVER ask user to run console commands one-by-one.** Produce a single debug script that outputs JSON.
4. **NEVER hardcode selectors in UI components.** Use site adapter / site rules pattern.
5. **ALL injected UI MUST use Shadow DOM** to prevent CSS pollution. No exceptions unless explicitly justified.
6. **NEVER prioritize mimicking the host site's CSS.** Maintain extension's own design system. Only reference host site for: position/size hints, light/dark mode, font-size scale.
7. **NEVER assume static page.** Always handle: SPA route changes, delayed rendering, partial re-renders, MutationObserver, duplicate mount prevention.
8. **ALWAYS provide debug/observability** for injection issues.
9. **ALWAYS provide fallback selectors** (minimum 3 candidates with risk assessment).
10. **ALWAYS provide verification steps** for any UI injection change.

### Required Output Order (for UI injection tasks)
1. Problem breakdown
2. Injection strategy
3. Site adapter / site rules design
4. Selector candidates & fallback order
5. Mount strategy
6. Shadow DOM strategy
7. Dynamic DOM / SPA strategy
8. Debug / observability plan
9. Implementation code
10. Verification steps
11. Risks & fallbacks
12. Minimum info needed from user

### Site Adapter Pattern
```typescript
type SiteRule = {
  id: string
  match: RegExp
  anchors: string[]
  fallbackAnchors?: string[]
  mountMode: "append" | "prepend" | "before" | "after" | "overlay"
  targetSelector?: string
  observe?: string[]
  shouldUseShadowDom: boolean
}
```

### Selector Strategy (priority order)
1. Stable semantic containers (aria roles, semantic HTML)
2. Clear structural anchors (nav, header, main, aside)
3. Predictable structural patterns (toolbar, sidebar, content areas)
4. Fragile class names (LAST RESORT - dynamic hash classes, deep nth-child, long CSS paths)

Always provide: 3+ candidates, fallback order, risk per selector, stability ranking.

### Mount Strategy Requirements
- Explicit mount target and position (append/prepend/before/after/overlay)
- Rationale for chosen position
- Fallback if target doesn't exist
- Duplicate mount prevention
- Re-mount after page re-render

### Shadow DOM Requirements (default ON)
- Host element creation
- Shadow root attachment
- Style injection method
- z-index strategy
- Minimal sync with host page (light/dark mode, font-size scale only)
- Extension design system boundary

### Dynamic DOM / SPA Requirements
- Document ready timing
- Delayed render handling
- Route change detection
- MutationObserver with debounce/throttle
- Re-mount / unmount lifecycle
- Duplicate insertion prevention
- Anchor disappearance recovery

### Debug Tool Requirements
When needing page info from user, produce a SINGLE executable debug script that outputs JSON containing:
- Current URL
- Matched site rule
- Matched anchor selector
- Candidate selector hit counts
- Target element summary
- BoundingClientRect for candidates
- Final mount target
- Mount status (mounted/duplicate/failed)
- MutationObserver status
- Failure reason
- Suggested next step

### Verification Checklist (for every UI injection change)
- [ ] First load mounts correctly
- [ ] SPA navigation still mounts
- [ ] Repeated renders don't duplicate
- [ ] Late-appearing targets get mounted
- [ ] UI not polluted by page CSS (Shadow DOM)
- [ ] z-index not covered
- [ ] Unmount/remount behavior is correct

## Key Domain Knowledge
- Threads.com uses React, obfuscated class names, overflow:hidden on many containers
- Comments load dynamically (virtual scroll)
- Username links: `a[href^="/@"]` with pattern `/@username`
- Comment containers found by walking up DOM from username link (heuristic: >=3 children)
- Dark theme by default
- Content occupies center ~1/3 of viewport

## Communication Style
- Engineering-first, not tutorial-style
- Conclusion first, then architecture, then code
- Mark assumptions explicitly
- List risks explicitly
- Never present uncertain things as certain
