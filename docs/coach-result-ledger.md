# Coach Result Ledger

## Local Reference Engine Facts

- Preferred full-strength Stockfish reference as of 2026-09-27: `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe`, verified by `bench 1` as Stockfish 19. Use this for future Stockfish reference analysis and match commands unless Sir Slice explicitly asks for another engine.
- Older extracted `analysis-tools\stockfish\stockfish-windows-x86-64-avx2.exe` reported as Stockfish 16.1 in `tools\coach-analysis-lab.mjs`; keep old run artifacts reproducible, but do not use that path for future SF18/SF19 claims.
- Sir Slice has a usable Rodent opening book at `<USERPROFILE>\Downloads\rodent.bin`.

## 2026-09-25 - Bare-King Rook-Pawn Root Extension

- Status: accepted-narrow
- Commit: b842913 Add-bare-king-rook-pawn-root-extension
- Run: analysis-runs\candidate-bareking-rookpawn-rootext-shallowblue1618-20g-5m0-20260925
- Result: Coach vs ShallowBlue 1618: 10 - 9 - 1 [0.525] 20
- Baseline: nearest ShallowBlue 1618 5+0 baseline was 8 - 7 - 5 [0.525] 20
- Tests: sentinel depth-8 Kc4/Kc5 opposition fixed; normal engine regression 64 pass, 0 fail; time-management focused tests 14 pass, 0 fail; stability-short identity ok with about 0.286% slower timing
- Decision: Accepted because the narrow sentinel was fixed and the 20-game smoke score tied the nearest baseline without regression.
- Next targets: game10-ply160-Kd1, game8-ply208-Kc2, game5-ply101-Kc4, repeated game11/game15 exd4 mate-score drop, and queen-vs-king / entered-losing-mate king-move themes from the run's swing-mining folder.

## 2026-09-25 - Root Tie Verified-Top Candidate

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-root-tie-verified-top-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 4 - 16 - 0 [0.200] 20
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20
- Tests: sentinel and normal engine regression passed; time-management focused tests passed; stability-short identity ok but about 1.070% slower
- Decision: Rejected because the 20-game smoke match was a severe regression and mining showed 21 swings with more losing-mate entries.
- Known-bad idea: Do not broadly change root tie verification to return the top root table move after a verified tied move is lowered; it fixed the local Kb4 sentinel but destroyed ShallowBlue 5+0 match strength.
- Next targets: Continue from the accepted b842913 baseline; prefer a more local treatment of the queen-vs-king/king-move horizon cases or choose a different mined FEN family.

## 2026-09-26 - Losing-Mate Root Tie Pawn Preference

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-losing-mate-tie-pref-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 5 - 13 - 2 [0.300] 20
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20
- Tests: sentinel moved game5-Kc4-before from b3c4 to h2h4; engine regression passed 65 pass, 0 fail, 67 skipped; stability-short identity ok and about 0.318% faster
- Decision: Rejected because the 20-game 5+0 smoke match regressed badly despite passing local gates.
- Known-bad idea: Do not generally prefer quiet pawn resources over king moves in tied losing-mate root scores; it fixed the local game5-Kc4-before move choice but damaged ShallowBlue 5+0 strength.
- Next targets: Mine this failed run for why the tie preference caused match losses, but keep the accepted b842913 code baseline; look for a narrower condition than root-wide losing-mate tie preference.

## 2026-09-26 - Root Verification Centipawn-to-Mate Guard

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-root-verify-centipawn-guard-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 4 - 14 - 2 [0.250] 20
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20
- Tests: game13-ply165-g4 sentinel stayed centipawn-class at depth 8; engine regression passed 65 pass, 0 fail, 67 skipped; stability-short identity ok and about 0.227% faster
- Decision: Rejected because the 20-game 5+0 smoke match regressed badly, especially as White.
- Known-bad idea: Do not skip root-tie verification merely because a verified tied move falls from a centipawn root score into losing-mate class; it fixed a local root-table inconsistency but badly damaged match strength.
- Next targets: Stop patching root-tie verification policy broadly. Prefer mining accepted-baseline losses for a different FEN family or a move-specific eval/search issue outside root verification.

## 2026-09-26 - Depth-8 Danger Time Targeting

- Status: rejected-fragile
- Commit: n/a
- Run: analysis-runs\candidate-depth8-danger150-shallowblue1618-50g-5m0-20260924
- Result: Coach vs ShallowBlue 1618: 11 - 26 - 13 [0.350] 50
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20; the same depth8-danger150 idea had an encouraging 20-game smoke at 11 - 5 - 4 [0.650] 20 but did not hold up in the larger 50-game sample.
- Tests: prior 20-game smoke looked promising, but the 50-game match showed clear practical regression and included one illegal-move/no-move result.
- Decision: Rejected as a standalone time/depth policy because the larger sample contradicted the quick smoke result.
- Known-bad idea: Do not revive broad depth-8 danger targeting just because Coach often benefits from reaching depth 8; require narrower evidence tied to clock state, position class, and stable match results.
- Next targets: If time management is revisited, track actual move clocks/depths and only spend extra time when a specific class of positions repeatedly flips at depth 8 without harming 5+0 clock safety.

## 2026-09-26 - Accepted-Run High-Signal FEN Probe Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\candidate-bareking-rookpawn-rootext-shallowblue1618-20g-5m0-20260925 plus analysis-runs\accepted-bareking-smoke-sf18-compare-20260926\20260925-223031
- Result: No new candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Probed game11/game15 exd4-after, game12 exf4-after, game7 Kb5 before/after, game19 Kb3 before/after, game20 c4 before/after, and game8 Kc2-before through depths 4-10.
- Decision: Most high-signal FENs either were already mate-class at shallow depth, collapsed into many equivalent mate-class root moves, or repeated the root-verification/tie pattern that already failed smoke matches.
- Known-bad idea: Do not force an eval patch from these FENs when root tables and deeper probes do not isolate a stable non-root policy error.
- Next targets: Pivot to either new match evidence, a different FEN family where root table and reference engine agree on a single missing resource, or instrumentation that correlates Coach's clock/depth use with later blunders.

## 2026-09-26 - Rejected-Run Centipawn Suspect SF18 Compare

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\current-centipawn-suspects-sf18-compare-20260926\20260926-013058
- Result: 8 positions compared at depth 8; Coach/SF best-move agreement 3/8; average non-mate eval difference 512cp.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Probed rejected-run centipawn suspects including rootverify-game11-Kc5, rootverify-game8-Qb5, rootverify-game7-Rf7, losingpref-game11-Rb1, losingpref-game18-Rd2, rootverified-game1-Kf8, rootverified-game5-Rxb2, and rootverified-game16-Kf6.
- Decision: No candidate accepted. The only large same-position best-move miss without mate class was Kc5, which is the root-verification family already known-bad for broad changes. Rf7 was a 50-move rook shuffle tie through depth 12, not a stable move-quality target.
- Known-bad idea: Do not build a patch from a best-move disagreement when Coach's own root table shows near-total ties across many identity-equivalent moves.
- Next targets: Need fresh evidence or targeted instrumentation; current accepted/rejected 20260925-20260926 evidence is exhausted for a safe narrow non-root patch.

## 2026-09-26 - Fresh ShallowBlue 1618 5+0 Evidence With Time/Depth Summary

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 6 - 13 - 1 [0.325] 20; Coach as White 2 - 8 - 0 [0.200], Coach as Black 4 - 5 - 1 [0.450]
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: mined 20 games with 14 swings; generated time/depth summary over 1568 Coach moves. Average Coach depth was 6.93 and average move time was 3.66s.
- Decision: Do not treat this as an accepted result; use it as fresh failure evidence. The score regressed versus the accepted smoke baseline, but the time/depth report exposed late low-depth play under severe eval pressure.
- Next targets: Prioritize narrow time/depth or endgame-horizon probes around game10-ply214-Kf5, game10-ply208-Ke6, game6-ply240-Kd5, and game19 late low-depth moves. Repeated game1/game3 Kc1 and game13 e4 looked like all-lost/root-tie mate-class positions, not clean eval candidates.

## 2026-09-26 - Narrow Bare-King Minor-Pawn Root Mate-Score PV Verifier

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-root-mate-pv-verifier-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 4 - 11 - 5 [0.325] 20
- Candidate FEN: `3B4/PK6/7P/8/6k1/8/8/8 b - - 0 107`
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: direct depth-10 inspection changed from false mate-class `g4f5` / `999.88` with a non-mating PV to non-mate `g4h3` / `22.12` white-relative; default engine regression passed 65 pass, 0 fail, 68 skipped; `tests\search.test.mjs` passed; stability-short baseline-vs-candidate was search-stable with no tree/PV/root-order changes and 0.578% slower.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke match regressed badly despite fixing a real local false mate-class root result.
- Known-bad idea: Do not add root mate-score PV re-verification as a practical playing-strength patch, even behind a bare-king minor-pawn ending gate, unless future evidence narrows it further and proves it does not hurt 5+0 strength.
- Next targets: Mine the rejected run's `entered-losing-mate` and `mate-score-change` FENs, but continue from the accepted b842913 baseline and avoid another broad root verification policy.

