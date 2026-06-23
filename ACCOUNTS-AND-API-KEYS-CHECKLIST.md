# Accounts & API Keys Checklist

> Claude Code writes the code; **you** create the accounts and supply the keys. This is your list. It's ordered so you're never blocked — get the 🟢 **Get first** items before the build starts, then supply the rest as each module needs them.
>
> Columns: what to sign up for · what you'll hand to Claude Code · rough cost · which build module needs it.
>
> **Security:** never paste a live secret into chat. Put keys in your `.env` / Supabase Vault as instructed per module. Share only that a key "is ready," not the value.

---

## 🟢 Get first — needed before/at the start of the build

| Service | What you need | Rough cost | Needed for |
|---|---|---|---|
| **Supabase** | Project URL, anon key, service-role key | Free to start; Pro ~$25/mo later | Module 0–1 |
| **Vercel** | Account + project linked to your repo | Free to start; Pro ~$20/mo | Module 0 |
| **Inngest** | Account, event key, signing key | Free tier (50k runs) | Module 0 |
| ↳ *What is Inngest?* | The background-job runner — it handles all the slow/scheduled work that can't run while someone waits on a page (video rendering, batch content generation, scheduled posting, overnight analytics refresh). Vercel functions time out after a few minutes, so longer jobs hand off to Inngest, which runs them reliably and retries on failure. It also fires scheduled posts even when your computer is off (matters during load-shedding). | — | — |
| **OpenAI** | API key (set a billing limit) | Usage-based, cents per call; budget ~$20–50/mo dev | Module 4–6 |
| ↳ *What does it do?* | Scripts, captions, brand-voice structuring (GPT models), image generation (DALL-E), and voiceover (TTS). All the text/image generation plus the "brain" that decides what to make. | — | — |
| **GitHub** | Repo for the project | Free | Module 0 |

---

## 🟡 Get during the build — supply when the module needs it

| Service | What you need | Rough cost | Needed for |
|---|---|---|---|
| **WooCommerce (Zaazaa)** | REST API consumer key + secret from zaazaashoes.co.za (WP admin → WooCommerce → Advanced → REST API). Read access is enough to start. | Free (it's their store) | Module 3 |
| **Segmind** | API key (this is how we run Higgsfield models in production, pay-per-generation) | Pay-per-gen: images ~$0.12–0.23, video ~$0.16–0.70, talking-video ~$0.86–4.22 each | Module 5 |
| **Higgsfield** | One subscription seat (for the MCP/CLI during dev) + confirm API tier access | Subscription (tiered) | Module 5 (dev) |
| **Shotstack** | API key (video assembly/rendering) | Free sandbox; production per-rendered-minute | Module 5 |
| **Canva** | Canva Connect API credentials (branded static templates) | Connect API; can defer | Module 5 (optional Phase 2+) |
| **ElevenLabs** | API key (premium voiceover / brand voices) | Usage-based; only needed for premium tier | Module 5 (premium only) |
| **Blotato or Ayrshare** | Account + API key (the publishing wrapper — pick ONE to start) | Blotato mid-tier / Ayrshare enterprise (~$770/mo at 50 profiles — fine for one brand early); Postiz self-host (~$99/mo) is the white-label-friendly alt | Module 8 |
| **Zaazaa social accounts** | Instagram (Business/Creator), Facebook Page, TikTok — authorized *through* the wrapper | Free | Module 8 |
| **Paystack or Peach Payments** | Merchant account + API keys (ZAR recurring billing) | ~2.9% + R1 per txn (Paystack) | Module 10 |

---

## 🔴 Start early, finishes later — the slow platform audits (begin in parallel during Phase 1)

These take **2–4 weeks each and can be rejected** — that's exactly why Phase 1 ships on the wrapper instead. But start them early so direct APIs are ready for Phase 2 (better margins + deeper analytics).

| Service | What's involved | Time | Needed for |
|---|---|---|---|
| **Meta (Instagram + Facebook) Graph API** | Meta developer app, **business verification**, `instagram_business_content_publish` permission, **App Review** with screencasts. Requires IG Business account linked to a FB Page. | 2–4 weeks per submission | Phase 2 direct publishing |
| **TikTok Content Posting API** | Developer app, `video.publish` scope, **app audit** (needs a built, compliant integration; until passed, posts are forced private and capped at 5 accounts/24h) | 2–4 weeks, multiple rounds | Phase 2 direct publishing |

**Action:** register the Meta developer app + start business verification, and register the TikTok developer app, **now**. They run in the background while you build on the wrapper.

---

## 🟣 Later phases — don't get these yet

| Service | For | When |
|---|---|---|
| **Stripe (ZA)** | International / white-label reseller billing in USD | Phase 3 |
| **Trend/scraper APIs** (TikTok Creative Center, Google Trends, Apify, Data365/Phyllo) | Trend detection & competitor monitoring | Phase 2 |
| **TikTok Shop** | Shoppable integration — **not reliably live in SA yet**, don't build on it | Phase 3 / when SA-live |

---

## Rough monthly running cost at MVP (one brand, Zaazaa)
Ballpark once live, low volume: Supabase Pro ~$25 + Vercel Pro ~$20 + OpenAI ~$20–50 + Segmind (usage; depends on video count — the big variable) + Shotstack (usage) + publishing wrapper (~$99–770 depending on choice) + Paystack per-transaction. **The video generation count is the cost driver** — that's why the app meters it and sells credit packs. Keep an eye on it during testing.

> Re-verify all pricing before committing — these are 2026 snapshots and change often.

---

## One-line summary
Get the 🟢 five first, hand over 🟡 keys as each module asks, kick off the 🔴 Meta + TikTok audits in parallel right away, and ignore 🟣 until later phases. Tell Claude Code when each key "is ready" — never paste the actual secret into chat.
