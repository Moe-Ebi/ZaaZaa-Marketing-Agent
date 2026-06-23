# Phase 1 Build Plan — MVP (Prove the Loop for Zaazaa)

> **Goal of Phase 1:** prove the full content loop end-to-end for one brand (Zaazaa Shoes) — pull products → generate brand-consistent content → human approves → publish to Instagram/TikTok/Facebook → see basic performance. Ship in ~8–12 weeks.
>
> **How to use this:** build modules in order. Each depends on the ones before it. Finish, test, and commit a module before starting the next. Do not scaffold everything at once. The 🔑 icon marks a point where the operator must supply an account or API key before you can proceed.

---

## Module 0 — Project foundation
**What:** Scaffold the repo and the skeletons everything else hangs on.
- Next.js (App Router) + TypeScript (strict) on Vercel.
- Supabase project: Auth, Postgres, RLS enabled.
- Inngest wired into the app (dev server + one hello-world job).
- Folder structure including the `lib/adapters/` layout from CLAUDE.md (empty interfaces are fine for now).
- Environment variable handling + a `.env.example`. Secrets never committed.
- Base CI: typecheck + lint + test run.

🔑 **Operator provides:** Supabase project URL + keys, Vercel project, Inngest account keys.
**Done when:** app deploys to Vercel, connects to Supabase, runs a trivial Inngest job, CI passes.

---

## Module 1 — Multi-tenancy & auth
**What:** The tenant backbone. Everything else assumes this works.
- `organizations` (tenants), `users`, membership/roles.
- Supabase Auth (email + optionally Google).
- RLS policies scoping every table by `tenant_id`. Write the policy pattern once and reuse it.
- Tenant context helper that every query and adapter call passes through.
- Seed the first tenant: Zaazaa Shoes.
- Mark tenants as `multi_tenant` vs `single_tenant` (hybrid flag) — even if single-tenant deploys come later, the flag exists now.

**Done when:** two test tenants cannot see each other's data; Zaazaa exists as tenant #1.

---

## Module 2 — Credential vault (operator-managed)
**What:** Secure storage for the client API credentials the operator manages.
- Encrypted storage (Supabase Vault or envelope-encrypted columns) for: WooCommerce keys, publishing-wrapper keys, social tokens, generation keys per tenant where needed.
- Internal admin UI for the operator to add/rotate credentials per tenant.
- Audit log on every credential read/write (POPIA requirement).
- Token-refresh job scaffold in Inngest (Meta 60-day, TikTok 24h access / 365-day refresh) — even if unused until publishing is wired.

🔑 **Operator provides:** decides Vault vs. encrypted-column approach is fine to leave to you; provides the master encryption key via env.
**Done when:** a credential can be stored, retrieved server-side, never appears in logs or client, and every access is audited.

---

## Module 3 — WooCommerce integration (commerce adapter)
**What:** Pull Zaazaa's catalogue so content can be product-aware.
- `lib/adapters/commerce/` implementing `getProducts()`, `getBestsellers()`, `getStockLevels()`, `getNewArrivals()`.
- Sync products into a tenant-scoped `products` table on a schedule (Inngest cron) + on-demand.
- Capture: title, description, images, price, stock, categories, sales rank where available.

🔑 **Operator provides:** WooCommerce REST API consumer key/secret for zaazaashoes.co.za.
**Done when:** Zaazaa's products appear in the dashboard, refresh on a schedule, and expose bestsellers / low-stock / new-arrivals.

---

## Module 4 — Brand profile & voice setup
**What:** Teach the system each brand's identity. This feeds every generation.
- `brand_profiles`: colors, logo, tone/voice doc upload, target audience, do/don't rules, example past posts.
- Upload past content + a guidelines doc → OpenAI distills a structured **brand-voice profile** (stored as structured data, not free text).
- An editable summary the operator can correct.

🔑 **Operator provides:** OpenAI API key. Brand assets/guidelines for Zaazaa (or we generate a starter profile from their site + socials).
**Done when:** Zaazaa has a saved, editable brand-voice profile that downstream generation reads.

---

## Module 5 — Generation adapters (the production core)
**What:** The wrapped AI services. Build each behind its interface with a mocked test first.
- `generateScript()` / `generateCaption()` → OpenAI (structured output, reads brand profile).
- `generateImage()` → Higgsfield (Soul) via Segmind.
- `generateVideo()` → Higgsfield via Segmind.
- `generateVoiceover()` → OpenAI TTS (default); ElevenLabs stub for premium tier.
- `assembleVideo()` → Shotstack (combine clips/images + captions + music into final per-platform formats).
- Supplementary: Freepik (stock/background), Canva (branded static templates).
- **Every billable call writes a `usage_event` and checks tier allowance first.**