## 2026-09-26 - Late Tactical Core Window Starts At Move 15

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-late-core-move15-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 7 - 10 - 3 [0.425] 20; Coach as White 2 - 6 - 2 [0.300], Coach as Black 5 - 4 - 1 [0.550]
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: `tests\uci.test.mjs` passed 46 pass, 0 fail; `tests\time_management_candidate.test.mjs` passed 14 pass, 0 fail; default engine regression passed 64 pass, 0 fail, 67 skipped.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke match regressed versus the accepted baseline despite passing local time-management tests.
- Known-bad idea: Do not simply move the heavy late-opening tactical core boost from move 10 back to move 15; it reduces early spend but costs too much practical strength, especially with Coach as White.
- Next targets: Mine this run for time/depth and swing evidence, but keep the accepted b842913 timing baseline. If time management is revisited, use a more conditional trigger than fullmove-window rollback.

## 2026-09-26 - Late-Core Rejected-Run Probe Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\candidate-late-core-move15-shallowblue1618-20g-5m0-20260926
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Probed repeated `Qb5+`, `h3`, `h2+`, `Kc5`, `Kh7`, `Kd2`, `Kf7`, `f8=Q`, and `Qe5` swing FENs through depths 4-9 or 4-10.
- Decision: Latest rejected-run FENs did not isolate a safe non-root patch. Repeated `Qb5+` was a many-equal queen-move table, `Kh7` was forced-only, king/pawn endings were all-losing or all-winning mate-class by deeper depth, and promotion/queen positions repeated many equivalent mate-class root moves.
- Known-bad idea: Do not patch these latest-run FENs by broad root-verification, root-tie, or fullmove-window timing policy; they repeat already rejected families.
- Next targets: Pivot back to accepted-baseline and SF18-compare evidence for a non-root centipawn case, or gather a fresh match with better reference comparison rather than forcing a patch from this run.

## 2026-09-26 - Full-Strength Stockfish 5+0 Diagnostic Harvest

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\diagnostic-fullsf18-8g-5m0-20260926
- Result: Coach vs match-labeled "Stockfish 18 full": 0 - 8 - 0 [0.000] 8; Coach as White 0 - 4 - 0, Coach as Black 0 - 4 - 0.
- Baseline: not an acceptance baseline; ShallowBlue 1618 5+0 accepted gate remains 10 - 9 - 1 [0.525] 20.
- Setup: 8 games, 4 concurrent, `tc=5:00`, local extracted `analysis-tools\stockfish\stockfish-windows-x86-64-avx2.exe`, no `UCI_LimitStrength`, seed 26092618. The match label said Stockfish 18, but `tools\coach-analysis-lab.mjs` identified the executable as Stockfish 16.1, so do not cite this as verified SF18 evidence until the real SF18 path is confirmed.
- Tests: Swing miner found 0 candidate FEN lines from Coach-side eval drops. Time/depth summary covered 388 Coach moves: average depth 7.93, minimum depth 1, average move time 5.31s, 90th percentile 12s, with repeated late depth-1 moves under severe eval pressure.
- Decision: Use this only to harvest first-divergence and centipawn-drop positions where Coach may have a narrow non-root resource miss. Do not judge Coach strength from the expected lopsided score.
- Next targets: Probe the analysis-lab centipawn divergence positions `game1-before-28.d6`, `game1-before-27.cxd5`, `game1-before-23.axb4`, and `game1-before-29.Rb1`; ignore mate-class late positions unless they isolate a false-mate or clock-safety sentinel.

## 2026-09-26 - Stockfish Diagnostic Centipawn FEN Probe Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\diagnostic-fullsf18-analysis-20260926\20260926-115032 plus local root-depth probes.
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Probed `game1-before-28.d6`, `game1-before-27.cxd5`, `game1-before-23.axb4`, and `game1-before-29.Rb1` through depths 4-12 with 12 root moves. All four showed broad same-score root tables rather than an isolated missing resource; `game1-before-29.Rb1` floated `f2f4` to the top at depths 9-12, but it remained tied with many alternatives.
- Decision: Do not patch these positions. The Stockfish-preferred moves are not isolated by Coach's own root evidence, and broad root-tie policy is already a known-bad family.
- Next targets: Use verified Stockfish 19 for future reference analysis, and pivot back to ShallowBlue 1618 5+0 late low-depth / time-depth evidence where a narrower clock or search condition might be isolated.

## 2026-09-26 - SF19 False-Mate Trigger Recheck

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\sf19-single-probes-20260926
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Verified `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe` as Stockfish 19. On `game10-Kf5-before` / `3B4/PK6/7P/8/6k1/8/8/8 b - - 0 107`, Coach depth 10 chose `g4f5` with mate -6 while SF19 depth 10 preferred `g4h5` at about -796cp. Coach PV replay was legal but ended at `3B3Q/1K6/8/8/5k2/8/4Q3/8 w - - 5 113`, not in check, with 55 legal moves. Disabling reverse-futility produced the same false mate and same PV.
- Decision: Do not revive the prior root mate-score PV verifier candidate; it fixed this exact local false mate but failed the ShallowBlue 1618 5+0 smoke at 4 - 11 - 5 [0.325] 20. Reverse-futility is not the root cause.
- Known-bad idea: Do not solve this by broad root mate-score PV re-verification or broad root tie policy. Only revisit if a narrower internal cause is isolated below root verification, such as a specific TT/PVS/qsearch mate-score leak with passing match evidence.
- Next targets: Continue mining ShallowBlue 1618 evidence outside this already-rejected false-mate verifier family, especially late low-depth clock behavior and any non-mate-class centipawn targets not dominated by root ties.

## 2026-09-26 - ShallowBlue Swing Targets SF19 Depth-8 Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260926\sf19-compare-depth8\20260926-121704
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: Compared all 28 `coach-swing-targets.fens` against verified Stockfish 19 at depth 8. Most high-difference targets were mate-class disagreements or same-move mate-vs-centipawn disagreements. Follow-up probes through depth 12 on `game1/game3-ply91-Kc1-before`, `game10-ply208-Ke6-before`, `game6-ply242-Ke6-before`, and `game6-ply240-Kd5-before` showed broad same-score king-move tables rather than an isolated missing resource.
- Decision: Do not patch these tied king-move endings yet. `Kc1-before` turns mate-class at deeper depths, and the bishop-pawn king endings mostly rank many king moves identically before the played move drifts worse; this repeats the root-tie/false-mate family without a safe local lever.
- Next targets: Need either a new ShallowBlue run with better clock/depth targeting evidence, or deeper instrumentation of the false-mate path below root policy before attempting another code candidate.

