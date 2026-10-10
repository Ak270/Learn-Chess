# Phase 11 — Personal-use decision: what it simplifies, and every limit that remains

**Decision D10 = RESOLVED: personal use only (one learner, the owner).** This file records what that unlocks, what it forbids, and every practical limit of a free, local-first, single-user build. It overrides earlier phases where noted in §9. *This is engineering guidance, not legal advice.*

## 1. Licensing: what personal use allows and the one line not to cross
| Component | Licence | Personal use | What would change the answer |
|---|---|---|---|
| Stockfish (WASM) | GPL-3.0 | Running it for yourself on your own machine/browser imposes **no obligations** | **Giving the app to anyone else.** A public website sends the GPL code (the Stockfish JS/WASM) to every visitor, which counts as distributing it, so the whole app would need to be GPL-compatible with source offered |
| Maia code/weights | GPL-3.0 per repo metadata (**VERIFY**) | Usable privately (still must work in-browser or via local lc0; see Phase 7 §1.3) | same as above |
| chess.js | BSD-2 | fine | keep notice if distributed |
| Lichess datasets (puzzles, games, evals) | CC0 | fine, no conditions | none |
| Dexie, ts-fsrs | Apache-2.0 / MIT (**VERIFY**) | fine | keep notices if distributed |
| Piece set, fonts | depends | prototype uses system glyphs; pick any set whose licence allows personal use; record it | check before sharing |
**The line:** *keep the app and its URL private.* Don't publish it on a public, discoverable URL, don't hand the build or repo to others, and don't make the GitHub repo public if it contains the Stockfish build. If you ever want to share it with even one friend, that is a new decision (see §8).
Third-party **terms of service still apply** even for personal use: Lichess API, Chess.com Published-Data API (identify yourself with a User-Agent, don't hammer in parallel — official guidance), and your AI provider's free-tier terms. Read them once and record in `LICENSES.md`.

## 2. How to run it privately (hosting options, pick one)
| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Local only (recommended start)** | `npm run build && npm run preview` (or `dev`) on your computer, open `http://localhost:…` | Zero cost, zero exposure, full-strength multi-thread Stockfish possible (add COOP/COEP headers in the dev/preview server config), no 25 MiB per-file limit | Only on that computer; phone use needs same-network access |
| **B. Same-network device access** | run the preview server bound to your LAN address; open from phone on home Wi-Fi | Use on phone at home | HTTP only on LAN → some browser features (service worker, install-as-app, clipboard) need a secure context (`localhost` or HTTPS) — **VERIFY**; not for use away from home |
| **C. Private static host** | deploy to a static host **behind access control** (e.g. Cloudflare Pages + Cloudflare Access with only your email, or a password-protected host) — **VERIFY** the free plan supports this | Use anywhere, HTTPS (PWA install works) | Setup effort; must confirm access control really blocks the public; the build is still stored on a third-party host |
Do **not** use a plain public static URL (unlisted is not private: URLs leak and get crawled).
Backups: the app lives in one browser profile, so §4 export is your backup.

## 3. Free-tier and usage limits (single user)
Numbers quoted from the blueprint's Appendix A or other sources are **as of 8 Oct 2026 and must be re-checked** before relying on them.
| Resource | Limit (as found) | Your expected use | Verdict / handling |
|---|---|---|---|
| AI wording (free tiers: Gemini, Groq, OpenRouter) | Quotas/models change; OpenRouter documented 50 requests/day account limit on its Free plan; Groq returns HTTP 429 above model limits | ≈ 5–12 calls/day (1–2 game explanations + teacher note + a few chat questions), cached by hash | Fits. Provider chain + cache + template fallback (Phase 7 §3.5–3.6). If every provider is down, the app still works with templates |
| AI keys in the browser | Visible to anyone with access to your browser profile | single trusted user | Acceptable for personal use; use a key with a spending cap; never commit keys |
| Lichess game export | Rate-limited, streaming; ordinary personal use is fine | 20 games at onboarding, then a few per day | Fine; fetch serially; respect HTTP 429 `Retry-After` |
| Chess.com PubAPI | Serial access OK, parallel may 429; data refreshes ≤ every ~12 h | same | Fine; cache with ETag; serial fetch |
| Browser storage (IndexedDB) | Quota depends on browser/disk; data can be evicted; Safari may clear script-written storage after a period of non-use unless installed/persisted (**VERIFY**) | ~50 MB per 1,000 games (Phase 2 §7) | Fine for size. Call `navigator.storage.persist()`; show usage; monthly export reminder; keep a backup file |
| Engine strength/speed | Browser Stockfish: lite single-thread ≈ 6 MB build is weaker; full multi-thread build ≈ 66 MB needs COOP/COEP headers | analysis depth 12–14 per ply is enough at your level | Option A lets you use the strong build; phone uses lite; review runs in background |
| Single device | Local-first = data lives in one browser profile; no automatic sync between laptop and phone | you | Use export/import to move or back up; optional future: File System Access API to keep a backup file automatically — **VERIFY** browser support |
| Battery/CPU on phone | Engine analysis is CPU-heavy | review 40-move game ≈ 1 min laptop, longer on phone | Run reviews on the laptop; phone for drills/cards/puzzles |
| Content volume | Puzzle shards + engine files; local hosting has no 25 MiB/file or 20,000-file hosting limits (those apply to Cloudflare Pages) | ~19k puzzles ≈ 5–8 MB gz | Fine |
| Opening explorer API | Might require a Lichess token now (**VERIFY**) | rare lookups | Use the bundled opening book instead (Phase 6 §3.3) |
| Authoring effort | Not a technical limit, but the largest practical one | ~40 lessons | Staged plan (Phase 6 §9) |

## 4. Backup, recovery, and "what if the browser forgets"
1. **Weekly auto-reminder** (in-app banner + `.ics` entry) to export (Phase 2 §6).
2. Export includes games, cards, attempts, skills, memories, settings. AI keys are excluded unless you tick a box.
3. Restore = import into an empty browser profile; Phase 2 acceptance test proves round-trip.
4. If storage is wiped: games can be re-imported from Lichess/Chess.com (reviews re-run), but Blunder Box schedule/attempt history and notes are lost without the export — **the export is the only copy**.
5. Optional later: auto-save the export to a chosen folder (File System Access API) so backups need no thought.

## 5. What personal use lets us simplify (remove or defer)
| Earlier item | Change |
|---|---|
| Milestone M5 "public-readiness" (Phase 9 §7) | **Dropped**: no GPL source-offer process, no public privacy notice, no load test |
| CORS proxy for Lichess/Chess.com (Phase 4 §2.1) | **Deferred**: first try direct browser fetch (**VERIFY** CORS); fall back to manual PGN upload; run a tiny *local* proxy only if needed. No hosted proxy |
| Hosting limits & `_headers` (Phase 8/9) | Option A makes COOP/COEP trivial in the local server config |
| Accounts, cloud sync, analytics | Remain out (also unnecessary now) |
| Anti-abuse, rate-limits for others, CSP strictness for public threats | Keep basic CSP, drop the rest |
| Maia (GPL) | Allowed for evaluation under personal use (still subject to technical feasibility, Phase 7 §1.3) |
| Multi-user considerations (profile per user, i18n beyond English, age/privacy policy) | Deferred |

## 6. Hard limits that remain no matter what (be aware, plan around them)
1. **Evidence limit**: coaching methods are unproven trials; we measure on you (Phase 9 §2).
2. **Opponent realism below ~1100**: needs your own calibration (Phase 7 §1.2, Phase 9 §2.4).
3. **Review accuracy**: first-meaningful-mistake and diagnosis are heuristics; expect to correct them for the first ~20 games.
4. **Browser engine is weaker than desktop Stockfish**; fine for teaching at 600–1200, not for deep analysis.
5. **Single-browser data**: switching browsers/devices means export/import.
6. **No push notifications** without a server; reminders rely on calendar/in-app.
7. **Authoring time** for lessons is the main real-world constraint.
8. **Third-party API changes** (free AI quotas, explorer auth, CORS) can break features; every such feature has a fallback.

## 7. Updated decisions (replaces rows in `00-INDEX.md` §3)
| ID | Decision | Status |
|---|---|---|
| D8 | Hosting: **Option A local first**, Option C (private, access-controlled) only if you want phone use away from home | PROPOSED (owner may change) |
| D10 | **Personal use only** | **RESOLVED** |
| D14 | CORS: try direct fetch; fallback manual PGN; local proxy only if needed | PROPOSED, VERIFY |
| D19 | Backup: weekly export reminder; export file is the only backup | PROPOSED |
| D20 | Repo visibility: keep the GitHub repo **private** (it will contain/ship the Stockfish build and your data fixtures) | PROPOSED — please confirm the repo is private |

## 8. If you ever decide to share it (checklist, not now)
1. Decide who and how many; even one recipient = distribution.
2. Make the app GPL-3-compatible, add a LICENSE, offer the corresponding source for the shipped Stockfish and for the app.
3. Replace browser-held AI keys with a rate-limited proxy; write a privacy notice (no data leaves the device by default).
4. Re-verify all dataset/asset licences and provider terms; add a hosted CORS proxy if needed.
5. Re-introduce M5 from Phase 9.

## 9. Patches applied
`00-INDEX.md` D8/D10/D14/D19/D20 rows; `09-quality-ops.md` §5 ledger status for Stockfish and M5; `../COVERAGE.md` §I; `04-import-review.md` §2.1 proxy note.

## 10. Acceptance tests
- [ ] Production build served from a local server with COOP/COEP headers runs the multi-thread engine; with headers removed it falls back to lite single-thread with no errors.
- [ ] No network request leaves the machine during play/drills/review except: Lichess/Chess.com import and AI wording (verified with a network log test).
- [ ] Export → wipe browser data → import restores all tables.
- [ ] With all AI providers disabled, every screen still works using templates.
- [ ] `LICENSES.md` contains an entry for every dependency and notes "personal use only; do not distribute".
