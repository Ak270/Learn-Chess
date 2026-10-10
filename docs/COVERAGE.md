# Coverage check: does the plan cover everything a good teacher does?

Method: list what a human chess teacher does for a ~600-rated adult (from the teacher/coach sources in `research-notes.md` and general tutoring-system structure: domain model, student model, pedagogical model, interaction layer), then point to where our docs and prototype handle it. **Status:** ✅ specified · 🟡 specified but thin/needs data · 🆕 added in `backend/10-addendum-teacher-gaps.md` · ⏳ deliberately later · ❌ not planned (with reason).
"Prototype" = clickable UI in `ui/` (`#/profile` and review "Find it first" were added after the research).

## A. Understand the person (student model)
| Teacher behaviour | Where | Status |
|---|---|---|
| Assess starting level without trusting self-rating | Phase 4 §1 baseline + calibration set | ✅ |
| See *how* they think (think-aloud) | Phase 10 §1.2 | 🆕 |
| Know their goals, motivation, time, preferences | Phase 10 §1.1; prototype Profile | 🆕 |
| Track skills with evidence, separate knowledge vs recognition vs transfer | Phase 5 §3 | ✅ |
| Recognise wrong beliefs (misconceptions) | Phase 10 §1.3 | 🆕 |
| Remember patterns over months ("coach memory"), visible and editable | Phase 10 §1.4; prototype Profile | 🆕 |
| Notice mood/tilt/fatigue | Phase 10 §5.4 | 🆕 |
| Rules knowledge gaps (castling, en passant, stalemate) | Phase 10 §7 (`rules_fluency`) | 🆕 |

## B. Teach new things
| Teacher behaviour | Where | Status |
|---|---|---|
| Short focused lessons, one idea at a time | Phase 6 §4, Phase 5 §5 | ✅ |
| Worked examples from the student's own games | Phase 5 §5.3, Phase 4 | ✅ |
| Explain "why", with analogies; change angle when it doesn't land | Phase 7 §3–5, Phase 10 §8 | 🟡→🆕 |
| Model games / "how a stronger player thinks" | Phase 6 §7 | ✅ (content in M4) |
| Openings as ideas + retention | Phase 6 §3 | ✅ |
| Middlegame plans | Phase 6 §5 (skills exist) | 🟡 content authoring later |
| Endgames incl. basic mates early | Phase 6 §6 + Phase 10 §7 | 🆕 reorder |
| Visualization | Phase 10 §4 | 🆕 |
| Reading list / next resources | Phase 10 §9 | 🆕 (optional) |

## C. Practise
| Teacher behaviour | Where | Status |
|---|---|---|
| Targeted drills from own mistakes (Blunder Box) | Phase 5 §4 | ✅ |
| Spaced repetition & retrieval | Phase 5 §4, daily recall | ✅ |
| Recognition vs calculation practised differently; accuracy before speed | Phase 10 §3 | 🆕 |
| Fixed-set repetition (Woodpecker) | Phase 6 §2.4 | ✅ |
| Hint ladder that fades | Phase 5 §7 | ✅ |
| Daily/weekly/monthly tests | Phase 5 §6, §9 | ✅ |

## D. Play with the student
| Teacher behaviour | Where | Status |
|---|---|---|
| Human-like sparring partner at the right level | Phase 7 §1 | ✅ (Maia unverified) |
| Adaptive level; normalise dips vs stronger players | Phase 10 §5.3 | 🆕 |
| Coaching during play without nagging | Phase 7 §2 | ✅ |
| Take-back-with-a-question | Phase 7 §2.2 | ✅ |
| Play the critical position out | Phase 4/10 §2, Phase 7 critical mode | ✅ |
| Slow games as the training default | Phase 10 §5.2 | 🆕 |
| Real-board / over-the-board play | Phase 10 §9 | 🆕 (opt-in) |

## E. Review games
| Teacher behaviour | Where | Status |
|---|---|---|
| Find the first meaningful mistake, not every inaccuracy | Phase 3 §4 | ✅ |
| Student finds it first, then compare | Phase 10 §2 | 🆕 |
| Ask "what were you thinking?" before explaining | Phase 4 §5 | ✅ |
| Diagnose cause with honest confidence | Phase 4 §4 | ✅ |
| Review losses soon; don't let student cherry-pick | Phase 10 §5.2/§6 | 🆕 |
| Time-per-move interpretation | Phase 4 §4 | ✅ |

## F. Motivate, plan, communicate
| Teacher behaviour | Where | Status |
|---|---|---|
| A plan for each day/week/month with reasons | Phase 5 §5, §9 | ✅ |
| Consequences that teach, never shame | Phase 5 §8 | ✅ |
| Honest expectations, no false timelines | Phase 10 §5.1 | 🆕 |
| Celebrate behaviour change, specific praise | Phase 7 §5 | ✅ |
| Streaks with freeze/welcome-back | Phase 5 §8 | ✅ |
| Socratic questioning with an opt-out | Phase 10 §8 | 🆕 |
| Reminders / accountability | Phase 10 §6 | 🆕 (local-first limits) |
| Share progress with a human coach/friend | Phase 10 §6 | 🆕 |

## G. System qualities
| Need | Where | Status |
|---|---|---|
| Correctness: chess truth from engine/rules, AI only words | Phase 3, 7 | ✅ |
| Privacy/local-first, export/delete | Phase 2, 9 | ✅ |
| Measure whether it works on the learner | Phase 9 §2 | ✅ |
| Accessibility, performance, offline | Phase 8–9 | ✅ |
| Licensing | Phase 9 §5 | 🟡 several VERIFY items |
| Free-first, replaceable parts | Phase 1 | ✅ |

## H. Deliberately not planned (and why)
| Item | Reason |
|---|---|
| Human live-coach marketplace | Out of scope; replaced by Coach Report export |
| Social/leaderboards/public profiles | Shame/comparison risk; privacy; revisit after v1 |
| Video courses | High authoring cost; interactive lessons first |
| Voice coaching, mobile app, accounts/cloud sync | ⏳ future (blueprint v1 §18) |
| Cheating/fair-play detection | Not relevant to a personal training tool |
| Monetisation, paywalls | Not a goal; free-first |

## I. Honest remaining gaps / risks (not solved by writing docs)
1. **Authoring effort**: ~40 good lessons must be written and reviewed (M2–M4).
2. **Evidence is thin**: all pedagogy is expert opinion; success is measured per learner (Phase 9 §2), not assumed.
3. **Opponent realism below 1100** has no off-the-shelf human-like model; our error model must be calibrated on the owner's games.
4. **Diagnosis precision** for imported games is limited (no Safety-Check data) — mitigated by the self-explanation prompt, but accuracy is unproven until labelled data exists.
5. **Several external facts are VERIFY items** (CORS, explorer auth, Maia, Stockfish package version, ts-fsrs API, licences).
6. **Owner decisions pending** (D8, D10, D12, D13, D15).