## 2026-09-26 - Early-Core 12s Time Cap Candidate

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\candidate-early-core-cap12-shallowblue1618-20g-5m0-20260926`
- Result: Coach vs ShallowBlue 1618: 6 - 11 - 3 [0.375] 20; Coach as White 2 - 5 - 3 [0.350], Coach as Black 4 - 6 - 0 [0.400].
- Baseline: accepted bare-king rook-pawn root-extension baseline was 10 - 9 - 1 [0.525] 20.
- Tests: PGN time/depth summary now replays moves and exports phase/legal/capture/material/allocation context; focused summary test passed. Fresh ShallowBlue 20-game report showed moves 11-15 consumed 1,243.9s across 100 Coach moves, with 93 moves >=10s. Policy simulator estimated a 12s cap on fullmoves 10-15 would save about 112s across the sample while leaving the move-19 tactical reinvestment target unchanged. Before smoke: `tests\time_management_candidate.test.mjs` passed 15/15; `tests\uci.test.mjs` passed 47/47; `tests\coach_time_depth_summary.test.mjs` passed 1/1; `tests\engine_regressions.test.mjs` passed 64, skipped 67, failed 0. Stability-short vs `b842913` was search-stable: no tree, PV, or root-order changes; candidate 0.643% slower overall. After rejection/revert, `tests\time_management_candidate.test.mjs` passed 14/14 and `tests\uci.test.mjs` passed 45/45; tracked code diff was clean ignoring line endings.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke regressed badly versus 10 - 9 - 1 [0.525] 20. The failed-run miner found 17 swings: 3 entered-losing-mate, 5 centipawn drops, and 9 mate-score changes; one Coach win came from a ShallowBlue illegal/no-move result.
- Known-bad idea: Do not cap the early tactical-core window at 12s just because moves 10-15 consume a lot of clock. That saved clock and kept local tests stable, but practical match strength fell to [0.375].
- Follow-up probes: Root-depth probes on `game20-ply114-Rxg7-before`, `game11-ply117-Rxc2-before`, and `game6-ply114-Ke4-before` showed broad tied move tables or same-move/depth-drift patterns rather than a clean static-eval patch. SF19 depth-8 comparison over all 34 failed-run swing FENs had 16/34 best-move agreement; the highest-priority disagreements were mostly mate-score horizon artifacts in late rook/pawn, queen/king, and promotion endings. No safe follow-up candidate accepted from this run.
- Next targets: Keep the enhanced time/depth observability and policy simulator. Do not continue by shrinking the early-core cap further. Fresh work should pivot away from broad timing/core-window edits and toward a narrower false-mate internals investigation or a new evidence source with a non-mate centipawn miss that survives root-depth and SF19 comparison.

## 2026-09-26 - QSearch Quiet-Check Root Heavy-Material Gate

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-qsearch-root-heavy-gate-shallowblue1618-20g-5m0-20260926
- Result: Coach vs ShallowBlue 1618: 3 - 17 - 0 [0.150] 20; Coach as White 2 - 8 - 0 [0.200], Coach as Black 1 - 9 - 0 [0.100].
- Candidate FEN: `3B4/PK6/7P/8/6k1/8/8/8 b - - 0 107`
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Tests: TT cutoff diagnostics showed the SF19 false mate survived disabling exact mate TT cutoffs and disabling 5.7M mate-bound TT cutoffs, so TT reuse was not the root cause. Captures-only qsearch and no-quiet-check qsearch both removed the false mate. A broad quiet-check removal broke the accepted bare-king rook-pawn sentinel (`c5-c4` became `c5-c6`), so it was rejected locally. The retained candidate disables qsearch quiet checks only when the root position starts without rooks or queens; quiet promotions remain enabled.
- Verification so far: `tests\engine_regressions.test.mjs` passed 65/65 with 67 skipped, including the SF19 false-mate sentinel and the accepted bare-king rook-pawn sentinel. `tests\uci.test.mjs` passed 45/45. `tests\time_management_candidate.test.mjs` passed 14/14. `tests\coach_time_depth_summary.test.mjs` passed 1/1. Stability-short vs `b842913` was search-stable: no tree-shape changes, 0 PV changes, 0 root-order changes; timing was effectively neutral at +0.048% speed gain / 0.303% median slower.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke match collapsed badly despite clean local gates. Mining found 20 swings from 1391 scored Coach moves, including 3 entered-losing-mate, 12 centipawn-drop, and 3 mate-score-change selections. Time/depth summary was generated under the run folder.
- Known-bad idea: Do not disable qsearch quiet checks by broad root material class, even though it fixes the SF19 promotion-race false mate. It damages practical 5+0 strength far more than the local sentinel helps.
- Follow-up probes: Top non-mate drops `game4-ply162-Kf8`, `game15-ply171-Kg6`, and `game2-ply172-Kg5` did not isolate a safe patch. `Kf8` stayed a narrow two-king-move table with depth drift; `Kg6` and `Kg5` became broad mate-class king-move families by depth 9-10.
- Next targets: Candidate code was reverted. Continue from accepted `b842913` behavior and use the failed-run swing FENs only as diagnostics; prefer a narrower false-mate internal cause or a fresh non-mate centipawn target rather than qsearch quiet-check gating.

## 2026-09-27 - Fresh Evidence SF19 Depth-10/12 Non-Mate Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260926\sf19-compare-depth10\20260926-233858 and analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260926\nonmate-depth12-compare\20260927-095059
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Tests: SF19 depth-10 compared 28 fresh ShallowBlue swing FENs; 20 analyzed, 8 timed out, best-move agreement 10/20, average non-mate eval difference 738cp. Most top disagreements were mate-horizon artifacts in pawn races or queen/king endings. Three non-mate bishop/pawn king-ending FENs were promoted to SF19 depth-12; one best-move disagreement vanished (`game10-ply208-Ke6-before`), one stayed a broad tied king-move family (`game6-ply240-Kd5-before`), and one became mate-class (`game6-ply242-Ke6-before`).
- Static lab: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260926\lab-nonmate-candidates.mjs` found only tiny static deltas across candidate king moves, with no promotion-danger, stopper-quality, pawn, or king-safety term isolating a culprit.
- Decision: Do not patch from this sweep. The evidence does not isolate a stable non-root missing resource, and the tempting fixes repeat already rejected root-tie, root-verification, or broad bare-king minor/pawn ending policies.
- Known-bad idea: Do not add a broad bare-king bishop/pawn root extension or static eval adjustment from these FENs; Coach's own root tables show many near-equivalent king moves and depth drift rather than a narrow feature error.
- Next targets: Pivot to either a fresh evidence run with different positions or a narrower false-mate internal diagnostic below root policy. Keep SF19 at `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe` as the reference engine.

## 2026-09-27 - Early-Core High-Mobility Surcharge Starts At Move 16

- Status: rejected
- Commit: n/a
- Run: analysis-runs\candidate-early-core-highmobility16-shallowblue1618-20g-5m0-20260927
- Result: Coach vs ShallowBlue 1618: 2 - 16 - 2 [0.150] 20; Coach as White 0 - 8 - 2 [0.100], Coach as Black 2 - 8 - 0 [0.200].
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Candidate: removed only the extra +0.10 late-tactical high-mobility time surcharge from fullmoves 10-15 while keeping the +0.15 core base bonus and preserving move-16+ tactical reinvestment. This was narrower than the rejected early-core 12s cap and was predicted by the policy analyzer to save about 72s over the fresh ShallowBlue sample.
- Tests: Before smoke, `tests\uci.test.mjs` passed 46/46, `tests\time_management_candidate.test.mjs` passed 14/14, and `tests\engine_regressions.test.mjs` passed 64/64 with 67 skipped. Search behavior did not change, so no search-stability benchmark was required. After rejection/revert, `tests\uci.test.mjs` passed 45/45 and `tests\time_management_candidate.test.mjs` passed 14/14.
- Mining: Failed-run mining found 11 swings from 1426 scored Coach moves: 5 entered-losing-mate, 5 centipawn-drop, and 1 mate-score-change. Time/depth summary still showed heavy early-core spending: 100 early-core moves, 1226.6s total, 12.27s average, 93 moves >=10s, and many late low-depth moves under low clock.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke collapsed badly. The narrower high-mobility timing trim neither fixed clock pressure nor preserved practical strength.
- Known-bad idea: Do not delay the high-mobility surcharge to move 16 as a standalone time-management candidate. Also do not keep shrinking early-core spend by broad phase windows without a sharper trigger; both this candidate and the 12s cap failed hard.
- Follow-up probes: SF19 depth-8 comparison over the failed-run swing FENs found mostly mate-vs-centipawn horizon artifacts or same-move eval-magnitude disagreements. The two checked non-mate move-choice targets did not isolate a safe candidate: `game16-ply114-Rf7-before` was a broad rook-move family where moves tied or flipped into mate-class by depth 8-10, and `game1-ply125-Kb2-before` had only three king moves tied through depth 8 before the whole family collapsed into mate-class.
- Next targets: Keep the time/depth observability tools, but pivot away from broad early-core timing reductions and from this failed-run FEN family. If time management is revisited, require a local trigger tied to eval drop, clock state, and position class rather than fullmove-window trimming.

## 2026-09-27 - Root Tie Verification Lowered-Score Abort

- Status: rejected
- Commit: n/a
- Run: analysis-runs\false-mate-internals-20260927 and analysis-runs\candidate-root-tie-lowered-abort-shallowblue1618-20g-5m0-20260927
- Result: ShallowBlue 1618 5+0 smoke was stopped early at Coach vs ShallowBlue 1618: 1 - 7 - 0 [0.125] 8 because the candidate had already failed the practical gate.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Candidate: abort `verifyRootTie` when the best verified tied root move falls below the original tied root score by more than the root-tie tolerance. This fixed the SF19 false-mate trigger locally by changing `3B4/PK6/7P/8/6k1/8/8/8 b - - 0 107` depth 10 from mate-class `999.88` to non-mate `22.12` while keeping root/PV table consistency.
- Tests: Before smoke, `tests\engine_regressions.test.mjs` passed 65/65 with 67 skipped; `tests\uci.test.mjs` passed 45/45; `tests\time_management_candidate.test.mjs` passed 14/14; `tests\coach_time_depth_summary.test.mjs` passed 1/1. Stability-short vs `b842913` was SearchStable with no tree, PV, or root-order changes and about 0.824% faster timing.
- Mining: Partial failed-run mining covered 8 games, 606 scored Coach moves, and found 2 selected swings: one entered-losing-mate (`game4-ply138-Rxe7`) and one centipawn drop (`game5-ply99-Rxg7`).
- Follow-up probes: `game4-ply138-Rxe7-before` had only three legal root moves and collapsed into mate-class by depth 6; `game5-ply99-Rxg7-before` showed broad rook-move ties with mate-class cliffs by depth 7-10. Neither isolated a safe static-eval or non-root search lever.
- Decision: Rejected and reverted because the practical smoke collapsed despite clean local gates. This confirms even the narrower lowered-score root-tie abort belongs with the known-bad root-verification family unless future evidence narrows it further.
- Known-bad idea: Do not patch `verifyRootTie` merely to suppress a local mate-class diagnostic if it still changes root verification behavior broadly in low-material endings; local false-mate cleanup is not enough without ShallowBlue 5+0 survival.
- Next targets: Mine/probe only the failed-run FENs as diagnostics if needed, but continue from accepted `b842913` behavior. Prefer a non-root centipawn miss or a deeper internal cause that does not alter practical root-tie policy.

