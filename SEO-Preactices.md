# SEO + GEO Plan for Flare AI

Website: https://flareai.co
Competitor referenced: https://flare-sh.tech

This file is a cleaned and practical plan based on your current codebase.

## Current Audit (From Your Repo)

What is already good:
- You already have global metadata in `src/app/layout.tsx`.
- You already have Open Graph + Twitter metadata.
- You already have JSON-LD structured data.
- You already have a sitemap route in `src/app/sitemap.ts`.
- You already have multiple public pages (`/landing`, `/about`, policy pages).

Main gaps to fix next:
1. `sitemap.ts` uses `new Date()` for all pages each request.
Reason: this makes all URLs look "recently changed" all the time and can reduce trust in freshness signals.
2. No dedicated `robots.ts` route (metadata robots is good, but a physical robots endpoint is still useful).
3. Home/canonical strategy should be clearer (`/` vs `/landing`).
Reason: you want one primary ranking URL for branded/non-branded intent.
4. Content depth is still thin for non-brand keywords.
Reason: ranking for "AI chat" terms needs strong topic coverage, not only product pages.
5. Structured data can be tightened to avoid over-claim style language.
Reason: factual, verifiable claims tend to perform better long-term.

## Priority Actions (Do These First)

1. Fix sitemap quality
- Keep `lastModified` real per page/update cycle, not `new Date()` for all.
- Include only canonical indexable URLs.

2. Add `robots.ts`
- Explicitly allow key public routes.
- Include your sitemap URL.

3. Decide canonical primary page
- If `/landing` is your main marketing page, redirect `/` -> `/landing` or make `/` primary and reduce duplicate intent pages.
- Keep canonical tags aligned with that decision.

4. Create 6-10 high-intent pages
- Suggested slugs:
  - `/ai-chat`
  - `/gpt-4o-chat`
  - `/claude-chat`
  - `/gemini-chat`
  - `/ai-image-generation`
  - `/chatgpt-alternative`
- Each page: unique title, unique H1, 700-1200 words, FAQ block, internal links.

5. Launch comparison content cluster
- Examples:
  - `GPT-4o vs Claude 3.5 vs Gemini for coding`
  - `Best free ChatGPT alternatives in 2026`
  - `When to use each model in one workflow`
- Add first-party evidence (screenshots, test prompts, measured outputs).

## GEO (AI Search) Playbook

1. Add citation-friendly sections to pages
- "What it is"
- "When to use"
- "Limitations"
- "Model comparison table"
- "Sources"

2. Increase factual density
- Prefer measurable statements over generic claims.
- Include date-stamped benchmark notes where possible.

3. Strengthen extractability
- Short paragraphs, clear H2/H3 structure.
- Use tables for model features and tradeoffs.
- Keep FAQ answers concise and specific.

4. Track AI crawler and referral visibility
- Log requests from common AI user agents.
- Track sessions/mentions from AI assistant referrals.

## Internal Linking Rules

- Every marketing page should link to:
  - one model page
  - one use-case page
  - one comparison page
  - one conversion page (`/landing` or `/pricing`)
- Add breadcrumb schema on content pages.

## Technical Checklist

- [ ] Add `src/app/robots.ts`.
- [ ] Improve `src/app/sitemap.ts` freshness strategy.
- [ ] Ensure one canonical primary marketing URL.
- [ ] Add FAQ schema only where FAQ is visible on page.
- [ ] Keep Organization/SoftwareApplication schema factual and consistent with visible content.
- [ ] Optimize OG images (real preview image per key page, not same icon everywhere).
- [ ] Ensure all indexable pages have unique title + description.

## Suggested 30-Day Plan

Week 1:
- Canonical strategy (`/` vs `/landing`)
- robots + sitemap cleanup
- metadata consistency pass

Week 2:
- Publish 4 high-intent feature pages
- Add internal linking blocks

Week 3:
- Publish 3 comparison pages with tables and test data
- Add FAQ schema to those pages

Week 4:
- Improve CTR (titles/descriptions)
- Review Search Console queries and adjust content to match real impressions

## KPIs to Track

- Non-brand impressions (Google Search Console)
- Average position for target queries
- CTR by page title/meta description
- Indexed page count
- Referring domains to feature/comparison pages
- Conversions from organic landings

## Notes on Your Original File

The earlier version had some incorrect assumptions:
- It implied your site was mostly one landing page. Your repo already has multiple public pages.
- It had broken character encoding and noisy citations.
- It was too generic and not tied to your current implementation.

This version is aligned with your current code and gives concrete next steps.

## Reference Docs (Primary Sources)

- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google crawling/indexing best practices: https://developers.google.com/search/docs/crawling-indexing
- Google structured data intro: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Google FAQ structured data: https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Next.js Metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js `sitemap.ts` docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js `robots.ts` docs: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
