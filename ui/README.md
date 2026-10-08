# Mentor — UI prototype (dummy data)

Plain HTML/CSS/ES modules. No build step. All data is placeholder (`js/data.js`); the bot is a tiny material search (`js/bot.js`).
Rules come from the vendored `chess.js` 1.4.0 (BSD-2-Clause, see `vendor/chess.js.LICENSE`).

## Run
```
cd ui && python3 -m http.server 8765      # then open http://localhost:8765/
```
(ES modules need http://, not file://.)

## Screens (hash routes)
`#/home` `#/session` `#/play` `#/puzzles` `#/learn` `#/learn/l2` `#/openings` `#/blunders` `#/review` `#/progress` `#/settings` + global "Ask Mentor" drawer.

## What is real vs dummy
| Real in the prototype | Dummy |
|---|---|
| Legal moves, check/mate/draw, castling, en passant, promotion (chess.js) | Engine strength, evaluation, move classification |
| Drag/click moves, animations, arrows (right-drag), flip, history navigation | Hanging-piece detector is a 1-ply capture check |
| Hint ladder, take-back flow, Safety Check UI, settings persistence (localStorage) | Every number, rating, card schedule, lesson |

Layout and interaction patterns follow common chess-site conventions. No third-party logos, names, or art are used.
Pieces are Unicode glyphs; the real build swaps in an open-licensed piece set (licence to be verified).