## 2026-09-27 - Fresh Baseline ShallowBlue 1618 5+0 Evidence

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927
- Result: Coach vs ShallowBlue 1618: 8 - 12 - 0 [0.400] 20; Coach as White 3 - 7 - 0 [0.300], Coach as Black 5 - 5 - 0 [0.500].
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20, so this run is fresh diagnostic evidence, not an accepted strength result.
- Mining: 20 games, 1347 scored Coach moves, 21 swings: 8 centipawn drops, 4 entered-losing-mate, and 9 mate-score changes. Time/depth summary averaged depth 7.33, average move time 4.21s, and lowest estimated Coach clock 2.89s.
- Time/depth: Early-core moves 11-15 still consumed 1259s over 100 moves, but prior early-core timing reductions failed badly. Late endgame had 219 moves averaging 0.40s and depth 6.49, with many low-clock shallow moves in games 18-20.
- Follow-up probes: Top centipawn drops `game10-ply164-Kxh6`, `game10-ply174-Ke5`, and `game8-ply68-Kd7` were broad equal king/root families with depth drift or mate cliffs. `game14-ply126-Rxc3` stayed a small non-mate spread through depth 8, then collapsed into mate-class by depth 9-10. Game 11 mate-score-change positions were broad equal mate tables or forced-only.
- Decision: No candidate accepted from direct Coach probes. Run SF19 comparison over the mined FEN list before giving up on this evidence set.
- SF19 sweep: `analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\sf19-compare-depth8\20260927-124103` analyzed all 42 mined FENs with verified Stockfish 19. Best-move agreement was 25/42; average non-mate eval difference was 676cp over 17 comparable positions. Most high-priority disagreements were mate-vs-centipawn artifacts or broad mate tables.
- Follow-up SF19 targets: `game1-ply103-h4-before` briefly preferred `h2h3` at Coach depths 4-5 and SF19 depth 8, but Coach deeper search made `h3` mate-class losing and `h4` also collapsed by depth 10. `game12-ply88-Qxc2-before`, `game7-ply115-Rxg1-after`, `game18-ply204-Kf5-after`, and `game14-ply126-Rxc3-after` became broad equal mate tables by depth 7-10. `game10-ply164-Kxh6-after` was a crowded king-move tie with tiny depth drift. No stable non-root missing resource was isolated.
- Next targets: Do not patch from this fresh baseline evidence set. Next productive paths are either a different evidence source, deeper false-mate internals that avoid root-tie policy, or a targeted clock-safety idea for late low-clock positions that is not another broad early-core/depth8 policy.

## 2026-09-27 - Bare-Root-Side Child-Depth Root Tie Verification

- Status: rejected
- Commit: n/a
- Run: analysis-runs\false-mate-internals-20260927 and analysis-runs\candidate-bare-root-tie-child-depth-shallowblue1618-20g-5m0-20260927
- Result: ShallowBlue 1618 5+0 smoke was stopped after Coach vs ShallowBlue 1618: 3 - 11 - 2 [0.250] 16 because the candidate had already failed the practical gate.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Candidate: when root tie verification starts with the root side having only a bare king, verify tied root moves at child-equivalent depth (`depth - 1`) instead of one ply deeper. The diagnostic `root-tie-depth-scan.md` showed the SF19 false-mate trigger stays non-mate at verify depth 9 but becomes broad mate-class at verify depth 10+.
- Tests: The broad version failed `tests\root_tie_verification.test.mjs` by breaking the queen-rich low-piece ending (`b4c5` became `c2c1q`). The narrowed bare-root-side version passed `tests\root_tie_verification.test.mjs` 8/8, `tests\uci.test.mjs` 45/45, `tests\time_management_candidate.test.mjs` 14/14, and `tests\engine_regressions.test.mjs` 64 pass / 67 skipped. Stability-short vs `b842913` was SearchStable with no tree/PV/root-order changes, but about 1.012% slower.
- Mining: Partial failed-run mining covered 16 games, 1169 scored Coach moves, and found 8 selected swings: 3 entered-losing-mate, 3 centipawn-drop, and 2 mate-score-change positions.
- Decision: Rejected and reverted because the 16-game smoke collapsed to [0.250] despite the narrow local false-mate fix and clean local gates.
- Known-bad idea: Do not alter root-tie verification depth, even only for bare-root-side positions, merely to fix the SF19 false-mate trigger. It repeats the pattern where local root-verification fixes hurt practical ShallowBlue 5+0 strength.
- Next targets: Leave root-tie policy alone unless a deeper internal cause can be fixed without changing practical tie behavior. Pivot to a different evidence source or a non-root centipawn miss with stable root-depth/SF19 agreement.

## 2026-09-27 - SF19 2400 Fixed-2s Evidence Run

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\evidence-sf19-2400-20g-st2-20260927
- Result: Coach vs Stockfish 19 limited to 2400 Elo: 5 - 13 - 2 [0.300] 20; Coach as White 2 - 7 - 1 [0.250], Coach as Black 3 - 6 - 1 [0.350].
- Setup: 20 games, 4 concurrent, `st=2`, seed 26092719, verified SF19 path `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe`, options `Threads=1`, `Hash=96`, `UCI_LimitStrength=true`, `UCI_Elo=2400`.
- Mining: 20 games, 1499 scored Coach moves, 38 swings: 10 centipawn drops, 4 entered-losing-mate, and 9 mate-score changes. The miner exported 46 candidate FEN lines.
- Follow-up probes: Top non-mate drops `game14-ply156-b2`, `game18-ply148-d3`, and `game20-ply112-Bxb5` did not isolate a patch. `b2` and `d3` turned into broad pawn-race mate tables by depth 10; `Bxb5` was a many-equivalent-moves table through depth 10. Additional queen/endgame drops `game5-ply119-Kf1`, `game5-ply113-Ke2`, and `game10-ply114-Ra8` were also broad tied move families through depth 10.
- Decision: No candidate accepted from this SF19 evidence run. The score is useful for tracking, and SF19 is now the preferred reference, but the mined high-signal FENs again point to root-tie/mate-horizon families rather than a stable non-root missing resource.
- Next targets: Do not patch from this run's probed FENs. To make progress, use either a different evidence source with earlier middlegame centipawn misses, or build diagnostics that classify tied root families automatically so we stop spending probe time on positions that are already all-equivalent.

## 2026-09-27 - FEN Triage Classifier Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\evidence-sf19-2400-20g-st2-20260927\fen-triage-d468 and analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\fen-triage-d468
- Tool: tools\triage-coach-fens.mjs classifies mined FENs as candidate-review, mate-horizon-flip, all-tied, or mate-table using Coach root tables at depths 4, 6, and 8.
- Result: No candidate accepted. The SF19 2400 and fresh ShallowBlue 1618 FEN lists were dominated by tied root families, mate tables, or mate-horizon flips.
- Follow-up probes: The only fresh ShallowBlue survivor not already exhausted was `game6-ply124-b6-before/after`. SF19 depth-14 agreed with Coach's best move in both positions: before `b7b6` and after `c5b6`. Coach reported mate-class scores while SF19 stayed centipawn-class, so this is false-mate/eval-shape diagnostic evidence rather than a missing-move candidate.
- Decision: Keep the triage tool for future mining passes. Do not patch from the `b6` pawn-race survivor because the reference engine agrees on the move, and previous root-verification/mate-class cleanup candidates have repeatedly failed ShallowBlue 5+0 smoke tests.
- Next targets: Seek a fresh evidence source or mine earlier middlegame positions where Coach and SF19 disagree on a stable non-mate best move. If continuing from current evidence, focus on automation that filters out tied root/mate-table endings before manual probing.

## 2026-09-27 - Balanced SF19 Middlegame Scan

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\sf19-early-all-depth8\20260927-172519 and analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\sf19-balanced-midgame-depth8\20260927-174718
- Tooling: `tools\coach-analysis-lab.mjs` now supports `--max-per-game`, `--min-move`, `--max-move`, and `--sample-every` for balanced PGN scans. This prevents one long game from consuming the whole `--max-positions` budget.
- Result: No candidate accepted. The first 80-position scan was biased toward games 1-2 and found mostly opening drift, false-mate late endings, and game-2 tactical tied-root families. The balanced scan sampled moves 12-45 across all 20 games and found repeated non-mate SF19 disagreements around `game13/15/17/19-before-18.Qc3` and `game13/15/17/19-before-21.cxb6`.
- Follow-up probes: `Qc3` FEN `r2r2k1/ppq2ppp/4b3/2P1n3/3Q4/4P3/PP2BPPP/R3R1K1 w - - 1 18` stayed a broad equal root table through depth 11; SF19's depth-8 `Qf4` target sits inside Coach's tied family at deeper depths. `cxb6` FEN `r5k1/2q2ppp/1p2b3/p1Prn3/8/P1Q1P3/1P2BPPP/2R1R1K1 w - - 0 21` also stayed a broad equal root table through depth 11.
- Automated triage: `analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\sf19-balanced-midgame-depth8\20260927-174718\fen-triage-d468` classified all 80 balanced candidate FENs as `all-tied` at depth 8 with a zero-width band across the top 12 root rows.
- Decision: Do not patch root ordering or tie policy from these middlegame scans. They are better evidence than the endgame mate-table positions, but still do not isolate a stable missing resource inside Coach.
- Next targets: Use the balanced-scan flags for future match evidence, preferably with a stronger filter for positions where the SF19 move is not merely tied in Coach's deeper root table. A good next automation step is a root-table triage pass over analysis-lab candidate FENs before manual probing.

