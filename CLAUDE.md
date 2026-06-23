# CLAUDE.md — Project Build Bible

> **Read this file at the start of every session before writing any code.**
> This is the source of truth for how this project is built. If a request conflicts with the rules here, flag it before proceeding.

---

## 1. What we're building

An AI marketing automation **SaaS platform**. It automates social media marketing for e-commerce brands: it generates product-aware content (posts, reels, stories, TikToks, video ads), routes it through a human approval queue, publishes to Instagram / TikTok / Facebook, tracks performance, and uses that performance to improve the next batch.

**First client:** Zaazaa Shoes (South African shoe brand, on WooCommerce — https://zaazaashoes.co.za/).
**End goal:** resell the platform to other brands as a multi-tenant + single-tenant hybrid SaaS, with white-label capability.

The product's promise is to behave like an **autonomous expert digital marketer** with human approval gates — not just a scheduler with AI bolted on.

---

## 2. The non-negotiable architectural rules

These rules exist so we can add features later without ripping out wiring. **Do not violate them, even if it's faster in the moment.**

### Rule 1 — Everything external goes through an adapter
Never call an external API (Higgsfield, Segmind, OpenAI, Shotstack, WooCommerce, the publishing wrapper, payment provider) directly from UI components or business logic. Every external service is wrapped in an internal adapter module with a stable interface.

- `lib/adapters/generation/` → `generateImage()`, `generateVideo()`, `generateScript()`, `generateVoiceover()`
- `lib/adapters/publishing/` → `publishPost()`, `schedulePost()`, `getAnalytics()`
- `lib/adapters/commerce/` → `getProducts()`, `getBestsellers()`, `getStockLevels()`
- `lib/adapters/billing/` → `createSubscription()`, `recordUsage()`

The rest of the app calls these interfaces and never knows which vendor is behind them. Swapping Higgsfield→another model, or the publishing wrapper→direct Meta API, must be a change inside one adapter folder, nothing else.

### Rule 2 — Multi-tenant from line one
Every table has a `tenant_id` (organization) column. Every query is scoped by Supabase Row-Level Security. No query ever returns data across tenants. A single brand (Zaazaa) is just the first tenant — never hardcode anything Zaazaa-specific into shared code; it all lives in tenant config/data.

### Rule 3 — No secrets in code, ever
All API keys, tokens, and client credentials live in environment variables (for platform keys) or **Supabase Vault / encrypted columns** (for per-client credentials the operator manages). Never commit a key. Never log a key. Never put personal data or secrets in URL query strings.

### Rule 4 — Long jobs never run in a request handler
Vercel serverless functions time out (~300s on Pro). Anything slow — video rendering, batch generation, scheduled posting, analytics pulls — runs as an **Inngest** background job, not inline in an API route. API routes enqueue jobs and return immediately.

### Rule 5 — Build module by module, prove each one
Do not scaffold the whole platform at once. Build one module from the Phase 1 plan, make it work, test it, commit it, then move to the next. Keep changes reviewable.

---

## 3. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Frontend / hosting | Next.js (App Router) + React on Vercel |
| Database / auth | Supabase (Postgres + RLS + Auth + Vault) |
| Background jobs | Inngest (primary) + QStash for simple scheduled posts |
| AI image/video (core) | **Higgsfield** via **Segmind** (pay-per-generation) for production; one Higgsfield subscription seat for dev/MCP |
| Supplementary images / stock | Freepik API |
| Scripts / captions / brand voice / agent brain | OpenAI API (function calling + structured outputs) |
| Voiceover | OpenAI TTS (default tiers) → ElevenLabs (premium tiers) |
| Raw video editing & final assembly | Shotstack (JSON→video) |
| Static design / branded templates | Canva Connect API |
| Social publishing & analytics | **Phase 1:** Blotato or Ayrshare wrapper. **Phase 2:** direct Meta Graph API + TikTok Content Posting API |
| E-commerce data | WooCommerce REST API |
| Billing | Paystack or Peach Payments (ZAR) + Stripe (international/white-label) |
| Trend detection | TikTok Creative Center + Google Trends + scrapers (Phase 2) |

**Do not introduce new vendors or frameworks without flagging it first.** If a task seems to need one, raise it rather than silently adding a dependency.

---

## 4. The core pipeline (how content gets made)

This is the heart of the product. Build it as discrete, testable stages, each behind an adapter:

```
1. SENSE     pull WooCommerce data + social analytics + trend signals + SA seasonal calendar
2. PLAN      OpenAI (function calling) decides what to make: format, hook, product, angle, A/B variants
                constrained by the tenant's brand-voice profile + brand guidelines
3. GENERATE  script/caption (OpenAI) → image/video (Higgsfield via Segmind)
                → assembly + captions + music (Shotstack) → voiceover (TTS/ElevenLabs)
4. REVIEW    item lands in the approval queue with a preview; human edits/approves
5. PUBLISH   auto / scheduled / one-click via the publishing adapter
6. LEARN     ingest post-performance → update brand model → bias next PLAN cycle
```

Stage 6 (the feedback flywheel) is the differentiator. Even a simple version ("favor formats that performed well last time") matters — build the hook for it early even if the logic starts basic.

The whole loop is driven per-tenant by a scheduled **Inngest cron** job — this is the "autonomous expert marketer" brain. Autonomy is **bounded**: human approval is ON by default. A "full autopilot" toggle is opt-in per tenant.

---

## 5. Data model principles

- Core entities: `organizations` (tenants), `users`, `brands` (a tenant may hold several), `brand_profiles` (voice/guidelines/colors), `products` (synced from WooCommerce), `content_items` (the generated assets + state), `content_variants` (A/B), `schedules`, `publications` (what went live where), `analytics_snapshots`, `credentials` (encrypted), `usage_events` (for billing/metering), `trend_signals`.
- `content_items` moves through an explicit **state machine**: `draft → generating → ready_for_review → approved → scheduled → published → analyzed` (plus `rejected`, `failed`). Never represent state with scattered booleans.
- Everything is timestamped and tenant-scoped. Soft-delete; respect POPIA retention/deletion (see §7).

---

## 6. Billing & usage metering

- **Video generations are the dominant cost.** Meter every billable AI generation as a `usage_event` the moment it happens, in the generation adapter. Enforce tier allowances before generating, not after.
- Tiers gate which models are allowed (premium video models + ElevenLabs = higher tiers only) and how many generations per month.
- Sell overage credit packs. Never offer "unlimited" anything that costs us per call.
- Blended AI cost of goods should stay under ~30% of a tier's price.

---

## 7. South Africa & compliance (build in from the start)

- **Billing currency is ZAR** (Paystack/Peach). USD only for international/white-label resale.
- **Seasonal/trend logic uses a South African + Southern-Hemisphere calendar** (summer is Dec–Feb; Heritage Day, Youth Day, Women's Month, Freedom Day, Mandela Day, Black Friday/Festive, back-to-school in Jan, etc.). Never default to a Northern-Hemisphere calendar.
- **POPIA:** we are an "operator" processing data for clients. Build: encrypted credential storage, audit logging on credential access, per-tenant data isolation (RLS), data export + deletion, configurable retention (30–90 days post-termination). Keep a POPIA-ready privacy policy and a Data Processing Agreement template in the repo.
- **TikTok Shop is NOT reliably live in SA** — do not build hard dependencies on it. Architect it as a future fast-follow integration behind the commerce adapter.
- Assume mobile-first, data-cost-sensitive users; generate lightweight asset variants where feasible.
- **AI-content labeling:** music must be commercially licensed for auto-posting; Meta requires AI-generated labels for photorealistic people — bake disclosure into the publish step.

---

## 8. Coding conventions

- TypeScript everywhere. Strict mode on.
- Server-side logic in route handlers / server actions / Inngest functions; keep secrets server-side only.
- Validate all external input and all AI output with a schema (e.g. Zod) before it touches the database.
- Adapters return typed results and never leak vendor-specific shapes upward.
- Errors from external services are caught in the adapter and returned as typed failures — the app never sees a raw vendor error.
- Write a test for each adapter against a mocked vendor response.
- Keep functions small; comment the *why*, not the *what*.
- Use feature flags for anything that isn't ready for all tenants.

---

## 9. How to work with me (the human / operator)

- I (the operator) handle all account creation, API keys, paid tier approvals, and the Meta/TikTok platform audits. You cannot do those — when a task needs a key or an account, tell me exactly what to get and pause.
- Build in the order given by the Phase 1 plan. Don't jump ahead.
- After each module: summarize what you built, how to test it, and what key/account I need next.
- If something in this file blocks a request, say so and propose the cleanest compliant path rather than quietly working around it.
- Flag any new cost, new vendor, or new permission *before* committing to it.

---

## 10. Definition of done (per module)

A module is done when: it works end-to-end behind its adapter; it's tenant-scoped with RLS; secrets are handled per Rule 3; long work runs in Inngest per Rule 4; it has at least one test; usage is metered if it costs money; and there's a one-paragraph note on how to test it and what comes next.

---

## 11. Known risks to design around

- **Higgsfield API:** sparse docs, undocumented rate limits, gated access, possible bot-protection on non-browser calls. Mitigate by going through Segmind and keeping the generation adapter swappable.
- **Social API access:** TikTok audit + Meta App Review take weeks and can be rejected. That's why Phase 1 uses a pre-audited wrapper. Start the direct-API audits in parallel but never block launch on them.
- **Vendor pricing shifts:** all pricing is a 2026 snapshot; the metering layer must make cost changes a config update, not a code rewrite.