🔑 **Operator provides:** Segmind key, Higgsfield subscription seat, Shotstack key, ElevenLabs key (for premium), Freepik Pro key, Canva Connect credentials.
**Done when:** given a product + brand profile, the system produces a finished captioned video and a static post, fully behind adapters, with usage metered.

---

## Module 6 — Content pipeline orchestration
**What:** Chain the adapters into the SENSE→PLAN→GENERATE flow as Inngest jobs.
- `content_items` table with the explicit state machine (`draft → generating → ready_for_review → …`).
- PLAN step: OpenAI decides format/hook/product/angle + A/B variants, constrained by brand profile + WooCommerce signals (feature bestsellers, low-stock urgency, new arrivals).
- GENERATE step: runs the right adapters, stores assets, moves item to `ready_for_review`.
- Triggers: on-demand button, manual product upload, and scheduled batch (Inngest cron).
- Robust failure handling → `failed` state with reason, retryable.

**Done when:** clicking "generate" (and a scheduled batch) produces review-ready items with A/B variants, product-aware, in the correct states.

---

## Module 7 — Approval queue, calendar & history (the dashboard core)
**What:** Where the human reviews and controls everything.
- Approval queue: preview each item per platform, edit caption/script, approve or reject.
- Content calendar: see/schedule what's going out when.
- Content history: everything generated + its state + outcome.
- Edit-before-publish for captions, timing, platform selection.

**Done when:** the operator can review, edit, approve/reject, and schedule items from a clean dashboard.

---

## Module 8 — Publishing (wrapper-first)
**What:** Push approved content live without waiting on platform audits.
- `lib/adapters/publishing/` implementing `publishPost()`, `schedulePost()` via **Blotato or Ayrshare**.
- Support auto-post, one-click, and scheduled (QStash/Inngest fires scheduled posts — works even if operator is offline, important for load-shedding).
- Per-platform formatting (IG / TikTok / FB).
- Record every publish in `publications`; handle platform errors gracefully.
- Enforce: licensed music only, AI-label where required, no third-party watermarks (TikTok rule).

🔑 **Operator provides:** Blotato or Ayrshare account + keys; Zaazaa's social accounts authorized through the wrapper. **Start the direct Meta App Review + TikTok audit in parallel now — they take weeks — but Phase 1 ships on the wrapper.**
**Done when:** an approved item publishes to all three platforms (manual, auto, and scheduled) via the wrapper.

---

## Module 9 — Analytics ingest & basic dashboard
**What:** Close enough of the loop to see results and seed the feedback flywheel.
- `getAnalytics()` in the publishing adapter pulls follower count/growth, engagement, reach/impressions, per-post performance (via the wrapper in Phase 1).
- `analytics_snapshots` table, refreshed on an Inngest cron.
- Dashboard views: follower growth, engagement rate, reach, top-performing posts.
- **Flywheel hook:** store per-format/per-hook performance so the PLAN step can later bias toward winners (basic version: surface "what performed best" to PLAN).

**Done when:** the dashboard shows real performance for Zaazaa's published content, and PLAN can read past performance.

---

## Module 10 — Billing & POPIA baseline
**What:** Make it a real SaaS and make it legal.
- Paystack (or Peach) recurring subscription in ZAR; map tiers → allowances; enforce via the metering from Module 5.
- Overage credit packs.
- POPIA: privacy policy, DPA template in repo, data export + deletion per tenant, retention config, Information Officer details.

🔑 **Operator provides:** Paystack/Peach account + keys; business/Information Officer details; legal review of POPIA docs.
**Done when:** a tenant can subscribe in ZAR, allowances are enforced, and POPIA export/delete works.

---

## Phase 1 exit criteria
The MVP is done when, for Zaazaa: products sync from WooCommerce → the system generates product-aware, brand-consistent content with A/B variants on a schedule and on demand → the operator reviews/edits/approves in the dashboard → content publishes to IG/TikTok/Facebook (manual, auto, scheduled) → performance flows back into the dashboard → all behind adapters, tenant-scoped, metered, and POPIA-compliant.

That's the full loop proven on one brand — the foundation Phase 2 (autonomy + intelligence) and Phase 3 (white-label resale) build on.

---

## What comes after (so you build Phase 1 with it in mind)
- **Phase 2:** autonomous marketer loop, trend + seasonal autopilot, trending-audio detection, hook generator, optimal-time prediction, competitor monitoring, raw-footage upload editing, direct Meta/TikTok APIs, deeper feedback flywheel, ElevenLabs brand voices.
- **Phase 3:** full white-label (custom domains/branding), single-tenant deployments, reseller billing via Stripe, predictive analytics, TikTok Shop (when SA-live), shoppable video.

Build Phase 1 modules so these slot in behind the existing adapters and tenant model without rework.