## 2026-09-27 - SF19 2400 Balanced Middlegame Scan

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\evidence-sf19-2400-20g-st2-20260927\sf19-balanced-midgame-depth8\20260927-181253 and analysis-runs\evidence-sf19-2400-20g-st2-20260927\sf19-game12-kd6-survivor-depth12\20260927-214519
- Result: No candidate accepted. The balanced depth-8 scan sampled moves 12-45 across the SF19 2400 fixed-2s match and produced larger Coach-vs-SF19 eval gaps than the ShallowBlue scan, but automated root-table triage found only one non-tied survivor.
- Automated triage: `fen-triage-d468` classified 77/80 candidates as `all-tied`, 2/80 as `mate-table`, and only `game12-before-21...Kd6` as `candidate-review` with a depth-8 spread.
- Follow-up probe: `game12-before-21...Kd6` FEN `R4b1r/1p1k1ppp/1qp2p2/5Q2/8/1P2P2P/3r1PP1/2R3K1 b - - 3 21` had only three legal king moves. Coach depth 8 briefly preferred `Ke7/Kc7` over `Kd6`, but depths 10-13 collapsed to a flat table (`Kd6/Ke7/Kc7` all -40cp side-relative). SF19 depth 12 agreed with Coach's final best move `Kd6` at -134cp, so the candidate did not survive.
- Ranked triage: `tools\rank-triage-candidates.mjs` merged analysis-lab output with root triage. ShallowBlue balanced scan produced 28 candidates above 150cp and 0 useful after triage; SF19 2400 balanced scan produced 53 candidates above 150cp and only 1 useful after triage, the already-rejected `game12-before-21...Kd6` survivor.
- Decision: Do not patch this SF19 evidence set. The only survivor became a harmless king-move tie at deeper depth and reference agreement.
- Next targets: Current mined ShallowBlue and SF19 2400 evidence is nearly exhausted for narrow engine candidates. Productive next work should either generate a fresh match with different openings/opponent/time control, or improve automation to search directly for positions where Coach root tables have a stable non-zero spread and SF19 disagrees across multiple depths.

## 2026-09-27 - Prepared Fresh ShallowBlue Evidence Run B

- Status: pending-local-match
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, ShallowBlue 1618 at `<USERPROFILE>\Downloads\shallowblue_x86-64.exe`, Coach with `Hash=32` and `Move Overhead=150`, seed 26092501.
- Artifacts: `run-match.ps1`, `run-match.cmd`, and `README.md` are prepared in the run folder. No `match.pgn` or `cutechess.stdout.txt` exists yet.
- Tool smoke: `analysis-runs\tool-smoke-rank-triage-20260927` verifies `tools\rank-triage-candidates.mjs` keeps a synthetic `candidate-review` spread survivor and rejects a synthetic `all-tied` case.
- Decision: Sir Slice needs to run this local match before the next mine/probe/candidate loop can produce fresh evidence.
- Next targets: After completion, mine with `$coach-match-miner`, generate time/depth summary, run balanced SF19 scan plus triage/ranked-triage, then probe only useful non-tie survivors.

## 2026-09-28 - Fresh ShallowBlue Evidence Run B Completed

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b
- Result: Coach vs ShallowBlue 1618: 7 - 13 - 0 [0.350] 20.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Mining: 20 games, 1628 scored Coach moves, 12 swings: 4 centipawn drops, 5 entered-losing-mate, and 3 mate-score changes. The miner exported 24 candidate FEN lines.
- Time/depth: Average depth 6.96, minimum depth 1, average move time 3.52s, and lowest estimated Coach clock 2.07s. Early-core moves 11-15 again consumed heavy time: 100 moves, 1265.8s total, 12.66s average, and 96 moves at 10s or more. Late-endgame moves 61+ averaged 0.35s and depth 5.85, with all 468 moves at low clock.
- Automated triage: Direct swing triage produced 5 `candidate-review`, 1 `early-spread-then-tie`, 8 `mate-horizon-flip`, 1 `all-tied`, and 9 `mate-table` rows. The balanced SF19 midgame scan plus root triage produced 0 useful survivors; all ranked candidates above 150cp were skipped as all-tied.
- Follow-up probes: The `game6-ply180-Kc6` before/after and `game7-ply187-Ke1` before/after survivors were low-material king/bishop/pawn drift with no stable single missing resource. The `game16-ply116-a3` and adjacent `game16-ply112-Rb4` rows collapsed into mate-class root tables by depth 9-12, with broad tied root moves and sign/reporting artifacts.
- Decision: No candidate accepted from this run. Do not patch from these FENs; they repeat the known-bad root-tie, root-verification, and mate-horizon families.
- Next targets: Use a different evidence source or add automation that searches directly for stable non-tied Coach root spreads where SF19 disagrees across multiple depths. Keep time/depth telemetry, but avoid broad early-core trimming or depth-8 danger policies unless a much sharper trigger survives local probes.

## 2026-09-28 - Run B Wide SF19 Middlegame Sweep

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b\sf19-wide-16-60-depth8\20260928-071303
- Result: No candidate accepted.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Sweep: Sampled 160 Coach positions from moves 16-60, up to 8 positions per game, every 2 Coach moves, compared with verified SF19 at depth 8.
- Automated triage: Root triage over the 160 candidate-regression FENs produced 153 `all-tied` and 7 `early-spread-then-tie`. The merged ranker found 22 positions above 150cp eval difference and 0 useful after triage; all 22 ranked candidates were `all-tied`.
- Decision: Do not patch from the repeated middlegame disagreements such as `game2/game4-before-30...Nc8`, `28...Kf7`, `26...fxe5`, `24...g6`, `game1/game3-before-16.Qd4`, or the `28...Bxf3` cluster. SF19 prefers different moves, but Coach's own depth-8 root tables flatten them into broad equal move plateaus.
- Next targets: Current Run B evidence has no stable non-root missing-resource candidate. The next productive local step is better automation that searches directly for stable non-tied root spreads across depths before spending SF19 time, or a fresh match with different openings/opponent characteristics.

## 2026-09-28 - Stable Candidate Selector Tool

- Status: diagnostic-tooling
- Commit: n/a
- Tool: tools\select-stable-candidates.mjs
- Purpose: tighten the candidate loop after `coach-analysis-lab` and `triage-coach-fens` by keeping only positions with a deepest-depth root `spread`, a minimum score band, limited top ties, no mate-table contamination, and optionally a reference-engine best-move disagreement.
- Smoke: Run B wide SF19 sweep selected 0 stable candidates from 160 triaged positions at `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b\sf19-wide-16-60-depth8\20260928-071303\stable-selector`.
- Fixture: `analysis-runs\tool-smoke-stable-selector-20260928` kept 1 synthetic stable spread and rejected 1 synthetic broad tie.
- Tests: `node --check tools\select-stable-candidates.mjs` passed.
- Decision: Use this selector as the final automation gate before manual probing. Treat `early-spread-then-tie` as diagnostic unless a deeper follow-up scan turns it into a deepest-depth spread.
- Next targets: For future matches, run `coach-analysis-lab`, `triage-coach-fens`, `rank-triage-candidates`, then `select-stable-candidates` before choosing FENs to probe. If stable selector returns 0, do not patch from that evidence set.

## 2026-09-28 - Prepared Fresh ShallowBlue Evidence Run A

- Status: pending-local-match
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260928a
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, ShallowBlue 1618 at `<USERPROFILE>\Downloads\shallowblue_x86-64.exe`, Coach with `Hash=32` and `Move Overhead=150`, seed `26092801`.
- Opening book: none. `<USERPROFILE>\Downloads\rodent.bin` exists, but direct CuteChess Polyglot `-openings` syntax was not verified from the shell, so this launcher intentionally avoids book use.
- Artifacts: `run-match.ps1`, `run-match.cmd`, and `README.md` are prepared in the run folder.
- Decision: Sir Slice needs to run the local match before the next mine/probe/candidate loop can continue.
- Next targets: After completion, mine the match, generate time/depth summary, run SF19 analysis plus Coach root triage, then apply `tools\select-stable-candidates.mjs` before manual probing or code changes.

## 2026-09-28 - CuteChess Rodent Book Verification

- Status: diagnostic-tooling
- Commit: n/a
- Run: analysis-runs\cutechess-opening-check-20260928
- Result: CuteChess help confirms `-openings` supports `epd` and `pgn`, while Polyglot books are supported as engine options with `book=FILE` and `bookdepth=N`.
- Smoke: `analysis-runs\cutechess-opening-check-20260928\book-smoke` completed 2 games with exit code 0 using `book=<USERPROFILE>\Downloads\rodent.bin` and `bookdepth=8`; PGN moves 1-8 were tagged `{book}` in both paired games.
- Decision: Rodent can be used for future CuteChess direct matches via `-each ... book="<USERPROFILE>\Downloads\rodent.bin" bookdepth=8`. Do not use it via `-openings file=... format=...`, because this build does not list Polyglot as an `-openings` format.
- Next targets: Prefer a book-based fresh ShallowBlue run for broader opening evidence.

## 2026-09-28 - Prepared Fresh ShallowBlue Book Evidence Run B

