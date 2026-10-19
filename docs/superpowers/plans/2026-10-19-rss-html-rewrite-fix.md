# RSS HTML Rewrite Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-text RSS URL rewriting deployment-base-aware, HTML-aware, and safe for `srcset`, with both language feeds covered by the publish gate.

**Architecture:** Replace the global regex pass with a small tag scanner that only rewrites real URL attributes, skips comments and raw-text elements, and delegates URL resolution to a site-root-aware resolver. Parse `srcset` as candidates rather than splitting on every comma.

**Tech Stack:** TypeScript, Vitest, Astro 7, Node 24

## Global Constraints

- No runtime dependency added.
- Preserve existing behavior for absolute, protocol-relative, anchor, `mailto:`, `tel:`, and `data:` URLs.
- Support both deployment bases `/` and `/yukki-rui/`.
- Keep the rewrite idempotent.
- Build remains fully static.

---

### Task 1: HTML-aware rewriting

**Files:**
- Modify: `src/lib/feed-html.ts`
- Test: `tests/feed-html.test.ts`

**Interfaces:**
- `absolutizeUrl(ref: string, pageUrl: string, siteUrl?: string): string`
- `absolutizeSrcset(value: string, pageUrl: string, siteUrl?: string): string`
- `absolutizeFeedHtml(html: string, pageUrl: string, siteUrl?: string): string`

- [x] **Step 1: Add failing tests** for root-relative subpath links, URL-like text, inline script text, raw HTML comments, `data:` URLs in `srcset`, and idempotency.
- [x] **Step 2: Run** `npx vitest run tests/feed-html.test.ts`; expect the new tests to fail.
- [x] **Step 3: Implement** a tag scanner and candidate-based `srcset` parser; skip text/comments/raw-text elements.
- [x] **Step 4: Re-run** the focused test file; expect all tests to pass.

### Task 2: Publish gate

**Files:**
- Modify: `scripts/check-content.mjs`

- [x] **Step 1: Add a published English fixture containing an image and `srcset` probe.**
- [x] **Step 2: Add assertions for full rendered content in both Chinese and English feeds.**
- [x] **Step 3: Add a root-relative URL probe and assert the subpath build keeps `/yukki-rui/`.**
- [x] **Step 4: Run** `npm run check:content`; expect both bases to pass.

### Task 3: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/usage-guide.md`
- Modify: `docs/verification-report.md`

- [x] **Step 1: Correct root-relative and rendering-parity wording.**
- [x] **Step 2: Record the fixed behavior and fresh verification evidence.**
- [x] **Step 3: Run** `npm run verify:frontend`, `npm run check:pages`, `npm run check:reading`, `npm run check:search`, `npm run check:comments`, and `npm run check:comments-live`.
- [x] **Step 4: Run** `git diff --check` and confirm the working tree contains only intended changes.


## Execution Record (2026-10-19)

- Focused unit tests: 21 passed.
- `npm run check:content`: both `/` and `/yukki-rui/` passed with bilingual RSS, root-relative, image, and `srcset` probes.
- `npm run verify:frontend`: passed; 16 files / 174 tests, both bases 33 pages and 1452 references, links/OG/frontend gates passed.
- Browser checks: reading 23/23, search 19/19, pages 24/24, comments 28/28, live comments 15/15.
- `git diff --check`: clean.