- Status: pending-local-match
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, ShallowBlue 1618 at `<USERPROFILE>\Downloads\shallowblue_x86-64.exe`, Coach with `Hash=32` and `Move Overhead=150`, seed `26092802`.
- Opening book: `<USERPROFILE>\Downloads\rodent.bin` through CuteChess `book=... bookdepth=8`, verified by the 2-game book smoke.
- Artifacts: `run-match.ps1`, `run-match.cmd`, `run-match-and-analyze.ps1`, `run-match-and-analyze.cmd`, and `README.md` are prepared in the run folder.
- Decision: Prefer this book-based run over the no-book `20260928a` run for the next evidence cycle.
- Next targets: Sir Slice needs to run the local match. Prefer `run-match-and-analyze.ps1` so the full analysis pipeline starts automatically after the PGN is written. If stable candidates survive, use the generated `probe-commands.md` before manual probing or code changes.

## 2026-09-28 - Post-Match Analysis Pipeline Tool

- Status: diagnostic-tooling
- Commit: n/a
- Tool: tools\analyze-match-pipeline.mjs
- Purpose: run the standard post-match sequence from one command: match mining, time/depth summary, SF19 depth-8 sampled analysis, Coach root triage, ranked triage, and stable-candidate selection.
- Command: `node tools\analyze-match-pipeline.mjs --run "<analysis-runs match folder>"`
- Probe handoff: tools\print-stable-probe-commands.mjs turns `stable-candidates.json` into exact `probe-root-depths.mjs` commands for the top two stable candidates.
- Smoke: pending book run fails cleanly before work with `Missing match PGN`; completed Run B reuse path succeeded with `--analysis-run analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b\sf19-wide-16-60-depth8\20260928-071303 --reuse-existing`, reported 0 stable candidates, and wrote `stable-selector\probe-commands.md` saying no stable candidates were found.
- Tests: `node --check tools\analyze-match-pipeline.mjs`, `node --check tools\select-stable-candidates.mjs`, and `node --check tools\print-stable-probe-commands.mjs` passed.
- Decision: Use this pipeline after future matches finish. If it reports 0 stable candidates, do not patch from that evidence set. If it reports stable candidates, use the generated `probe-commands.md` and manually probe at most two before any engine change.

## 2026-09-28 - Fresh ShallowBlue Book Evidence Run B Completed

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b
- Result: Coach vs ShallowBlue 1618: 6 - 11 - 3 [0.375] 20; Coach as White 4 - 4 - 2 [0.500], Coach as Black 2 - 7 - 1 [0.250].
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, Rodent book `<USERPROFILE>\Downloads\rodent.bin` through CuteChess `book=... bookdepth=8`, seed `26092802`.
- Mining: 20 games, 1234 scored Coach moves, 12 swings: 3 centipawn drops, 5 entered-losing-mate, and 4 mate-score changes. The miner exported 24 swing target FEN lines.
- Time/depth: Average depth 7.09, minimum depth 1, average move time 4.40s, P90 12s, lowest estimated clock 2.11s. Book openings reduced Coach's own opening move count to 40 moves but those still averaged 13.78s; early-core moves 11-15 consumed 1285s over 100 moves.
- Pipeline: `tools\analyze-match-pipeline.mjs` completed with SF19 depth-8 analysis over 156 sampled positions, root triage, ranked triage, stable selector, and probe-command handoff. Summary: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b\analysis-pipeline-summary.md`.
- Triage: `fen-triage-d468` classified 154 positions as `all-tied`, 1 as `early-spread-then-tie`, and 1 as `mate-horizon-flip`. Ranked triage found 72 candidates above 150cp and 0 useful after triage.
- Stable selector: `tools\select-stable-candidates.mjs` selected 0 stable candidates from 156 triaged positions. `probe-commands.md` correctly reported no stable candidates found.
- Decision: No candidate accepted and no manual probe target from this evidence set. The book produced better opening variety, but the SF19 disagreements again collapsed into Coach root ties or mate-horizon diagnostics rather than a stable missing resource.
- Next targets: Do not patch from this run. Current productive paths are a different evidence source/opponent/time control, or a more internal diagnostic aimed at why Coach's root tables flatten many SF19 disagreements, not another broad root-tie policy change.

## 2026-09-28 - Run B Deep Root Follow-Up

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b
- Inputs: top ranked SF19 disagreements from `ranked-triage\ranked-candidates.json`; generated `deep-root-top24.fens`, `deep-root-top8.fens`, and `deep-root-top3.fens`.
- Triage attempt: depth-12 root-table sweeps over top 24, top 8, and top 3 were stopped because they were too slow for the value of this evidence set. A depth-10 top-8 sweep was also too slow through `tools\triage-coach-fens.mjs`.
- Probe 1: `game7-before-18.f4`, FEN `1n1qkb1r/2rb1p2/p2p1p2/3B4/3QP3/2N2P2/PP5P/R3K2R w KQk - 1 18`; direct probe depths 4-10 stayed flat. At depth 10, Coach had `f3f4 -7` tied with seven other root moves at `-7`.
- Probe 2: `game17-before-26.Nf3`, FEN `2r1r1k1/p2q2np/bp2p2B/3p4/2pP4/2P3Q1/PP1N1PPP/4RRK1 w - - 0 26`; direct probe depths 4-9 stayed flat. At depth 9, `d2f3 222` was tied with seven other root moves at `222`.
- Decision: The top SF19 disagreements are still broad Coach root plateaus at deeper practical probe depths, not clear local tactical misses. Do not patch from these positions without a narrower mechanism for distinguishing tied root moves.
- Next targets: Improve diagnostic tooling before more depth-12 sweeps, or change evidence source. A useful tool improvement would add per-position timeout/progress output to `tools\triage-coach-fens.mjs` so expensive FENs cannot stall a whole candidate audit.

## 2026-09-28 - Bounded Triage Tooling and Swing Audit

- Status: diagnostic-tooling
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b
- Tooling: `tools\triage-coach-fens.mjs` now supports `--max-ms-per-depth`, emits per-position/depth progress, and records `completedDepth`, elapsed time, and timed partials in `fen-triage.json` / `fen-triage.md`.
- Verification: `node --check tools\triage-coach-fens.mjs` passed. `node --test tests\coach_time_depth_summary.test.mjs` passed 1/1. A top-3 smoke with `--max-ms-per-depth 1000` completed and marked partial depths correctly.
- Bounded SF19 audit: top-8 ranked SF19 disagreements were triaged with depths 8,10,12, limit 6, and `--max-ms-per-depth 5000` at `bounded-triage-top8-d8-10-12-ms5000`; all 8 were `all-tied` with deepest `broad-tie`. `bounded-stable-selector-top8-ms5000` selected 0 stable candidates.
- Bounded swing audit: all 24 swing before/after FENs were triaged with depths 6,8,10, limit 8, and `--max-ms-per-depth 3000` at `bounded-swing-triage-d6-8-10-ms3000`. Counts: 1 `candidate-review`, 1 `early-spread-then-tie`, 4 `mate-horizon-flip`, 13 `all-tied`, 5 `mate-table`.
- Candidate-review follow-up: `game9-ply89-Qf3-after` (`8/R7/1r4pp/6rk/8/5Q2/P4PPP/5NK1 b - - 1 45`) was the only review item. Direct probe showed only two Black moves, both mate-class by depth 10 (`g5g4 -99990`, `h5h4 -99992`). The Coach-side before-position (`8/R4Q2/1r4pp/6rk/8/8/P4PPP/5NK1 w - - 0 45`) became a broad mate-class plateau by depth 7-9, with many White moves tied at mate-class.
- Decision: No engine candidate from this audit. The only swing review item is another mate-horizon/root-plateau diagnostic, not an isolated stable missing resource. Do not patch from Run B swing targets.
- Next targets: Use the bounded triage option in future audits. Productive next evidence likely needs a different source or a narrower internal diagnostic for root plateau causes; Run B is mined out under the current acceptance rules.

## 2026-09-28 - Run 20260927b Bounded Swing Follow-Up

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b
- Result: Coach vs ShallowBlue 1618: 7 - 13 - 0 [0.350] 20; Coach as White 2 - 8 - 0 [0.200], Coach as Black 5 - 5 - 0 [0.500].
- Bounded swing triage: `bounded-swing-triage-d6-8-10-ms3000` over 24 swing before/after FENs found 3 `candidate-review`, 2 `early-spread-then-tie`, 3 `mate-horizon-flip`, 1 `all-tied`, and 15 `mate-table`.
- Review targets: `game14-ply148-Kd8-before` crossed into a mate-class plateau by depth 7-10, so it was rejected as mate-horizon evidence. `game6-ply180-Kc6-before` and `game7-ply187-Ke1-before` were the only non-mate endgame review targets.
- Reference check: SF19 depth 10 preferred `c5c6` over Coach's `c5c4` on `game6-ply180-Kc6-before`, and `f1g2` over Coach's `f1e1` on `game7-ply187-Ke1-before`. Depth 12 kept the `Kc6` move disagreement but showed the actual game move `c5c6` is SF19's preferred move; `Ke1` changed to best-move agreement (`f1e1`) at depth 12.
- Decision: No candidate accepted. `Kc6-before` is an eval-magnitude artifact after the game move, not a Coach move-selection miss, because the played move matches SF19's preferred move. `Ke1-before` does not remain a move disagreement at depth 12. Do not patch from this run.
- Next targets: Continue bounded triage on another fresh ShallowBlue 5+0 evidence set before considering a new local hypothesis.

## 2026-09-28 - Fresh Baseline 20260927 Bounded Swing Follow-Up

- Status: diagnostic
- Commit: n/a
- Run: analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927
- Result: Coach vs ShallowBlue 1618: 8 - 12 - 0 [0.400] 20; Coach as White 3 - 7 - 0 [0.300], Coach as Black 5 - 5 - 0 [0.500].
- Bounded swing triage: `bounded-swing-triage-d6-8-10-ms3000` over 42 swing before/after FENs found 2 `candidate-review`, 7 `early-spread-then-tie`, 7 `mate-horizon-flip`, 14 `all-tied`, and 12 `mate-table`.
- Review targets: `game6-ply124-b6-before` was already known from prior SF19 review; SF19 agreed on the move family and the issue is eval/mate-shape rather than a missing move. `game6-ply118-Kh8-before` was the only new non-mate move-choice candidate.
- Probes: `game6-ply118-Kh8-before` (`8/1p5k/2p4P/P1P2p1K/P1P2P2/8/8/8 b - - 2 59`) flipped among `Kh8`, `Kg8`, `b6`, and `b5` at lower depths. Coach depth 14 chose `h7h8`; SF19 depth 14 also chose `h7h8`, with only 44cp difference.
- Decision: No candidate accepted. The only new review target converged to Coach/SF19 agreement at depth 14, so it is not a stable missing-resource FEN.
- Next targets: Recent fresh ShallowBlue 5+0 runs now repeatedly collapse into mate horizon, root plateau, eval-magnitude-only, or eventual SF agreement. Next productive work should either use a genuinely different evidence source or add a diagnostic specifically aimed at explaining root-score plateaus without changing root policy.

## 2026-09-28 - Root Plateau Diagnostic

- Status: diagnostic-tooling
- Commit: n/a
- Tool: tools\explain-root-plateau.mjs
- Run: analysis-runs\root-plateau-diagnostic-20260928
- Purpose: explain whether apparent root-score plateaus are static-eval blindness, child-search convergence, mate/horizon behavior, or fail-hard bound artifacts. The tool compares root rows against static eval after each move, quiescence, and independent child searches in root-side perspective.
- Verification: `node --check tools\explain-root-plateau.mjs` passed. Depth-8 sample output was written to `depth8-bound-counts\root-plateau-explain.md/json`.
- Finding: the repeated midgame “all tied” SF19 disagreements are often fail-hard/root-bound artifacts. Example `runb-game7-before-18-f4` had root band 0 and 8 top ties, but independent child searches had a 1067cp root-side band and 5 bound-like top ties. Example `runb-game17-before-26-nf3` had root band 0 but 439cp child-search band.
- Endgame contrast: simple endgame plateaus behaved differently. `baseline-game6-ply118-kh8-before` had a real nonzero root band and later converged to SF19 agreement at depth 14. `run20260927b-game6-ply180-kc6-before` had only a 67cp child-search band and was eval-magnitude/noise, not a missing move.
- Decision: Do not patch root policy from this finding. The important process change is that `rootMoves` ties should not be treated as exact move equality unless verified by independent child searches or another exact-score pass.
- Next targets: Update candidate selection/mining to resolve root-bound plateaus before declaring “all-tied” or stable. A future candidate should come from positions where independent child search, reference analysis, and Coach root evidence all agree on a stable missing resource after bound artifacts are filtered out.

## 2026-09-28 - Plateau Candidate Audit Tool

- Status: diagnostic-tooling
- Commit: n/a
- Tool: `tools\rank-plateau-audit.mjs`
- Runs: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b\plateau-candidate-audit` and `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b\plateau-candidate-audit`
- Purpose: rank `explain-root-plateau` output against SF19 analysis by checking whether the SF19 reference move appears in Coach's audited root rows and whether independent child search scores the SF19 move at least 100cp better than Coach's chosen move.
- Book-run audit: top-six depth-7/limit-6 plateau audit found 0 candidates. A widened top-three depth-7/limit-16 audit also found 0 candidates: `game7-before-24.Qe2` had child gap 0cp, while `game7-before-18.f4` and `game17-before-26.Nf3` did not have the SF19 move in Coach's top 16 rows.
- Run 20260927b audit: top-three wide depth-7/limit-16 audit found 0 candidates. Repeated `game2/game4-before-30...Nc8` had SF19 `e7e8` scoring 62cp worse than Coach's `b6c8` under independent Coach child search, and `game2-before-28...Kf7` had SF19 `b8a8` scoring 195cp worse than Coach's `g8f7`.
- Tests: `node --check tools\rank-plateau-audit.mjs`, `node --test tests\plateau_audit.test.mjs`, and `node --test tests\coach_time_depth_summary.test.mjs` passed.
- Decision: No engine candidate accepted. The plateau audits confirm many high-diff SF19 disagreements are root-bound artifacts or reference moves not supported by Coach child search, not stable missing-resource FENs.
- Next targets: Continue seeking non-root-policy candidates from either a different evidence source or positions where SF19 disagreement, Coach root rows, and independent Coach child search all point to the same reference move. Do not patch broad root-tie/root-verification behavior from these audits.

## 2026-09-28 - Reference Child-Search Verifier Sweep

- Status: diagnostic-tooling
- Commit: n/a
- Tool: `tools\verify-reference-child-search.mjs`
- Purpose: faster candidate search over SF19 disagreements by child-searching only Coach's chosen move and SF19's reference move, then keeping a position only when the reference move is legal, present in Coach's audited root rows, and at least 100cp better under Coach's own independent child search.
- Runs:
  - `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-book-20260928b\reference-child-search-d6-top30`: 30 audited, 0 candidates. Best positive gap was +19cp; all rows failed `gap<100`, and 6 also had the reference move outside the top 24 root rows.
  - `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20260927b\reference-child-search-d6-top30`: 18 audited, 0 candidates. Best positive gap was +17cp; all rows failed `gap<100`.
  - `analysis-runs\fresh-baseline-shallowblue1618-20g-5m0-20260927\reference-child-search-d6-top30`: 17 audited, 0 candidates. Best positive gap was +5cp; all rows failed `gap<100`.
- Tests: `node --check tools\verify-reference-child-search.mjs` and `node --test tests\reference_child_search_verifier.test.mjs` passed.
- Decision: No engine candidate accepted. Across the three latest ShallowBlue 1618 5+0 SF19 analysis sets, high-diff reference disagreements do not survive Coach child-search verification as stable missing-resource FENs.
- Next targets: Current ShallowBlue evidence is exhausted under the active acceptance rules. Productive continuation requires either new local match evidence with different openings/opponent characteristics or permission to broaden the evidence source; do not patch Coach from these SF19 disagreement rows.

## 2026-09-28 - Prepared Fresh ShallowBlue PGN-Suite Evidence Run C

- Status: pending-local-match
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c`
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, ShallowBlue 1618 at `<USERPROFILE>\Downloads\shallowblue_x86-64.exe`, Coach with `Hash=32` and `Move Overhead=150`, seed `26092803`.
- Opening policy: deterministic 10-opening PGN suite at `openings.pgn`, `-openings file=... format=pgn order=sequential plies=8 policy=round`, paired by `-repeat` so Coach and ShallowBlue each get both sides of every opening.
- Artifacts: `run-match.ps1`, `run-match.cmd`, `run-match-and-analyze.ps1`, `run-match-and-analyze.cmd`, `analyze-existing.ps1`, `analyze-existing.cmd`, `README.md`, and `openings.pgn` are prepared in the run folder.
- Verification: PowerShell parse checks passed for both `.ps1` launchers; CuteChess, ShallowBlue 1618, and `openings.pgn` paths exist; opening suite contains 10 PGN games. A 2-game fixed-0.1s smoke at `analysis-runs\cutechess-opening-check-20260928\pgn-suite-smoke` completed with exit code 0, injected the first opening as `{book}` through 8 plies, and confirmed `-repeat` swapped colors. `tools\analyze-match-pipeline.mjs` now passes `--max-ms-per-depth 5000` to root triage by default; `node --check tools\analyze-match-pipeline.mjs` and `node --test tests\analyze_match_pipeline_args.test.mjs` passed.
- Decision: Sir Slice needs to run this local match before the improvement loop can continue. This is the next ShallowBlue 1618 5+0 evidence source after book/no-book SF19 disagreement rows produced no valid child-search-supported candidates.
- Next targets: After completion, inspect `cutechess.stdout.txt`, mine `match.pgn`, and use the automatically generated standard pipeline plus `reference-child-search-d6-top30` output to decide whether any non-root-policy candidate survives. If only `match.pgn` exists or analysis is interrupted, run `analyze-existing.ps1` in the run folder to resume analysis without replaying the match.

## 2026-09-28 - Fresh ShallowBlue PGN-Suite Evidence Run C Completed

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c`
- Result: Coach vs ShallowBlue 1618: 6 - 13 - 1 [0.325] 20; Coach as White 3 - 6 - 1 [0.350], Coach as Black 3 - 7 - 0 [0.300].
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Setup: 20 games, 4 concurrent, `tc=5:00`, `-repeat`, deterministic 10-opening PGN suite through 8 plies, ShallowBlue 1618 at `<USERPROFILE>\Downloads\shallowblue_x86-64.exe`, seed `26092803`.
- Mining: 20 games, 1486 Coach-side scored moves, 18 swings: 8 centipawn drops, 5 entered-losing-mate entries, and 5 mate-score changes. Top repeated losing-mate swing was `game6/game8-ply114-Kd8` from `4k3/1p6/2pBK3/P1P5/2P2P2/8/2P5/8 b - - 4 57`.
- Time/depth: Average depth 7.13, minimum depth 1, average move time 3.86s, P90 11s, lowest estimated clock 0.51s. Early-core moves 11-15 averaged 13.35s with all 100 moves >=10s, while late-endgame 61+ averaged depth 5.18 and 0.42s with all 372 moves at estimated clock <=30s.
- Pipeline: `tools\analyze-match-pipeline.mjs` completed SF19 depth-8 sampled analysis over 160 positions, root triage, ranked triage, stable-candidate selection, and probe-command handoff. Summary: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c\analysis-pipeline-summary.md`.
- Triage: ranked triage found 97 positions above 150cp, but 95 were `all-tied` and 2 were `early-spread-then-tie`. Stable selector rejected all 160 triaged positions; stable candidates: 0.
- Reference child-search: `reference-child-search-d6-top30` audited 30 top SF19 disagreements and found 0 candidates; every row failed `gap<100`.
- Decision: No engine candidate accepted and no manual probe target from this evidence set. The PGN-suite evidence regressed versus the accepted ShallowBlue 1618 5+0 gate, and the apparent SF19 disagreements again collapsed into root-bound/tie artifacts or child-search gaps too small to justify a patch.
- Next targets: Stop mining this evidence set for code changes. The best remaining direction is a narrow time-management diagnostic aimed at early-core overspend versus late-endgame depth collapse, while avoiding the already rejected broad depth-8 danger policy.

## 2026-10-03 - No High-Mobility Bonus On Moves 10-15 Candidate

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\candidate-no-highmobility-10-15-shallowblue1618-20g-5m0-20261003`
- Candidate: keep the late tactical core base bonus on moves 10-15, but delay the extra high-mobility bonus until fullmove 16. This is narrower than the rejected early-core 12s/10s caps and does not alter fixed-depth or fixed-movetime search.
- Baseline: accepted bare-king rook-pawn root-extension baseline remains 10 - 9 - 1 [0.525] 20.
- Evidence: Run C time/depth showed early-core moves 11-15 averaged 13.35s with all 100 moves >=10s, while late-endgame 61+ averaged depth 5.18 and 0.42s. The policy simulator estimated this narrow candidate saves about 64.91s across the Run C sample, versus 188.27s for the already rejected 12s cap and 402.19s for a 10s cap. The durable impact report is `analysis-runs\candidate-no-highmobility-10-15-shallowblue1618-20g-5m0-20261003\time-policy-impact.md`.
- Tests: `node --check js\uci\uciengine.js`; `node --test tests\time_management_candidate.test.mjs`; `node --test tests\uci.test.mjs`; `node --test tests\engine_regressions.test.mjs`; `node --check tools\analyze-match-pipeline.mjs`; `node --check tools\evaluate-candidate-smoke.mjs`; `node --test tests\evaluate_candidate_smoke.test.mjs`; `node --check tools\check-candidate-smoke-preflight.mjs`; `node --test tests\candidate_smoke_preflight.test.mjs`.
- Verification refresh: `node --test tests\engine_regressions.test.mjs` passed 64/64 with 67 skipped; `node --test tests\uci.test.mjs` passed 45/45; focused candidate/tooling suite passed 23/23.
- Progress tooling: `tools\summarize-cutechess-progress.mjs` added for UTF-16-safe CuteChess running/completed summaries; `node --test tests\cutechess_progress_summary.test.mjs` passed 2/2. Current candidate progress snapshot showed 0/20 games finished after games 1-4 started.
- Artifacts: `run-match.ps1`, `run-match.cmd`, `run-match-and-analyze.ps1`, `run-match-and-analyze.cmd`, `analyze-existing.ps1`, `analyze-existing.cmd`, `preflight.cmd`, `README.md`, `preflight.md`, `time-policy-impact.md/json`, and automatic post-match `candidate-smoke-decision.md/json` generation are prepared in the run folder.
- Finish helper: `finish-after-match.cmd` refreshes CuteChess progress, runs the standard analysis/decision flow on an existing `match.pgn`, then refreshes progress again.
- Preflight: `analysis-runs\candidate-no-highmobility-10-15-shallowblue1618-20g-5m0-20261003\preflight.md` reports ok for CuteChess, ShallowBlue 1618, Coach UCI, 10-opening PGN suite, and absent match outputs.
- Result: Coach vs ShallowBlue 1618: 4 - 10 - 6 [0.350] 20; Coach as White 1 - 6 - 3 [0.250], Coach as Black 3 - 4 - 3 [0.450].
- Match analysis: `candidate-smoke-decision.md` classified this as `reject-smoke-regression`; stable candidates: 0. Average depth was 9.16, average move time 4.42s, P90 11s, lowest estimated Coach clock 4.6s, and low-clock low-depth moves 27.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke regressed well below the accepted `10 - 9 - 1 [0.525] 20` gate. The replay simulation correctly identified early-core overspend, but delaying only the high-mobility bonus on moves 10-15 did not solve the live clock/depth failure and did not produce stable follow-up FEN candidates.
- Known-bad idea: Do not delay only the high-mobility tactical reinvestment until move 16 as a standalone fix; it saved simulated time but hurt practical match strength.
- Next targets: Revert the active engine timing tweak and continue from accepted timing. The next time-management candidate should target repeated long early-core book/opening positions by position class or repeated-position recognition rather than a broad move-window/mobility rule.

## 2026-10-03 - Early-Core Slow Position Stability Audit

- Status: diagnostic-tooling
- Commit: n/a
- Run: `analysis-runs\early-core-slow-stability-audit-20261003`
- Tooling: `tools\extract-slow-coach-fens.mjs` extracts repeated slow Coach FENs from one or more `coach-time-depth-summary.json` files and writes grouped JSON, Markdown, and triage-ready `.fens`.
- Inputs: Run C (`fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c`) plus the rejected no-highmobility candidate run.
- Extraction: top 12 repeated slow opening/early-core positions accounted for 879s of search time. The largest repeat was `slow01`, 8 occurrences of `11...Nd6`, totaling 136s at average depth 8.
- Triage: `triage-d46810` probed depths 4, 6, 8, and 10 with 12 root rows and 5s per-depth cap. All 12 positions classified as `all-tied`; most had root band 0 with 12 top ties, and many timed before completing depth 8 or 10.
- Decision: No engine candidate accepted, but this is useful direction-setting evidence. The repeated expensive early-core positions look like root-plateau/bound artifacts rather than positions where 15-17s reliably buys a differentiated best move.
- Next targets: Investigate a narrow root-plateau/time-management candidate: when repeated completed depths show a broad root tie with stable best move and no tactical/mate signal, stop or soften allocation after a safe minimum depth. Do not implement another broad move-window cap without a plateau/stability guard.

## 2026-10-03 - Root Plateau Early-Stop Candidate

- Status: accepted-narrow
- Commit: n/a
- Run: `analysis-runs\candidate-root-plateau-earlystop-shallowblue1618-20g-5m0-20261003`
- Candidate: In UCI clock searches only, stop iterative deepening after depth 7 when depth 6 and depth 7 both show a non-mate broad root plateau with the same best move. Fixed-depth and fixed-movetime searches are unchanged.
- Evidence: `stability-d56789` found all 12 top repeated slow opening/early-core positions were `all-tied` across depths 5-9 with 16 root rows. Estimated single-pass saving from stopping at depth 7 instead of continuing toward depth 9 over those 12 positions was about 43.6s.
- Tests: `node --test tests\time_management_candidate.test.mjs` passed 15/15; `node --test tests\uci.test.mjs` passed 45/45; `node --test tests\engine_regressions.test.mjs` passed 64/64 with 67 skipped.
- Result: Coach vs ShallowBlue 1618: 12 - 7 - 1 [0.625] 20; Coach as White 9 - 0 - 1 [0.950], Coach as Black 3 - 7 - 0 [0.300].
- Baseline: accepted bare-king rook-pawn root-extension ShallowBlue 1618 5+0 gate was 10 - 9 - 1 [0.525] 20.
- Match analysis: `candidate-smoke-decision.md` classified this as `smoke-nonregression-ready-for-review`; stable SF19/root-triage candidates: 0. Time/depth improved clock safety: average move time 3.47s, P90 7.3s, lowest estimated clock 29.38s, and only 1 low-clock low-depth move.
- Decision: Accepted narrowly because the same-control 20-game smoke beat the baseline gate and the time/depth evidence shows the intended clock-safety improvement. Treat as a smoke acceptance, not proof of broad strength, because the color split remains lopsided and swings are still present.
- Next targets: Commit this candidate if final diff review is clean. Next improvement loop should focus on Coach-as-Black/endgame swing families from this run, especially `game4-ply108-a3`, `game2-ply122-Kc8`, `game12-ply118-Kf8`, `game18-ply146-Rf7`, and related entered-losing-mate king/pawn endings.
