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

## 2026-10-03 - Accepted-Run Black Endgame Swing Audit

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\black-endgame-swing-audit-20261003`
- Source: accepted root plateau early-stop run `analysis-runs\candidate-root-plateau-earlystop-shallowblue1618-20g-5m0-20261003`.
- Targets: top Coach-as-Black/endgame swing decision points from the accepted run, including `game4-ply108-a3`, `game2-ply122-Kc8`, `game12-ply118-Kf8`, `game18-ply146-Rf7`, and related low-material king/pawn entries.
- Triage: bounded depths 4,6,8,10,12 over 18 before-position FENs initially showed mostly `mate-horizon-flip`, `mate-table`, and `all-tied`. A longer depth-12 rerun with 15s per position resolved the high-severity mate-horizon rows into `mate-table=12` and `all-tied=6`.
- Reference child-search: `reference-child-search-d7-top40` audited 38 high-diff SF19 rows from the accepted run and found 0 candidates; every row failed `gap<100`, and 4 also had the reference move outside Coach's top 24 root rows.
- Decision: No code candidate from this accepted-run Black/endgame evidence. The severe losing-mate swings are already mate-table positions at deeper search, while the non-mate rows are broad ties or child-search unsupported SF19 disagreements.
- Next targets: Gather fresh evidence from the current `7fc0fb1` baseline before patching. Prefer another paired ShallowBlue 1618 5+0 run, then mine specifically for Coach-as-Black losses and positions where Coach child search, root rows, and SF19 all support the same alternative move.

## 2026-10-03 - Late Winning Conversion Floor Candidate

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\candidate-late-winning-conversion-floor-shallowblue1618-20g-5m0-20261003-clean20`
- Candidate: add a narrow-looking UCI clock allocation floor for late low-material winning conversion positions after fresh evidence showed `game4-ply132-g4-before` (`8/2p5/8/3k2p1/3P4/8/3K4/5q2 b - - 1 66`) needed about 5.5s to finish the depth-7 mate jump from `g5g4` to `d5d4`.
- Baseline: accepted root plateau early-stop gate `12 - 7 - 1 [0.625] 20`.
- Local evidence: fixed-depth depth 7 chose `d5d4` mate while UCI clock search at `btime=65000/80000` chose `g5g4`; with `btime=120000` UCI chose `d5d4`. The candidate sentinel made the FEN choose `d5d4`.
- Tests: candidate passed `node --check js\uci\uciengine.js`, `node --test tests\time_management_candidate.test.mjs` (16/16 while active), `node --test tests\uci.test.mjs` (45/45), `node --test tests\engine_regressions.test.mjs` (64/64, 67 skipped), and `stability-short` exact identity against `7fc0fb1` with 0 mismatches and about 0.052% slower overall.
- Result: Coach vs ShallowBlue 1618 clean 20-game smoke: `6 - 11 - 3 [0.375] 20`; White `4 - 3 - 3 [0.550]`, Black `2 - 8 - 0 [0.200]`.
- Match analysis: `candidate-smoke-decision.md` classified `reject-smoke-regression`; stable candidates: 0. Average depth 7.46, average move time 2.91s, P90 6.7s, lowest estimated Coach clock 2.54s, and low-clock low-depth moves 30.
- Decision: Rejected because the smoke regressed far below the accepted 0.625 gate and worsened practical late-clock behavior despite fixing the sentinel.
- Known-bad idea: Do not add a broad late winning-conversion budget floor, even with static eval/material/capture gates, as a standalone fix.
- Next targets: Keep mining for a local condition that preserves clock safety, and prefer fixing incomplete clock-iteration publication or a truly local mate-jump guard over generalized extra time.

## 2026-10-03 - Rejected Smoke Follow-up Probes

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-late-winning-conversion-floor-shallowblue1618-20g-5m0-20261003-clean20`
- Evidence: failed candidate smoke scored `6 - 11 - 3 [0.375] 20` and produced 39 swings, 30 low-clock low-depth moves, and 0 stable SF19/root-triage candidates.
- Direct probes: `game4-ply106-Kxd7-before` was a flat tied rook/pawn ending through depth 12. `game16-ply112-g5-before` and `game16-ply114-hxg5-before` kept the played pawn moves as deeper bests through depth 12, so they do not support an eval or root-ordering fix.
- Queen-vs-king sweep: `game10/game12/game18-ply132-Ke7-before` (`8/8/4k3/7Q/3K4/8/8/8 b - - 0 66`) under clock search returned centipawn `e6f6` at `btime=15000/30000/45000`, then mate-class `e6e7` from about `btime=60000` onward. Fixed-depth probes show the row becomes mate-table by depth 9-12.
- Decision: Do not make a queen-vs-bare-king time/depth guard from this evidence. The deeper result only proves all choices are losing mate, so extra time would improve reporting accuracy more than game outcome and risks repeating the broad time-floor regression.
- Next targets: Prefer fresh evidence where a deeper local probe changes from a losing played move to a materially better or drawing alternative, with SF19/root-child support. Avoid patching all-tied rows, all-losing mate tables, and deeper-best-equals-played rows.

## 2026-10-03 - Late-Endgame Disagreement Follow-up

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-rootplateau-baseline-shallowblue1618-20g-5m0-pgnsuite-20261003b`
- Source: late swing FEN batch from the fresh root-plateau baseline run, especially high-severity post-move-60 centipawn drops that were outside the original SF19 pipeline move window.
- Evidence: `late-endgame-disagreement-followup-sf19-d12\20261003-180019` found three Coach/SF19 depth-12 disagreements: `game9-ply145-Kg3-before`, `game18-ply148-Ke5-before`, and `game10-ply122-Kb6-before`. `game14-ply188-g5-before` timed out for Coach at depth 12.
- Child verification: `late-endgame-child-verify-d10` kept only `game18-ply148-Ke5-before` (`e6e5` vs `e6e7`, child gap 495cp). At child depth 12 the same row still kept but narrowed to an 88cp gap; `game9-ply145-Kg3-before` failed the child-gap gate and `game10-ply122-Kb6-before` was a child-search tie.
- Higher reference check: Stockfish 19 depth 24 preferred `e6f5` for `game18-ply148-Ke5-before`, not the earlier depth-12 `e6e7`; `game10-ply122-Kb6-before` became mate-losing at SF depth 24; `game9-ply145-Kg3-before` stayed `g2f2`.
- Candidate tried and reverted: a narrow-looking bare-king rook-pawn verifier window for near-tied root moves, intended to verify `e6e7/e6f5` instead of `e6e5`, did not change the sentinel in the desired way and still selected a different tied king move in internal debug. No code kept.
- Decision: No accepted candidate from this evidence. The best row exposed a real weakness family but not a stable patch target: preferred moves varied with reference depth and Coach's own root/child verification did not converge cleanly.
- Next targets: Continue mining late-endgame rows, but require stronger convergence before patching: same reference move at higher depth, Coach child-search support with a larger stable gap, and a root-verifier change that demonstrably switches the sentinel without relying on broad near-tie policy.

## 2026-10-03 - Unique Late Swing Triage Follow-up

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-rootplateau-baseline-shallowblue1618-20g-5m0-pgnsuite-20261003b`
- Source: unique before-position set from the fresh baseline run's top centipawn drops plus the known mate-score-change row: `unique-centipawn-before-plus-matescore.fens`.
- Triage: `unique-centipawn-before-triage-d6-12` over depths 6,8,10,12 produced class counts `candidate-review=1`, `early-spread-then-tie=2`, `mate-horizon-flip=4`, and `all-tied=4`.
- Rejected rows: `game7-ply149-Kxh3-before`, `game18-ply152-Kf7-before`, `game9-ply145-Kg3-before`, and `game18-ply148-Ke5-before` were all-tied at depth 12. `game18-ply164-Kd3-before` and `game10-ply122-Kb6-before` widened early but collapsed to broad ties by depth 12. `game18-ply166-Ke2-before`, `game18-ply162-Ke4-before`, `game14-ply188-g5-before`, and `game4-ply132-g4-before` became mate-table/mate-horizon rows, so they remain diagnostic only.
- Best surviving row: `game18-ply150-Kf6-before` (`4R3/K7/2p5/2P1k3/2P5/2P5/8/8 b - - 2 75`) was the only `candidate-review` row. Coach root rows at depths 10/12/14/16 show `e5f4/e5f5` scoring ahead of the played/report-best `e5f6`, but the reported best stayed `e5f6`.
- Reference check: Stockfish 19 depth 16 also chose `e5f6` with a 363cp eval disagreement but best-move agreement, so this does not pass the convergence gate for a patch target.
- Decision: No code candidate from this narrowed late-swing set. Treat the `game18-ply150` root-row/report-best mismatch as a possible diagnostic artifact only; do not patch unless a future row also has stable SF19 best-move disagreement and Coach child-search support.
- Next targets: Current accepted/fresh evidence is close to exhausted under the stricter gate. The next useful evidence should be a fresh paired 20-game ShallowBlue 1618 5+0 run from commit `7fc0fb1`, then mine late Coach-as-Black/endgame rows with the unique-before triage filter before trying another patch.

## 2026-10-03 - Accepted-Run Unique Swing Before Triage

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-root-plateau-earlystop-shallowblue1618-20g-5m0-20261003`
- Source: accepted root plateau early-stop smoke (`12 - 7 - 1 [0.625] 20`) top swing packet. Created `unique-swing-before.fens` from the 20 unique before-positions across entered-losing-mate, centipawn-drop, and mate-score-change rows.
- Triage: `unique-swing-before-triage-d6-12` across depths 6,8,10,12 produced class counts `mate-horizon-flip=10`, `all-tied=6`, `mate-table=3`, `early-spread-then-tie=1`, and `candidate-review=0`.
- Entered-mate rows: `game4-ply108-a3-before`, `game4-ply112-Ka2-before`, `game4-ply110-Ka1-before`, `game2-ply122-Kc8-before`, `game12-ply118-Kf8-before`, `game2-ply124-Kb8-before`, `game2-ply126-cxb6-before`, `game18-ply142-Kh6-before`, `game16-ply156-Kb2-before`, and `game1-ply107-d7-before` were mate-horizon flips by the deepest completed search. `game18-ply146-Rf7-before`, `game16-ply162-Kd2-before`, and `game18-ply144-Kh5-before` were mate-table rows.
- Centipawn rows: `game16-ply148-Ke3-before`, `game12-ply112-g5-before`, `game12-ply110-Kf7-before`, `game16-ply144-Kg5-before`, `game9-ply97-f6-before`, and `game12-ply116-g4-before` were all-tied at depth 12. `game12-ply114-hxg5-before` widened briefly at depth 8 but collapsed to a broad tie by depth 12.
- Decision: No code candidate from the accepted-run unique-before swing packet. This reinforces that the scary accepted-run Black/endgame swings are either already mate-table/mate-horizon rows or broad ties under deeper Coach search.
- Next targets: Do not keep patching this accepted-run packet directly. Gather fresh paired `5+0` ShallowBlue 1618 evidence, then run the unique-before triage plus SF19/child-search convergence gate on new late Coach-as-Black/endgame losses before changing search, eval, or time management.

## 2026-10-04 - Compact Late Endgame Floor Candidate

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\candidate-compact-endgame-floor-shallowblue1618-20g-5m0-20261004a`
- Source: accepted run `game16-ply148-Ke3-before` (`8/R4p2/2K2P2/2P2P2/5k2/2B5/8/8 b - - 4 74`) from `analysis-runs\candidate-root-plateau-earlystop-shallowblue1618-20g-5m0-20261003`.
- Evidence: SF19 depth 20 preferred `f4e4` over Coach's played `f4e3`; Coach child-search verifier kept the row at child depth 10 with a 69cp gap. Actual match move used depth 9, 2.9s, allocated 2.93s, estimated clock before 70.47s, material 1210, legal moves 7, captures 1, fullmove 74.
- Candidate: add a narrow 6000ms clock allocation floor only when no explicit `movestogo` is supplied, remaining time is at least 60000ms, material is at most 1500, fullmove is at least 70, side is not in check, legal moves are 2-8, and captures are at most 1. Existing percentage-of-clock cap still applies.
- Local sentinel: UCI clock search at the actual-ish `70470ms` clock now chooses `f4e4`; baseline chose `f4e3`. Fixed-depth/fixed-movetime paths are unchanged.
- Tests: `node --check js\uci\uciengine.js`; `node --test tests\time_management_candidate.test.mjs`; `node --test tests\uci.test.mjs`; `node --test tests\engine_regressions.test.mjs`; `node --test tests\candidate_smoke_preflight.test.mjs tests\evaluate_candidate_smoke.test.mjs tests\coach_time_depth_summary.test.mjs`; `stability-short` fixed-depth benchmark exact identity OK on 4/4 primary positions, with timing `0.063%` slower overall (`candidate run: negative` only because it is not a speedup, not because identity changed).
- Result: Coach vs ShallowBlue 1618: `8 - 10 - 2 [0.450] 20`; Coach as White `1 - 9 - 0 [0.100]`, Coach as Black `7 - 1 - 2 [0.800]`.
- Match analysis: `candidate-smoke-decision.md` classified `reject-smoke-regression` versus the accepted `12 - 7 - 1 [0.625] 20` gate. Time/depth summary: average depth 8.06, average move time 2.86s, P90 6.5s, lowest estimated Coach clock 8.39s. Swing mining found 53 swings from 1596 scored Coach moves: 12 entered-losing-mate selections, 12 centipawn-drop selections, and 2 mate-score-change selections.
- Decision: Rejected because the 20-game ShallowBlue 1618 5+0 smoke regressed well below the accepted gate despite the local sentinel and fixed-depth stability identity passing.
- Known-bad idea: Do not add a compact late-endgame clock floor as a standalone fix, even with low-material/fullmove/legal-move/capture gates. It fixed `game16-ply148-Ke3-before` locally but hurt the live 5+0 smoke, especially Coach as White.
- Next targets: Revert the active clock-floor code and mine the failed smoke for fresh targets. Highest-signal follow-up starts with the repeated Coach-as-White king/pawn/queen late endgame losses and the game18 black mate-score-change rows, but require root-depth and reference checks before any patch.

## 2026-10-04 - Compact Floor Rejected-Smoke Follow-up

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-compact-endgame-floor-shallowblue1618-20g-5m0-20261004a`
- Evidence: Direct swing triage over `swing-mining\coach-swing-targets.fens` produced class counts `candidate-review=4`, `early-spread-then-tie=5`, `mate-horizon-flip=31`, `all-tied=10`, and `mate-table=2`.
- Broad SF19 pipeline attempt: `sf19-pipeline-m16-90-d8` was stopped after the root triage spent 67 rows on repeated opening/middlegame duplicates; every completed row was `all-tied` or narrow-tie/broad-tie, so it did not expose a fresh patch target.
- Candidate-review rows: `game1-ply97-Kf1-after` was after the losing move and is diagnostic only. Actionable before-move rows were `game15-ply171-Kc6-before`, `game3-ply203-Kh4-before`, and `game18-ply132-Ke2-before`.
- Root-depth follow-up: `game15-ply171-Kc6-before` crossed into a mate-class table/tie by depth 8-10 (`c5d6`/`c5c6` tied at `-999.90` by depth 10; depth 12 was stopped after running too long). `game3-ply203-Kh4-before` stayed on the played move through depth 10 and became losing mate-class by depth 12. `game18-ply132-Ke2-before` became an all-winning mate table by depth 12 after `e3e2` first separated at depth 10.
- Decision: No replacement candidate from this failed smoke. The surviving rows are mate-horizon or table artifacts rather than stable non-mate move-quality misses. Do not patch from this run without fresh reference child-search evidence.
- Next targets: Return to the accepted root plateau early-stop baseline evidence and search for a non-mate centipawn target with stable root spread plus SF19/child-search support, or gather a fresh paired baseline ShallowBlue 1618 5+0 run rather than extending late-endgame time floors.

## 2026-10-04 - Fresh Baseline ShallowBlue Evidence Run A

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004a`
- Result: Coach vs ShallowBlue 1618: `5 - 11 - 4 [0.350] 20`; Coach as White `2 - 4 - 4 [0.400]`, Coach as Black `3 - 7 - 0 [0.300]`.
- Time/depth: average depth 7.82, average move time 2.82s, P90 6.6s, lowest estimated Coach clock 28.78s. Early-core moves 11-15 still include repeated 14-17s searches, but this run did not produce a safe timing candidate.
- Swing mining: 38 swings from 1453 scored Coach moves; selected FEN counts were 14 entered-losing-mate, 16 centipawn-drop, and 3 mate-score-change records. A unique-before file with 33 positions was written to `unique-swing-before.fens`.
- Unique-before triage: `unique-before-triage-d681012` produced class counts `candidate-review=1`, `early-spread-then-tie=6`, `mate-horizon-flip=14`, and `all-tied=12`.
- Triage survivor: `game16-ply188-Kh8-before` (`6k1/8/4p1BP/4K3/5P2/5P2/8/8 b - - 0 94`) stayed as `candidate-review` through depth 12, but depth 14 made `g8h8` and `g8f8` both losing mate-class. SF19 depth 16 chose `g8f8`, while Coach chose `g8h8`, but both were mate -7 with 0cp practical gap.
- SF19/child-search sweep: SF19 depth-12 comparison over the 33 unique-before rows fed `reference-child-search-d10`, which kept one apparent candidate, `game15-ply91-Kc1-before` (`8/6p1/8/2p2p2/p3bP2/P2pP2k/1P1K4/8 w - - 0 46`): Coach/root `d2c1`, SF19 `d2e1`, child-depth-10 gap 183cp.
- Equal-depth verifier audit: `reference-child-search-d12` rechecked the same 9 high-diff rows at child depth 12 and kept 0 candidates. `game15-ply91-Kc1-before` collapsed to `gap=0cp` (`d2c1` vs `d2e1`). Manual instrumentation showed that before root-tie verification six root moves tied at `-1156`; full child verification at depth 12 scored `d2c1=-1374`, `d2c3=-1379`, `b2b4=-99984`, `d2d1=-1374`, `b2b3=-99984`, and `d2e1=-1374`. So `Ke1` was not better than `Kc1` at equal depth.
- Decision: No candidate accepted from this fresh evidence run. The only child-search keeper was a depth-mismatch false positive, and the only triage survivor was same-outcome losing mate. Do not patch root-tie selection from this run.
- Next targets: Current accepted-run plus fresh-run evidence remains dominated by mate-horizon, broad-tie, and equal-depth root-verification artifacts. A next goal should likely shift from hand-mining ShallowBlue swing rows to improving the automated candidate filter so child verification uses equal-depth rechecks before surfacing keepers, or gather a materially different evidence source.

## 2026-10-04 - Reference Child-Search Confirmation Gate

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\verify-reference-child-search.mjs`
- Motivation: Fresh evidence run A produced a false keeper at `game15-ply91-Kc1-before` when child verification used depth 10 against an SF19 depth-12 comparison. Equal-depth verification at depth 12 collapsed the apparent `183cp` gap to `0cp`.
- Change: the verifier now defaults `--confirm-child-depth` to `analysis`, infers the maximum Coach/SF analysis depth when available, and reruns coach/reference child searches only for rows that initially pass the keep filter and need a deeper confirmation. Rows whose confirmation gap falls below `--min-gap` are rejected with `confirm-gap<...@dN`. `--confirm-child-depth off` disables the extra guard when reproducing older artifacts.
- Verification: `node --check tools\verify-reference-child-search.mjs`; `node --test tests\reference_child_search_verifier.test.mjs`; reran the previous depth-10 fresh-run command to `reference-child-search-d10-confirmed`, which now reports 0 candidates and rejects `game15-ply91-Kc1-before` with `confirm-gap<100@d12`.
- Decision: Keep this stricter filter before surfacing future Coach candidates. It prevents depth-mismatch false positives without changing engine search behavior.
- Next targets: Re-run future candidate mining through the confirmed verifier first. Only patch Coach when a row survives unique-before triage, SF19 comparison, and confirmed child-search at the analysis depth.

## 2026-10-04 - Accepted-Run Confirmed Child-Search Rescan

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-root-plateau-earlystop-shallowblue1618-20g-5m0-20261003`
- Tooling: confirmed child-search verifier from `tools\verify-reference-child-search.mjs`.
- Broad SF19 rescan: `sf19-pipeline-m16-60-d8\20261003-114818\reference-child-search-d8-confirmed` audited 24 accepted-run SF19 disagreements and kept 0 candidates. Rejections were dominated by `gap<100=24` and `reference-not-in-top-12=16`.
- Ke3 special rescan: `sf19-ke3-child-verify-d10-confirm-d12` rejected `game16-ply148-Ke3-before`; the old child-depth-10 gap was 69cp, but confirmation depth 12 reduced the gap to 28cp (`f4e3` vs `f4e4`), below the 50cp threshold. This supports treating the rejected compact endgame floor as a depth-mismatch false positive rather than a robust move-quality target.
- Edge special rescan: `sf19-edge-child-verify-d8-confirm-d12` audited `game16-ply148-Ke3-before` and `game12-ply114-hxg5-before`; both rejected, with gaps 14cp and -109cp.
- Unique-before SF19 rescan: `sf19-unique-before-d12\20261004-022852` compared the accepted run's 20 unique swing-before positions at SF19 depth 12; 14 positions completed and 6 hard rows failed. Confirmed child-search over the 7 completed SF19 disagreements kept 0 candidates. The largest non-mate rows, `game16-ply144-Kg5-before` and `game12-ply114-hxg5-before`, rejected with gaps -191cp and -65cp.
- Decision: No accepted-run SF19/reference-child candidate survives the confirmed gate. The accepted-run Coach-as-Black/endgame evidence is currently exhausted for a safe narrow patch under the active constraints.
- Next targets: Either collect a materially different evidence source or improve search-mining automation further. Do not build another candidate from the accepted-run Ke3/hxg5 family unless a future deeper reference/child-search pass produces a confirmed gap.

## 2026-10-04 - Analysis Pipeline Confirmed Child-Search Integration

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\analyze-match-pipeline.mjs`, `tools\verify-reference-child-search.mjs`
- Change: the match analysis pipeline now runs `tools\verify-reference-child-search.mjs` automatically after SF19 analysis results exist, writing `reference-child-search-d<childDepth>-confirmed` under the SF19 analysis run. Defaults are `--child-depth 10`, `--child-min-gap 100`, `--child-root-limit 12`, `--child-max-ms-per-child 10000`, and `--confirm-child-depth analysis`.
- Verification: `node --check tools\analyze-match-pipeline.mjs`; `node --check tools\verify-reference-child-search.mjs`; `node --test tests\analyze_match_pipeline_args.test.mjs`; `node --test tests\reference_child_search_verifier.test.mjs`.
- Decision: keep the confirmed verifier inside the standard pipeline so future candidate mining surfaces equal-depth-confirmed disagreements instead of depth-mismatch false positives.
- Next targets: run the improved pipeline on fresh/non-exhausted evidence, then only probe or patch rows that survive the confirmed child-search artifact.

## 2026-10-04 - Fresh Evidence Broad Pipeline Pass A

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004a`
- Pipeline: `sf19-pipeline-m16-90-d8\20261004-030842` over 80 sampled Coach positions from moves 16-90, both colors, using SF19 depth 8 and the confirmed child-search verifier.
- Confirmed child-search: `reference-child-search-d8-confirmed` audited 14 high-diff rows and kept 0 candidates. All 14 rejected on `gap<100`; 2 also had `reference-not-in-top-12`.
- Root triage/stable selector: 80/80 rows rejected as `all-tied`; stable selector kept 0 candidates. Rejections were dominated by `deepest=broad-tie=79`, `band<50=80`, and `topTies>3=79`.
- Decision: no code candidate from this broad early/middlegame sampled pass. The apparent SF19 eval differences collapse under Coach root triage and child-search, so do not patch from these Qd4/f3/Kg1/Nc8/Kf8 families.
- Next targets: avoid spending more cycles on repeated sampled opening rows. Move candidate discovery toward deduplicated late-loss/swing positions or a materially different evidence source with confirmed child gaps.

## 2026-10-04 - Fresh Evidence Swing-Target SF19 Pass

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004a`
- Source: `swing-mining\coach-swing-targets.fens`, 46 targeted before/after positions from entered-losing-mate, centipawn-drop, and mate-score-change swings.
- SF19 pass: `sf19-swing-targets-d10\20261004-032837` analyzed 45/46 positions at depth 10; `game9-ply129-Rxf1-before` failed. Best-move agreement was 23/45; 10 rows were marked as Coach strongly optimistic with a different best move.
- Confirmed child-search: `reference-child-search-d8-confirmed` audited 19 high-diff rows and kept 0 candidates. Rejections were `mate-root-score=10`, `gap<100=18`, and `reference-not-in-top-12=2`.
- Triage: `swing-targets-triage-d6810` class counts were `candidate-review=11`, `early-spread-then-tie=8`, `mate-horizon-flip=16`, and `all-tied=11`.
- Stable selector cross-check: `stable-swing-selector` surfaced three apparent rows, but all failed confirmed child/probe review: `game16-ply186-Kg8-before` had child gap `-57cp` and became mate-class at Coach depth 12; `game11-ply115-Ke3-after` had child gap `-86cp` and deeper Coach search kept/favored Coach's `g2h3`; `game12-ply100-f4-before` had only an `81cp` child gap and became equal/tied by Coach depth 12.
- Decision: no code candidate from the fresh swing-target packet. Do not patch these Kg8/Ke3/f4 rows without new evidence; the confirmed child/probe checks show they are mate-horizon, broad-tie, or selector false-positive cases.
- Next targets: the current fresh ShallowBlue 1618 5+0 evidence has no confirmed patch path under the active gate. Consider either a new materially different match/evidence source or a tooling improvement that filters stable-selector output against confirmed child-search results before presenting candidates.

## 2026-10-04 - Stable Selector Confirmed-Child Filter

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\select-stable-candidates.mjs`, `tools\analyze-match-pipeline.mjs`
- Change: stable candidate selection now accepts `--confirmed-child-search <reference-child-search.json>` and rejects rows that confirmed child-search already rejected, carrying child gap and rejection reasons into `stable-candidates.json` and `stable-candidates.md`. The standard match analysis pipeline passes its generated confirmed child-search artifact into the stable selector automatically.
- Verification: `node --check tools\select-stable-candidates.mjs`; `node --check tools\analyze-match-pipeline.mjs`; `node --test tests\select_stable_candidates.test.mjs tests\analyze_match_pipeline_args.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Evidence rerun: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004a\sf19-swing-targets-d10\20261004-032837\stable-swing-selector-confirmed` selected 0 stable candidates. The previous selector survivors `game16-ply186-Kg8-before`, `game11-ply115-Ke3-after`, and `game12-ply100-f4-before` are now rejected with `confirmedChildRejected:gap<100` and child gaps `-57cp`, `-86cp`, and `81cp`.
- Decision: keep the confirmed-child filter in stable selection. This prevents selector false positives from being handed off as patch candidates when equal-depth child confirmation already rejected them.
- Next targets: with accepted-run and fresh-run ShallowBlue swing evidence exhausted under the confirmed gate, gather a materially different evidence source or a new match before proposing an engine patch.

## 2026-10-04 - Fresh Evidence ShallowBlue 1618 Run B

- Status: diagnostic
- Commit: `28400a7`
- Run: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004b`
- Result: Coach vs ShallowBlue 1618: `2 - 14 - 4 [0.200] 20`; Coach as White `2 - 5 - 3 [0.350]`, Coach as Black `0 - 9 - 1 [0.050]`.
- Time/depth: average depth 7.74, average move time 3.07s, P90 6.8s, lowest estimated Coach clock 32.42s. Early-core moves 11-15 again contained repeated 14-17s searches, but there was no low-clock crisis.
- Swing mining: 46 swings from 1374 scored Coach moves. Selected FEN counts were 10 entered-losing-mate and 10 centipawn-drop records, producing 40 before/after FEN lines; no mate-score-change rows were selected.
- Broad pipeline: `sf19-pipeline-m16-90-d8\20261004-073654` over 80 sampled positions kept 0 confirmed child-search candidates and 0 stable candidates. The largest fresh sampled row, `game14-before-24...Ncb6`, rejected with child gap `-34cp` and all-tied root triage.
- Swing-target SF19 pass: `sf19-swing-targets-d10\20261004-075330` analyzed 36/40 targeted swing positions; 4 hard rows failed. Confirmed child-search audited 16 high-diff rows and kept 0 candidates. Rejections were `gap<100=16`, `mate-root-score=8`, and `reference-not-in-top-12=2`.
- Swing-target stable selector: `stable-swing-selector-confirmed` selected 0 stable candidates. Coach-only triage rows such as `game10-ply110-Kd8-before`, `game13-ply131-Kf3-after`, `game15-ply155-Ka2-before`, and the repeated `game10-ply100-f4-before` were rejected because of confirmed-child rejection, SF best-move agreement, mate rows, low band, or missing confirmed support.
- Tooling fix: while processing this run, `tools\analyze-match-pipeline.mjs` was corrected so `--confirmed-child-search` is passed only to `tools\select-stable-candidates.mjs`, not to `tools\rank-triage-candidates.mjs`. `tests\analyze_match_pipeline_args.test.mjs` now guards that command placement.
- Verification: `node --check tools\analyze-match-pipeline.mjs`; `node --test tests\analyze_match_pipeline_args.test.mjs tests\select_stable_candidates.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Decision: no engine candidate from this new evidence source. The bad match is dominated by mate-horizon/table rows and broad-tie or child-search-unsupported SF disagreements rather than a confirmed non-mate patch target.
- Next targets: do not patch from Run B. If continuing, use a materially different evidence source, such as a targeted SF19 diagnostic match or a different opening/evidence policy, rather than another identical ShallowBlue sampled-opening pass.

## 2026-10-04 - SF19 Anchor Diagnostic Packet

- Status: diagnostic
- Commit: `2b70704`
- Run: `analysis-runs\sf19-anchor-diagnostics-20261004`
- Source: 22 non-ShallowBlue diagnostic anchors from `tests\data\diagnostic_anchors.json`: 6 early-minor Stockfish-reference openings plus 16 Lucas STS regression positions. Strict sentinels, equivalence controls, and ShallowBlue-derived arena anchors were excluded.
- SF19 comparison: `sf19-anchor-d10\20261004-094925` completed 19/22 positions at depth 10; 3 hard rows timed out. Best-move agreement was 9/19, average non-mate eval gap 68cp, and there were 0 mate-score disagreements.
- Best apparent target: `lucas-square-vacancy-g4-i75` (`b3qbk1/B6p/1QNp2p1/3Pp3/2P2p2/5P1P/6P1/6K1 w - - 0 1`) had Coach `b6c7` 60cp versus SF19 `c6d8` 233cp, a 173cp non-mate gap.
- Confirmed child-search: `reference-child-search-d8-confirmed` audited the only row above 150cp and kept 0 candidates. `lucas-square-vacancy-g4-i75` rejected with child gap `-31cp`; Coach child scores were `b6c7=55` and `c6d8=24`, with the SF19 move ranked 11th.
- Coach root triage: `anchor-triage-d681012` classified all 22 positions as `all-tied`. The `lucas-square-vacancy-g4-i75` row had deepest band 6cp with 18 top ties and timed at completed depth 8.
- Decision: no engine candidate from this anchor packet. The new non-ShallowBlue source produced one tempting SF19 disagreement, but Coach's equal-depth child search and root triage show it is another plateau/tie artifact rather than a confirmed missing move.
- Next targets: pivot to an SF19-from-anchor or SF19 opening-policy match where the anchor positions seed played games, then mine actual Coach move failures after the positions evolve. Do not patch directly from `lucas-square-vacancy-g4-i75` unless future evidence produces a confirmed child-search gap.

## 2026-10-04 - SF19 Anchor-Opening Match

- Status: diagnostic
- Commit: `2b70704`
- Run: `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004`
- Setup: 44 paired games, 4 concurrent, fixed `st=1`, `-repeat`, SF19 limited to 2400 Elo, seeded from 22 non-ShallowBlue anchor EPD positions generated from early-minor and Lucas STS diagnostic anchors.
- Result: Coach vs Stockfish 19 2400: `4 - 35 - 5 [0.148] 44`; Coach as White `3 - 17 - 2 [0.182]`, Coach as Black `1 - 18 - 3 [0.114]`.
- Swing mining: 108 swings from 2141 scored Coach moves; selected 9 entered-losing-mate and 16 centipawn-drop records, producing 50 before/after FEN lines.
- Swing-target SF19 pass: `sf19-swing-targets-d10\20261004-103451` analyzed 42/50 FENs. Confirmed child-search audited 23 high-diff rows and kept 1 after-position, `game14-ply160-Kf8-after`, with child gap 766cp.
- After-position audit: `game14-ply160-Kf8-after` (`5k2/8/7P/5K2/8/4B3/2p5/8 w - - 7 81`) was not a valid Coach move target. The actual before-position where Coach chose `80...Kf8` (`8/5k2/7P/5K2/8/4B3/2p5/8 b - - 6 80`) still had `Kf8` as best or tied-best through depth 12, with all black moves losing badly.
- Before-move sampled pipeline: `sf19-pipeline-m8-120-d8\20261004-111426` analyzed 119/120 sampled Coach decision positions; confirmed child-search audited 39 high-diff rows and kept 0 candidates. Stable selector selected 0 candidates.
- Before-move wide pass: `sf19-pipeline-wide-m8-120-d8\20261004-132209` analyzed 237/240 Coach decision positions; confirmed child-search audited 81 high-diff rows and kept 0 candidates.
- Decision: no engine candidate from the anchor-opening evidence source. The match produced many SF19 disagreement rows, but actual Coach decision points collapsed under equal-depth child-search into gap-under-100, broad-tie/root-plateau, mate-table, or reference-move-not-supported cases.
- Next targets: do not patch from this anchor-opening run. If continuing in a future goal, prefer improving candidate mining automation or a new evidence family that is not dominated by root plateaus and same-move eval-scale gaps.

## 2026-10-05 - Decision Candidate Selector

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\select-decision-candidates.mjs`
- Motivation: recent SF19 and ShallowBlue mining kept surfacing rows that were not safe patch targets: after-position artifacts, same-move eval-scale gaps, mate-class rows, root plateaus, and SF/reference disagreements that failed confirmed child-search.
- Change: added an analysis-first selector that starts from Coach analysis positions, optionally requires confirmed child-search support and triage support, filters labels with `--require-label-regex` / `--exclude-label-regex`, rejects mate-class scores, same-move rows, child gaps below threshold, root-tie-heavy rows, and can keep only the first valid candidate per game with `--first-per-game`.
- Verification: `node --check tools\select-decision-candidates.mjs`; `node --test tests\select_decision_candidates.test.mjs tests\select_stable_candidates.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Evidence rerun: applied the selector to the SF19 anchor-opening narrow before-move pipeline, wide before-move pipeline, and swing-target packet. All three selected 0 decision candidates:
  - `sf19-pipeline-m8-120-d8\20261004-111426\decision-candidates-before-confirmed`: 0/120.
  - `sf19-pipeline-wide-m8-120-d8\20261004-132209\decision-candidates-before-confirmed`: 0/240.
  - `sf19-swing-targets-d10\20261004-103451\decision-candidates-before-confirmed`: 0/50.
- Decision: keep this selector as the handoff gate before making engine candidates. It confirms the current SF19 anchor-opening evidence has no clean non-mate Coach before-move failure that survives the active goal's confirmed-child standard.
- Next targets: continue the active goal with a materially different evidence generator or a deeper diagnostic that creates true first-divergence before-move rows. A good next loop is to build or run a paired SF19 diagnostic set that samples Coach's first disagreement from each anchor game at higher Coach/reference depth, then feed only those rows through this selector.

## 2026-10-05 - First-Disagreement SF19 Diagnostic

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\extract-first-disagreements.mjs`
- Motivation: broad sampled analysis kept mixing late/noisy rows with same-move eval gaps. The active goal needed a cleaner evidence generator that starts at the earliest non-mate Coach/SF19 move disagreement per game.
- Change: added a first-disagreement extractor that reads `coach-analysis-lab` results, filters by label, eval gap, same-move agreement, and mate-class scores, then writes `first-disagreements.json`, `first-disagreements.fens`, and `first-disagreements.md`. It can cap selected disagreements per game.
- Verification: `node --check tools\extract-first-disagreements.mjs`; `node --test tests\extract_first_disagreements.test.mjs tests\select_decision_candidates.test.mjs tests\select_stable_candidates.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Evidence packet: `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004\first-disagreements-wide-d8` selected 24 first disagreements from the 240-row wide SF19 depth-8 pass. Rejections were `refMoveAgrees=131`, `diff<150=71`, `gameLimit>1=53`, `mateAnalysisScore=20`, and 3 analysis failures.
- Deeper follow-up: `first-disagreements-d10\20261004-184701` analyzed the 24-row packet at Coach/SF19 depth 10: 22 analyzed, 2 failed, best-move agreement 8/22, average non-mate eval gap 265cp, mate-score disagreements 0, and 6 high-priority different-best-move rows where Coach was at least 100cp more optimistic/pessimistic.
- Confirmed child-search: `reference-child-search-d8-confirmed` audited 11 high-diff different-move rows and kept 0 candidates. All 11 rejected with `gap<100`; 3 also had `reference-not-in-top-12`. Notably every reported child gap was negative, so Coach's own equal-depth child search did not support the SF19 move as better.
- Decision selector: `decision-candidates-before-confirmed` selected 0/24 decision candidates. Rejections included `missingConfirmedChild=13`, `confirmedChildRejected:gap<100=8`, `confirmedChildRejected:reference-not-in-top-12+gap<100=3`, `childGap<100=11`, and `rootTies>3=9`.
- Decision: no engine candidate from the first-disagreement SF19 diagnostic. The deeper packet produced real-looking non-mate SF19 move disagreements, but they still collapse under Coach's confirmed child-search gate, so they are not safe patch targets.
- Next targets: stop mining this anchor-opening run for engine patches. The next improvement loop should use a new evidence family or a diagnostic that compares Coach child-search outcomes against an external child-search/reference, because Coach's own child-search currently rejects the SF19 alternatives even when root depth-10 evals differ by 200-400cp.

## 2026-10-05 - External SF19 Child-Search Diagnostic

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\verify-external-child-search.mjs`
- Motivation: the confirmed Coach child-search gate rejected every SF19 first-disagreement row, but that left an open question: whether SF19 still prefers its branch after each candidate move, or whether the disagreement was only a root-analysis artifact. This tool asks SF19 to evaluate the child position after Coach's move and after SF19's move, then scores the gap from the original root side's perspective.
- Change: added an external child-search verifier with a minimal UCI client, legal child-FEN generation through Coach move legality, root-side score normalization, JSON/Markdown output, and focused tests for score-perspective handling and keeper classification.
- Verification: `node --check tools\verify-external-child-search.mjs`; `node --test tests\external_child_search_verifier.test.mjs tests\extract_first_disagreements.test.mjs tests\select_decision_candidates.test.mjs tests\select_stable_candidates.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Evidence run: applied to `first-disagreements-d10\20261004-184701\results.json` with SF19 at depth 10 and depth 12:
  - `external-child-search-d10`: audited 11 rows, kept 3 external candidates: `game3-before-8.Nxe5` gap 458cp (`d7b6` vs `d7e5`), `game19-before-8.Re1` gap 303cp (`c2e4` vs `d1d2`), and `game8-before-9...Ne4` gap 155cp (`a1a3` vs `d2e4`).
  - `external-child-search-d12`: audited 11 rows, kept 4 external candidates: `game3-before-8.Nxe5` gap 602cp, `game19-before-8.Re1` gap 350cp, `game9-before-8.Bf8` gap 103cp (`f6e4` vs `h5h4`), and `game20-before-9...Qe5` gap 110cp (`d4e5` vs `d4e3`). The previous `game8` external gap collapsed to 56cp.
- Coach root-depth probes:
  - `game3-before-8.Nxe5`: Coach root table is a broad tie through depth 12; SF19's `d7e5` is tied with Coach's `d7b6` and many alternatives by depths 7-12.
  - `game19-before-8.Re1`: broad tied root family through depth 11; SF19's `d1d2` is tied in the same plateau when it appears. Depth 12 was stopped after running too long.
  - `game9-before-8.Bf8`: broad tied root family through depth 11; SF19's `h5h4` appears tied by depth 9-11.
  - `game20-before-9...Qe5`: Coach root table stays a flat queen-move family through depth 11; SF19's `d4e3` is not in the top 12, but no Coach root gap isolates why because the root scores remain tied.
- Decision: no engine candidate accepted from the external-child diagnostic. The tool found a better evidence signal than Coach-only child search, but root probes still classify the rows as plateau/tie families rather than clean non-mate Coach move-selection failures. Avoid patching broad root-tie policy from this evidence because similar broad root changes have previously hurt ShallowBlue 5+0 strength.
- Next targets: external child-search is now useful as an upstream evidence filter, but a code candidate still needs a row where Coach root probing exposes a narrow mechanism. Continue with either a new evidence source or a diagnostic specifically aimed at why Coach's root tables collapse many tactically distinct SF19-backed moves into identical scores.

## 2026-10-05 - Root-Bound Pair Diagnostic

- Status: diagnostic-tooling
- Commit: n/a
- Tooling: `tools\diagnose-root-bound-pairs.mjs`
- Motivation: `external-child-search-d12` found four SF19-backed alternatives, but Coach root probes still showed broad tied root tables. The next question was whether Coach's published root tie hid a Coach full-window child-search gap, or whether Coach's child search itself disagreed with SF19.
- Change: added a targeted pair diagnostic that reads Coach/SF analysis rows, optionally filters to external-child keepers, runs Coach root search at a chosen depth, then full-window child-searches only the Coach move and SF/reference move at `depth-1`. It reports root gap, Coach child gap, external SF19 child gap, and classifies `bound-like-root-tie` versus `coach-child-disagrees-with-external`.
- Verification: `node --check tools\diagnose-root-bound-pairs.mjs`; `node --test tests\root_bound_pairs.test.mjs tests\external_child_search_verifier.test.mjs tests\extract_first_disagreements.test.mjs tests\select_decision_candidates.test.mjs tests\select_stable_candidates.test.mjs tests\reference_child_search_verifier.test.mjs`.
- Full plateau sanity check: `tools\explain-root-plateau.mjs` on the strongest external row, `game3-before-8.Nxe5`, at depth 8 showed a true broad root plateau: root band `0cp`, static side band `446cp`, child-search band `805cp`, 8 top ties, and 7 bound-like top ties. However, for the specific Coach-vs-SF move pair, Coach child-search still preferred Coach's `d7b6` over SF19's `d7e5` (`childGap=-76cp`).
- Pair diagnostic: `root-bound-pairs-d8` audited the four `external-child-search-d12` keepers and found 0 bound-like root ties for the Coach-vs-SF move pairs. All four had `childBand<100`, `root-and-child-flat`, and `coach-child-disagrees-with-external`:
  - `game3-before-8.Nxe5`: root gap `0cp`, Coach child gap `-76cp`, external SF19 child gap `602cp`.
  - `game19-before-8.Re1`: root gap `0cp`, Coach child gap `-85cp`, external SF19 child gap `350cp`.
  - `game9-before-8.Bf8`: root gap `4cp`, Coach child gap `-59cp`, external SF19 child gap `103cp`.
  - `game20-before-9...Qe5`: root gap `0cp`, Coach child gap `-28cp`, external SF19 child gap `110cp`.
- Decision: no engine candidate accepted. This evidence does not satisfy the active gate requiring equal-depth Coach child-search confirmation with a real gap. The promising rows are now classified as external-only SF19 disagreements, not Coach-confirmed missing moves.
- Next targets: do not patch from these four rows. If continuing, seek a new evidence source that produces Coach-confirmed child gaps, or deliberately start a separate eval/search-calibration investigation into why Coach child-search disagrees with SF19 on these tactical early positions. That second path should be treated as exploratory and must not bypass the ShallowBlue 5+0 smoke gate.

## 2026-10-05 - Confirmed-Child Corpus Keeper Audit

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\corpus-confirmed-keeper-audit-20261005`
- Motivation: before launching a new evidence source, scan existing `analysis-runs` artifacts for any historical `reference-child-search.json` rows with `keep=true` that might predate the stricter current gates.
- Scan result: found five historical keepers across the corpus: `game16-ply148-Ke3-before`, `game18-ply148-Ke5-before` at depth 10 and depth 12, `game15-ply91-Kc1-before`, and `game14-ply160-Kf8-after`.
- Current-gate audit:
  - `game16-ply148-Ke3-before`: rejected; historical gap 69cp is below the active 100cp gate, and later confirmation collapsed further (`confirm-gap<50@d12`, edge gap 14cp).
  - `game18-ply148-Ke5-before`: rejected; depth-10 gap 495cp collapsed to 88cp at depth 12, below the active 100cp gate. Current decision selector selected 0 candidates.
  - `game15-ply91-Kc1-before`: rejected; depth-10 gap 183cp collapsed to 0cp at equal-depth d12 and `reference-child-search-d10-confirmed` rejects with `confirm-gap<100@d12`.
  - `game14-ply160-Kf8-after`: rejected; after-position artifact rather than a Coach decision point. Current decision selector with `--exclude-label-regex -after` selected 0 candidates.
- Verification: current decision selector reruns selected 0 candidates for the `Ke5` and `Kf8-after` keeper paths; the other stale keepers have explicit confirmed-depth rejection artifacts already in the run folders.
- Decision: no existing corpus keeper survives the active goal's current gates. Do not patch from these stale `keep=true` rows.
- Next targets: move to a genuinely new evidence source or an exploratory calibration pass; the existing confirmed-child corpus is exhausted for narrow candidate selection.

## 2026-10-05 - Large-Gap Child-Search Corpus Audit

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\corpus-large-gap-child-audit-20261005`
- Motivation: the previous corpus scan only checked historical `keep=true` rows. This pass scanned all existing `reference-child-search.json` artifacts for any row with `gapCp >= 100`, including rows rejected for mate, confirmation, or root-support reasons.
- Scan result: only 7 large-gap rows exist in the corpus. Reason counts were `mate-root-score=2`, historical `KEEP=3`, `confirm-gap<100@d10=1`, and `confirm-gap<100@d12=1`.
- Current-gate audit:
  - `game25-ply143-Kb2-after` and `game9-ply131-Kh4-after`: rejected mate-root after-position/table artifacts.
  - `game14-ply160-Kf8-after`: rejected after-position artifact, not a Coach decision point.
  - `game18-ply148-Ke5-before`: rejected because d10 gap 495cp collapses to 88cp at d12.
  - `game14-ply162-Kf7-after`: rejected after-position plus `confirm-gap<100@d10`.
  - `game15-ply91-Kc1-before`: rejected because d10 gap 183cp collapses to 0cp at equal-depth d12; confirmed artifact already says `confirm-gap<100@d12`.
- Decision: no large-gap child-search row in the existing corpus survives the active goal's gates. The existing analysis-runs corpus is exhausted for candidate discovery under confirmed Coach child-search requirements.
- Next targets: proceed only with a genuinely new evidence source or a separate exploratory calibration investigation; do not keep re-auditing the same corpus for child-gap candidates.

## 2026-10-05 - Lucas STS Miss Packet Diagnostic

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\lucas-sts-miss-packet-20261005`
- Motivation: after exhausting ShallowBlue/SF19 match-derived child-gap artifacts, try a genuinely different local evidence source: Lucas STS suite positions where current Coach scored poorly in the worst regression categories.
- Packet: 48 current-Coach low-score misses from `analysis-runs\lucas-sts-20260916-comparison\lucas-sts-comparison.json`, focused on Pawn Play in the Center, Open Files and Diagonals, Square Vacancy, Simplification, Undermining, Advancement of f/g/h Pawns, Re-Capturing, and Advancement of a/b/c Pawns.
- SF19 comparison: `sf19-d8\20261004-194607` analyzed 48/48 at depth 8. Best-move agreement was 14/48, average absolute eval difference 104cp, largest eval diff 410cp at `lucas-g1-i4-Undermining`, mate disagreements 0, Coach mate scores 0.
- Confirmed child-search: `reference-child-search-d8-confirmed` audited 6 high-diff different-move rows and kept 0 candidates. Rejections were `gap<100=6` and `reference-not-in-top-12=2`.
- Largest collapsed rows: `lucas-g2-i69-Open-Files-and-Diagonals` gap 33cp, `lucas-g4-i31-Square-Vacancy` gap -1cp, `lucas-g1-i49-Undermining` gap -7cp, `lucas-g1-i38-Undermining` gap -17cp, `lucas-g6-i15-Re-Capturing` gap -14cp, and `lucas-g1-i83-Undermining` gap -31cp.
- Decision: no engine candidate from the Lucas STS packet. This was clean non-mate evidence, but it repeated the current pattern: SF19 root disagreements do not survive equal-depth Coach child-search confirmation.
- Next targets: Coach-confirmed child-gap evidence remains absent across match-derived, anchor-opening, corpus, and STS sources. Further candidate work likely needs either a new played-match evidence source or an explicit exploratory calibration project to understand Coach-vs-SF child-search divergence before patching.

## 2026-10-05 - Lucas STS Best-Move Policy Check

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\lucas-sts-miss-packet-20261005\sts-best-reference-d8`
- Motivation: the first Lucas STS packet used SF19's root best move as the reference and kept 0 candidates. This check tests whether the Lucas STS suite's own preferred move, rather than SF19's chosen move, produces a Coach-confirmed child gap.
- Method: built a synthetic `coach-analysis-lab`-compatible `results.json` from the 48-position Lucas STS miss packet. Each row keeps Coach's actual depth-8 move, but replaces the reference move with the first move from the STS `best_moves` field. Rows where Coach already matched the STS best were excluded.
- Result: 33 Coach-vs-STS-best rows audited by `tools\verify-reference-child-search.mjs` at child depth 8. Candidates kept: 0. Rejections were `gap<100=33` and `reference-not-in-top-16=8`.
- Largest gaps: the best STS-favoring Coach child gap was only 77cp at `lucas-g4-i73-Square-Vacancy-stsbest`; other top gaps were 36cp, 33cp, 21cp, 14cp, 11cp, and 10cp.
- Decision: no engine candidate from the STS-best policy. Even when the reference move is the suite's preferred move, Coach's own child-search does not produce a >=100cp confirmed gap.
- Next targets: this further supports treating the current blocker as evidence-policy/search-calibration rather than a ready patch target. Do not create an engine candidate from STS rows unless future deeper Coach child-search or match evidence exposes a real confirmed gap.

## 2026-10-05 - Lucas STS Best-Move Depth-10 Follow-Up

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\lucas-sts-miss-packet-20261005\sts-best-reference-d10-followup`
- Motivation: the STS-best policy check had one near-threshold row at 77cp (`lucas-g4-i73-Square-Vacancy-stsbest`). Recheck the strongest eight STS-best rows at deeper Coach child depth 10 before declaring the policy exhausted.
- Result: audited 8 rows at child depth 10, kept 0 candidates. All rejected with `gap<100`.
- Depth behavior: the prior top row, `lucas-g4-i73-Square-Vacancy-stsbest`, fell from 77cp at child depth 8 to 4cp at child depth 10. The largest depth-10 gap was only 51cp at `lucas-g10-i58-Simplification-stsbest`.
- Decision: deeper Coach child-search confirms the STS-best near misses are not candidates under the active gate.
- Next targets: STS-based candidate discovery is exhausted under current gates. Further progress needs a new played evidence source or a deliberately separate calibration effort, not another STS child-gap pass.

## 2026-10-05 - Active Goal Pivot

- Status: goal-policy
- Commit: n/a
- Baseline: current published head `2b70704`; preserve the accepted ShallowBlue 1618 5+0 smoke baseline `12 - 7 - 1 [0.625]`.
- Exhausted sources: identical ShallowBlue sampled-opening passes, SF19 anchor-opening first-disagreement rows, existing corpus confirmed-child keepers, large-gap child-search corpus rows, Lucas STS SF19-reference rows, and Lucas STS suite-best rows.
- Active loop: do not run another identical sampled-opening candidate-fishing pass. Prefer a materially different evidence source or calibration diagnostic, especially a targeted SF19 diagnostic set or a different opening/evidence policy that creates clean before-move, non-mate Coach decision rows.
- Candidate gate: only patch when a row survives SF19/reference comparison, Coach root-depth probing, and equal-depth Coach child-search confirmation with a real gap. External-only SF19 disagreement is useful upstream evidence, but not enough for an engine candidate.
- Stop condition: continue looping until one narrow candidate is accepted, the chosen evidence source is exhausted, or a true blocker requires Sir Slice.
- Next targets: inspect unprocessed/current-baseline evidence candidates first; if none are clearly current and comparable, build a targeted SF19 diagnostic packet rather than reusing stale ShallowBlue/STS sources.

## 2026-10-05 - Benchmark Corpus SF19 Diagnostic

- Status: diagnostic
- Commit: `2b70704`
- Run: `analysis-runs\benchmark-corpus-sf19-diagnostic-20261005`
- Motivation: use a materially different local evidence source after ShallowBlue sampled openings, SF19 anchor openings, and Lucas STS rows were exhausted under the confirmed-child gate.
- Packet: 20 six-field FENs from `tests\data\search_benchmark_corpus.json`, excluding `startpos`.
- SF19 comparison: `sf19-d8\20261004-203639` analyzed all 20 positions at fixed depth 8. High-diff different-move rows included `quiet-open`, `game4`, `in-check-tactical`, `swing-game95-kc3-after`, `swing-game36-rxh2-after`, and `swing-game92-qba1-after`; mate-class rows included `queen-rook-mate` and `promotion-race`.
- Confirmed child-search: `reference-child-search-d8-confirm-d10` audited 8 high-diff rows and kept 0 candidates. Rejections were `gap<100=7`, `confirm-gap<100@d10=1`, and `mate-root-score=2`.
- Root triage: `triage-d681012` classified 17/20 as `all-tied`, 2/20 as `mate-horizon-flip`, and 1/20 as `candidate-review` (`quiet-defense`, but Coach and SF19 agreed on the move and the row was mate-row contaminated).
- Decision selector: `decision-candidates-confirmed` selected 0/20. Top non-mate different-move rows all failed the child/root gates: `quiet-open` child gap `-101cp`, `game4` gap `45cp`, `in-check-tactical` gap `-9cp`, `swing-game36-rxh2-after` gap `-19cp`, and `swing-game92-qba1-after` gap `0cp`.
- Decision: no engine candidate from the benchmark corpus. This confirms the current pattern on a different source: SF19 root disagreements and eval-scale gaps exist, but Coach equal-depth child-search and root triage do not expose a narrow missing move.
- Next targets: continue the active goal with a new evidence policy that can create non-tied before-move rows, not another static corpus sweep. Best next local process idea is to build a selector/generator that samples positions where Coach root band is already wide at shallow depth, then compares only those against SF19; otherwise ask Sir Slice for a fresh match from a different opening policy/opponent/time control.

## 2026-10-05 - Exact Root-Tie Verification Candidate

- Status: rejected
- Commit: n/a
- Tooling: `tools\select-root-spread-fens.mjs`
- Run: `analysis-runs\root-spread-corpus-scan-20261005`
- Motivation: after repeated broad-tie failures, add a root-spread selector that only emits triaged positions whose deepest Coach root table is `spread`, has at least 100cp band, at most 3 top ties, no mate rows, and is a before-move row.
- Evidence packet: scanning the 20 most recent `fen-triage.json` artifacts found 5 unique before-move root-spread FENs. SF19 depth-10 comparison found two different-move rows: `game16-ply186-Kg8-before` and `game12-ply100-f4-before`.
- Confirmed child-search: `reference-child-search-d10-confirm-d12` kept 1/2 rows. `game12-ply100-f4-before` (`8/8/1k1Bp3/1P2Pp1p/2K4P/8/5P2/8 b - - 2 50`) had Coach `b6b7`, SF19/reference `f5f4`, and confirmed child gap 433cp. `game16-ply186-Kg8-before` rejected with gap 0cp.
- Root-bound diagnosis: `root-bound-pairs-d12` classified `game12-ply100-f4-before` as `bound-like-root-tie` and `coach-child-confirms-external`, with root gap 0cp, child gap 638cp, and external gap 433cp.
- Code change: root tie verification now records verified scores for every tied root move, not only the selected move, and uses exact verified score ordering (`ROOT_TIE_VERIFY_SCORE_TOLERANCE = 0`) so an 8cp verified improvement is not overridden by the old king-move tie preference.
- Sentinel: `tests\root_tie_verification.test.mjs` now asserts that the FEN above chooses `f5f4` at depth 10 and that the top root row agrees with the published best move.
- Verification: focused tests passed (`tests\root_tie_verification.test.mjs`, `tests\select_root_spread_fens.test.mjs`, `tests\root_bound_pairs.test.mjs`, `tests\external_child_search_verifier.test.mjs`); `tests\engine_regressions.test.mjs` passed 64/64 with 67 skipped; `tests\uci.test.mjs` plus `tests\time_management_candidate.test.mjs` passed 60/60; `stability-short` exact identity passed on 4/4 primary positions with candidate 0.789% slower overall.
- Candidate check: post-patch SF19 depth-10 rerun changed `game12-ply100-f4-before` from Coach `b6b7` to `f5f4`, matching SF19. The only remaining different-move row, `game16-ply186-Kg8-before`, still rejects with child gap 0cp.
- Smoke: `analysis-runs\candidate-root-tie-exact-score-shallowblue1618-20g-5m0-20261005`, Coach vs ShallowBlue 1618 5+0, 20 games, 4 concurrent, seed `26092501`: `10 - 7 - 3 [0.575]`. Coach as White `2 - 6 - 2 [0.300]`; Coach as Black `8 - 1 - 1 [0.850]`.
- Smoke mining: 20/20 games mined, 1822 Coach moves scored, 19 swings selected: 9 entered-losing-mate and 10 centipawn-drop records. Worst rows included `game3-ply179-Kf8`, `game3-ply177-Kg7`, `game16-ply196-Kc3`, `game1-ply135-Ke1`, and `game15-ply199-Kb2`.
- Decision: rejected. The local sentinel and exact-identity stability-short were good, but the 20-game ShallowBlue smoke regressed below the accepted `12 - 7 - 1 [0.625]` baseline. The engine change was reverted; keep the root-spread selector tooling for future evidence generation.
- Next targets: mine the rejected smoke only as evidence for future candidates. Do not reapply exact root-tie tolerance without a narrower trigger that avoids the White-side collapse seen in this smoke.

## 2026-10-05 - Wide Root-Spread Corpus Scan

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\root-spread-corpus-scan-wide-20261005`
- Motivation: after rejecting the exact root-tie verification candidate, broaden the new root-spread selector across all existing `fen-triage.json` artifacts rather than only the first recent slice.
- Selection: strict root-spread gate (`candidate-review`, before-move only, band >=100cp, top ties <=3, mate rows 0) found 12 unique FENs after excluding the rejected `game12-ply100-f4-before` FEN.
- SF19 comparison: `merged-root-spread\sf19-d10\20261004-225713` analyzed 12/12 at depth 10. Different-move rows were `game16-ply186-Kg8-before`, `game7-ply187-Ke1-before`, `game11-ply177-Kg8-before`, `game10-ply164-Kxh6-before`, and `game6-ply180-Kc6-before`.
- Confirmed child-search: `reference-child-search-d10-confirm-d12` audited 5 rows and kept 0 candidates. Child gaps were `0cp`, `-2cp`, `-30cp`, `-151cp`, and `-605cp`.
- Decision: no candidate from the wider existing root-spread corpus. The selector remains useful, but current local triage artifacts are exhausted under the confirmed child-search gate.
- Next targets: require genuinely new evidence, preferably a different opening/opponent/time-control policy or a diagnostic that generates fresh non-flat before-move rows; do not repeat another scan of the same existing triage corpus.

## 2026-10-05 - Rejected-Smoke Current-Engine Swing Review

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-root-tie-exact-score-shallowblue1618-20g-5m0-20261005\current-engine-before-only`
- Motivation: use the rejected exact-root-tie smoke as new played evidence, but analyze the mined positions with the current reverted engine rather than the rejected candidate behavior.
- Source: 18 before-move FENs from `swing-mining\coach-swing-targets.fens`, excluding the pathological/stalling `game19-ply155-Ke6-before`; after-position rows were excluded.
- SF19 comparison: `sf19-d8\20261004-230717` analyzed 18/18. Most worst rows were mate-class same-move or already-lost king-move endgames. Different-move rows included `game19-ply149-Ke4-before`, `game16-ply188-d4-before`, and `game13-ply177-Kb6-before`.
- Confirmed child-search: `reference-child-search-d8-confirm-d10` audited 5 high-diff different-move rows and kept 0 candidates. Non-mate child gaps were only 6cp, 15cp, and 10cp; mate-class rows had 0cp gap.
- Decision selector: `decision-candidates-confirmed` selected 0/18.
- Decision: no candidate from the failed-smoke swing evidence. The failed match is useful as rejection evidence for the exact-root-tie candidate, but its mined positions do not expose a new clean current-engine child-gap target.
- Next targets: stop mining this failed smoke for candidates. Next progress requires a fresh evidence policy, not repeated analysis of this same failed-candidate match.

## 2026-10-05 - Fresh SF19 2400 Fixed-1s Diagnostic Match

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005`
- Setup: Coach vs Stockfish 19 limited to 2400 Elo, 20 games, fixed `st=1`, 4 concurrent, `-repeat`, seed `26092501`.
- Result: Coach vs Stockfish 19 2400: `5 - 14 - 1 [0.275] 20`; Coach as White `2 - 7 - 1 [0.250]`, Coach as Black `3 - 7 - 0 [0.300]`.
- Mining: 20/20 games mined, 1340 Coach moves scored, 39 swings. Selected 26 records / 52 FEN lines: 16 centipawn drops, 8 mate-score changes, and 2 entered-losing-mate rows.
- Before-only SF19 pass: `before-only\sf19-d8\20261004-232121` analyzed 26 before-move FENs. A filtered non-mate, high-diff, different-move packet contained 16 rows.
- Confirmed child-search: `before-only\reference-child-search-nonmate-d8-confirm-d10` audited 16 rows and kept 1 row: `game15-ply151-g8R-before` (`8/4N1P1/4KP1k/3R3P/2q5/8/8/8 w - - 17 76`), Coach `g7g8r`, SF19/reference `e6f7`, child gap 183cp. The other 15 rows rejected with `gap<100` or mate-root reasons.
- Follow-up triage: `keeper-game15-g8R\triage-d681012` showed `game15-ply151-g8R-before` as `early-spread-then-tie`; at depth 12 Coach's root best was already `e6f7`, with a broad tied root table and depth 11 reached under the 30s cap.
- Root-bound diagnostic: `keeper-game15-g8R\root-bound-pairs-d8` rejected the row as a patch target: root was already spread at depth 8, Coach child gap was `-60cp`, and classification was `coach-child-disagrees-with-external`, not `bound-like-root-tie`.
- Decision selector: `keeper-game15-g8R\decision-candidates-confirmed` selected 0 candidates. The kept child-search row failed due `triageClass=early-spread-then-tie`, `deepest=broad-tie`, and `topTies>4`.
- Time/depth: `time-depth\coach-time-depth-summary.md` confirms the fixed-1s match averaged depth 6.31 and ~0.86s per Coach move. The useful keeper appears to be a depth/time diagnostic rather than a narrow search/eval patch.
- Decision: no engine candidate from this SF19 diagnostic match. The evidence is useful and different from the exhausted ShallowBlue/STS/static corpora, but it still does not satisfy the active gate for a clean current-engine patch.
- Next targets: if pursuing this family, use it as time/depth targeting evidence only after collecting matching 5+0 or non-fixed-time examples. Do not patch from `game15-ply151-g8R-before` alone.

## 2026-10-05 - Depth-Flip Evidence Policy

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-depth-flip-fens.mjs`
- Motivation: pivot away from repeated sampled-opening ShallowBlue mining and look for positions where Coach's own deeper fixed-depth search disagrees with a shallower played match move by a real root-score gap. This directly tests the time/depth hypothesis before changing time management.
- Tool behavior: consumes `coach-time-depth-summary.json`, filters low-depth played moves, orders lowest depth / latest move / lowest estimated clock first, probes the played depth and a target deeper depth with a per-search deadline, and emits JSON/Markdown/FEN artifacts for rows where the deeper Coach root move beats the played move by at least the configured gap.
- Verification: `node --test tests\select_depth_flip_fens.test.mjs tests\select_root_spread_fens.test.mjs tests\select_decision_candidates.test.mjs` passed 4/4.
- Accepted-baseline check: `analysis-runs\depth-flip-baseline-shallowblue1618-5m0-20261005-endgame-d9-wide` audited 80 late-game moves from the accepted `fresh-evidence-shallowblue1618-20g-5m0-20261004b` 5+0 baseline and found 0 depth-flip candidates. This argues against broad time-management changes from the current accepted baseline alone.
- SF19 fixed-1s check: `analysis-runs\depth-flip-sf19-2400-st1-20261005-d9` audited 100 low-depth moves and found 3 depth-flip candidates. Root triage found `game4-ply68-b5` was mate-horizon contaminated, while `game7-ply77-Bxd4` and `game2-ply62-Rg6` were tied-table / depth-instability rows. SF19 depth-10 comparison and external child-search kept 0 candidates; `game7-ply77-Bxd4` collapsed to external child gap 3cp.
- Non-fixed ShallowBlue checks: `analysis-runs\depth-flip-fresh-shallowblue-20261004a-20261005` found 2 late-endgame candidates, `analysis-runs\depth-flip-shallowblue-pgnsuite-20260928c-20261005` found 1, and `analysis-runs\depth-flip-rootplateau-baseline-pgnsuite-20261005` found 0. Merged packet: `analysis-runs\depth-flip-nonfixed-shallowblue-merged-20261005`.
- Best non-fixed row: `game7-ply267-Kxf6` (`6r1/6K1/3kbp2/8/8/5p1p/5R2/8 w - - 46 134`) from 5+0 evidence flipped from played `g7f6` at depth 4 to `g7h7` by depth 7+. SF19 depth 10 also preferred `g7h7` over Coach `g7f6` with 590cp root eval difference, but external child-search rejected it with external child gap `-59cp`.
- Decision: no engine candidate accepted from depth-flip evidence yet. The policy produced better evidence than another identical sampled-opening pass, but current survivors still fail the active child-search confirmation gate.
- Next targets: keep `select-depth-flip-fens.mjs` as a reusable evidence selector. Further work should either generate more non-fixed 5+0 depth-flip evidence or calibrate why external root gaps are repeatedly collapsing at child-search before attempting a time-management patch.

## 2026-10-05 - Child-Search Collapse Calibration

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\summarize-child-search-collapses.mjs`
- Motivation: repeated candidate searches were producing large Coach/SF19 root eval gaps that collapsed under child-search. Add a durable calibration view before spending more cycles on the same failed evidence shape.
- Summary run: `analysis-runs\child-search-collapse-summary-20261005` scanned 39 verifier artifacts and 533 rows from `analysis-runs`.
- Results: 15 historical keepers, 15 near misses, and 5 active-gate-shaped Coach child-search keepers. Rejection counts were dominated by `gap<100=479`, `reference-not-in-top-12=75`, `mate-root-score=62`, and `external-gap<100=19`. Gap buckets were `<0=392`, `0-24=96`, `25-49=13`, `50-99=17`, and `>=100=15`.
- Active-gate keeper audit: all 5 active-gate-shaped rows were already accounted for by prior work. `game15-ply151-g8R-before` is a fixed-time depth/time diagnostic, not a patch target; `game12-ply100-f4-before` is the exact root-tie candidate rejected by ShallowBlue smoke; `game18-ply148-Ke5-before` collapses below gate at deeper child depth; `game15-ply91-Kc1-before` collapses to 0cp at equal-depth confirmation; the duplicate `game12-ply100-f4-before` is the same rejected root-tie row.
- Verification: `node --test tests\summarize_child_search_collapses.test.mjs tests\select_depth_flip_fens.test.mjs tests\select_root_spread_fens.test.mjs tests\select_decision_candidates.test.mjs` passed 5/5.
- Decision: no hidden historical candidate remains in the verifier artifacts. This quantitatively confirms the active blocker is not lack of root-gap rows; it is that root/external gaps almost always fail Coach child-search or deeper confirmation.
- Next targets: prioritize evidence that starts from Coach-confirmed child gaps or from a non-root-gap source. Do not run another broad SF-root disagreement pass unless it changes the upstream evidence policy.

## 2026-10-05 - Direct Diagnostic Anchor SF19 Pass

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\diagnostic-anchors-sf19-direct-20261005`
- Motivation: use the local diagnostic anchor suite directly as a different evidence source, rather than only via match seeds or the smaller benchmark corpus.
- Packet: 55 six-field FENs from `tests\data\diagnostic_anchors.json`, excluding `control-startpos` because `coach-analysis-lab` FEN-file mode expects six-field FEN rows.
- SF19 comparison: `sf19-d8\20261005-065303` analyzed 54/55 rows successfully at depth 8; one anchor (`arena-shallowblue-3sec-qxa6`) errored. High-diff rows included mate-heavy sentinels plus non-mate/control rows such as `arena-shallowblue-5min-g4`, `arena-shallowblue-3sec-kd7`, `control-castling-both`, `control-quiet-middlegame`, `control-open-file-pressure`, `control-pinned-piece`, and `arena-shallowblue-5min-ree1`.
- Confirmed child-search: `sf19-d8\20261005-065303\reference-child-d8-confirm-d10` audited 11 high-diff rows and kept 0 candidates. Rejections included `arena-shallowblue-5min-g4` gap `-5cp`, `arena-shallowblue-3sec-kd7` gap `0cp`, `control-castling-both` gap `-2cp`, `control-open-file-pressure` gap `-24cp`, `control-quiet-middlegame` gap `-92cp`, `control-pinned-piece` gap `-9cp`, `arena-shallowblue-5min-ree1` gap `-430cp`, and mate sentinel collapses.
- Decision: no engine candidate from direct diagnostic anchors. This source repeats the calibrated pattern: visible root/reference differences, but no Coach-confirmed child gap.
- Next targets: avoid more static SF19 comparison sweeps unless paired with a pre-filter that predicts Coach child-search support. Better next evidence source is a deliberately generated Coach-confirmed child-gap packet or a fresh played match policy designed to create non-flat before-move decision rows.

## 2026-10-05 - Coach Child-Gap-First Selector

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-coach-child-gap-fens.mjs`
- Motivation: after calibration showed SF/root disagreement rows usually collapse under Coach child-search, invert the evidence order. Start from Coach's own root table, child-search the current root best and top alternatives, and only keep rows where a non-root-best move beats the root best by at least 100cp in Coach child-search.
- Verification: `node --check tools\select-coach-child-gap-fens.mjs`; `node --test tests\select_coach_child_gap_fens.test.mjs` passed.
- Accepted-baseline pass: `analysis-runs\coach-child-gap-baseline-shallowblue1618-20261005-small` audited 20 before-position swing rows from the accepted `fresh-evidence-shallowblue1618-20g-5m0-20261004b` 5+0 baseline, using root depth 8, child depth 8, top 5 root moves, and 1500ms per child. It found 5 Coach child-gap candidates.
- Best rows from accepted baseline: `game15-ply155-Ka2-before` (`g2g4` root best vs `a3a2`, child gap 99048cp), `game20-ply106-Kc5-before` (`c6b6` vs `c6c5`, 98702cp), `game13-ply131-Kf3-before` (`f4g3` vs `f4f3`, 561cp), `game9-ply137-Kb5-before` (`c5c6` vs `c5d5`, 262cp), and `game12-ply90-Kc8-before` (`c7d8` vs `c3a2`, 241cp).
- Follow-up triage: `triage-d6-12` classified the five rows as `early-spread-then-tie=2`, `mate-horizon-flip=2`, and `all-tied=1`. `game15-ply155-Ka2-before` and `game13-ply131-Kf3-before` were deeper-depth root fixes but tied/broad-tied by depth 12; `game20-ply106-Kc5-before` and `game9-ply137-Kb5-before` became mate-horizon rows; `game12-ply90-Kc8-before` was all-tied.
- SF19 check: `sf19-d10\20261005-072041` completed 3/5 rows and SF19 agreed with Coach's deeper best on all completed rows: `game15-ply155-Ka2-before` -> `a3a2`, `game20-ply106-Kc5-before` -> `c6c5`, and `game13-ply131-Kf3-before` -> `f4f3`. The other two rows timed out/errored for Coach at depth 10.
- SF19 fixed-1s pass: `analysis-runs\coach-child-gap-sf19-st1-before-20261005-top10` audited the top 10 before rows from the fresh SF19 2400 fixed-1s diagnostic and found 0 Coach child-gap candidates.
- Decision: no engine candidate yet. The child-gap-first policy is a better upstream filter and did find real Coach-internal depth gaps, but the accepted-baseline survivors were depth/mate-horizon diagnostics or already corrected by deeper root search, not clean patch targets under the active gate.
- Next targets: keep this selector, but use it on better ordered packets or add progress/output controls before broad runs. Candidate work should focus on rows where the child-gap-first selector finds a non-mate, non-tied candidate that remains a different move at deeper root depths and does not already agree with SF19 by depth 10.

## 2026-10-05 - Stricter Goal Pivot: SF19/Diagnostic Evidence

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-coach-child-gap-fens.mjs`
- Goal note: the active goal remains open because no accepted candidate has landed. The next loop is sharpened around a different evidence source: targeted SF19 diagnostics or a cleaner opening/evidence policy, not another identical sampled-opening ShallowBlue pass.
- Tooling change: hardened `select-coach-child-gap-fens.mjs` with root and confirm-root search deadlines (`--max-ms-per-root`) plus confirm-root quality gates (`--min-confirm-root-band`, `--max-confirm-root-top-ties`). This prevents hard rows from stalling the loop and rejects broad/tied confirm roots explicitly.
- Verification: `node --check tools\select-coach-child-gap-fens.mjs`; `node --test tests\select_coach_child_gap_fens.test.mjs tests\select_depth_flip_fens.test.mjs tests\summarize_child_search_collapses.test.mjs` passed 3/3.
- Strict accepted-baseline rerun: `analysis-runs\coach-child-gap-baseline-shallowblue1618-20261005-filtered5` audited the five earlier child-gap-first rows with root depth 8, child depth 8, confirm-root depth 10, root/confirm band >=50cp, <=3 top ties, no mate rows, 1500ms child deadline, and 5000ms root deadline. It found 0 candidates.
- Strict rejection reasons: `game15-ply155-Ka2-before` failed because confirm root did not prefer the alternative; `game20-ply106-Kc5-before` failed mate/flat confirm root gates; `game13-ply131-Kf3-before` failed confirm-root preference, band, and top-tie gates; `game9-ply137-Kb5-before` and `game12-ply90-Kc8-before` failed root/confirm plateau and timeout gates.
- SF19 diagnostic selector rerun: `analysis-runs\diagnostic-anchors-sf19-direct-20261005\decision-candidates-filtered-20261005` applied the current decision-candidate gate to direct diagnostic-anchor SF19 results plus confirmed child-search. It selected 0 candidates from 55 positions.
- Decision: no candidate from this stricter SF19/diagnostic pivot yet. This is still progress: the loop now rejects the tempting child-gap rows with durable reasons and confirms the direct SF19 anchor packet has no clean non-mate Coach-confirmed target.
- Next loop target: generate or select positions that are likely to have Coach-confirmed child gaps before spending SF19/reference time. Avoid broad static SF19 sweeps unless they are pre-filtered by Coach root spread/child-gap evidence or come from a materially different played-opening policy.

## 2026-10-05 - Coach Root Worklist Evidence Generator

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\build-coach-root-worklist.mjs`
- Motivation: broad SF19/static sweeps keep collapsing under Coach child-search. Add a direct FEN-corpus scanner that starts from Coach root shape before expensive child-gap or SF19/reference passes: recursively scan `.fens` files, dedupe positions, exclude after-position labels, run bounded Coach root searches, and keep only non-mate rows with real root spread and limited top ties.
- Tooling change: added `--exclude-file-regex` after an initial broad scan wasted its budget on old `candidate-regressions.fens` packets. This lets future runs skip noisy historical folders while scanning current evidence.
- Verification: `node --check tools\build-coach-root-worklist.mjs`; `node --test tests\build_coach_root_worklist.test.mjs tests\select_coach_child_gap_fens.test.mjs` passed 3/3.
- Initial broad scan: `analysis-runs\coach-root-worklist-corpus-20261005` audited 180 positions but wrote 0 worklist rows. Rejections were dominated by `band<80=178`, `topTies>3=155`, and `rootTimed=105`; the scan was polluted by old 202607 candidate-regression packets.
- Recent SF19 fixed-1s scan: `analysis-runs\coach-root-worklist-sf19-st1-20261005` audited 26 positions from `fresh-evidence-sf19-2400-20g-st1-20261005` and wrote 5 worklist rows. Strict child-gap verification at root/child depth 7 with confirm-root depth 9 found 0 candidates; every row rejected with `gap<100` and/or confirm-root preference/band failure.
- Clean corpus scan: `analysis-runs\coach-root-worklist-corpus-clean-20261005` skipped `candidate-regressions`, audited 160 current/historical swing and diagnostic FENs, and wrote 15 root-worklist rows. Strict child-gap verification found one survivor: `game17-ply137-Nf2-before` (`8/8/8/1p2k2p/1n4p1/1P2ppP1/8/4K2N w - - 1 69`), where depth-7 root preferred `e1f1` but child/confirm-root preferred `e1d1` with a huge apparent gap.
- Depth probe: `probe-root-depths` on `game17-ply137-Nf2-before` showed this is not a clean non-mate candidate. Root best oscillated (`e1d1`, `e1f1`, `h1f2`) and by depth 10-12 all plausible moves collapsed into losing mate-class scores: depth 10 had `e1d1 -99988`; depth 11 had `e1d1 -99988`, `e1f1 -99990`; depth 12 had `h1f2 -99986`, `e1f1 -99986`, `e1d1 -99988`.
- Decision: reject the survivor as a mate-horizon/endgame-loss artifact. Do not patch from it. The new worklist process is useful because it found and then safely killed a plausible row before engine-code changes, but this evidence path has not produced an acceptable candidate yet.
- Next targets: use `build-coach-root-worklist.mjs` as an upstream queue builder for fresh evidence, preferably from a materially different played-opening policy or a targeted SF19 diagnostic set. For existing local corpora, require a survivor to remain non-mate through deeper root probes before entering SF19/reference or engine-candidate work.

## 2026-10-05 - Automated Non-Mate Screen for Child-Gap Survivors

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-coach-child-gap-fens.mjs`
- Motivation: the root-worklist loop found a plausible child-gap survivor, but manual depth probing showed it was mate-horizon contamination. Add the deeper non-mate screen directly to the selector so this class of false candidate is rejected before any engine patch work.
- Change: added optional `--nonmate-check-depth <n>` to run a deeper root search only after a row has otherwise passed the child-gap and confirm-root gates. The row is rejected if the deeper search times out, exposes mate-class root rows, or no longer prefers the proposed alternative when `--require-confirm-root-different` is active.
- Verification: `node --check tools\select-coach-child-gap-fens.mjs`; `node --test tests\select_coach_child_gap_fens.test.mjs tests\build_coach_root_worklist.test.mjs` passed 3/3.
- Evidence rerun: `analysis-runs\coach-root-worklist-corpus-clean-20261005\child-gap-strict-d7d7-confirm9-nonmate12` reran the 15-row clean-corpus worklist with root/child depth 7, confirm-root depth 9, and non-mate check depth 12. It selected 0 candidates.
- Key rejection: the previous survivor `game17-ply137-Nf2-before` now rejects automatically with `nonmateCheckMateRows` and `nonmateCheckDoesNotPreferAlternative`; its apparent child gap remained 98461cp, but the deeper root screen correctly classifies it as mate-horizon contamination.
- Decision: keep the non-mate screen as a final candidate gate. It is too expensive for first-pass scans, but it prevents a known false-positive class from reaching engine-candidate work.
- Next targets: apply `build-coach-root-worklist.mjs` plus `select-coach-child-gap-fens.mjs --nonmate-check-depth` to fresh evidence only. Existing local corpora now have no clean non-mate child-gap candidate under this stricter gate.

## 2026-10-05 - Candidate Discovery Pipeline Wrapper

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\run-candidate-discovery-pipeline.mjs`
- Motivation: the current best process is useful but had too much manual glue: build a Coach root-worklist, feed it to strict child-gap verification, then apply the deeper non-mate screen. Add a one-command wrapper so fresh evidence can be processed consistently without hand-copying commands.
- Change: added a pipeline wrapper that runs `build-coach-root-worklist.mjs`, then runs `select-coach-child-gap-fens.mjs` on the resulting `coach-root-worklist.fens` with confirm-root and non-mate-depth gates, and writes combined JSON/Markdown summary artifacts.
- Verification: `node --check tools\run-candidate-discovery-pipeline.mjs`; `node --test tests\run_candidate_discovery_pipeline.test.mjs tests\build_coach_root_worklist.test.mjs tests\select_coach_child_gap_fens.test.mjs` passed 4/4.
- Smoke run: `analysis-runs\candidate-discovery-pipeline-sf19-st1-20261005` processed `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005` with worklist depth 7, child depth 7, confirm depth 9, and non-mate depth 12. It produced 5 root-worklist rows and 0 strict child-gap candidates, matching the previous manual result.
- Decision: keep the wrapper as the standard first command for new evidence folders. It does not find a candidate by itself, but it reduces repeated manual process and prevents known bad evidence shapes from reaching patch work.
- Next targets: use this pipeline on the next fresh match/evidence policy. If it produces 0 candidates repeatedly across genuinely new evidence families, then the loop should pivot away from candidate fishing and toward a deeper eval/search-calibration investigation into why Coach child-search disagrees with SF19/reference on tactical branches.

## 2026-10-05 - Diagnostic Anchor Pipeline Rerun

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\candidate-discovery-pipeline-diagnostic-anchors-20261005`
- Source: `analysis-runs\diagnostic-anchors-sf19-direct-20261005`, the direct diagnostic-anchor packet of 55 curated FEN rows.
- Pipeline: `tools\run-candidate-discovery-pipeline.mjs` with worklist depth 7, child depth 7, confirm-root depth 9, non-mate depth 12, min root band 50cp, max top ties 4, and min child gap 100cp.
- Result: audited 55 positions, wrote 1 root-worklist row, and selected 0 strict child-gap candidates.
- Sole worklist row: `arena-shallowblue-5min-g4` (`6k1/7p/4K3/6p1/5r2/8/8/8 b - - 1 72`) rejected with `gap<100`, `confirmRootDoesNotPreferAlternative`, and `confirmRootBand<50`; best alternative gap was 0cp.
- Decision: no engine candidate from direct diagnostic anchors under the current stricter gate. This confirms the previous direct-anchor SF19 result with the newer automated pipeline: the family has at most one non-flat Coach-root row, and it fails Coach child/confirm support.
- Next targets: do not keep reprocessing the static diagnostic-anchor packet. The next useful path is either fresh played evidence with a different opening policy or a calibration investigation into why SF19/root disagreements collapse under Coach child-search.

## 2026-10-05 - External-vs-Coach Child Disagreement Calibration

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\summarize-external-child-disagreements.mjs`
- Motivation: repeated evidence sources now show the same failure pattern: SF19/external child-search can prefer the reference branch by 100cp+, while Coach's equal-depth child-search either stays flat or prefers Coach's branch. Add a corpus-level view of that pattern so it can guide calibration work instead of being scattered across root-bound pair artifacts.
- Verification: `node --check tools\summarize-external-child-disagreements.mjs`; `node --test tests\summarize_external_child_disagreements.test.mjs` passed 2/2.
- Run: `analysis-runs\external-child-disagreement-summary-20261005`, scanning all existing `root-bound-pairs.json` artifacts under `analysis-runs`.
- Result: audited 7 pair rows across 4 files and found 6 external-only disagreements. The largest rows were:
  - `game3-before-8.Nxe5`: external gap 602cp, Coach child gap -76cp.
  - `game12-ply100-f4-before`: external gap 433cp, Coach child gap 8cp. This is the exact root-tie candidate already rejected by ShallowBlue smoke (`10 - 7 - 3 [0.575]` versus accepted `12 - 7 - 1 [0.625]`), so do not recycle it directly.
  - `game19-before-8.Re1`: external gap 350cp, Coach child gap -85cp.
  - `game15-ply151-g8R-before`: external gap 183cp, Coach child gap -60cp; already classified as fixed-time depth/time diagnostic, not a patch target.
  - `game20-before-9...Qe5`: external gap 110cp, Coach child gap -28cp.
  - `game9-before-8.Bf8`: external gap 103cp, Coach child gap -59cp.
- Decision: no engine candidate from these rows under the active gate because Coach child-search does not confirm them. However, this set is now the best calibration target for a separate investigation into why Coach undervalues SF19-backed tactical branches.
- Next targets: if continuing without fresh played evidence, use this calibration set to compare static eval and child PV features after the Coach move vs SF19/reference move. Treat any resulting eval/search idea as exploratory and still require the full active candidate gates before patching.

## 2026-10-05 - Static Eval Child Comparison

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\compare-static-eval-children.mjs`
- Motivation: the external-vs-Coach child disagreement audit found rows where SF19 strongly prefers the reference branch but Coach child-search is flat or points the other way. Compare Coach's static evaluation immediately after each child move to determine whether the disagreement starts in static eval or emerges during search/PV.
- Verification: `node --check tools\compare-static-eval-children.mjs`; `node --test tests\compare_static_eval_children.test.mjs tests\summarize_external_child_disagreements.test.mjs` passed 5/5.
- Run: `analysis-runs\static-eval-child-comparison-20261005`, using `analysis-runs\external-child-disagreement-summary-20261005\external-child-disagreements.json`.
- Result: analyzed 6 external-only disagreement rows.
- Static eval findings:
  - `game3-before-8.Nxe5`: external gap 602cp; Coach child gap -76cp; static gap 327cp. Static eval already sees a large part of SF19's preference for `d7e5`, mostly material (+300cp), but Coach child-search still reverses/loses it.
  - `game12-ply100-f4-before`: external gap 433cp; static gap only 23cp. This is the already-rejected exact root-tie smoke candidate; do not recycle directly.
  - `game19-before-8.Re1`: external gap 350cp; static gap -25cp.
  - `game15-ply151-g8R-before`: external gap 183cp; static gap -68cp.
  - `game20-before-9...Qe5`: external gap 110cp; static gap 0cp.
  - `game9-before-8.Bf8`: external gap 103cp; static gap -15cp.
- Decision: this is not a simple broad static-eval fix. Only `game3-before-8.Nxe5` has a strong static signal, while most residuals are large and point toward search/PV behavior or tactical horizon rather than static categories. No engine candidate yet.
- Next targets: inspect `game3-before-8.Nxe5` as the best calibration row because static eval and SF19 agree directionally, but Coach child-search contradicts them. A narrow follow-up should compare Coach PV/root rows after `d7b6` vs `d7e5` across child depths before considering any patch.

## 2026-10-05 - Child-Pair Depth Probe: game3-before-8.Nxe5

- Status: diagnostic
- Commit: n/a
- Tooling: `tools\probe-child-pair-depths.mjs`
- Run: `analysis-runs\child-pair-depths-game3-nxe5-20261005`
- Target: `game3-before-8.Nxe5` (`r1b1k2r/3nqpbp/p2p2p1/1p1QN3/4PB2/1BP5/P4PPP/R3K2R b KQkq - 1 8`), comparing Coach `d7b6` against SF19/reference `d7e5`.
- Motivation: this was the strongest calibration row: SF19 external child-search favored `d7e5` by 602cp, and Coach static eval also favored `d7e5` by 327cp, but Coach child-search at depth 7 favored/flattened toward `d7b6`.
- Depth trajectory:
  - Static eval: `d7e5` ahead by 327cp.
  - Child depths 1-3: `d7e5` remains slightly ahead (`+8cp`, `+42cp`, `+38cp`).
  - Child depth 4: Coach flips against `d7e5`; gap becomes `-123cp`.
  - Child depths 5-10: Coach stays against `d7e5` by roughly `-130cp` to `-69cp`.
- PV clue: after Coach's `d7b6`, depth 4+ chooses `d5c6` and line `d5c6 c8d7 e5d7 e7d7`, while after `d7e5`, Coach keeps `d5a8` lines. The disagreement therefore appears when Coach resolves the concrete `Qxc6`/recapture line, not at static eval or very shallow search.

## 2026-10-05 - Game3 Nxe5 Depth-7 PV Static Replay

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\pv-static-replay-game3-nxe5-depth7-20261005`
- Result: replayed the Coach child-search PVs from `game3-before-8.Nxe5` for Coach move `d7b6` and SF19/reference move `d7e5`.
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Evidence: the `d7b6` PV ends at root-side static eval `-68` after `...Nd7-c5`; the `d7e5` reference PV ends at root-side static eval `-485` after `...d5 Bxe5`. Earlier static eval immediately after the child move favored `d7e5` by `+327cp`, but Coach child search flips against it from depth 4 onward.
- Decision: no engine candidate. Treat this as a calibration target showing a deeper Coach PV disagreement with SF19, not as a clean static-eval miss or patchable candidate.
- Next targets: pivot to a different evidence source or stricter SF19 diagnostic set. Only patch when a non-mate decision survives SF19/reference comparison, Coach root-depth probing, and equal-depth Coach child-search confirmation with a real gap.

## 2026-10-05 - SF19 Midgame Material-Rich Diagnostic Pass

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\sf19-midgame-diagnostic-20261005\20261005-122035`; extraction `analysis-runs\first-disagreements-sf19-midgame-material-rich-20261005`; strict pipeline `analysis-runs\candidate-discovery-pipeline-sf19-midgame-material-rich-20261005`
- Result: generated a fresh SF19 depth-8 analysis from `fresh-evidence-sf19-2400-20g-st1-20261005\match.pgn`, targeting Coach moves only, fullmoves 8-35, sampled/capped at 60 analyzed positions.
- Evidence: material-rich first-disagreement extraction kept 13 true Coach/SF19 move disagreements with diff >=100cp, at least 16 pieces, and at least 2400cp non-pawn material. Examples included `game9-before-12.Bxe5`, `game4-before-14...Qg5`, `game14-before-10...Qxf6`, and `game15-before-8.O-O`.
- Gate result: strict Coach root worklist rejected all 13 rows with `band<50` and `topTies>4`; every row had root band `0` and top ties `8` at depth 7. Direct probing of `game9-before-12.Bxe5` confirmed Coach assigns identical scores to the top 8 moves through depths 4-8.
- Decision: no engine candidate. This is a cleaner negative result than the late-endgame SF19 pass: the blocker is Coach root plateau behavior on material-rich midgame disagreements, not lack of external disagreements.
- Next targets: improve candidate discovery around plateau diagnosis rather than loosening gates. A future patch should not revive broad root-tie verification; it needs a narrow root-plateau cause or an evidence path that produces non-plateau Coach child gaps.

## 2026-10-05 - SF19 Midgame Plateau Bypass and Reference Child Verification

- Status: diagnostic
- Commit: n/a
- Run: plateau bypass `analysis-runs\child-gap-sf19-midgame-plateau-bypass-20261005`; explicit Coach-vs-reference child verifier `analysis-runs\reference-child-sf19-midgame-plateau-20261005`; focused depth probe `analysis-runs\child-pair-depths-game3-bb5-sf19-midgame-20261005`
- Result: bypassed the root-worklist band/tie gate and ran full Coach child searches on the 13 SF19 material-rich midgame disagreements. Also ran explicit Coach move vs SF19 reference move child verification on 15 raw disagreements from the same analysis.
- Evidence: root plateau rows were not hiding a qualifying Coach child-search gap. The plateau-bypass run found 0 candidates; every row failed `gap<100`. Explicit Coach-vs-reference verification also found 0 candidates; best positive row was `game3-before-10.Bb5` at +54cp for SF19's `f1b5` over Coach's `e5c4`.
- Focused probe: `game3-before-10.Bb5` across child depths 1-10 showed static gap +46cp, peak search gap +54cp at depth 6, then +4cp at depth 7 and +18cp at depths 8-10 under the 12s per-search cap. It does not satisfy the active equal-depth >=100cp gate.
- Tooling: `tools\verify-reference-child-search.mjs` now emits `gapClass` (`candidate`, `positive-subthreshold`, `flat`, `coach-favored`, `unknown`) so near misses are easier to separate from true candidates without changing candidate gates.
- Tests: `node --test tests\reference_child_search_verifier.test.mjs tests\extract_first_disagreements.test.mjs tests\probe_child_pair_depths.test.mjs tests\run_candidate_discovery_pipeline.test.mjs tests\select_coach_child_gap_fens.test.mjs` passed 10/10.
- Decision: no engine candidate. Do not patch from this SF19 midgame set; Coach's own equal-depth child search does not confirm SF19's preferred branches strongly enough.
- Next targets: move to a different evidence policy that can produce Coach-confirmed child gaps, such as stronger external-pair generation with direct reference-child verification first, or mine losing transitions from a played match where Coach's own depth progression flips by >=100cp.
- Decision: no engine candidate yet. This is a useful calibration row, but it does not satisfy the active candidate gate because Coach child-search still rejects the SF19 branch at practical depths. Do not patch from it directly.
- Next targets: if continuing calibration, inspect the depth-4 transition and quiescence/material accounting around the `d7b6 d5c6 c8d7 e5d7 e7d7` line versus the `d7e5 d5a8` line. Any idea from this must be treated exploratory and retested through the full candidate gates.

## 2026-10-05 - SF19 Low-Depth Flip Scan

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\depth-flip-sf19-midgame-lowdepth-20261005`
- Source: `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005\time-depth\coach-time-depth-summary.json`
- Result: audited 30 Coach moves from the SF19 fixed-1s match where the played search depth was at most 7, requiring shallow agreement and a depth-9 alternative gap of at least 100cp. It selected 0 candidates.
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Decision: no engine candidate. The existing SF19 fixed-1s time/depth evidence does not currently show a clean non-mate move where Coach's own deeper search flips by the required margin.
- Next targets: pivot to a different evidence policy instead of repeating this scan: mine played-match losing transitions, first-divergence packets, or external-pair rows only when Coach equal-depth child-search can confirm a real non-mate gap.

## 2026-10-05 - Confirmed Depth-Flip Gate

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-depth-flip-fens.mjs`
- Change: added optional `--confirm-depth <n|off>` so a low-depth/deeper-flip row only survives if the deeper preferred move still beats the played move at a second confirmation depth by the same minimum gap.
- Motivation: unconfirmed depth-flip scans produced tempting one-depth late-endgame rows that collapsed when probed deeper.
- Evidence: `analysis-runs\depth-flip-fresh-shallowblue-20261004a-confirm12-20261005` audited 80 low-depth moves from `fresh-evidence-shallowblue1618-20g-5m0-20261004a` and selected 0 candidates. The two previous promotion rows both failed confirmation: `game19-ply205-Ka1` confirmed gap 0cp at depth 11, and `game19-ply217-Ka2` confirmed gap -145cp at depth 12.
- PGN-suite check: the previous `fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c` survivor `game7-ply267-Kxf6` (`6r1/6K1/3kbp2/8/8/5p1p/5R2/8 w - - 46 134`) was manually probed through depth 10. The depth-7 `g7h7` preference disappeared at depths 8-9 and reversed by depth 10, with `g7f6` better than `g7h7`; not a clean candidate.
- Tests: `node --test tests\reference_child_search_verifier.test.mjs tests\extract_first_disagreements.test.mjs tests\probe_child_pair_depths.test.mjs tests\run_candidate_discovery_pipeline.test.mjs tests\select_coach_child_gap_fens.test.mjs tests\select_depth_flip_fens.test.mjs` passed 11/11.
- Decision: no engine candidate from these depth-flip rows. Keep the confirmation gate as a required filter before treating low-depth played-match flips as candidates.
- Next targets: pivot to a materially different source, such as Lucas STS misses or another curated tactical packet, then require SF19/reference comparison plus Coach equal-depth child confirmation before patching.

## 2026-10-05 - Depth-Flip Reporting Refinement

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\select-depth-flip-fens.mjs`
- Change: added rejection counts, preliminary-candidate counts, and optional `--progress` output to make long confirmed depth-flip scans auditable while they run.
- Verification: focused diagnostic stack passed 11/11 after the change. Real-data smoke `analysis-runs\tool-smoke-depth-flip-progress-20261005` audited 5 low-depth ShallowBlue 5+0 moves with `--progress` and selected 0 candidates while printing per-row rejection reasons.
- Decision: no engine candidate; this is process hardening so future depth/time evidence does not waste hours on silent one-depth artifacts.
- Next targets: use the progress/reporting path only for genuinely new played evidence. Existing STS, benchmark corpus, diagnostic-anchor, SF19 midgame, and current ShallowBlue depth-flip artifacts are already exhausted under the active gates.

## 2026-10-05 - PGN Root-First SF19 Anchor-Opening Scan

- Status: diagnostic
- Commit: n/a
- Source: `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004\match.pgn`
- Extraction: `analysis-runs\pgn-rootfirst-sf19-anchor-openings-20261005\20261005-200941`
- Result: extracted 140 Coach-side before-move positions from the 44-game SF19 anchor-opening fixed-1s match using `coach-analysis-lab` in cheap Coach-only depth-1 mode, fullmoves 8-45, sample-every 3, max 4 per game.
- Strict root-first pipeline: `analysis-runs\candidate-discovery-pipeline-pgn-rootfirst-sf19-anchor-openings-20261005` audited all 140 positions at Coach root depth 7 with band >=80cp, top ties <=3, mate rows 0, and found 0 root-worklist rows. Rejections were dominated by `band<80=136` and `topTies>3=126`.
- Loose-band follow-up: `analysis-runs\candidate-discovery-pipeline-pgn-rootfirst-sf19-anchor-openings-looseband-20261005` lowered the root band to 20cp while keeping top ties <=4. It found 3 root-worklist rows (`game25-before-8.Kg1`, `game7-before-8.c6`, `game28-before-11...h5`) and 0 child-gap candidates.
- Survivor rejections: all 3 failed `gap<100` and `confirmRootDoesNotPreferAlternative`; confirm-root also collapsed below the loose band and/or into too many top ties. Best alternative gaps were `-489cp`, `-29cp`, and `-11cp`.
- Decision: no engine candidate. This different upstream policy confirmed the same pattern: even when PGN extraction starts from Coach root shape instead of SF19 disagreement, the anchor-opening packet is dominated by root plateaus and the few low-band rows do not survive child/confirm gates.
- Next targets: do not repeat this anchor-opening PGN packet. Further progress likely requires either fresh played evidence from a materially different opening/opponent/time-control policy, or a deeper calibration/tooling pass focused on why Coach root search produces broad equal-score plateaus in so many non-mate middlegame positions.

## 2026-10-05 - Root Plateau Child-Score Audit

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\audit-root-plateau-child-scores.mjs`
- Motivation: recent SF19 and PGN-root-first passes repeatedly rejected positions because Coach root tables were all-tied or broad plateaus. Add a focused audit that takes the top root-table moves, searches each as a full-window child, and classifies whether the plateau is true-flat or hiding meaningful child-score spread.
- Verification: `node --test tests\audit_root_plateau_child_scores.test.mjs tests\select_coach_child_gap_fens.test.mjs tests\run_candidate_discovery_pipeline.test.mjs tests\select_depth_flip_fens.test.mjs tests\reference_child_search_verifier.test.mjs` passed 7/7.
- Run: `analysis-runs\root-plateau-child-audit-sf19-midgame-material-rich-20261005`, auditing the 13 material-rich SF19 midgame first-disagreement rows from `analysis-runs\first-disagreements-sf19-midgame-material-rich-20261005`.
- Result: 13/13 rows classified as `hidden-child-spread`. The root table band was 0cp on every row, but full-window child scores showed 181cp to 1049cp spread.
- Key interpretation: the plateau is not because Coach's full child searches truly see all top moves as equal. Root reporting/score storage is flattening these rows, but current root ordering still placed the full-window child-score best move first on all 13 audited positions. Examples: `game3-before-10.Bb5` root band 0cp, child scores `f1b5:161`, `e5c4:139`, `e5g4:136`; `game9-before-12.Bxe5` root band 0cp, child scores `f4e5:4`, `d4e5:-116`, `d2e4:-154`; `game14-before-10...Qxf6` root band 0cp, child scores `d8f6:-6`, `g7f6:-68`, `c6e5:-798`.
- Decision: no engine candidate. This explains why the SF19 midgame rows failed the active gate despite root-table flatness: the full-window child signal exists, but it supports Coach's current root ordering rather than exposing a better move.
- Next targets: use this auditor to separate diagnostic/root-reporting artifacts from true move-choice candidates. A future root-score patch would need evidence that corrected child scores change a real move choice and still passes ShallowBlue smoke; do not patch merely to make root tables prettier.

## 2026-10-05 - Root Plateau Move-Choice Disagreement Scan

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\audit-root-plateau-child-scores.mjs`
- Change: extended the plateau auditor to classify `root-child-disagreement` when full-window child scoring prefers a different root move than the root table's top move by at least the configured margin.
- Verification: `node --test tests\audit_root_plateau_child_scores.test.mjs` passed.
- Run: `analysis-runs\root-plateau-child-audit-pgn-anchor-openings-20261005`, auditing the first 60 PGN-derived SF19 anchor-opening positions from `analysis-runs\pgn-rootfirst-sf19-anchor-openings-20261005\20261005-200941\candidate-regressions.fens`.
- Result: no `root-child-disagreement` rows at the 100cp threshold. Class counts were `hidden-child-spread=46`, `mate-child=9`, `child-spread=3`, and `true-flat=2`.
- Near misses: a few rows had child-best moves different from the root-table top move, but the gap versus the root-table top move was tiny, e.g. `game3-before-14.Qf6` +10cp, `game4-before-11...e5` +1cp, `game7-before-14.Na4` +10cp, `game9-before-11.Rd8` +5cp, `game10-before-8...Nd1` +4cp, `game10-before-14...Qe1` +14cp, `game11-before-17.Qa4` +24cp, and `game13-before-14.g4` +14cp.
- Decision: no engine candidate. Root-score flattening clearly makes diagnostics misleading, but current evidence still does not show a meaningful root move-choice error caused by that flattening.
- Next targets: use the disagreement classifier as a cheap stop rule on future plateau packets. Only consider a root-score/search patch if it finds a non-mate row where full-window child scoring prefers a different move by >=100cp and that preference survives confirmation.

## 2026-10-05 - Accepted-Baseline Plateau Disagreement Scan

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\root-plateau-child-audit-shallowblue-baseline-sf19-pipeline-20261005`
- Source: `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-20261004b\sf19-pipeline-m16-90-d8\20261004-073654\candidate-regressions.fens`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Result: audited 60 accepted-baseline ShallowBlue/SF19-pipeline rows at root depth 7 and child depth 7. Class counts were `hidden-child-spread=55`, `child-spread=2`, and `mate-child=3`; `root-child-disagreements.fens` was empty.
- Interpretation: the same root-table plateau pattern appears in accepted-baseline evidence, but full-window child scoring did not prefer a different move by the 100cp threshold. The largest repeated near-miss was `game5/7/9/11/15-before-24.Kg1`, where child scoring preferred `f2f4` over root-table `f1g1` by only 13cp.
- Decision: no engine candidate. This closes the accepted-baseline plateau-disagreement path unless future evidence produces a real non-mate move-choice disagreement.
- Next targets: pivot away from plateau-disagreement scans on existing ShallowBlue/SF19 packets. Better next loops are either fresh evidence with a different opening/time policy, or a targeted SF19 tactical diagnostic that starts from direct reference-child confirmation rather than root-table disagreement.

## 2026-10-05 - Reference-Child-First Diagnostic Gate

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\verify-reference-child-search.mjs`
- Motivation: pivot the loop away from repeated root-plateau fishing by starting from SF19/reference move pairs and requiring Coach's own equal-depth child search to confirm a real non-mate gap before a row can become an engine candidate.
- Anchor diagnostic pass: `analysis-runs\reference-child-sf19-anchor-diagnostics-d10-confirm12-20261005` audited 7 rows from `analysis-runs\sf19-anchor-diagnostics-20261004\sf19-anchor-d10\20261004-094925\results.json` with child depth 10, confirm depth 12, min diff 50cp, min gap 100cp, and root limit 8. It found 0 candidates; all rows failed `gap<100`, and 5/7 also had the reference move outside the top 8 root rows.
- Benchmark corpus pass: `analysis-runs\reference-child-benchmark-corpus-d8-confirm10-20261005` audited 8 rows from `analysis-runs\benchmark-corpus-sf19-diagnostic-20261005\sf19-d8\20261004-203639\results.json` with child depth 8, confirm depth 10, min diff 100cp, min gap 100cp, and root limit 8. It found 0 candidates.
- Wide-root follow-up: `analysis-runs\reference-child-benchmark-corpus-d8-confirm10-root20-20261005` briefly exposed `swing-game95-kc3-after` (`1RQ5/8/8/8/7r/P1K5/1P6/1k6 b - - 2 55`) as a possible row when root limit was widened to 20: Coach `b1a1`, reference `h4h2`, child gap 98740cp. Root-depth probing rejected it as a clean candidate because the position transitions into mate-class root/child scores by depths 9-10.
- Mate classification: Coach-only depth-10 run `analysis-runs\single-swing-game95-rootmate-depth10-20261005\20261005-213318` reported `b1a2` with mate -5 and PV `b1a2 c8e6 a2b1 e6e1 b1a2 e1h4 a2a1 c3b3 a1b1 h4h1`; PV replay `analysis-runs\pv-static-replay-swing-game95-rootmate-depth10-20261005` showed this is a mate-horizon/root-mate diagnostic, not a non-mate eval candidate.
- Tool hardening: `verify-reference-child-search.mjs` now rejects `mate-child-score` and `confirm-mate-child-score@dN` rows so mate-class child arithmetic cannot pass the active non-mate candidate gate. Hardened rerun `analysis-runs\reference-child-benchmark-corpus-d8-confirm10-root20-20261005-hardened` found 0 candidates and correctly rejected `swing-game95-kc3-after` with `mate-child-score`.
- Verification: `node --check tools\verify-reference-child-search.mjs`; `node --test tests\reference_child_search_verifier.test.mjs tests\summarize_child_search_collapses.test.mjs tests\run_candidate_discovery_pipeline.test.mjs` passed 7/7.
- Decision: no engine candidate accepted. The reference-child-first gate is useful and stricter, and it prevented a tempting mate-class false lead from entering the patch queue.
- Next targets: keep using the hardened gate for candidate intake. If continuing from this evidence family, either create a dedicated false-mate/PV-validity sentinel for mate-horizon rows or generate fresh non-mate paired positions where the reference move is in Coach's top root rows and both child searches stay below mate-class thresholds.

## 2026-10-06 - Hardened STS Reference-Child Intake

- Status: diagnostic/tooling
- Commit: n/a
- Run: `analysis-runs\reference-child-lucas-sts-d8-confirm10-root20-20261006-hardened`
- Source: `analysis-runs\lucas-sts-miss-packet-20261005\sf19-d8\20261004-194607\results.json`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Result: audited 11 Lucas STS rows with child depth 8, confirm depth 10, min diff 100cp, min gap 100cp, root limit 20, and mate-child filtering. It found 0 candidates.
- Rejections: every row failed `gap<100`; one row also had `reference-not-in-top-20`. Best positive subthreshold gaps were `lucas-g2-i69-Open-Files-and-Diagonals` at 33cp, `lucas-g8-i66-Advancement-of-f-g-h-Pawns` at 21cp, `lucas-g13-i93-Pawn-Play-in-the-Center` at 14cp, and `lucas-g2-i61-Open-Files-and-Diagonals` at 10cp.
- Tooling change: `verify-reference-child-search.mjs` now writes `reference-child-candidates.fens` and `reference-child-positive-subthreshold.fens` beside the JSON/Markdown audit. This makes the candidate funnel chainable and separates true non-mate candidates from calibration-only near misses.
- Verification: `node --test tests\reference_child_search_verifier.test.mjs tests\summarize_child_search_collapses.test.mjs tests\run_candidate_discovery_pipeline.test.mjs` passed 7/7.
- Decision: no engine candidate from the hardened STS intake. The curated STS packet is exhausted under the active non-mate, Coach-confirmed child-search gate.
- Next targets: use the near-miss FEN file only for calibration, not patching. Further candidate discovery should generate fresh non-mate paired positions or improve first-divergence extraction so the reference move starts inside Coach's root candidate set with a confirmed >=100cp child gap.

## 2026-10-06 - Hardened SF19 Anchor First-Disagreement Intake

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\reference-child-sf19-anchor-first-disagreements-d10-confirm12-root20-20261006`
- Source: `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004\first-disagreements-d10\20261004-184701\results.json`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Result: audited 13 SF19 anchor-opening first-disagreement rows with child depth 10, confirm depth 12, min diff 100cp, min gap 100cp, root limit 20, and 12s per child. It found 0 candidates.
- Rejections: every row failed `gap<100`; three rows also had `reference-not-in-top-20`. The only positive subthreshold row was `game8-before-9...Ne4`, where Coach `a1a3` vs reference `d2e4` had only an 8cp Coach child-search gap. All other rows were flat or Coach-favored under Coach child search.
- Global collapse summary: `analysis-runs\child-search-collapse-summary-after-hardened-intake-20261006` scanned 48 verifier artifacts / 619 rows and reported 16 historical keepers plus 16 near misses. The apparent active-gate keepers are already accounted for by earlier ledger entries: `game15-ply151-g8R-before` is fixed-time depth/time evidence, `game12-ply100-f4-before` is the rejected exact root-tie smoke candidate, `game18-ply148-Ke5-before` collapses at deeper follow-up, and `game15-ply91-Kc1-before` was already rejected by confirmation/deeper-root checks.
- Verification: `node --test tests\summarize_child_search_collapses.test.mjs tests\reference_child_search_verifier.test.mjs` passed 6/6.
- Decision: no new engine candidate. The SF19 anchor first-disagreement packet is exhausted under the hardened non-mate, Coach-confirmed child-search gate.
- Next targets: stop reusing existing SF19-anchor disagreement artifacts for candidate fishing. The next productive process step is fresh paired-position generation that pre-filters for reference move inside Coach root candidates and excludes mate-class child/root scores before expensive confirmation.

## 2026-10-06 - Reference-Child Intake Root Prefilter

- Status: tooling
- Commit: n/a
- Tooling: `tools\verify-reference-child-search.mjs`
- Motivation: the hardened verifier could still stall on expensive root searches before reaching the child-search gate. Add a bounded root-search path and optional root prefilter so fresh paired-position generation can reject rows where the reference move is outside Coach's root window or root scores are mate-class before spending child-search time.
- Change: added `--max-ms-per-root <ms>` and `--prefilter-root`. Root searches now honor a deadline when supplied, root timeouts are recorded as `root-timed`, and prefiltered rows record `prefilter-reference-not-in-top-N` or `prefilter-mate-root-score` reasons.
- Real-data smoke: `analysis-runs\reference-child-sf19-anchor-first-disagreements-prefilter-capped-d10-confirm12-root20-20261006` reran the SF19 anchor first-disagreement packet with 12s root and child caps. It completed with 0 candidates; the only positive subthreshold row remained `game8-before-9...Ne4` at 8cp. Three rows were skipped by `prefilter-reference-not-in-top-20`; 12 rows recorded `root-timed`, making the bounded nature of the audit explicit.
- Verification: `node --check tools\verify-reference-child-search.mjs`; `node --test tests\reference_child_search_verifier.test.mjs tests\summarize_child_search_collapses.test.mjs` passed 7/7.
- Decision: no engine candidate; this is intake hardening. Use the capped prefilter mode for new broad scans so they fail fast and produce machine-readable reasons instead of hanging.
- Next targets: generate fresh non-mate paired positions with `--prefilter-root`, root/child caps, and the existing mate-child filter; only chase rows in `reference-child-candidates.fens`.

## 2026-10-06 - Broad SF19 Anchor Paired-Position Intake

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\reference-child-sf19-anchor-wide-prefilter-capped-d8-confirm10-root20-20261006`
- Source: `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004\sf19-pipeline-wide-m8-120-d8\20261004-132209\results.json`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Result: audited the top 40 highest-diff different-move rows from the 237-position / 44-game SF19 anchor-opening packet using child depth 8, confirm depth 10, min diff 300cp, min gap 100cp, root limit 20, 10s root cap, 10s child cap, and `--prefilter-root`. It found 0 candidates.
- Rejections: every row failed `gap<100`; 14 rows were `prefilter-reference-not-in-top-20`, 3 rows were mate-root rows, and 1 row had a mate-child score. Root caps made the hard rows explicit with `root-timed=36`.
- Near misses: `reference-child-positive-subthreshold.fens` contains five calibration-only rows: `game13-before-15.Re3` at 29cp, `game10-before-9...exd5` at 2cp, `game6-before-9...Qd1` at 15cp, `game1-before-13.Rfe8` at 4cp, and `game6-before-10...Bh3` at 14cp. No row is close to the 100cp gate.
- Verification: `node --test tests\reference_child_search_verifier.test.mjs tests\summarize_child_search_collapses.test.mjs` passed 7/7.
- Decision: no engine candidate. The broad SF19 anchor-opening match evidence is exhausted under the capped, root-prefiltered, non-mate Coach-confirmed candidate gate.
- Next targets: do not run more passes over this same 44-game anchor match unless a new upstream selector is created. Next useful evidence should be genuinely fresh played data or a new paired-position generator that constructs non-mate decision points with the reference move already inside Coach's root candidate window.

## 2026-10-06 - Fresh SF19 Fixed-1s Paired-Position Intake

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\reference-child-fresh-sf19-st1-prefilter-capped-d8-confirm10-root20-20261006`
- Source: `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005\before-only\sf19-d8\20261004-232121\results.json`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Result: audited 18 high-diff different-move rows from the fresh SF19 2400 fixed-1s match using child depth 8, confirm depth 10, min diff 150cp, min gap 100cp, root limit 20, 10s root cap, 10s child cap, and `--prefilter-root`. It found 0 candidates.
- Rejections: 17/18 failed `gap<100`; 4 mate-root rows were prefiltered. The only row with an initial gap over 100cp was the already-known `game15-ply151-g8R-before` (`g7g8r` vs `e6f7`, gap 183cp), but it was rejected with `root-timed` and remains classified as fixed-time depth/time evidence rather than a stable non-mate patch candidate.
- Near misses: `reference-child-positive-subthreshold.fens` contains only `game17-ply163-Kc5-before` at 19cp and `game17-ply143-Kf5-before` at 74cp; both are calibration-only and below the active gate.
- Decision: no engine candidate. This played SF19 fixed-1s packet is also exhausted under the capped, root-prefiltered, non-mate Coach-confirmed gate.
- Next targets: stop reusing existing SF19 fixed-1s evidence for patch candidates. Either collect genuinely fresh played evidence or build a generator that actively searches for non-mate rows whose root searches complete under cap, reference move is inside Coach's root window, and child gap remains >=100cp through confirmation.

## 2026-10-06 - Consolidated Reference-Child Intake Tooling

- Status: diagnostic/tooling
- Commit: n/a
- Tooling: `tools\build-reference-child-intake.mjs`
- Motivation: existing hardened reference-child verification worked one `results.json` at a time, which made broad scans tedious and encouraged repeated fishing in already-exhausted packets. Add a consolidated intake that scans many analysis artifacts, applies a cheap Coach root gate first, keeps only rows where the reference move is inside Coach's root window, and writes a verifier-ready synthetic analysis packet.
- Change: new intake writes `reference-child-intake.json`, `reference-child-intake.md`, `reference-child-intake.analysis.json`, and `reference-child-intake.fens`. It supports root caps, file/label filters, and `--exclude-mate-comparisons` so active-goal scans can avoid mate-disagreement rows before child-search verification.
- Verification: `node --test tests\build_reference_child_intake.test.mjs tests\reference_child_search_verifier.test.mjs tests\run_candidate_discovery_pipeline.test.mjs` passed 8/8 after the initial tool add; `node --test tests\build_reference_child_intake.test.mjs tests\reference_child_search_verifier.test.mjs` passed 7/7 after the non-mate filter. Later, `--file-order name|mtime-desc|mtime-asc` was added so global scans can prefer newest artifacts instead of truncating in old 2026-07 folders; `node --test tests\build_reference_child_intake.test.mjs` passed 2/2.
- Global smoke: `analysis-runs\reference-child-intake-global-smoke-20261006` scanned 142 result files, audited 60 rows, selected 20 intake rows, then verified 20 rows at child depth 8 / confirm 10. It found 0 candidates; all rows failed `gap<100`, showing the first broad pass was dominated by mate-scale historical rows whose Coach child searches were flat or Coach-favored.
- Non-mate smoke: `analysis-runs\reference-child-intake-global-nonmate-smoke-20261006` scanned the same global root with `--exclude-mate-comparisons`, audited 80 rows, selected 20, and verified 20. It found 0 candidates; rejection counts were `gap<100=20`, with `root-timed=4` and `mate-child-score=1`. Best printed near rows remained below the gate, including `game2-before-35.Bf4` at 83cp and `game2-before-39.Kg3` at 66cp.
- Newest-first smoke: `analysis-runs\reference-child-intake-newest-nonmate-smoke-20261006` used `--file-order mtime-desc` plus `--exclude-mate-comparisons`, audited 80 newer rows, selected 20, and verified 20. It found 0 candidates. One row, `game19-ply205-Ka1`, had an initial depth-8 child gap of 179cp, but the verifier rejected it because the gap collapsed below 100cp at confirm depth 10.
- Decision: no engine candidate accepted. This is useful process progress: future broad evidence passes can now consolidate scattered analysis results into a single hardened verifier input without letting known mate-horizon rows consume the candidate queue.
- Next targets: use this tool on genuinely fresh SF19/ShallowBlue evidence or a curated new opening/evidence policy. Do not treat historical 2026-07 rows or already-ledgered accepted-baseline king endings as patch candidates unless they survive the full non-mate child-gap gate and a fresh root-depth probe.

## 2026-10-06 - game19-ply205-Ka1 Root-Child Disagreement Probe

- Status: rejected-candidate / diagnostic
- Commit: n/a
- Target: `8/6P1/5n2/1k6/8/p7/8/1K6 w - - 8 103`
- Evidence: `analysis-runs\reference-child-intake-newest-nonmate-smoke-20261006\verified-d8-confirm10` exposed `game19-ply205-Ka1` as a near-hit: Coach `b1a1`, reference `b1c2`, gap 179cp at child depth 8, rejected by `confirm-gap<100@d10`.
- Probe: `analysis-runs\child-pair-depths-game19-ply205-ka1-20261006` showed unstable child gaps by depth: 92cp at d6, -12cp at d7, 179cp at d8, -19cp at d9/d10, and 262cp at d11/d12.
- Plateau audit: `analysis-runs\root-plateau-child-audit-game19-ply205-ka1-d12-20261006` classified the FEN as `root-child-disagreement` at root depth 12 / child depth 12: root band 0cp, child band 412cp, root best `b1a1`, child best `b1c1`, gap vs root best 268cp.
- Candidate attempt: raising `ROOT_TIE_VERIFY_MAX_MOVES` from 6 to 8 was not enough to change the real root result. Adding a fresh TT for root-tie verification changed behavior broadly and broke existing sentinels (`root tie verification covers queen-rich low-piece endings` and `advanced-pawn quiet queen check is searched before promotion`), so that approach was reverted.
- Verification after revert: `node --test tests\engine_regressions.test.mjs tests\root_tie_verification.test.mjs tests\build_reference_child_intake.test.mjs tests\probe_child_pair_depths.test.mjs` passed 76, skipped 67, failed 0.
- Decision: no accepted engine candidate. This is a valuable diagnostic target showing a real full-child/root-table disagreement, but the obvious root-tie verification levers are either insufficient or too broad.
- Next targets: investigate why root-tie verification with the existing TT cannot reproduce the fresh per-child score spread, without clearing/replacing TT globally. Any future patch must preserve the two root-tie sentinels above and then pass the normal regression, stability, and ShallowBlue smoke gates.

## 2026-10-06 - Sparse Knight-Pawn Root-Tie Per-Move TT Isolation

- Status: accepted-narrow
- Commit: n/a
- Run: `analysis-runs\candidate-sparse-knightpawn-root-tie-shallowblue1618-20g-5m0-20261006`
- Result: Coach vs ShallowBlue 1618 `5+0`: `15 - 1 - 4 [0.850] 20`; Coach as White `7 - 1 - 2 [0.800]`, Coach as Black `8 - 0 - 2 [0.900]`.
- Target: `8/6P1/5n2/1k6/8/p7/8/1K6 w - - 8 103`
- Baseline: active published head `2b70704`; preserve ShallowBlue 1618 `5+0` baseline `12 - 7 - 1 [0.625]`.
- Change: in very sparse endings only (`nonPawnMaterial <= 1`), root-tie verification checks up to 8 tied moves and uses an isolated fresh TT per verified root move. This keeps the earlier broad fresh-TT idea out of queen-rich/advanced-pawn sentinels that it broke.
- Local result: depth-12 root probe now chooses `b1c2` at `-309cp` instead of plateauing on `b1a1`; the candidate audit `analysis-runs\root-plateau-child-audit-game19-ply205-ka1-candidate-d12-20261006` reports `child-spread=1` and no root-child disagreement.
- Tests: `node --test tests\root_tie_verification.test.mjs tests\engine_regressions.test.mjs` passed 72/72 with 67 skipped; `node --test tests\diagnose_root_tie_tt.test.mjs tests\build_reference_child_intake.test.mjs tests\probe_child_pair_depths.test.mjs tests\reference_child_search_verifier.test.mjs tests\summarize_child_search_collapses.test.mjs` passed 13/13.
- Stability: `analysis-runs\candidate-sparse-knightpawn-root-tie-stability-short-20261006` passed stability-short versus temporary worktree `analysis-runs\bench-baseline-2b70704`; SearchStable OK, tree shape unchanged, PV changes 0, root-order changes 0, candidate timing 1.063% faster.
- Mining: `swing-mining` found 13 swings over 1481 scored Coach moves: 1 entered-losing-mate, 2 centipawn drops, and 10 mate-score changes. The only loss was game 9 as White; repeated mate-score-change rows mostly came from won promotion races.
- Decision: accepted-narrow because the exact sentinel is fixed, focused and regression tests pass, stability-short is SearchStable, and the 20-game ShallowBlue 1618 `5+0` smoke improves over the active `12 - 7 - 1 [0.625]` baseline without match-score regression.
- Next targets: commit/push this candidate if Sir Slice wants to publish it; keep game9-ply139-Kg7 (`7R/2p2K2/8/p3r1k1/P7/5r2/1pp5/8 w - - 2 70`) as a future loss-mining target, not a blocker for this accepted candidate.

## 2026-10-07 - Published Sparse Root-Tie Follow-Up Matches

- Status: diagnostic / confidence check
- Commit: `3afde24`
- Gate run: `analysis-runs\coach-3afde24-shallowblue1618-20g-st3-gate-20261007`
- Gate result: Coach vs ShallowBlue 1618 fixed `st=3`: `10 - 8 - 2 [0.550] 20`; Coach as White `7 - 1 - 2 [0.800]`, Coach as Black `3 - 7 - 0 [0.300]`.
- Gate mining: 20 games mined, 1630 scored Coach moves, 19 swings: 5 entered-losing-mate, 10 centipawn drops, 2 mate-score changes. The gate passed Sir Slice's condition by a small margin, so the longer match was run.
- Long run: `analysis-runs\coach-3afde24-shallowblue1618-50g-5m0-seed26100751-20261007`
- Long result: Coach vs ShallowBlue 1618 `5+0`: `34 - 10 - 6 [0.740] 50`; Coach as White `14 - 8 - 3 [0.620]`, Coach as Black `20 - 2 - 3 [0.860]`.
- Long mining: 50 games mined, 3556 scored Coach moves, 35 swings: 9 entered-losing-mate, 10 centipawn drops, 10 mate-score changes.
- Decision: the original `15 - 1 - 4 [0.850]` smoke was not just a lone favorable datapoint; the independent 50-game `5+0` run with a different seed still stayed well above the active `12 - 7 - 1 [0.625]` baseline. The side split remains asymmetric: Coach is much stronger as Black than White in this sample.
- Next targets: mine/probe the long-run loss rows if starting a new improvement goal, especially `game15-ply273-Kg3`, `game15-ply275-Kh4`, `game33-ply199-Kh6`, `game33-ply201-Kh7`, and `game45-ply137-h7`.

## 2026-10-07 - ShallowBlue 50-Game Loss-Row First Pass

- Status: diagnostic
- Commit: `3afde24`
- Source: `analysis-runs\coach-3afde24-shallowblue1618-50g-5m0-seed26100751-20261007\swing-mining`
- Baseline: preserve `34 - 10 - 6 [0.740] 50` versus ShallowBlue 1618 `5+0`.
- Named mate-entry probes: `game15-ply273-Kg3`, `game15-ply275-Kh4`, `game33-ply199-Kh6`, `game33-ply201-Kh7`, and `game45-ply137-h7` were all mate-class/all-lost by shallow or moderate Coach depth. None exposed a non-mate saving move.
- Game33 precursor audit: `analysis-runs\game33-kingwalk-plateau-child-audit-20261007` audited four king-walk precursors at root/child depth 10. It found `child-spread=1`, `mate-child=2`, `true-flat=1`, and `disagreements=0`.
- Before-target audit: `analysis-runs\shallowblue50-before-targets-plateau-child-audit-d8-20261007` audited 29 before-position swing targets at root/child depth 8. It found 3 root-child disagreements, but deeper root probes rejected them as clean candidates: `game21-ply103-Kf5` preferred the played move again by depths 9-12, `game20-ply118-Kc6` remained all-losing/unstable, and `game33-ply175-Ka2` flattened by depth 12.
- Pipeline check: `analysis-runs\coach-3afde24-shallowblue50-before-only-candidate-pipeline-20261007` ran the strict before-only discovery pipeline over 23 unique before-position rows. It wrote 3 worklist rows and found 0 Coach child-gap candidates.
- Decision: no engine candidate from this first loss-row pass. The current 50-game swing packet is useful as evidence of remaining endgame/mate-horizon weakness, but it does not yet provide a clean Coach before-move decision point that survives root-depth probing and focused confirmation.
- Next targets: use a different selector or evidence source before patching, such as a Coach-as-White first-loss-transition extractor or an SF19/reference check on earlier game phases before these positions become all-lost.

## 2026-10-07 - ShallowBlue 50-Game Loss-Transition / SF19 Pass

- Status: diagnostic
- Commit: `3afde24`
- Source: `analysis-runs\coach-3afde24-shallowblue50-time-depth-20261007\coach-time-depth-summary.json`
- New tooling: `tools\select-loss-transition-fens.mjs` extracts earlier Coach-as-White loss transitions from the time/depth summary; `tools\compare-coach-sf19-diagnostics.mjs` compares Coach root choices against verified SF19 at `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe`.
- Verification: `node --test tests\select_loss_transition_fens.test.mjs` passed 2/2 after fixing the selector CLI main guard to use `pathToFileURL`.
- Strict transition pass: `analysis-runs\coach-3afde24-shallowblue50-loss-transitions-20261007` selected 14 Coach-as-White loss transitions with `min-drop=250` and `max-after-cp=-300`. The candidate pipeline over those rows wrote 0 worklist rows and found 0 child-gap candidates.
- Loose transition pass: `analysis-runs\coach-3afde24-shallowblue50-loss-transitions-loose-20261007` selected 26 transitions with `min-drop=150` and `max-after-cp=0`. The pipeline wrote one worklist row, `game29-ply107-Kh7`, but the child-gap confirmer rejected it because deeper root search did not prefer the alternative. Direct depth 4-10 probing showed Coach and SF19 both settle on `g6h7`.
- SF19 pass: `analysis-runs\coach-3afde24-shallowblue50-loss-transition-sf19-d10-20261007` compared 26 transition rows at Coach depth 8 / SF19 depth 10. It found one candidate-class disagreement, `game33-ply173-Kb3`, where Coach depth 8 preferred `c2b1` and SF19 preferred `c2b3`.
- Follow-up probe: direct Coach depth 4-12 probing of `game33-ply173-Kb3` rejected the row as a shallow-only ghost. Coach chooses `c2b3` at depths 4, 5, 7, and 9-12; only depth 8 briefly prefers `c2b1`. The match move itself was `c2b3` at a deeper reported search depth, so this is not a patch target.
- Extra probe: `game45-ply115-h5` was also checked through depths 8-12 after the SF19 table showed a shallow disagreement. The row is a broad tied losing-endgame table, not a clean Coach/SF miss; Coach returns to the played/SF move at depths 11-12.
- Decision: no accepted engine candidate from the current ShallowBlue 50-game loss-transition evidence. The late mate-entry rows, before-target rows, transition rows, and SF19 reference check have all failed to isolate a stable non-mate decision point from this match.
- Next targets: pivot to genuinely different evidence instead of another pass over the same ShallowBlue 50-game loss packet. Best next source is a targeted SF19 diagnostic set or fresh paired-position generation that prefilters for non-mate rows where the reference move is inside Coach's root window and the Coach child gap survives confirmation.

## 2026-10-07 - Extended Root-Tie Verification Candidate From SF19 Non-Mate Intake

- Status: rejected
- Commit baseline: `3afde24`
- Goal source: pivoted from exhausted ShallowBlue 50-game loss packet to a wider SF19/non-mate reference-child intake.
- Intake: `analysis-runs\reference-child-intake-sf19-nonmate-wide-20261007` scanned 568 files, skipped 352 non-JSON artifacts, audited 401 SF19-derived non-mate rows, and selected 60 rows where the reference move was inside Coach's root window.
- Verifier: `analysis-runs\reference-child-intake-sf19-nonmate-wide-verified-d8-confirm10-20261007` audited the top 40 rows at child depth 8 with confirm depth 10 and found one keeper: `game15-ply151-g8R-before` / `8/4N1P1/4KP1k/3R3P/2q5/8/8/8 w - - 17 76`. Coach/root move `g7g8r`; SF/reference move `e6f7`; confirmed child gap 183cp.
- Root/child audit: `analysis-runs\root-plateau-child-audit-game15-ply151-g8r-d10-20261007` classified the target as `root-child-disagreement`: root band 0cp, child band 1743cp, root best `g7g8r`, child best `e6f7`, gap vs root best 211cp.
- Direct probe: baseline depth 10 flattened the top root moves at 1869cp and chose `g7g8r`; depth 11 found `e6f7` mate-class. Child-pair probe `analysis-runs\child-pair-depths-game15-ply151-g8r-wide-sf19-20261007` showed the `e6f7` advantage appears at depths 8-10 and vanishes once both lines become mate-class at depths 11-12.
- Change: increased root-tie verification coverage from 6 to 8 tied moves for material-eligible extended endings (`nonPawnMaterial <= ROOT_TIE_VERIFY_MAX_NON_PAWN_MATERIAL`). This lets the verifier reach the 7th tied move `e6f7` without changing the sparse-ending isolated-TT condition.
- Sentinel: `tests\root_tie_verification.test.mjs` now checks that the target chooses `e6f7` at depth 10 and scores it above `g7g8r`.
- Verification: `node --test tests\root_tie_verification.test.mjs` passed 9/9; `node --test tests\engine_regressions.test.mjs` passed 64, skipped 67, failed 0; tooling tests `build_reference_child_intake`, `probe_child_pair_depths`, and `select_loss_transition_fens` passed 7/7.
- Stability: `analysis-runs\candidate-extended-root-tie-maxmoves-stability-short-20261007.json` vs baseline worktree `analysis-runs\bench-baseline-3afde24` was SearchStable OK with tree shape unchanged, PV changes 0, root-order changes 0, and candidate timing 0.720% slower.
- Extra local gates: `node --test tests\uci.test.mjs` passed 45/45; `node --test tests\time_management_candidate.test.mjs` passed 15/15; rerun of `node --test tests\root_tie_verification.test.mjs` passed 9/9.
- Smoke blocker: CuteChess exists at `<USERPROFILE>\AppData\Local\Programs\Cute Chess\cutechess-cli.exe`, but launching the 20-game smoke from Codex required elevated execution and was rejected by the app usage-limit gate. The run folder still has no `match.pgn` as of the local check.
- Smoke: `analysis-runs\candidate-extended-root-tie-maxmoves-shallowblue1618-20g-5m0-20261007` scored `8 - 9 - 3 [0.475] 20`; Coach as White `2 - 7 - 1 [0.250]`, Coach as Black `6 - 2 - 2 [0.700]`.
- Smoke mining: 20 games, 1212 scored Coach moves, 15 swings: 5 entered-losing-mate, 9 centipawn drops, 1 mate-score change. Worst rows included `game6-ply212-Kb8`, `game6-ply216-Kb6`, `game3-ply97-Rxg2`, `game5-ply139-Ka6`, and `game16-ply118-Rxa8`.
- Decision: rejected. The local sentinel was real, but broadening extended-ending root-tie verification to 8 tied moves regressed practical ShallowBlue 1618 `5+0` strength badly versus the accepted `34 - 10 - 6 [0.740] 50` follow-up baseline and introduced a poor mate/swing profile. Candidate code and sentinel were reverted; `node --test tests\root_tie_verification.test.mjs` passed 8/8 after revert, and the target returned to the published depth-10 root plateau (`g7g8r`, all top moves 1869cp).
- Known-bad idea: do not broadly increase extended-ending root-tie verification coverage from 6 to 8 tied moves, even when a single root/child disagreement is fixed. The root-verification family remains dangerous unless a much narrower trigger is found.
- Next targets: continue the SF19 non-mate intake but avoid this broad max-move lever. If revisiting `game15-ply151-g8R-before`, isolate a more specific mechanism than tied-move count, or treat it as depth/time evidence rather than an engine patch candidate.

## 2026-10-07 - SF19 Non-Mate Intake Max-60 Completion

- Status: diagnostic
- Commit baseline: `3afde24`
- Source: `analysis-runs\reference-child-intake-sf19-nonmate-wide-20261007`
- Run: `analysis-runs\reference-child-intake-sf19-nonmate-wide-verified-d8-confirm10-max60-postreject-20261007`
- Result: audited all 60 selected SF19-derived non-mate rows with child depth 8, confirm depth 10, min gap 100cp, root limit 24, and root/child caps. It found 0 candidates.
- Rejections: `gap<100=59`, `root-timed=28`, `mate-child-score=5`, `mate-root-score=3`, `prefilter-mate-root-score=3`, and `reference-not-in-top-24=2`.
- Near hits: the only candidate-class gap was the already-rejected `game15-ply151-g8R-before` (`g7g8r` vs `e6f7`, 183cp gap, ref rank 7, 15 root ties), rejected here by `root-timed` and rejected in practice by the failed broad max-move smoke. Subthreshold positives included `game6-ply118-Kh8-before` at 73cp, `game7-ply187-Ke1-before` at 40cp, `game17-ply163-Kc5-before` at 19cp, `game16-ply188-d4-before` at 15cp, and several <=13cp midgame rows.
- Verification: tooling tests `build_reference_child_intake`, `probe_child_pair_depths`, and `select_loss_transition_fens` passed 7/7 after this pass.
- Decision: current wide SF19 non-mate intake is exhausted for patch candidates under the confirmed child-gap gate. Do not rerun the same 60-row packet unless the verifier criteria change materially.
- Next targets: build a stricter fresh-position generator/source that excludes root-timed, low-material root-tie, mate-child, and gap-collapse families, preferably emphasizing middlegame/queen-rich rows where the reference move is already in Coach's root top 24 and both root and child searches complete under cap.

## 2026-10-07 - Clean-Middlegame SF19 Intake Filter Pass

- Status: diagnostic/tooling
- Commit baseline: `3afde24`
- Tooling: `tools\build-reference-child-intake.mjs` now supports `--min-total-pieces`, `--min-non-pawn-pieces`, and `--max-root-top-ties`; `tools\filter-reference-child-intake.mjs` can reuse a completed intake JSON to produce verifier-ready packets from otherwise-clean rows when only a cutoff changes.
- Strict run: `analysis-runs\reference-child-intake-sf19-cleanmid-20261007` audited 401 SF19-derived non-mate rows with at least 12 pieces, at least 6 non-pawn pieces, and at most 8 tied top root moves. It selected 3 rows.
- Strict verifier: `analysis-runs\reference-child-intake-sf19-cleanmid-verified-d8-confirm10-20261007` found 0 candidates. All 3 selected rows were Coach-favored in child search: gaps `-16cp`, `-73cp`, and `-79cp`.
- Loosened tie packet: `analysis-runs\reference-child-intake-sf19-cleanmid-ties16-20261007` reused the strict intake JSON and selected 12 otherwise-clean rows with at most 16 tied top root moves.
- Loosened verifier: `analysis-runs\reference-child-intake-sf19-cleanmid-ties16-verified-d8-confirm10-20261007` found 0 candidates. Best positive gap was only `13cp` on `game13-before-13.h5`; the rest were flat or Coach-favored.
- Verification: `node --test tests\build_reference_child_intake.test.mjs tests\filter_reference_child_intake.test.mjs` passed 4/4.
- Decision: the current historical SF19 non-mate intake family is exhausted under material-rich, bounded-tie, confirmed child-gap criteria. The stronger filters are useful process tooling, but they did not expose a patch candidate.
- Next targets: generate genuinely fresh evidence instead of re-filtering the same historical rows. Prefer a fresh SF19 diagnostic/opening policy that samples earlier middlegame positions and prefilters for completed roots, material richness, reference move in Coach top 24, bounded root ties, and positive child gap before spending time on deeper confirmation.

## 2026-10-07 - Fresh Diagnostic Anchor SF19 Pass

- Status: diagnostic/tooling
- Commit baseline: `3afde24`
- Source tooling: `tools\export-diagnostic-anchor-fens.mjs` exports filtered FEN packets from `tests\data\diagnostic_anchors.json`.
- Source: `analysis-runs\fresh-anchor-lucas-sf19-source-20261007\anchors.fens` exported 22 early-minor and Lucas regression anchors, excluding ShallowBlue endgames and control/sentinel rows.
- Analysis: depth-10 SF19 analysis was stopped because it bogged down on the third anchor; depth-8 analysis completed at `analysis-runs\fresh-anchor-lucas-sf19-source-20261007\sf19-d8\20261007-090403`.
- Strict intake: `analysis-runs\fresh-anchor-lucas-sf19-source-20261007\clean-intake-d8-20261007` used min diff 120cp, at least 12 pieces, at least 6 non-pawn pieces, and at most 16 tied top root moves. It selected 0 rows; the only audited row was rejected by `root-top-ties>16`.
- Lower-threshold intake: `analysis-runs\fresh-anchor-lucas-sf19-source-20261007\clean-intake-d8-mindiff80-20261007` used min diff 80cp and selected 0 rows; both audited rows were rejected by `root-top-ties>16`, with one also `root-timed`.
- Verification: `node --test tests\export_diagnostic_anchor_fens.test.mjs tests\filter_reference_child_intake.test.mjs tests\build_reference_child_intake.test.mjs` passed 5/5.
- Decision: curated early-minor/Lucas anchors are useful regression coverage, but they did not expose a clean SF19/Coach child-gap candidate under the current non-mate gate.
- Next targets: stop mining existing historical or curated packets for this goal. Generate genuinely fresh positions next: either a new SF19 match/diagnostic run through CuteChess, or a deterministic opening-continuation FEN generator that expands the curated opening suite into material-rich middlegames before running the same SF19 child-gap gate.

## 2026-10-08 - Generated Opening Continuation SF19 Pass

- Status: diagnostic/tooling
- Commit baseline: `3afde24`
- Source tooling: `tools\generate-opening-continuation-fens.mjs` creates deterministic legal continuations from 10 curated opening prefixes, branching early from Coach root choices and sampling material-rich middlegame positions.
- Source: `analysis-runs\generated-opening-continuations-fresh-20261007\positions.fens` generated 120 opening/middlegame FENs with at least 12 pieces and 6 non-pawn pieces.
- SF19 analysis: `analysis-runs\generated-opening-continuations-fresh-20261007\sf19-d8\20261007-091331` analyzed all 120 positions at depth 8 against verified SF19. It produced 29 non-mate best-move disagreements at or above 120cp.
- Strict intake: `analysis-runs\generated-opening-continuations-fresh-20261007\clean-intake-d8-20261007` selected 0 rows at Coach root depth 8; rejections were dominated by `root-top-ties>16=28` and `root-timed=21`.
- Cheaper-root intake: `analysis-runs\generated-opening-continuations-fresh-20261007\clean-intake-rootd6-20261007` selected 3 rows at Coach root depth 6: `ruy-lopez-line3-fm17-ply24`, `nimzo-indian-line4-fm23-ply36`, and `nimzo-indian-line2-fm19-ply28`.
- Child verifier: `analysis-runs\generated-opening-continuations-fresh-20261007\clean-intake-rootd6-verified-d8-confirm10-20261008` found 0 candidates. Gaps were `1cp`, `-28cp`, and `-39cp`, so none showed a meaningful Coach child-search miss.
- Verification: generator/tooling tests passed with `node --test tests\generate_opening_continuation_fens.test.mjs tests\export_diagnostic_anchor_fens.test.mjs tests\filter_reference_child_intake.test.mjs tests\build_reference_child_intake.test.mjs`.
- Decision: the generated opening-continuation source produced fresh material-rich disagreements, but no child-gap candidate. The method is useful for producing cleaner evidence, yet Coach's own child searches did not confirm a patchable miss in this sample.
- Next targets: change the fresh source policy rather than reusing this exact packet. Best next direction is to generate positions from SF19/reference-favored continuations or mixed Coach/SF branches, so the source is less dominated by Coach self-play plateaus before SF19 comparison.
## 2026-10-08 - Model Escalation Operating Rule

- Status: diagnostic
- Commit: n/a
- Run: n/a
- Result: n/a
- Baseline: accepted Coach baseline `3afde24`
- Tests: n/a
- Decision: Keep the current cost-efficient model for routine evidence generation, filtering, command building, ledger updates, and match mining. Escalate to a stronger model only when the work needs high-leverage reasoning: designing a narrow patch from ambiguous evidence, reviewing TT/root-tie/mate-score hypotheses, resolving competing candidate explanations, or making a final accept/reject call.
- Next targets: continue the active SF19 diagnostic goal; include this rule in successor goals when a new goal is created.

## 2026-10-08 - Generated Reference-Followup SF19 Pass

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\generated-reference-followups-fresh-20261008`
- Result: `sf19-d8-limit56\20261008-124034` analyzed 56 generated reference-followup FENs at depth 8; strict depth-8 intake selected 0; root-depth-6 intake selected 0.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: `node --test tests\generate_reference_followup_fens.test.mjs tests\generate_opening_continuation_fens.test.mjs tests\build_reference_child_intake.test.mjs tests\filter_reference_child_intake.test.mjs`
- Decision: Exhaust this evidence source for candidate purposes. The intake audited 32 non-mate/material-rich rows, but every row failed the bounded-root-tie gate (`root-top-ties>16=32` at root depth 6; depth 8 also had 30 tie failures and 25 root timeouts), so it does not provide a clean Coach-child-search candidate.
- Next targets: build a source that pre-filters for naturally separated Coach roots before SF19 comparison, instead of starting from SF19 disagreements and discovering Coach root tie pollution afterward.

## 2026-10-08 - Coach-Root-Separated Opening Source

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\coach-root-separated-source-20261008`
- Result: Coach-first root filter selected 7/120 generated opening-continuation FENs at root depth 6 with `root-top-ties<=16`; SF19 depth-8 comparison found 3 non-mate best-move disagreements over 120cp; intake selected 1 row.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: `node --test tests\filter_coach_root_separated_fens.test.mjs tests\generate_reference_followup_fens.test.mjs tests\build_reference_child_intake.test.mjs`
- Decision: Reject as a patch source. The single clean Ruy Lopez survivor (`r4rk1/2p2ppp/p1n4q/1pb1p3/4P3/1BB2N2/PP2QPPP/2KR3R w - - 1 17`) had SF19 `c1b1` vs Coach `e2d2`, but deeper Coach child verification produced `gap=-4cp`, so it is not a positive Coach-child-search miss.
- Next targets: apply Coach-first root separation to the generated reference-followup pool, then run SF19 only on those clean roots.

## 2026-10-08 - Coach-Root-Separated Reference-Followup Source

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\coach-root-separated-reference-followups-20261008`
- Result: Coach-first root filter selected 12/116 generated reference-followup FENs at root depth 6 with `root-top-ties<=16`; SF19 depth-8 comparison produced 6 non-mate best-move disagreements over 120cp; depth-8 intake selected 0; root-depth-6 intake selected 3.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: `node --test tests\filter_coach_root_separated_fens.test.mjs tests\generate_reference_followup_fens.test.mjs tests\build_reference_child_intake.test.mjs`
- Decision: Reject as a patch source. The three shallow survivors failed deeper child verification: Queen's Gambit `c5b6` vs `b7b6` gap `-30cp`; Nimzo `d8c8` vs `c7c6` gap `-36cp`; Nimzo `d5f5` vs `g4f3` gap `-11cp`.
- Next targets: switch to a Coach-depth-transition evidence source: find positions where Coach's own best move changes between shallow and deeper depths with bounded root ties, then use SF19 only to classify those transitions.

## 2026-10-08 - Future Opening-Structure Investigation

- Status: diagnostic
- Commit: n/a
- Run: n/a
- Result: n/a
- Baseline: accepted Coach baseline `3afde24`
- Tests: n/a
- Decision: Keep named-opening hardcoding out of Coach for now. Later, mine Coach match PGNs by color, opening family, and structural features, then consider evaluation/search improvements only if Coach shows a real strength pattern in structures such as open files, bishop pair, king safety, locked centers, IQP, or specific pawn skeletons.
- Next targets: revisit after the current SF19 diagnostic candidate search, especially if match evidence suggests Coach repeatedly succeeds or fails in a particular structure rather than a single tactic.

## 2026-10-08 - Coach Depth-Transition Generated Source

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\coach-depth-transitions-opening-20261008`, `analysis-runs\coach-depth-transitions-opening-swing20-20261008`, `analysis-runs\coach-depth-transitions-reference-followups-swing20-20261008`
- Result: Opening-continuation pool selected 0/120 at depth 4->6 with 100cp swing; selected 0/120 with 20cp swing. Reference-followup pool selected 0/116 with 20cp swing.
- Baseline: accepted Coach baseline `3afde24`
- Tests: `node --test tests\find_coach_depth_transitions.test.mjs tests\filter_coach_root_separated_fens.test.mjs tests\generate_reference_followup_fens.test.mjs`
- Decision: Reject generated depth-transition sampling as the next candidate source. Rejection counts are dominated by root ties (`low-root-top-ties>16` and `high-root-top-ties>16`) and small score swings, so generated openings are not producing clean depth-transition targets.
- Next targets: mine existing real match PGNs for positions Coach actually reached, preferably losses or eval swings, then apply the same non-mate/material/root-tie gates before SF19 classification.

## 2026-10-08 - Real-Match Midgame SF19 Small Pass

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\realmatch-midgame-sf19-small-20261008`
- Result: Extracted 40 Coach positions from the accepted 50-game ShallowBlue 1618 5+0 match (`moves 10-35`, one sampled Coach move per game), SF19 depth 8. Only 2 unique non-mate/material-rich best-move disagreements exceeded 120cp.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: n/a; diagnostic tool run completed and wrote `20261008-144109\results.json`.
- Decision: Reject this small extraction as a candidate source. Both audited rows failed bounded-root-tie gates at root depth 8 and root depth 6; `game24-before-10...Bxf3` also had the SF19 move missing from Coach root top 24.
- Next targets: widen real-match extraction beyond move-10 repeated openings, sampling later move windows or more positions per game while preserving material and non-mate gates.

## 2026-10-08 - Real-Match Later-Midgame SF19 Pass

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\realmatch-midgame-later-sf19-20261008`
- Result: Extracted 60 Coach positions from the accepted 50-game ShallowBlue 1618 5+0 match (`moves 16-35`, two sampled Coach moves per game), SF19 depth 8. Depth-8 intake selected 1 row; root-depth-6 intake selected 2 rows.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: n/a; diagnostic tool run completed and wrote `20261008-144757\results.json`.
- Decision: Reject as a patch source. The strict depth-8 survivor `game20-before-21...Rb8` failed child verification with `gap=-33cp`. Root-depth-6 survivors also failed: `game6-before-21...Rd8` had `gap=-19cp`; `game20-before-16...Bg4` had a weak positive child gap `+29cp` but verifier root prefilter remained timed even with a 30s root budget and root ties rose to 40, violating the completed/bounded-root requirement.
- Next targets: try a later real-match window (`moves 24-45`) for more diverse, material-rich positions before abandoning real-match PGN sampling.

## 2026-10-08 - Real-Match Late-Midgame SF19 Pass

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\realmatch-late-midgame-sf19-20261008`
- Result: Extracted 60 Coach positions from the accepted 50-game ShallowBlue 1618 5+0 match (`moves 24-45`, two sampled Coach moves per game), SF19 depth 8. This produced the richest raw disagreement set so far, including `game9-before-24.Nc5` at 698cp, but strict gates selected only one row.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`.
- Tests: n/a; diagnostic tool run completed and wrote `20261008-150051\results.json`.
- Decision: Reject as a patch source. The single survivor, `game17-before-28.Red1` (`r2r2k1/1b3p2/1p3pn1/5p1p/p1PB1P2/P3P3/1P4PP/R3R1K1 w - - 0 28`), was clean in intake (`22/7` pieces, root ties 2 at depth 8) but failed child verification with `gap=-11cp`. Root-depth-6 intake selected the same row only.
- Next targets: stop chasing Coach-child-gap candidates from generated and real-match SF19 disagreement rows for this cycle; consider a different improvement source, likely direct root-tie diagnostic/tooling or a future structure/eval mining pass.

## 2026-10-08 - Current Baseline Root-Bound Recheck

- Status: diagnostic
- Commit: accepted Coach baseline `3afde24`
- Run: `analysis-runs\current-baseline-root-bound-game12-probe-20261008`
- Result: Rechecked old `game12-ply100-f4-before` root-bound row (`8/8/1k1Bp3/1P2Pp1p/2K4P/8/5P2/8 b - - 2 50`, old Coach `b6b7`, reference `f5f4`). Child probe still shows a large old-child gap at deeper depths (`+433cp` at child depth 10, `+336cp` at depth 12), but current root search already chooses `f5f4` from depth 8 onward.
- Baseline: accepted Coach baseline `3afde24`
- Tests: diagnostic probe only.
- Decision: Do not patch this old root-bound case. It is useful confirmation that the accepted low-material root-tie work fixes a real class, but it is not a live current-root failure.
- Next targets: use root-bound/tie diagnostics only when the current root still selects the weaker move; otherwise prefer fresh evidence.

## 2026-10-08 - Real-Match Root-Plateau Audit

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\realmatch-late-root-plateau-audit-dedup-d7-20261008`
- Result: Audited the top 20 deduped late-midgame candidate FENs at root depth 8, child depth 7, root limit 8. Class counts: `hidden-child-spread=18`, `child-spread=2`, `root-child-disagreement=0`.
- Baseline: accepted Coach baseline `3afde24`
- Tests: `node tools\audit-root-plateau-child-scores.mjs --help`; added `--dedupe-fen` to avoid repeated match positions.
- Decision: Reject root-child disagreement as a patch source for this packet. The root often presents broad same-score plateaus, but Coach's own child search usually keeps the current root best or differs by only a small gap (`<100cp`).
- Next targets: pivot to structure/eval-source mining rather than broadening root-tie verification policy again.

## 2026-10-08 - Real-Match Structure Summary

- Status: diagnostic
- Commit: n/a
- Run: `analysis-runs\realmatch-structure-summary-20261008`, `analysis-runs\structure-passed-pawn-game9-nc5-childprobe-20261008`, `analysis-runs\realmatch-late-midgame-sf19-20261008\relaxed-tie-intake-d8-20261008`, `analysis-runs\realmatch-late-midgame-sf19-20261008\relaxed-tie-intake-d8-verified-child10-20261008`
- Result: Summarized 51 high-diff (`>=150cp`) rows across the three fresh real-match SF19 passes. The strongest repeated bucket is passed-pawn tactical middlegames (`theme:passed pawn`, 12 rows, average abs diff 387cp, all Coach-optimistic). Top repeated row `game9/game29-before-24.Nc5` had SF19 `d7e5` vs Coach `d7c5`, but direct child probing rejected it: Coach child gap stayed negative (`-79cp` at depths 8-10) and root search remained a broad plateau. Relaxed root-tie intake (`max-root-top-ties=999`) selected 4 rows from the late pass; child verifier found 0 candidates (`game20...h6` only `+9cp`; others `-11`, `-79`, `-65`).
- Baseline: accepted Coach baseline `3afde24`
- Tests: `node --test tests\summarize_diagnostic_structures.test.mjs tests\find_coach_depth_transitions.test.mjs tests\filter_coach_root_separated_fens.test.mjs`
- Decision: Treat passed-pawn tactical middlegames as a promising source theme, not as an accepted candidate. The first top row and all relaxed-tie late-pass survivors fail the required positive Coach child-search gap.
- Next targets: generate/select new passed-pawn tactical middlegame FENs from real games or opening continuations, then require a positive Coach child gap and bounded current-root behavior before patching. Do not repeat blind SF19 disagreement scans without a structural filter.

## 2026-10-09 - Structural Passed-Pawn Generated Sources

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\structural-passed-pawn-source-20261008`, `analysis-runs\expanded-opening-continuations-structural-20261009`, `analysis-runs\expanded-structural-passed-pawn-source-20261009`
- Result: First structural selector kept 27/236 generated opening/reference-followup FENs with advanced passed pawns, >=12 pieces, >=6 non-pawn pieces, and >=2 heavy pieces. SF19 depth 8 produced many 200-500cp disagreements. Strict depth-8 intake selected one Ruy row (`ruy-lopez-line3-fm21-ply32-refline-ply6`) but child verification rejected it (`gap=-15cp`). Root-depth-6 intake selected one Nimzo row (`nimzo-indian-line4-fm23-ply36`) but child verification rejected it (`gap=-39cp`). Expanded generator produced 240 FENs; selector kept 20 Ruy Lopez passed-pawn rows. Strict/root-depth-6 intake selected the same clean row (`ruy-lopez-line4-fm25-ply40`, `2r2rk1/5ppp/pq6/1p2P3/1p1pB3/3Q4/P2R1PPP/2K4R w - - 2 25`, SF `c1b1` vs Coach `c1b2`, root ties 2 at depth 8 / 1 at depth 6), but child verification rejected it (`gap=-12cp`). Coach-only depth-transition scan on the expanded structural source selected 0/20 rows (`analysis-runs\expanded-structural-depth-transitions-20261009`).
- Baseline: accepted Coach baseline `3afde24`; SF19 at `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe`
- Tests: `node --test tests\select_structural_fens.test.mjs tests\summarize_diagnostic_structures.test.mjs tests\find_coach_depth_transitions.test.mjs tests\filter_coach_root_separated_fens.test.mjs`
- Decision: Reject structural passed-pawn generated sources as a patch source for this cycle. The structural filter improves disagreement density and root cleanliness versus blind scans, but all survivors fail the required positive Coach child-search gap.
- Next targets: switch evidence policy from SF19 disagreement to Coach-only depth transitions/root behavior on the same structural source, or mine a different structure class instead of repeating passed-pawn Ruy/Nimzo rows.

## 2026-10-09 - Real-Match Coach-Only Transition Source

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\realmatch-coachonly-fen-source-20261009`, `analysis-runs\realmatch-coachonly-later-fen-source-20261009`, `analysis-runs\realmatch-coachonly-later-depth-transitions-swing20-20261009`, `analysis-runs\realmatch-coachonly-later-root-plateau-audit-20261009`
- Result: Built real-match Coach-only FEN sources from the accepted 50-game ShallowBlue 1618 5+0 match, avoiding SF-first filtering. Early window (`moves 12-16`) was too repetitive and was stopped. Later window (`moves 20-26`, 120 rows) produced no bounded Coach depth transitions even with `min-score-swing=20`; rejection counts were dominated by root plateaus (`low-root-top-ties>16=102`, `high-root-top-ties>16=99`). A deduped root-plateau child audit on 41 unique later positions found `hidden-child-spread=38`, `child-spread=2`, `true-flat=1`, but `root-child-disagreement=0`.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`
- Tests: diagnostic tools completed; no engine code changed.
- Decision: Reject this real-match Coach-only source as a patch source. The positions are dominated by broad root plateaus, but Coach's child searches do not provide a clean alternative root move under the current disagreement threshold.
- Next targets: mine a different structure class, specifically queen/rook tactical middlegames without advanced passed-pawn filtering, before returning to SF19 comparison.

## 2026-10-09 - Queen/Rook Structural Source

- Status: rejected
- Commit: n/a
- Run: `analysis-runs\queen-rook-structural-source-20261009`, `analysis-runs\queen-rook-depth-transitions-20261009`, `analysis-runs\queen-rook-root-plateau-audit-20261009`
- Result: Added `queen-rook` mode to `tools\select-structural-fens.mjs` and selected 120/240 generated queen/rook middlegame FENs without advanced passed pawns. Coach-only depth-transition scan selected 0/120; rejection counts were dominated by root plateaus (`high-root-top-ties>16=112`, `low-root-top-ties>16=97`) and low score swing (`score-swing<50=107`). A 40-row root-plateau child audit found `hidden-child-spread=39`, `true-flat=1`, and `root-child-disagreement=0`.
- Baseline: accepted Coach baseline `3afde24`
- Tests: `node --test tests\select_structural_fens.test.mjs`
- Decision: Reject this generated queen/rook structure source as a patch source. Like the passed-pawn source, it produces broad root plateaus but no clean Coach-child-supported alternate root move.
- Next targets: use a source that ranks by actual match outcome deterioration or time/depth behavior before root plateau filtering, rather than more generated Ruy-heavy structural positions.

## 2026-10-09 - Accepted-Match Time/Depth Remine

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\coach-3afde24-time-depth-remine-20261009`
- Result: Re-summarized the accepted 50-game ShallowBlue 1618 5+0 match and added `tools\select-time-depth-candidate-fens.mjs` to extract time/depth pressure FENs. The material-rich low-clock/shallow slice selected 0 positions. The slow material-rich middlegame slice selected 35 positions from moves 12-35 where Coach spent 10-16s with at least 18 pieces and 8 non-pawn pieces.
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`
- Tests: `node --test tests\select_time_depth_candidate_fens.test.mjs`; depth-transition probe on the 35 slow-rich FENs selected 0; root-plateau child audit found `hidden-child-spread=29`, `child-spread=2`, `true-flat=4`, and `root-child-disagreement=0`.
- Decision: Reject slow-rich middlegame time/depth behavior as a patch source for this cycle. Coach often spends time in broad root plateaus, but child probes did not show a clean alternate move.
- Next targets: if time management remains the focus, mine late low-clock/shallow endgame positions separately; otherwise use a new evidence policy rather than another generated structural/SF19 pass.

## 2026-10-09 - Low-Clock Shallow Endgame Time/Depth Branch

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\coach-3afde24-time-depth-remine-20261009\low-clock-shallow-endgame`
- Result: Relaxed low-clock/shallow selector kept 29 late-endgame FENs (`depth<=5`, estimated clock `<=30s`, moves 40-160, at least 4 pieces and 1 non-pawn). Coach depth-transition scan selected 2 connected queen/pawn-vs-rook FENs from game 2. SF19 comparison over the full 29-row slice at depth 14 found one apparent candidate (`game2-ply196-c3`, Coach `h7b1`, SF `h7e4`, Coach gap 257cp at Coach depth 8).
- Baseline: accepted Coach baseline `3afde24`; ShallowBlue 1618 5+0 baseline `34 - 10 - 6 [0.740]`
- Tests: `node --test tests\select_time_depth_candidate_fens.test.mjs tests\select_structural_fens.test.mjs tests\find_coach_depth_transitions.test.mjs`; child-pair probes rejected both candidate interpretations. `h7b1` vs `c4c3` ended with only `+4cp` for the reference move at child depth 12, and `h7b1` vs SF `h7e4` ended with only `+21cp` at child depth 12 after being worse at earlier depths.
- Decision: Reject this branch as a patch source. It is useful evidence that low-clock depth-1/5 endgames exist, but the only surviving non-agreement case was a broad winning-conversion plateau rather than a stable move-quality miss.
- Next targets: for a future time/endgame goal, collect more low-clock endgame examples before changing time management; for the current improvement loop, pivot again to a source with clearer child-search gaps.

## 2026-10-09 - Coach Child-Gap-First Evidence Pass

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\child-gap-first-expanded-opening-fast-20261009`, `analysis-runs\child-gap-first-realmatch-later-fast-20261009`
- Result: Inverted the evidence policy by probing Coach root alternatives first, before SF19. Expanded opening source audited 80 generated rows and selected 0 candidates; summary found 3 near misses. The only meaningful near miss (`ruy-lopez-line6-fm14-ply18`, root `a7c7`, alternative `f4e5`) kept a positive child-pair gap through depth 12, but current Coach root search already chooses/ties `f4e5` from depth 6 onward and SF19 depth 14 agrees with Coach depth 8 on `f4e5`. Accepted-match later source audited 80 real-match rows and selected 0 candidates with 0 near misses.
- Baseline: accepted Coach baseline `3afde24`; SF19 at `<USERPROFILE>\Downloads\stockfish-windows-x86-64-universal.exe`
- Tests: `node --test tests\summarize_coach_child_gap_run.test.mjs`; direct root probe and child-pair probe for `ruy-lopez-line6-fm14-ply18`; SF19 comparison `ruy-line6-sf19` found 0 candidates.
- Decision: Reject these child-gap-first packets as patch sources. The method is useful and cheaper than SF-first scans, but the generated source is still dominated by flat Ruy plateaus and the real-match source has no positive child-gap signal.
- Next targets: search existing verifier artifacts for any positive child-gap near misses not yet classified, then pivot to a source designed to contain naturally non-flat tactical roots rather than more broad opening plateaus.

## 2026-10-09 - Global Root-Spread Worklist With Material Gate

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\child-search-collapse-global-20261009`, `analysis-runs\coach-root-spread-worklist-global-20261009`, `analysis-runs\coach-root-spread-worklist-material-global-20261009`
- Result: Summarized 887 historical verifier rows from 70 artifacts and rechecked two opening keepers on current code. `game3-before-8.Nxe5` and `game19-before-8.Re1` both remain broad root plateaus, but their historical positive child gaps no longer survive current direct child-pair probing (`d7e5` was -59cp vs `d7b6`; `d1d2` was -79cp vs `c2e4`). A root-spread worklist over 300 global FENs found 3 naturally separated rows, but all were sparse pawn endgames. After adding material gates to `tools\build-coach-root-worklist.mjs`, the same 300-row scan with at least 12 pieces and 6 non-pawn pieces found 0 worklist rows.
- Baseline: accepted Coach baseline `3afde24`
- Tests: `node --test tests\summarize_coach_child_gap_run.test.mjs tests\select_time_depth_candidate_fens.test.mjs`; direct root and child-pair probes for `game3-before-8.Nxe5` and `game19-before-8.Re1`.
- Decision: Reject global root-spread mining as a current patch source. Naturally separated roots in this pool are sparse-endgame only; material-rich positions remain dominated by flat root tables or timeouts.
- Next targets: a better successor source should be generated for material-rich tactical positions with forced captures/checks or externally supplied tactical/STS positions, then filtered by material, non-mate scores, bounded roots, and positive current child gap.
## 2026-10-09 - Lucas STS Material Root-Spread Recheck

- Source: `analysis-runs\lucas-sts-miss-packet-20261005`.
- Tool/run: `analysis-runs\lucas-sts-root-spread-material-20261009`.
- Gate: Coach root depth 7, root limit 8, min band 80cp, max top ties 3, no mate-root rows, at least 12 total pieces and 6 non-pawn pieces.
- Result: audited 48 STS miss positions, wrote 0 root-spread rows.
- Rejection pattern: every audited position had `band<80`; every audited position also had `topTies>3`; 30 timed before the requested root depth; only 1 failed the material gate.
- Decision: rejected as an improvement source. This confirms the Lucas STS miss packet is mostly a flat-root/tie surface for current Coach, matching the earlier STS-best child-search checks where depth-8 and depth-10 Coach child search did not produce a confirmed >=100cp gap.
- Next policy: stop requiring root spread for this class of evidence; use a broader SF19 disagreement source with material/non-mate gates, then filter by reference move in Coach root and positive Coach child-search gap.

## 2026-10-09 - Broad Opening SF19 Low-Gap Sample

- Source: `analysis-runs\broad-opening-sf19-policy-20261009\positions.fens`.
- Generator: curated opening continuations, Coach depth 3, fullmove 8-18 samples, at least 16 pieces and 8 non-pawn pieces.
- First Ruy slice: `sf19-d10-lowgap-first40`; Coach depth 7 vs SF19 depth 10 MultiPV 6; found 0 candidates. Most disagreements had Coach gap 0cp, so no patch signal.
- First non-Ruy/Sicilian slice: `sf19-d10-lowgap-nonruy60`; found 1 loose SF19 candidate, `sicilian-open-line8-fm13-ply16`, Coach `c4b5` vs SF19 `b1d2`.
- Probe: `sicilian-line8-fm13-child-pair`, depths 4-12. Static eval favored SF by 80cp, but Coach child search rejected it from depth 6 onward and stabilized at about -35cp against the SF move.
- Decision: rejected. Root/SF disagreement is not a Coach child-search-confirmed candidate.
- Tooling added: `tools\sample-fen-lines.mjs` plus `tests\sample_fen_lines.test.mjs`, so future passes can quickly test different opening slices without fragile shell quoting.

### Follow-up Slice

- Source slice: `non-ruy-skip60-next60.fens`, containing later Sicilian rows plus early Nimzo rows.
- SF pass: `sf19-d10-lowgap-nonruy-skip60`; Coach depth 7 vs SF19 depth 10 MultiPV 6; found 1 loose candidate, `sicilian-open-line7-fm15-ply20`, Coach `b1d2` vs SF19 `f2f4`.
- Probe: `sicilian-line7-fm15-child-pair`, depths 4-12. Coach child search favored Coach's `b1d2` at every depth, stabilizing at -96cp against SF's move.
- Decision: rejected. The broad source is currently over-weighted toward Ruy/Sicilian because the generator stops at the global limit; next pass should target or balance later opening families directly.

### Targeted QGD Slice

- Tooling change: `tools\generate-opening-continuation-fens.mjs` now accepts `--include-opening-regex` and `--exclude-opening-regex`, allowing direct generation from selected opening families.
- Source: `analysis-runs\targeted-opening-families-sf19-20261009\qgd-english-first70.fens`; first 70 rows were QGD.
- SF pass: `sf19-d10-lowgap-qgd-english70`; Coach depth 7 vs SF19 depth 10 MultiPV 6; found 2 loose QGD candidates:
  - `queens-gambit-declined-line7-fm9-ply8`, Coach `g1f3` vs SF19 `f2f3`.
  - `queens-gambit-declined-line7-fm10-ply10`, Coach `a2a3` vs SF19 `f3d2`.
- Probes: `qgd-line7-fm9-child-pair` and `qgd-line7-fm10-child-pair`, depths 4-12. Coach child search favored Coach's move at every depth in both rows, stabilizing at -155cp and -34cp against the SF moves.
- Decision: rejected. The QGD low-gap disagreements are not child-search-confirmed Coach candidates.

### Targeted English Slice

- Source: `analysis-runs\english-opening-sf19-policy-20261009\first50.fens`.
- SF pass: `sf19-d10-lowgap-first50`; Coach depth 7 vs SF19 depth 10 MultiPV 6; found 1 loose candidate, `english-four-knights-line1-fm8-ply6`, Coach `f1g2` vs SF19 `b2b3`.
- Probe: `english-line1-fm8-child-pair`, depths 4-12. Coach child search favored Coach's move at every depth, with the SF move worse by 91cp to 116cp at depths 9-12.
- Decision: rejected. English low-gap disagreement is not a child-search-confirmed candidate.

### Targeted French Slice

- Source: `analysis-runs\french-caro-kings-sf19-policy-20261009\first60.fens`; first 60 rows were French Tarrasch.
- SF pass: `sf19-d10-lowgap-first60`; Coach depth 7 vs SF19 depth 10 MultiPV 6; found 1 loose candidate, `french-tarrasch-line2-fm8-ply6`, Coach `e1f1` vs SF19 `g1f3`.
- Probe: `french-line2-fm8-child-pair`, depths 4-12. Static eval favored SF by 137cp, but Coach child search favored Coach's move at every searched depth and stabilized at about -100cp against the SF move.
- Decision: rejected. This reinforces that low-gap SF19 root disagreements are mostly false positives when checked through Coach child-search.
- Next policy: pivot from SF root disagreement to Coach's own depth-transition/instability evidence, then use SF19 only as confirmation rather than the first filter.

## 2026-10-09 - Targeted Opening Depth-Transition Scout

- Source: `analysis-runs\targeted-opening-families-depth-transitions-20261009\scout80.fens`; first 80 rows from the targeted opening-family source, all Nimzo.
- First attempted full pass: depth 5 -> 8 over 180 rows was stopped at row 34 because runtime was too high for a scout pass.
- Cheaper scout: depth 4 -> 6, root limit 16, max top ties 8, min score swing 50cp, material gate 16/8.
- Result: audited 80 Nimzo positions, selected 0 transitions.
- QGD/English scout: `qgd-english-d4-d6.fens`, same gate; audited 70 QGD positions, selected 0 transitions.
- Decision: generated opening-family positions are not producing clean Coach self-instability under this gate. Next source should use broader existing analysis artifacts or real-match evidence rather than more generated opening continuations.

## 2026-10-09 - Broad Existing-Artifact Reference Intake

- Source: all `analysis-runs` result artifacts, ordered by newest mtime.
- Intake run: `analysis-runs\broad-existing-reference-intake-20261009`.
- Gate: non-mate comparisons, min diff 80cp, Coach root depth 7, root limit 24, material at least 16 total pieces and 8 non-pawn pieces, max root top ties 12.
- Result: scanned 155 files and 1088 raw positions; audited 180 high-diff rows; selected 3 intake rows.
- Selected rows:
  - `ruy-lopez-line3-fm17-ply24`, Coach `e2d2` vs reference `c1b1`, diff 358cp.
  - `ruy-lopez-line3-fm17-ply24-refline-ply4`, Coach `h6f6` vs reference `c5d6`, diff 410cp.
  - `queens-gambit-declined-line4-fm21-ply32-refline-ply2`, Coach `c5b6` vs reference `b7b6`, diff 291cp.
- Coach child-search verification: `reference-child-search-d7-confirm9`, child depth 7 with confirmation at depth 9 and min gap 100cp.
- Verification result: 0 candidates. Child gaps were negative for all three selected rows: -4cp, -22cp, and -30cp.
- Decision: rejected. Even the best gated existing-artifact rows do not show Coach's own child search preferring the reference move.
- Next policy: look for evidence where the candidate move is generated by Coach at a deeper root or by a real match depth/time miss, not merely by SF/reference disagreement.

## 2026-10-09 - Real-Match Time/Depth Flip Scout

- Source: `analysis-runs\coach-3afde24-shallowblue50-time-depth-20261007\coach-time-depth-summary.json`, the 50-game ShallowBlue 1618 5+0 accepted-baseline match.
- Strict run: `analysis-runs\realmatch-time-depth-flips-20261009\shallowblue50-midgame-d9-confirm11`; middlegame moves 16-40, played depth <=7, target depth 9, confirmation depth 11, material gate 16 total / 8 non-pawn pieces, min deeper gap 80cp, requiring shallow search to agree with the played move.
- Strict result: audited 80 moves and selected 0 candidates. Rejections were `deeper-agrees-with-played=74` and `gap<min=80`; prefilter rejections were mainly move-window/material/depth gates.
- Loose run: `analysis-runs\realmatch-time-depth-flips-20261009\shallowblue50-midgame-d8-confirm10-loose`; middlegame moves 11-40, played depth <=6, target depth 8, confirmation depth 10, same material gate, min deeper gap 40cp, no shallow-agreement requirement.
- Loose result: audited 25 moves and selected 0 candidates. Rejections were `deeper-agrees-with-played=23` and `gap<min=25`.
- Decision: rejected as a patch source. The accepted 50-game ShallowBlue time/depth data does not currently expose a clean material-rich middlegame case where deeper Coach search prefers a different move.
- Next policy: pivot to naturally forcing tactical sources such as checks/captures/threat positions, then keep the same gates: non-mate, material-rich, bounded root ties, positive Coach child-search gap, and SF19 only as confirmation.

## 2026-10-09 - Forcing Tactical Existing-Artifact Scout

- Tooling added: `tools\select-forcing-fens.mjs` plus `tests\select_forcing_fens.test.mjs`. The selector ranks existing FENs by legal captures and checking moves while keeping material gates.
- Source run: `analysis-runs\forcing-tactical-source-20261009\forcing.fens`.
- Source result: scanned 434 FEN files and 1,200 unique positions from `analysis-runs`; selected 83 material-rich forcing rows with at least 16 total pieces, 8 non-pawn pieces, 3 captures, 1 checking move, and 5 total forcing moves.
- Root-spread run: `analysis-runs\forcing-tactical-source-20261009\root-worklist-d7`; Coach root depth 7, root limit 16, min band 60cp, max top ties 6.
- Root-spread result: 0 worklist rows. Rejections were `band<60=83`, `topTies>6=82`, `rootTimed=51`, and `mateRootScore=1`, showing the forcing packet is still root-flat under Coach.
- Fast child-gap scout: `analysis-runs\forcing-tactical-source-20261009\child-gap-d5-c7-fast20`; first 20 forcing rows, root depth 5, child depth 7, root limit 8, min gap 60cp, confirm root depth 8.
- Fast child-gap result: 0 candidates. Best alternative gaps were mostly negative; only one row (`game2-before-20.exd5`) reached a positive but tiny `+24cp`, below threshold.
- Remaining-row scout: `analysis-runs\forcing-tactical-source-20261009\child-gap-d5-c7-skip20-noconfirm`; scanned the remaining 63 rows at root depth 5 / child depth 7, root limit 8, min gap 40cp, no confirmation, and found 3 scout candidates.
- Deeper confirmation: `analysis-runs\forcing-tactical-source-20261009\child-gap-d6-c9-confirm10-survivors`; rechecked the 3 scout candidates at root depth 6 / child depth 9, min gap 80cp, confirm root depth 10, and non-mate check depth 11. Result: 0 confirmed candidates. `game8-before-16...Nxd3` flipped to `-104cp`, `sicilian-open-line2-fm13-ply16` fell to `+27cp`, and `before-22...b6` flipped to `-16cp`.
- SF19 comparison: `analysis-runs\forcing-tactical-source-20261009\sf19-d12-coachd7`; Coach depth 7, SF19 depth 12, MultiPV 6, min Coach gap 60cp, max absolute SF score 3000cp.
- SF19 result: compared all 83 forcing rows and found 0 direct candidates. Most rows were `agree` or `small-coach-gap`; the SF19 move was usually in Coach's root list but carried a 0cp Coach gap because the root table was flat. One mate/extreme row was excluded.
- Decision: rejected as a patch source. The forcing selector is useful durable tooling, but this existing-artifact tactical packet did not produce a stable positive Coach child-search gap or a bounded-root SF19 disagreement.
- Next policy: before abandoning this packet entirely, run one cheap lower-depth root-separation scout. If that also finds no bounded-root rows, pivot away from historical artifacts toward a generated forcing source designed to reduce root plateaus.

## 2026-10-09 - Generated Capped Forcing Source

- Tooling change: `tools\select-forcing-fens.mjs` now supports `--max-legal-moves`, with coverage in `tests\select_forcing_fens.test.mjs`, so forcing packets can avoid very branchy positions.
- Historical capped recheck: `analysis-runs\forcing-tactical-source-20261009\forcing-capped36.fens` selected 18/83 existing-artifact forcing rows with legal moves <=36. Root worklist `root-worklist-capped36-d6` still selected 0 rows.
- Generated source: `analysis-runs\generated-capped-forcing-source-20261009\opening-continuations.fens`; generated 500 Coach opening-continuation FENs from curated openings with dense sampling from fullmoves 8-24.
- Generated forcing filter: `analysis-runs\generated-capped-forcing-source-20261009\forcing-capped36.fens`; selected 15/500 rows with at least 16 total pieces, 8 non-pawn pieces, 3 captures, 1 checking move, 5 forcing moves, and legal moves <=36.
- Root worklist: `analysis-runs\generated-capped-forcing-source-20261009\root-worklist-d6`; Coach root depth 6, root limit 12, min band 20cp, max top ties 8. Result: 0 worklist rows; every row had `band<20` and `topTies>8`.
- SF19 comparison: `analysis-runs\generated-capped-forcing-source-20261009\sf19-d12-coachd7`; Coach depth 7, SF19 depth 12, MultiPV 6, min Coach gap 40cp. Result: 0 candidates; rows were `agree` or `small-coach-gap`, with Coach gap on SF move always 0cp.
- Decision: rejected as a patch source. Even fresh generated forcing positions with lower legal-move counts still collapse into flat Coach root tables under the current evidence gates.
- Next policy: stop sampling more opening/forcing FENs until the root-score collapse is diagnosed. Use these clean forcing rows to audit whether child searches show spread hidden by root reporting/order; only patch if the audit isolates a narrow root scoring, move-ordering, or search bookkeeping bug rather than a broad root-tie policy.

## 2026-10-10 - Balanced Generated Opening Child-Gap Scout

- Tooling change: `tools\sample-fen-lines.mjs` now supports `--every` and `--round-robin-opening`, with tests in `tests\sample_fen_lines.test.mjs`, so generated FEN sources can avoid opening-family clumps.
- Plateau audit follow-up: `analysis-runs\generated-capped-forcing-source-20261009\plateau-child-audit-d6-c8`; audited the 15 capped generated forcing rows at root depth 6 / child depth 8. Result: `hidden-child-spread=14`, `mate-child=1`, `root-child-disagreements=0`. Child searches showed real spread, but the root-best move remained child-best in 14/15 rows; the only mismatch was `+6cp`.
- Balanced source: `analysis-runs\generated-capped-forcing-source-20261009\opening-balanced80.fens`, generated with round-robin opening sampling from the 500-row opening-continuation source.
- Scout: `analysis-runs\generated-capped-forcing-source-20261009\child-gap-balanced80-d5-c7`; first 40 balanced rows, root depth 5, child depth 7, root limit 8, min gap 60cp. Result: 1 scout candidate, `ruy-lopez-line5-fm8-ply6`, root `d1e2` vs child alternative `f3e5`, gap `+99cp`.
- Deeper confirmation: `analysis-runs\generated-capped-forcing-source-20261009\child-gap-balanced-candidate-confirm`; root depth 6, child depth 9, min gap 80cp, confirm root depth 10, non-mate check depth 11. Result: 0 candidates; the scout row flipped to `-69cp` and confirm root timed.
- Decision: rejected as a patch source. Balanced sampling improved source diversity and produced one scout signal, but it did not survive deeper Coach confirmation.
- Next policy: move away from opening-continuation sources. The repeated pattern is that Coach child search usually validates the current root choice at deeper depths; the next source should be real-game outcome transitions or a curated external tactical suite, not more Coach-generated openings.

## 2026-10-10 - Corrected Real-Game Loss Transition Refresh

- Tooling fix: `tools\select-loss-transition-fens.mjs` now filters to Coach's actual move side using the FEN side-to-move, falling back to ply parity only when FEN side is missing. It also supports `--min-total-pieces` and `--min-non-pawn-pieces`. Tests updated in `tests\select_loss_transition_fens.test.mjs`.
- Bug found: the earlier black-loss transition extraction used all moves in Coach-as-Black games, so rows like `game40-ply28-Rh1` were opponent moves. The apparent `game40` candidate was invalid as a Coach patch source even though its child-pair probe showed `g5g6` better than `f6f7`.
- Accepted ShallowBlue 50-game refresh: `analysis-runs\realgame-loss-transition-refresh-20261010\white-losses-material-drop120`; with the 12/6 material gate selected 0 Coach-side transitions.
- SF19 anchor refresh: `analysis-runs\realgame-loss-transition-refresh-20261010\sf19-anchor-coach-material-losses.fens`; after Coach-side and 12/6 material filtering, selected 6 valid Coach-move transitions from `analysis-runs\sf19-anchor-openings-sf19-2400-44g-st1-20261004\time-depth\coach-time-depth-summary.json`.
- Child-gap scout: `analysis-runs\realgame-loss-transition-refresh-20261010\sf19-anchor-coach-material-childgap-d5-c7`; root depth 5, child depth 7, root limit 8, min gap 60cp. Result: 0 candidates; best gaps were all below threshold, with the closest only `+18cp`.
- Decision: rejected as a patch source. The corrected material-rich real-game transition source did not produce a Coach child-search-supported candidate.
- Next policy: continue only with Coach-side/material-gated transition packets; do not reuse pre-fix black-loss transition outputs. Try a different match summary or a curated external tactical suite if available.

## 2026-10-10 - Corrected SF19 st1 Loss Transition Scout

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\realgame-loss-transition-refresh-20261010`
- Source: `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005\time-depth\coach-time-depth-summary.json`
- Result: corrected Coach-side/material-gated extraction selected 8 positions: 5 Coach-as-White losses and 3 Coach-as-Black losses.
- Child-gap scout: `sf19-st1-coach-material-childgap-d5-c7`; root depth 5, child depth 7, root limit 8, min gap 60cp. Found 1 scout row, `game13-ply81-Kc1`.
- Confirmation: `sf19-st1-coach-material-childgap-d6-c9-confirm-long`; root depth 6, child depth 9, confirm root depth 10, non-mate check depth 11. The row survived with root `c2c1`, deeper/child alternative `c2d2`, and a +175cp child gap; no mate rows.
- Probe: direct child pair `game13-ply81-child-pair-c2c1-c2d2` kept `c2d2` ahead from depths 7-11, settling at +63cp from depths 9-11.
- SF19 check: `game13-ply81-sf19-compare-d14-coachd6` rejected it as a patch source. SF19 depth 14 also preferred `c2c1`, with `c2d2` only 12cp behind.
- Decision: reject `game13-ply81-Kc1` as an improvement candidate. It is a real Coach internal depth/child-search disagreement, but the reference engine does not support changing toward `c2d2`.
- Next policy: pivot from loss-transition child-gap-first mining to an SF19-first disagreement source over real match positions, then require Coach child-search confirmation before patching.

## 2026-10-10 - SF19 st1 Real-Position Disagreement Child-Gap Scout

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-realposition-disagreement-20261010`
- Source: 80 material-rich real-match positions selected from `analysis-runs\fresh-evidence-sf19-2400-20g-st1-20261005\time-depth\coach-time-depth-summary.json` using `tools\select-time-depth-candidate-fens.mjs` in `slow-rich` mode.
- SF19 pass: `sf19-st1-slowrich80-sf19d12-coachd7`; Coach depth 7 vs SF19 depth 12, MultiPV 6, min Coach root gap 40cp. Result: 0 strict candidates. Most disagreements had Coach root gap 0cp because Coach root scores were flat.
- Tooling added: `tools\select-reference-child-gap-from-compare.mjs`, which reads `coach-sf19-diagnostic.json`, filters root-visible SF19 disagreements, and child-probes Coach move vs SF19 move before emitting candidates.
- Automated child-gap pass: `sf19-st1-slowrich80-reference-childgap-top12-d5d8`; audited the top 12 SF disagreements with child depths 5-8, min final gap 60cp, and selected 0.
- Near miss: `game9-ply75-Rg3` (`3b1k2/p4q1r/1pQ1p2r/4Pb2/3P4/2N5/PPP3R1/5RK1 w - - 5 38`), Coach `g2g3` vs SF19 `f1f3`. Deeper child-pair probe `childpair-game9-ply75-g2g3-f1f3-deep` stabilized at +48cp for `f1f3` from depths 9-12, below the 60cp candidate gate.
- Manual probes: `game9-ply61`, `game8-ply44`, `game13-ply43`, and `game18-ply28` all rejected the SF19 move under Coach child search, with negative deeper gaps.
- Decision: reject this SF19-first real-position slice as a patch source. It produced one small reference-supported near miss but no strong child-confirmed candidate.
- Next policy: use the new compare-child-gap tool on smaller, better-targeted slices only. Avoid broad 30+ row deep child passes unless the source has already shown multiple +40cp near misses.

## 2026-10-10 - SF19 st1 Queen-Rook Real-Position Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-queenrook-target-20261010`
- Source: 300 material-rich SF19 `st1` real-match positions from moves 8-30, filtered to 80 queen-rook middlegames with both queens, at least two rooks, at least 16 total pieces, at least 8 non-pawn pieces, and no advanced passed pawns.
- SF19 pass: `queenrook80-sf19d12-coachd7`; Coach depth 7 vs SF19 depth 12, MultiPV 6, min Coach root gap 20cp. Result: 2 loose SF-root candidates: `game11-ply25-Nd6` and `game3-ply19-Bb5`.
- Automated child-gap pass: `queenrook80-reference-childgap-top16-d5d8-gap40`; audited top 16 root-visible SF disagreements at child depths 5-8, min final gap 40cp. Result: 0 selected. Closest rows were `game4-ply32-Qc5` at +31cp and `game2-ply46-Nf6` at +26cp.
- Direct probes for the 2 loose SF-root candidates:
  - `childpair-game11-ply25-e1g1-d1d8`: SF move `Qxd8+` did not survive child search; gap settled at -18cp depths 10-11.
  - `childpair-game3-ply19-f1b5-e5d3`: SF move `Nxd3` did not survive child search; gap settled at -7cp depths 9-11.
- Tooling update: `tools\select-reference-child-gap-from-compare.mjs` now supports `--max-root-top-ties` so future compare-child scans can enforce the bounded-root gate directly.
- Decision: rejected as a patch source. This was a cleaner structural source than broad real-position scans, but Coach child search still mostly validates Coach's move.
- Next policy: pivot from same-position SF root disagreements to SF19 follow-up/child-position sources, where the SF move is applied first and Coach's evaluation of the resulting position can expose a more concrete eval/search defect.

## 2026-10-10 - SF19 Queen-Rook Follow-Up Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-followup-source-20261010`
- Tooling update: `tools\generate-reference-followup-fens.mjs` now accepts current `coach-sf19-diagnostic.json` files in addition to older `coach-analysis-lab` result files. Existing focused test `node --test tests\generate_reference_followup_fens.test.mjs` passed.
- Source: `queenrook-sf19-followups.fens`; generated 80 positions by applying SF19's preferred move from the queen-rook comparison source, then following shallow Coach continuations for up to 4 plies with material gate 16/8.
- SF19 pass: `queenrook-followups-sf19d12-coachd7`; Coach depth 7 vs SF19 depth 12, MultiPV 6, min Coach root gap 40cp. Result: 0 strict candidates.
- Bounded-root child-gap pass: `queenrook-followups-reference-childgap-top12-d5d8-gap40`; after requiring material 16/8 and max root top ties 12, only 5 rows were audited. Result: 0 selected. Closest was `game9-ply37-Rae1-refline-ply2`, Coach `h6g6` vs SF19 `d8d5`, with deepest child gap +30cp.
- Decision: rejected as a patch source. Applying SF19 moves first created a cleaner child-position source, but Coach's root and child search still did not expose a strong reference-supported miss.
- Next policy: filter the SF19 follow-up positions for forcing structure (captures/checks, capped legal moves) before comparing again, so the next source is tactical rather than merely structural.

## 2026-10-10 - SF19 Follow-Up Forcing Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-followup-forcing-20261010`
- Source: `forcing-followups.fens`; filtered the SF19 queen-rook follow-up source for tactical rows with at least 16 total pieces, 8 non-pawn pieces, 2 captures, 1 checking move, 3 forcing moves, and no more than 40 legal moves. Result: selected 7/63 audited follow-up rows.
- SF19 pass: `forcing-followups-sf19d14-coachd8`; Coach depth 8 vs SF19 depth 14, MultiPV 6, min Coach root gap 20cp. Result: 1 loose candidate, `game15-ply17-Re1-refline-ply1`, Coach `d1d3` vs SF19 `e4e5`, Coach root gap 20cp.
- Direct child-pair probe: `childpair-game15-ply17-refline-ply1-d1d3-e4e5`, depths 5-12. The SF19 move did not survive: gaps were +1, +12, 0, 0, then -1cp from depths 9-12.
- Decision: rejected as a patch source. This was the cleanest forcing follow-up signal so far, but Coach child search treats the two moves as essentially equal and slightly favors Coach's move at stable depths.
- Next policy: avoid more broad queen-rook/follow-up variants for now. A better successor should target actual Coach self-instability/depth transitions inside forcing rows rather than SF19 best-move disagreement, because SF19 disagreement keeps collapsing under Coach child search.

## 2026-10-10 - SF19 Follow-Up Depth-Transition Scout

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-followup-forcing-20261010\depth-transition-d5-d8` and `analysis-runs\sf19-followup-source-20261010\depth-transition-d5-d8`
- Forcing scout: ran Coach depth transition finder on the 7 forcing follow-up rows from depth 5 to depth 8, root limit 12, max top ties 8, min score swing 20cp. Result: 0 selected. Rejections were dominated by `low-root-top-ties>8` and `high-root-top-ties>8`.
- Only self-instability near miss: `game9-ply37-Rae1-refline-ply2` changed root best from `e7d6` at depth 5 to `d8d5` at depth 8, but both roots were broad plateaus. Direct child-pair `e7d6` vs `d8d5` favored `d8d5` by +93cp at depths 10-12, but the deeper root-floated move was `h6g6`; direct child-pair `h6g6` vs `d8d5` settled at only +5cp for `d8d5`.
- Full follow-up scout: ran the same depth 5 to 8 scan over all 80 queen-rook follow-up rows, root limit 12, max top ties 8, min score swing 40cp. Result: 0 selected. Rejections: `low-root-top-ties>8=73`, `high-root-top-ties>8=78`, `same-best-move=53`, `score-swing<40=71`, `high-root-timed=16`.
- Root scoring inspection: `js\engine\search.js` root loop records per-root move scores, but these sources are genuinely returning broad same-score plateaus. This is not yet evidence for a narrow root bookkeeping patch.
- Decision: rejected as a patch source. Coach self-instability inside the SF19 follow-up packet did not produce a bounded-root, non-mate, material-rich candidate.
- Next policy: stop mining this SF19 `st1` queen-rook/follow-up family. The recurring blocker is broad root ties; the next evidence source should be a different policy entirely, such as curated low-branch tactical suites or positions selected by naturally low legal move count plus non-flat root bands before any SF comparison.

## 2026-10-10 - SF19 Low-Branch Real-Position Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-lowbranch-realpositions-20261010`
- Tooling update: `tools\select-time-depth-candidate-fens.mjs` now supports `--max-legal-moves` and `--min-captures`, with coverage in `tests\select_time_depth_candidate_fens.test.mjs`, so real-position sources can target low/medium-branch tactical positions instead of only slow/high-mobility rows.
- Strict source: `lowbranch-capture-rich.fens`; material-rich moves 8-40, legal moves <=24, captures >=2. Result: selected 7/1340 rows. Coach depth 7 vs SF19 depth 14, MultiPV 6, min Coach gap 40cp found 0 candidates.
- Relaxed source: `lowbranch-capture-relaxed.fens`; material-rich moves 8-40, legal moves <=32, captures >=1. Result: selected 120/1340 rows. Coach depth 7 vs SF19 depth 14 found 0 strict candidates.
- Child-gap salvage: `child-gap-relaxed`; audited 8 SF19-visible rows and selected 2 direct child-gap survivors: `game3-ply51-Nd7` (Coach `a1a2`, SF19 `e1d1`, stable child gap +59cp from depths 8-12) and `game12-ply20-Qxg7` (Coach `e8f8`, SF19 `e5g7`, stable child gap +46cp from depths 9-12).
- Clock check: current Coach under normal 5+0 clock already solves both survivor FENs: `game3-ply51-Nd7` reaches depth 8 and plays `e1d1`; `game12-ply20-Qxg7` reaches depth 9 and plays `e5g7`.
- Decision: reject as a code patch source. The positions reinforce that depth 8 matters, but they do not expose a current 5+0 time-management or search failure.
- Next policy: stop treating sub-depth fixed-time SF19 `st1` misses as patch candidates unless the same FEN fails under clock-based 5+0. Pivot to evidence that tests current practical play directly, such as 5+0 loss positions where Coach had normal clock time but still chose a move that deeper Coach and SF19 both reject.

## 2026-10-10 - ShallowBlue 50-Game Practical Rich Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\shallowblue50-practical-rich-20261010`
- Source: accepted-baseline 50-game ShallowBlue 1618 5+0 time/depth summary, selecting material-rich moves 8-40 where Coach spent at least 5s, legal moves <=32, captures >=1, and material >=12/6.
- Source result: `spent-rich-lowbranch.fens` selected 32/3556 Coach moves.
- SF19 pass: `compare-d8-sf14`; Coach depth 8 vs SF19 depth 14, MultiPV 6, min Coach root gap 30cp. Result: 0 strict candidates. Most rows were `agree` or `small-coach-gap`, with SF19 moves carrying 0cp Coach root gap.
- Child-gap salvage: `child-gap-d5d8`; only 2 SF19-visible rows qualified for audit (`game41-ply61-e6`, `game39-ply67-Rb1`), and selected 0 candidates.
- Decision: rejected as a patch source. This current-practical-play source did not expose a position where Coach spent normal 5+0 time but missed a move that Coach child search and SF19 both support.
- Next policy: stop broad SF19 comparison over match-derived real positions for now. Try a curated tactical/STS-style external suite or a deliberately narrow hand-built tactical packet where expected best moves are known, then require current Coach to fail under 5+0-like search before considering a patch.

## 2026-10-10 - SF19-Guided Tactical Opening Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-guided-tactical-source-20261010`
- Tooling added: `tools\generate-sf19-guided-tactical-fens.mjs` follows verified SF19 from curated openings, branches with MultiPV, and keeps material-rich positions where SF19's best move is a forcing move. This creates a fresh known-reference tactical source rather than another Coach-generated continuation packet.
- Source result: `sf19-guided-tactical.fens` generated 80 positions from the Ruy Lopez and Sicilian prefixes at SF19 depth 8, requiring material >=12/6, at least one capture available, legal moves <=40, and a forcing SF19 best move. Rejections were mainly `sfBestNotForcing=192`, `legalMoves>40=71`, and `captures<1=14`.
- SF19 pass: `compare-coachd8-sf14`; Coach depth 8 vs SF19 depth 14, MultiPV 6, min Coach root gap 30cp. Result: 0 strict candidates.
- Strict child-gap pass: `child-gap-top24-d5d8`; bounded root ties <=12 selected 0 candidates. Only one row was audited under the strict gate and it failed.
- Loose child-gap pass: `child-gap-loose-d5d8`; audited 24 SF-visible rows with max root ties 40 and min gap 20cp; selected 0. One row, `ruy-lopez-sfline8-fm9-ply9`, showed a large but unstable child gap and was promoted to direct probing.
- Diagnostic survivor: `ruy-lopez-sfline8-fm9-ply9` / `r1b1kb1r/2ppqppp/p1n2n2/1p2P3/8/1Bp2N2/PPP2PPP/R1BQ1RK1 b kq - 3 9`. Direct child-pair `c6e5` vs `f6e4` favored `f6e4` by +193cp from depths 8-12, while root depth 8 and 10 returned broad same-score plateaus. Root-child audit confirmed a `root-child-disagreement`; a top-5 targeted audit found this as the only disagreement, with four other rows showing hidden child spread but root-best agreement.
- Decision: reject as a patch source for now. The source is useful and produced one real high-material root/child contradiction, but it violates the bounded-root gate and does not yet justify a broad high-material root-tie verification policy, a family that has repeatedly hurt match strength.
- Next policy: continue with a root-child-disagreement evidence source, not SF-best disagreement. Mine fresh tactical rows for repeated completed-root, high-material root-child disagreements; only patch if multiple rows isolate the same narrow root scoring/search bookkeeping mechanism without broad root-tie policy changes.
## 2026-10-10 - SF19-Guided Tactical Diverse Plateau Audit

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\sf19-guided-tactical-diverse-20261010`
- Tooling update: `tools\generate-sf19-guided-tactical-fens.mjs` now supports `--max-samples-per-opening`, and `tools\select-root-plateau-targets-from-compare.mjs` now supports `--classification-regex`, `--exclude-agree`, `--require-sf-in-root`, and `--max-sf-rank` so plateau audits can avoid already-agreeing rows.
- Source result: generated 100 SF19-guided tactical rows across 10 curated openings, capped at 10 rows per opening. Coach depth 8 vs SF19 depth 14 produced 0 strict candidates.
- Plateau audit: broad selector found 40/100 high-material root plateau rows; top-8 audit found `hidden-child-spread=8`, `disagreements=0`. Non-agree/SF-visible selector found 18/100 rows; top-8 audit found `hidden-child-spread=6`, `true-flat=2`, `disagreements=0`.
- Tests: `node --check tools\select-root-plateau-targets-from-compare.mjs`; `node --check tools\generate-sf19-guided-tactical-fens.mjs`; `node --test tests\select_time_depth_candidate_fens.test.mjs tests\generate_reference_followup_fens.test.mjs tests\select_forcing_fens.test.mjs` all passed.
- Decision: reject this diverse SF19-guided source as a patch source. High-material root plateaus are common, but the audited rows mostly agree with deeper Coach child search, so this does not justify widening high-material root-tie verification.
- Next policy: pivot to a different evidence policy, preferably current-practical 5+0 positions where Coach spent real clock but failed to reach or hold a depth-8 resource, or a small curated tactical/known-answer suite; do not keep sampling equivalent SF19-guided opening plateau rows.

## 2026-10-10 - Current Practical Slow-Shallow 5+0 Source

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\current-practical-slow-shallow-20261010`
- Tooling update: `tools\select-time-depth-candidate-fens.mjs` now supports `--mode slow-shallow`, with a focused test in `tests\select_time_depth_candidate_fens.test.mjs`, so real 5+0 moves can be selected when Coach spent meaningful time but still reached only shallow depth.
- Source result: from accepted-baseline ShallowBlue 1618 50-game 5+0 time-depth summary, selected 29/3556 rows with time >=6s, depth <=7, moves 8-40, material >=12/6, legal moves <=36, and at least one capture.
- SF19 pass: Coach depth 8 vs SF19 depth 14 produced 1 strict row, `game35-ply63-Rf1` (`f2f6` vs SF19 `a1f1`, Coach root gap 38cp), but direct child-pair depths 5-12 rejected it; Coach's `f2f6` was ahead by 28-79cp at depths 10-12.
- Coach self-depth pass: depth 5 -> depth 8 scan selected 3 rows. `game45-ply29-e4` and `game35-ply61-Qf2` were already the actual 5+0 match moves. `game22-ply60-c5` actual `c7c5` vs deeper-root `d8c8` was rejected by direct child-pair probe; actual `c7c5` was ahead by 5-11cp at depths 8-12.
- Tests: `node --check tools\select-time-depth-candidate-fens.mjs`; `node --test tests\select_time_depth_candidate_fens.test.mjs` passed.
- Decision: reject this current-practical slow-shallow packet as a patch source. It confirms depth-8/deeper moves matter, but the promising rows either were already played in the 5+0 game or failed deeper child-pair confirmation.
- Next policy: move to a curated tactical/known-answer source rather than another sampled-opening or practical slow-shallow pass; require Coach to fail the known answer under current clock/search and then survive Coach child/deeper confirmation before patching.

## 2026-10-10 - Game15 Ply151 Mate-Horizon Diagnostic Recheck

- Status: diagnostic/future-target
- Commit: n/a
- Run: `analysis-runs\mate-horizon-game15-ply151-20261010`
- Source: older verified non-mate-wide reference-child intake candidate `game15-ply151-g8R-before`, FEN `8/4N1P1/4KP1k/3R3P/2q5/8/8/8 w - - 17 76`.
- Probe: current Coach root depths 4-12 showed `e6f7` appears at depth 7, `g7g8r` returns at depths 8-10, depth 11 reports `e6f7` as mate-class `999.87`, and depth 12 flattens all top moves to mate-class `999.87`.
- PV replay: UCI depth 11 produced `e6f7 c4e4 g7g8r e4d5 e7d5 h6h5 f7e6 h5h4 f6f7 h4h3 f7f8q h3h4`; replay ended at `5QR1/8/4K3/3N4/7k/8/8/8 w - - 1 82`, which is not a terminal mate position.
- Decision: do not patch under the active non-mate SF19 diagnostic goal. Preserve as a future false-mate / mate-PV sentinel target if the work pivots back to mate-score correctness.
- Next policy: continue the active goal with non-mate, material-rich, bounded-root evidence. Avoid letting this mate-class endgame pull the current loop into broad root tie or broad mate-verification policy.

## 2026-10-10 - Positive Subthreshold Reference-Child Aggregate

- Status: diagnostic/rejected
- Commit: n/a
- Run: `analysis-runs\positive-subthreshold-aggregate-20261010`
- Tooling added: `tools\summarize-positive-subthreshold-reference-child.mjs` aggregates prior `reference-child-search.json` rows, dedupes by FEN, and filters non-mate material-rich positive child gaps.
- Strict aggregate: gap 35-99cp, material >=12/6, root ties <=24 selected 0/864 rows from 67 reference-child files.
- Relaxed root-tie aggregate: root ties <=60 selected 4 rows. Direct child-pair depths 8-12 found two stable subthreshold rows: `lucas-g4-i73` held +79cp for STS `f1f5`, and `lucas-g10-i58` held +66cp for STS/SF19 `e3c5`; `game4` collapsed to +16-18cp and `lucas-g2-i69` reached only +62cp at depth 12.
- SF19 check: Coach d8 vs SF19 d14 over the 4 relaxed rows found 0 strict candidates. SF19 aligned with `lucas-g10-i58` (`e3c5`) and `lucas-g2-i69` (`g8c8`), but Coach root gap was 0cp.
- Root probes: `lucas-g10-i58` and `lucas-g2-i69` both kept broad same-score root plateaus through depth 12; the SF19/child-favored move floated to first, but remained tied with many alternatives.
- Decision: reject as a patch source. These are useful diagnostics of high-tie root plateaus hiding small child-search differences, but they do not justify a broad root-tie policy change.
- Next policy: target non-flat root-spread sources. The repeated blocker is flat Coach root tables; prioritize sources where Coach already shows a bounded root band before comparing SF19 or child gaps.

## 2026-10-10 - Non-Flat Root-Spread / Mate-Horizon Pivot

- Status: diagnostic/candidate-lead
- Commit: n/a
- Runs: `analysis-runs\current-practical-slow-shallow-20261010\root-worklist-d7-band20-ties8`; `analysis-runs\sf19-guided-tactical-diverse-20261010\root-worklist-d7-band20-ties8`; `analysis-runs\sf19-guided-tactical-source-20261010\plateau-audit-top12-equivalent-d8-c7`; `analysis-runs\sf19-guided-tactical-source-20261010\plateau-audit-top12-deep-d8-c10`; `analysis-runs\mate-horizon-game15-ply151-20261010\root-tt-diagnostic-d11-c10-entry`.
- Non-flat source check: current-practical slow-shallow audited 29 rows and found 0 root worklist rows at depth 7 with band >=20cp and top ties <=8. SF19-guided diverse audited 100 rows and found 0 rows; rejections were `band<20=100`, `topTies>8=90`.
- Root plateau exact-child check: top 12 SF19-guided tactical plateau rows all showed hidden child spread, but 0 root-child move disagreements at equivalent child depth 7 and 0 disagreements at deeper child depth 10. The root table flatness is mostly alpha-beta bound reporting, while the first root move still survives exact child rescoring in this packet.
- Candidate lead: `game15-ply151-g8R-before` remains a real mate-horizon/TT target. UCI depth 11 still reports `e6f7` as mate-class with a PV that does not terminate in mate. SF19 depth 18 on the child position `8/4NKP1/5P1k/3R3P/2q5/8/8/8 b - - 18 76` reports centipawn-class advantage, not mate.
- TT diagnostic: after root depth 11, the child entry after `e6f7` is TT `EXACT`, depth 11, stored score `-99988`, move `c4-e4`; searching the same child with the shared TT returns `99987` immediately, while isolated depth 10 and fresh depth 10 return `2075cp`. Fresh child depth 11 still reproduces a false mate-class result, so the issue is deeper than a stale non-exact root bound.
- Negative patch probes: skipping non-exact mate TT bound cutoffs did not fix the child false mate. Fully disabling PVS or LMR for the depth-11 child was too slow for a practical quick candidate and was reverted.
- Decision: the active non-mate SF19/STS/practical sources are dry. The best current improvement lead is now a narrow false-mate search diagnostic, likely in the PVS/LMR/TT interaction path, not another sampled-opening or ShallowBlue packet.
- Next targets: add a focused sentinel that reproduces the child-position false mate, then isolate the smallest condition that prevents exact mate-class TT storage when the PV cannot be proven terminal. Avoid broad root-tie verification or global PVS/LMR disablement unless a much narrower trigger is found.

## 2026-10-11 - Sparse Mixed-Material Quiet-Queen QSearch Candidate

- Status: candidate / local gates passed / smoke pending
- Commit baseline: `3afde24`
- Target: child FEN `8/4NKP1/5P1k/3R3P/2q5/8/8/8 b - - 18 76`; baseline depth 11 reported false `mate -6`, while SF19 depth 18 remained centipawn-class.
- Diagnosis: captures-only qsearch removed the false mate. Removing quiet promotions alone did not. Removing quiet queen checks changed the result to centipawn-class, isolating the active branch. An all-sparse (`<=6` non-king pieces) queen-check gate fixed the target but broke the accepted sparse knight-pawn root-tie sentinel after promotion.
- Change: omit qsearch quiet queen checks only when 4-6 non-king pieces remain. Quiet checks from every other piece remain enabled, quiet promotions remain enabled, ultra-sparse 0-3-piece queen conversion remains unchanged, and positions with 7+ non-king pieces retain quiet queen checks.
- Sentinel: opt-in depth-11 test `sparse queen-check qsearch does not report false mate` now requires a non-mate-class score on the exact child FEN. A fast move-generation test covers the 4-6 gate plus both neighboring material classes.
- Tests: `node --test tests\engine_regressions.test.mjs` passed 65, skipped 68, failed 0; `node --test tests\root_tie_verification.test.mjs` passed 8/8; focused slow sentinel passed 1/1; `run-slow-tests.cmd /position rollback` passed 4/4, including all six rollback SF2400 positions.
- Stability: `analysis-runs\candidate-sparse-mixed-qqueen-piececount-stability-short-20261011.json` vs `analysis-runs\bench-baseline-3afde24` was SearchStable OK, with unchanged tree shape, 0 PV changes, 0 root-order changes, and candidate timing 0.399% slower.
- Decision: promote to a 20-game ShallowBlue 1618 `5+0` smoke. Do not accept unless it shows no practical regression against the published `3afde24` baseline (`34 - 10 - 6 [0.740] 50` nearest long-run evidence).
- Next targets: run and mine the smoke; reject and revert candidate code if the practical score or mate/swing profile regresses.

## 2026-10-11 - Strong-Engine Search-Feature Audit / Goal Expansion

- Status: diagnostic / active-goal amendment
- Baseline: `3afde24`; preserve the same sentinel, regression, stability-short, and ShallowBlue smoke acceptance gates.
- Sources: current Stockfish search (`https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp`), Stockfish tested IIR change (`https://github.com/official-stockfish/Stockfish/commit/b1053e6`), Ethereal releases (`https://github.com/AndyGrant/Ethereal/releases`), and Berserk's documented search stack (`https://github.com/jhonnold/berserk`).
- Gap audit: Coach already has iterative deepening, aspiration windows, PVS, conservative LMR, null move, reverse futility, check extensions, TT ordering, killers, basic from-to history, and qsearch SEE pruning. It does not currently have IIR, verified ProbCut, countermove/continuation/capture history, history-informed LMR/pruning, correction history, singular extensions, main-search SEE pruning, late-move pruning, or qsearch TT reuse.
- Priority 1: add telemetry before another broad feature patch: TT-miss rate by node type/depth, first-move cutoff rate, mean cutoff move index, and quiet/capture cutoff split. Use it to decide whether move ordering or pruning is the actual depth bottleneck.
- Priority 2: if deep PV/cut TT misses are frequent, test one conservative IIR candidate: reduce depth by one only at sufficient depth with no TT move. Require lower cutoff index or node count without sentinel loss before smoke.
- Priority 3: if high-SEE captures frequently cause later cutoffs, test one verified ProbCut candidate: non-PV, non-mate window, sufficient depth, SEE-qualified captures, qsearch precheck, and reduced null-window verification. Reject on any mate/PV sentinel regression.
- Priority 4: only with cutoff-order evidence, add one history layer at a time: capture history first or countermove/continuation history, then use it for ordering before considering history pruning or more aggressive LMR.
- Deferred: correction history needs an eval-residual corpus; singular extensions and qsearch TT reuse are too entangled with current false-mate/root-tie behavior for the first experiment; NNUE, SMP, bitboard conversion, and tablebase integration are architecture projects rather than narrow candidates.
- Decision: the active goal now includes this ranked successor lane. Finish the current sparse-qsearch smoke first; if it rejects, start telemetry rather than returning to another equivalent sampled-opening/SF19 intake pass.

## 2026-10-11 - Paired Candidate-vs-Baseline Confirmation Gate

- Status: process improvement / active-goal amendment
- Motivation: separate candidate quality from opponent and opening noise. Stockfish's Fishtest tests a patched engine directly against its base, uses paired opening assignments, and accumulates W-L-D/pentanomial evidence until its statistical stopping rule is reached. Coach cannot reproduce that scale locally, but it can adopt the high-value experimental shape.
- Available assets: executable baseline snapshot `analysis-runs\bench-baseline-3afde24\uci.js`; verified deterministic 10-opening suite `analysis-runs\fresh-evidence-shallowblue1618-20g-5m0-pgnsuite-20260928c\openings.pgn`; CuteChess `-repeat` color swapping was already smoke-tested with this suite. `<USERPROFILE>\Downloads\rodent.bin` remains available for later randomized-book confirmation, but the deterministic PGN suite is easier to reproduce and audit.
- New gate: after a candidate passes its exact sentinel, focused regressions, rollback tests, and stability-short, run candidate directly against the accepted baseline with the same Hash/Move Overhead, paired openings, equal colors, and a fresh recorded seed. Use this as a sensitive candidate screen; retain ShallowBlue 1618 as the independent practical-collapse check.
- Interpretation: a short A/B run can reject a clear loser but cannot prove a small Elo gain. Preserve pair-level outcomes and confidence bounds, and extend promising/ambiguous candidates rather than accepting from a lucky 20-game score. Do not call a local short run "SPRT" unless an actual sequential likelihood test and predeclared bounds are implemented.
- Candidate-discovery order if the current smoke rejects: run the new cutoff/TT telemetry first; choose conservative IIR only when deep no-TT-move nodes are common, verified ProbCut only when qualifying captures support it, or one history layer only when late cutoff indices show ordering weakness. Then apply the paired A/B gate before another opponent smoke.
- Decision: add paired candidate-vs-baseline testing to the active goal as a confirmation lane. It complements rather than replaces the existing ShallowBlue baseline and SF19 diagnostic evidence.

## 2026-10-11 - Candidate Neighborhood Robustness Gate

- Status: tooling / active-goal amendment
- Motivation: narrow fixes derived from one FEN can overfit the exact position. Before accepting a correctness/search candidate, generate nearby legal positions and check whether baseline-vs-candidate behavior forms a coherent family under SF19 rather than a one-position coincidence.
- Tooling: `tools\generate-fen-neighborhood.mjs` performs deterministic breadth-first legal move expansion with a ply and position cap, writing `.fens`, JSON, and Markdown evidence. `tests\generate_fen_neighborhood.test.mjs` covers determinism, bounds, legal child generation, and CLI validation (3/3 passed).
- Current packet: `analysis-runs\candidate-sparse-mixed-qqueen-neighborhood-20261011` contains the false-mate seed plus 23 legal one-ply children. Keep the running 5+0 smoke uncontended; after it completes, probe this same packet at equal depths with baseline `3afde24`, the candidate, and SF19.
- Gate: reject or narrow the patch if it creates new mate-class disagreement against SF19, breaks adjacent ultra-sparse conversion behavior, or only changes the exact seed without a defensible correctness explanation. A coherent reduction in false mate-class scores with no neighboring regression strengthens acceptance, but does not replace match testing.
- Decision: add neighborhood robustness to candidate validation when a patch is triggered by one or very few exact positions. This is especially important for mate-score, TT, qsearch, and root-tie changes.

## 2026-10-11 - Lazy Move-Generation Audit Lane

- Status: diagnostic / active-goal amendment
- Finding: Coach's `stagedPicker` delays scoring/sorting later buckets, but `negamax()` first calls `legalMoveGenerator.generateMoves()` and partitions the complete legal list. Thus a first-move beta cutoff still pays to generate and legality-check every quiet move. Current Stockfish separates pseudo-legal capture, quiet, and evasion generation and its MovePicker advances by stage, allowing later move classes to remain ungenerated after an early cutoff.
- Tooling update: `tools\profile-search-cutoffs.mjs` now records total generated moves, searched moves, unused generated moves at beta cutoffs, aggregate generated-move use rate, and measured generation/order/make/undo phase time in addition to TT and cutoff-order metrics. Focused profiler plus neighborhood tests passed 5/5; the phase-timing extension kept its focused profiler tests at 2/2.
- Decision rule: after the live match, run telemetry on the stable benchmark corpus. Consider a lazy capture/quiet legal-generation candidate only if a large share of generated moves is unused at cutoffs and search phase timing confirms move generation is material. This is potentially higher leverage than another pruning threshold, but it is a larger move-generator boundary change and therefore requires perft, legal-move, engine regression, search-equivalence, and match gates.
- Priority: place this beside IIR, not ahead of evidence. If deep no-TT-move nodes dominate, try conservative IIR first; if unused generated moves and generation time dominate, prototype lazy staging; if late cutoff indices dominate, improve history ordering; if qualifying capture cutoffs dominate, consider verified ProbCut.

## 2026-10-11 - Sparse Mixed-Material Quiet-Queen Candidate Final Validation

- Status: accepted-narrow / committed as `423afb3`
- Baseline: `3afde24`; candidate remains the 4-6 non-king-piece qsearch quiet-queen-check gate described above.
- ShallowBlue smoke: `analysis-runs\candidate-sparse-mixed-qqueen-shallowblue1618-20g-5m0-20261011`; 20 games at `5+0`, concurrency 4, no opening book, seed `26092501`. Final Coach score `14 - 4 - 2 [0.750] 20`, matching the nearest accepted 50-game baseline `34 - 10 - 6 [0.740] 50` within smoke-level noise. Color split was White `5 - 4 - 1 [0.550]`, Black `9 - 0 - 1 [0.950]`, so this is non-regression evidence rather than a strength estimate.
- Mining: 20/20 games replayed, 1,434 Coach-scored moves, 10 selected swings: 5 centipawn drops, 4 entered-losing-mate rows, and 1 mate-score change. No crash, replay error, or match warning was observed.
- Neighborhood breadth: `analysis-runs\candidate-sparse-mixed-qqueen-neighborhood-20261011` contains the seed plus all 23 legal one-ply children. At Coach depth 8 / SF19 depth 12, candidate and baseline had identical best moves and scores on 23/24 rows; the remaining row kept the same Coach/SF19-agreed move and shifted by only 1cp.
- Neighborhood depth: on a five-position forcing/representative sample at Coach depth 10 / SF19 depth 16, baseline reported the seed as false mate-class `-99988`, candidate reported normal `-2436cp`, and SF19 reported normal `-1440cp`. On the four neighboring positions with real mate-class outcomes, candidate and baseline retained identical moves/scores and SF19 independently remained mate-class.
- Paired A/B interpretation: a general opening A/B is unlikely to distinguish this correctness patch because the exact seed and every sampled neighbor retained the same Coach move; the practical ShallowBlue smoke plus direct baseline/candidate/SF19 neighborhood comparison is more informative for this candidate. Retain paired A/B as the default gate for future candidates that change played moves or search efficiency.
- Decision: accept narrowly. The candidate removes a reproducible fabricated mate score, preserves true neighboring mates, passes exact and adjacent sentinels, rollback/regression/root-tie tests, SearchStable stability, and a 75% ShallowBlue smoke. Prepare a scoped release without bundling unrelated worktree changes.

## 2026-10-11 - Search Cutoff / Move-Generation Telemetry Result

- Status: diagnostic / successor-goal evidence
- Runs: `analysis-runs\search-cutoff-profile-primary-20261011.json` (10 primary benchmark positions at corpus depths) and `analysis-runs\search-cutoff-profile-primary-d8-one-20261011.json` (quiet-defense at depth 8).
- Primary aggregate: 118,889 instrumented positive-depth nodes; TT hit rate 22.9%; 46,833 beta cutoffs; first-move cutoff rate 92.4%; mean cutoff index 1.16. Coach generated 1,662,104 legal moves but searched 413,960 (24.9% use), with 1,247,916 already-generated moves left unused at beta cutoffs. Move generation consumed 69.7% of tracked generate/order/make/undo time; ordering consumed 2.5%.
- Depth-8 check: first-move cutoff rate 96.0%, mean cutoff index 1.09, generated-move use 29.8%, and move generation consumed 77.2% of tracked phase time. `deepNoTtMoveNodes=0`, so the proposed conservative IIR gate had no opportunities in this representative deeper run.
- Capture signal: primary telemetry recorded 39,403 capture cutoffs versus 7,430 quiet cutoffs; 25,381 capture cutoffs had non-losing SEE. This leaves verified capture-only ProbCut as a secondary experiment, but only after the more direct generation bottleneck.
- Decision: promote lazy capture/quiet legal-move staging to the next improvement goal. Coach's existing ordering is already effective once moves exist; the larger waste is eagerly generating and legality-checking move classes never reached after a cutoff. Deprioritize IIR and additional history for now. Any prototype must preserve exact move legality and ordering, then pass perft, legal-move tests, engine regressions, search equivalence/stability, neighborhood mate sentinels, paired candidate-vs-baseline testing if behavior changes, and ShallowBlue smoke.

## 2026-10-11 - Material-Rich Lazy Quiet-Generation Candidate

- Status: accepted-narrow / committed as `3ae1771`
- Baseline: accepted qsearch correctness commit `423afb3`, preserved at `analysis-runs\bench-baseline-423afb3`.
- Change: at non-check, material-rich nodes (at least 10 non-king pieces) using staged ordering, with no quiet TT move and no promotion-ready pawn, generate and search legal captures first. Generate the quiet stage only if capture search does not cut off. Roots, checks/evasions, quiet-TT nodes, promotions, and sparse endings retain the established full-generation path. `COACH_LAZY_QUIET_MOVE_GENERATION=0` provides direct rollback.
- Motivation: baseline telemetry generated 1,662,104 legal moves but searched 413,960; move generation consumed 69.7% of tracked phase time, first-move cutoff rate was 92.4%, and mean cutoff index was 1.16. Extra move-history work was therefore lower leverage than avoiding unvisited quiet generation.
- Correctness: `node --test tests\perft.test.mjs tests\root_tie_verification.test.mjs tests\engine_regressions.test.mjs` passed 107 with 68 skipped, including start-position perft depth 5, Kiwipete depth 4, promotions, en passant, LMR, root-tie, mate normalization, and qsearch sentinels. `run-slow-tests.cmd /position rollback` passed 4/4 and all six selected rollback positions. The exact sparse false-mate sentinel passed; apples-to-apples wall time was 105.1s candidate versus 106.4s baseline, confirming the material gate avoids the ungated sparse-endgame penalty.
- Search equivalence: two fresh 16-group stability-short runs against `423afb3` retained Exact identity on all four primary positions. Seed `260101`: +2.565% raw; seed `260102`: +3.639% raw. Identical-build control was +0.069%. Multi-run summary: accepted, +3.033% mean control-adjusted gain, 2/2 positive runs, 4/4 positive positions in both gated runs, worst aggregated position +1.549%, no dominance failure.
- Mechanism check: on the 10-position primary corpus, candidate searched the identical 413,960 moves while generated moves fell from 1,662,104 to 662,535 (-60.1%); measured generation time fell 39.8%, tracked generation/order/make/undo time fell 32.5%, and quiet generation was skipped at 31,049 / 45,393 eligible nodes (68.4%).
- Paired A/B: `analysis-runs\candidate-lazy-quietgen-vs-423afb3-20g-st1-20261011`, 20 fixed-1s games, 10 deterministic openings, each color, concurrency 4. Candidate scored `10 - 8 - 2 [0.550]`; candidate White `8 - 1 - 1`, Black `2 - 7 - 1`, with overall White score 80%. Treat as non-regression/small positive smoke, not proof of Elo gain.
- Final ShallowBlue gate: `analysis-runs\candidate-lazy-quietgen-shallowblue1618-20g-5m0-20261011`; 20 games, `5+0`, concurrency 4, seed `26092501`, no book. Coach scored `17 - 3 - 0 [0.850] 20`; White `7 - 3 - 0 [0.700]`, Black `10 - 0 - 0 [1.000]`. This exceeds the immediate `423afb3` qsearch smoke `14 - 4 - 2 [0.750] 20` and shows no regression versus published `3afde24` 50-game evidence `34 - 10 - 6 [0.740] 50`; still treat 20 games as smoke rather than proof of a 110-point Elo gain.
- Smoke mining: all 20 games replayed with 0 errors; 1,520 Coach-scored moves and 10 selected swings: 3 centipawn drops, 2 entered-losing-mate rows, and 5 mate-score changes. No crash or match warning occurred.
- Candidate guardrails: added direct tests proving feature-off/feature-on exact root move, score, node count, and root table equality in a material-rich position, plus sparse and promotion-ready fallback coverage. Final focused/default affected suite passed 109, skipped 68, failed 0.
- Decision: accept narrowly. The candidate preserves exact fixed-depth search behavior, reduces eager move generation materially, clears perft/regression/root-tie/rollback/false-mate gates, passes two independent controlled speed runs, scores 55% in paired candidate-vs-baseline play, and scores 85% in the final ShallowBlue smoke.

## 2026-10-11 - Native Quiet-Only Generation Follow-Up

- Status: rejected / reverted
- Baseline: accepted `3ae1771`, preserved at `analysis-runs\bench-baseline-3ae1771`.
- Hypothesis: replace the deferred quiet stage's full legal generation plus capture filtering with native pseudo/legal quiet-only generation, preserving castling and quiet promotions while excluding captures, capture-promotions, and en passant.
- Correctness probe: a six-position partition sentinel covered initial position, castling-rich Kiwipete, en passant, quiet/capture promotions, check evasion, and a pinned piece. Legal captures plus legal quiets exactly reconstructed the full legal move set with no duplicates.
- Incremental benchmark: `analysis-runs\candidate-native-quietgen-ab4-20261011.json`, four-position stability-short against `3ae1771`, Exact identity. Result was 0.458% slower overall; quiet-open +0.005%, tactical-capture -0.522%, high-branching -2.314%, promotion-race +0.971%.
- Decision: reject before broad slow gates or match testing because it missed the predeclared +1% incremental threshold and was directionally negative. Reverted only the native quiet-only generator/search/test changes; accepted `3ae1771` remains intact.
- Next target: follow the goal fallback and test one conservative verified capture-only ProbCut candidate, using the existing capture-cutoff telemetry and strict PV/mate/SEE/depth gates.

## 2026-10-11 - Verified Capture-Only ProbCut Follow-Up

- Status: rejected / reverted
- Baseline: accepted `3ae1771`, preserved at `analysis-runs\bench-baseline-3ae1771`.
- Candidate: at non-root depth-6 scout nodes outside check, repetition, and mate-class windows, search only non-losing SEE captures. Require a qsearch fail-high at `beta + 200cp`, then repeat it in a reduced null-window search before returning fail-hard beta. Static evaluation had to be within 200cp of beta, and no speculative result was stored in the TT.
- Guard probe: focused helper tests covered depth, PV, root, check, repetition, mate-bound, static-margin, feature-off, and lazy-static-evaluation gates. The feature path maintained make/undo symmetry.
- Shallow benchmark: `analysis-runs\candidate-verified-probcut-ab4-20261011.json` retained SearchStable identity and identical tree shape on the four-position stability-short corpus, but was 0.536% slower. Telemetry confirmed zero ProbCut opportunities at these fixed depths, so the result measured guard overhead and timing noise rather than useful pruning.
- Deep telemetry: depth 8 on `quiet-defense` produced 1 attempt, 1 verification, and 1 cutoff, reducing nodes from 112,360 to 112,047 (-0.28%). Across four depth-7 positions, lowering the minimum to depth 5 produced 20 capture attempts, 2 verifications, and 2 cutoffs, saving about 234 nodes out of roughly 609k (<0.04%). Lowering the margin from 200cp to 150cp added one verification but no cutoff and slightly increased nodes.
- Decision: reject before slow sentinels or match testing. The strict verified form was too rare to create meaningful savings, while looser gates would exchange mate/PV safety for a threshold-tuning exercise unsupported by the measured tree. Reverted all ProbCut search and test changes; accepted `3ae1771` remains intact.
- Next target: pivot away from speculative forward pruning. Audit a structurally different low-risk source from strong engines: transposition-table reuse inside qsearch or a narrowly measured main-search SEE/late-move pruning lane, but first instrument qsearch TT opportunity and main-search late-move cost so the next patch has a quantified trigger.

## 2026-10-11 - Material-Rich Isolated QSearch TT Candidate

- Status: accepted-narrow / ready to commit
- Baseline: accepted `3ae1771`, preserved at `analysis-runs\bench-baseline-3ae1771`.
- Telemetry: the extended cutoff profiler tracks completed qsearch bounds by position and q-ply, normalizes mate scores across root plies, bypasses repetition-sensitive entries, and counts only the first reusable node on an active path. Four primary positions showed 50,410 reusable entries out of 302,558 eligible and an estimated 17.3% qsearch-entry / 15.2% generated-move reduction. The sparse false-mate plus three match-derived tactical targets showed 175,654 reusable entries out of 1,048,061 eligible and an estimated 17.4% entry reduction.
- Change: add a separate qsearch-only transposition table so qsearch entries cannot evict or masquerade as main-search entries. Keys include board hash, q-ply context, and halfmove clock; scores use existing mate-distance normalization; exact/lower/upper bounds use fail-hard returns; repetition-sensitive nodes bypass probe/store. The table is one quarter of configured main Hash up to an 8 MB cap, follows hash resize/clear and search age, and has `COACH_QSEARCH_TT=0` rollback.
- Safety narrowing: the first broad prototype changed the accepted sparse knight-pawn root-tie result. Isolating root-tie verification tables was necessary but did not remove the change. Qsearch TT reuse is therefore limited to positions with at least 10 non-king pieces, where telemetry showed the speed opportunity; sparse conversions, promotion races, and the accepted false-mate family stay on the established path. The halfmove clock was also added to the key to prevent fifty-move-context reuse.
- Tests: focused qsearch tests prove exact reuse across different root plies, q-ply and halfmove key separation, board-state preservation, sparse bypass, feature-off/feature-on exact fixed-depth root tables, lower leaf count, UCI resize cap, and dual-table clear. The full affected suite passed 161, skipped 68, failed 0, including perft, root-tie, engine, UCI, and profiler coverage. `run-slow-tests.cmd /position rollback` passed 4/4 with all six rollback SF2400 positions. The exact depth-11 sparse false-mate sentinel passed in 107.2s.
- Stability: two 16-group SearchStable runs against `3ae1771` retained identical moves, scores, PVs, and root order. Seed `260402`: +3.924% raw; seed `260403`: +2.261% raw. Stable identical-build control seed `260405` was +0.424%. Multi-run verdict: accepted, +2.668% mean control-adjusted gain, 2/2 positive runs, all 4/4 positions positive in both, worst aggregate position +1.495%, no dominance failure. Candidate qsearch/leaf entries fell 6.72%.
- Paired A/B: `analysis-runs\candidate-qsearch-tt-vs-3ae1771-20g-st1-20261011`, 20 fixed-1s games over 10 deterministic paired openings. Candidate scored `6 - 5 - 9 [0.525]`; White `3 - 4 - 3`, Black `3 - 1 - 6`. Treat as non-regression, not strength proof.
- ShallowBlue smoke: `analysis-runs\candidate-qsearch-tt-shallowblue1618-20g-5m0-20261011`, 20 games at `5+0`, concurrency 4, seed `26092501`, no book. Coach scored `16 - 2 - 2 [0.850]`; White `6 - 2 - 2`, Black `10 - 0 - 0`, matching the accepted `3ae1771` smoke score rate (`17 - 3 - 0 [0.850]`).
- Smoke mining: all 20 games replayed with 0 errors; 1,387 Coach-scored moves and 6 selected swings: 1 centipawn drop, 0 entered-losing-mate rows, and 5 mate-score changes. This is cleaner than the accepted baseline smoke's 10 selected swings, including 2 entered-losing-mate rows.
- Decision: accept narrowly. The material-rich isolated qsearch table converts a measured transposition opportunity into a repeatable control-adjusted speed gain, preserves fixed-depth decisions and every correctness sentinel, scores 52.5% in paired baseline play, and matches the accepted baseline's 85% ShallowBlue smoke score.

## 2026-10-12 - Depth-1 Late Quiet Move Pruning Candidate

- Status: accepted-narrow / ready to commit
- Baseline: accepted `8fbc85f`, preserved at `analysis-runs\bench-baseline-8fbc85f`.
- Telemetry trigger: the 10-position primary corpus recorded 316,943 late moves (move 4 or later) consuming 752,156 nodes; 99.733% failed low. At depth 1, move 8 or later, non-check, static evaluation at least 200cp below alpha, 136,586 branches recorded zero alpha raises or cutoffs. A separate target packet containing the sparse false-mate sentinel plus three SF19/ShallowBlue-derived tactical positions recorded 150,632 coarse-lane branches with only 7 alpha raises before the candidate's additional safety exclusions.
- Change: `COACH_LATE_MOVE_PRUNING=0` rolls back a depth-1-only late quiet pruning rule. It operates only at non-root scout nodes, from the eighth move onward, outside check/repetition/mate-class bounds, with at least 10 non-king pieces, no promotion-ready pawn, no promotion/capture/killer move, and a cached static evaluation at least 200cp below alpha. The move is made first and retained whenever it gives check, so checks and check extensions remain on the existing path.
- Correctness: direct helper sentinels cover every gate and rollback. Fixed-depth root equivalence retains the exact move, score, and complete root table while pruning nodes. Full affected regression coverage passed 164, skipped 68, failed 0; the exact sparse false-mate depth-11 sentinel passed in 107.1s; `run-slow-tests.cmd /position rollback` passed 4/4 over all six selected positions. On the four external tactical targets, all best moves and scores remained identical; the queen-rook target saved 66,732 nodes.
- Stability: two stable seeds against `8fbc85f` retained exact fixed-depth identity. Seeds `260503` and `260504` gained +5.510% and +6.629%; a stable control seed was -0.139%. The control-adjusted mean was +6.209%, both runs were positive, the worst aggregate position was +0.021%, and the candidate was not dominated. Nodes fell 16.52% and qsearch/leaf work fell 8.14%.
- Paired A/B: `analysis-runs\candidate-lmp-vs-8fbc85f-20g-st1-20261011`, 20 fixed-1s games, scored `11 - 6 - 3 [0.625]`. Candidate White was `9 - 1 - 0`; Black was `2 - 5 - 3`. This is a positive non-regression smoke, not an Elo estimate.
- ShallowBlue smoke: `analysis-runs\candidate-lmp-shallowblue1618-20g-5m0-20261011`, 20 games at `5+0`, concurrency 4, no opening book, seed `26092501`, scored `16 - 1 - 3 [0.875]`; White `6 - 1 - 3`, Black `10 - 0 - 0`. It narrowly exceeds the immediate `8fbc85f` smoke `16 - 2 - 2 [0.850]`, so treat it as non-regression support rather than proof of a rating jump.
- Mining and loss audit: all 20 games replayed with 0 errors; 1,470 Coach-scored moves yielded two selected swings, both in the sole loss. The loss's `Nxd2` entered a losing mate, but direct candidate-vs-rollback probes at depths 4-8 produced identical best moves, scores, and root rows at every depth. Both versions first see the forced mate at depth 8, so it is an existing horizon/root-choice issue rather than caused by this candidate.
- Decision: accept narrowly. This is a measured, heavily fenced instance of a standard strong-engine late-move-pruning idea: it clears all correctness gates, has a repeatable +6.209% control-adjusted speed gain, retains tactical-target scores, wins its paired smoke, and improves the immediate ShallowBlue smoke without a mate/replay warning.

## 2026-10-12 - Root-Depth / Time-Management Evidence Pass

- Status: diagnostic rejected / no patch
- Target packet: `analysis-runs\root-depth-transition-diagnostics-20261012\targets.json` contains the sole loss from the accepted late-move-pruning smoke plus three independent SF19 mismatches from the prior long-game diagnostic: sparse losing-mate transition, passed-pawn tactic, rook-choice tactic, and passed-pawn defense.
- Coach depth sweep: current `6d9396e` was probed at depths 4-10. The new smoke loss (`Nxd2`) looks like a real horizon event at depth 4-7, but by depth 8 the played move is mate-class and by depth 9 every plausible root alternative is mate-class. The actual 5+0 move was searched to depth 9 in 0.92s, so allocation of more time/depth would not have rescued it; the earlier `hxg4` error is a separate game-level target.
- Independent checks: the passed-pawn tactical case stays on Coach `d7c5` through depth 10 while SF19 prefers `d7e5` by roughly 700cp; the rook-choice case keeps Coach `e1d1` through depth 10 while SF19 prefers `a1d1`; the defensive case shifts among tied Coach moves (`h7h6`, `f7f6`, `g7g6`) but still remains far from SF19's negative assessment. These are persistent evaluation/child-search disagreements or broad root plateaus, not shallow tied moves becoming cleanly separated at deeper depth.
- Known-bad confirmation: earlier broad root-tie verification and broad time-management candidates already regressed in 5+0 smoke tests. This new packet gives no recurring, bounded-root mechanism that would justify reopening either family.
- Decision: reject root verification and time-management as the next patch source. Do not use the new loss to add an emergency depth rule. Pivot to a different evidence source: curated forcing tactical positions with naturally bounded legal/root bands, then measure move-ordering/child-search signal before considering capture-history or main-search SEE work.

## 2026-10-12 - Tactical Move-Ordering Evidence Pass

- Status: diagnostic rejected / no patch
- Corpus: `analysis-runs\tactical-ordering-diagnostics-20261012\corpus.json` used three independent Lucas/SF19 child-gap confirmations: `lucas-g4-i73`, `lucas-g10-i58`, and `lucas-g2-i69`. The packet is deliberately marked provisional because all three parent positions retain broad tied root tables; it was suitable for ordering-cost attribution, not for claiming a new best-move correction.
- Tooling: `tools\profile-search-cutoffs.mjs` now attributes every searched main-search move to hash, killer, promotion, capture by SEE class, or quiet with positive/nonpositive basic history, alongside subtree nodes, qsearch entries, alpha raises, and beta cutoffs. Focused profiler coverage passed 5/5.
- Aggregate ordering evidence at depth 8: hash moves cut off 73.7% of the time; non-losing SEE captures 64.9%; killers 23.8%; losing SEE captures 6.0%; positive-history quiets 1.0%; and nonpositive-history quiets 0.13%. This says existing TT/capture/SEE ordering is already doing most of the tactical work. Positive quiet history distinguishes a slightly better quiet class but remains far too weak for an ordering-only tactical explanation.
- Classification: the three independent reference alternatives are mixed (one quiet queen move, one capture, one quiet rook move), while Coach's root rows remain broad/flat. No move class is consistently late-and-decisive, so adding capture history, countermove history, continuation history, or a new SEE forward prune would be a threshold-driven experiment rather than a response to recurring evidence.
- Decision: reject a history-layer patch. Keep the new profiler attribution for future diagnostics. Pivot to a distinct source: evaluation residuals on stable, non-mate child-search disagreements, where Coach and SF19 agree on a bounded root/child line but materially disagree on the resulting position score.

## 2026-10-12 - Evaluation Residual Evidence Pass

- Status: diagnostic rejected / no patch
- Source: `analysis-runs\reference-child-lucas-sts-d8-confirm10-root20-20261006-hardened\reference-child-search.json`, analyzed with `tools\compare-static-eval-children.mjs` into `analysis-runs\evaluation-residual-diagnostics-20261012\lucas-hardened`.
- Eligibility result: all 11 historical Lucas rows remain non-keepers under the existing confirmed child-gap process. They are useful for static-component comparison but do not meet the required bounded-root, stable positive-child-gap gate for an evaluation change.
- Component result: the largest static child differences are heterogeneous: pawn structure (-59cp) in `lucas-g2-i69`, material (-100cp) from a material-changing comparison in `lucas-g6-i15`, and general position (-35cp) in `lucas-g4-i75`. Other rows scatter among opening, position, king, and pawn terms at small magnitudes. No concrete feature recurs independently strongly enough to tune.
- Decision: reject an evaluation correction. Do not adjust passed-pawn, king-safety, or generic positional constants from this packet; that would fit unrelated move-pair outcomes, not a verified evaluation residual. Pivot to a search-microarchitecture source: profile main TT collision/replacement quality and only consider a clustered/depth-preferred replacement policy if measured avoidable collision churn is material.

## 2026-10-12 - Main TT Replacement Evidence Pass

- Status: diagnostic rejected / no replacement-policy patch
- Tooling: `TranspositionTable.stats()` now records same-key refreshes, foreign-key collisions, foreign replacements, protected foreign stores, depth-versus-stale replacement reason, and replaced-entry depth/age summaries. `tools\profile-search-cutoffs.mjs` records both main and qsearch TT statistics per position. The direct collision sentinel passed, along with focused profiler tests.
- Main TT evidence at normal 32 MB (`1,048,576` entries): `analysis-runs\main-tt-profile-primary-20261012.json` recorded 188 foreign collisions in 62,528 stores (0.30%) over the 10-position primary corpus; `analysis-runs\main-tt-profile-targets-20261012.json` recorded 3,534 in 174,748 (2.02%) over the sparse false-mate and three tactical targets. Replaced entries averaged only about depth 1.1-1.3, and most foreign stores were correctly rejected to preserve a deeper current entry.
- Comparison: the separate capped qsearch TT has materially higher collision pressure on the same runs (7.4% primary, 11.7% tactical), consistent with its deliberately much smaller allocation and the already accepted isolated qsearch-TT optimization. This pass did not change qsearch allocation or threshold behavior.
- Decision: reject clustered/main-TT replacement work at Coach's actual Hash setting. The main table is sparse (under 1% fill on the primary corpus) and its collision rate is far too low for an extra bucket probe or more complex replacement logic to plausibly clear the predeclared +1% speed gate. Preserve the telemetry and pivot to a different measured source.

## 2026-10-12 - Exact Static-Evaluation Cache Candidate

- Status: accepted-narrow / local commit pending
- Baseline: accepted `6d9396e` (depth-1 late quiet move pruning), preserved at `analysis-runs\bench-baseline-6d9396e`.
- Evidence trigger: evaluation profiling on the primary corpus, tactical packet, and qsearch/target packet found 401,404 / 1,503,723 / 873,378 calls respectively. Pawn-structure work consumed 34.4% / 41.8% / 45.2% of total evaluation time, but a pawn-only key would be incorrect because passed-pawn scoring reads attacks, blockers, kings, material phase, and stopper pieces. Full board hashes repeated on 27.6-39.1% of calls, so an exact full static-evaluation cache was the safe boundary.
- Change: `Search.whiteRelativeEval()` uses a bounded 65,536-entry direct-mapped cache keyed by the full Zobrist position key. Every entry retains the full key and score, so index collisions are misses rather than aliases. The cache clears at the start of each root search, cannot grow across a game, and `COACH_STATIC_EVAL_CACHE=0` restores the old direct evaluation path.
- Correctness: direct sentinels cover same-key reuse, collision rejection, make/undo board integrity, and feature-off evaluation. `node --test tests\engine_regressions.test.mjs tests\profile_search_cutoffs.test.mjs` passed 80 with 68 skipped; `node --test tests\perft.test.mjs` passed 34/34; the sparse false-mate depth-11 sentinel passed 4/4 in 58.9s. Both controlled benchmark runs retained Exact move, score, node, leaf, PV, and root-table identity on every sampled position.
- Stability: `analysis-runs\evaluation-cache-candidate-20261012\benchmark-summary.txt` reports two stable same-session controls and two positive candidate runs. Raw speed gains were +6.104% and +5.407%; control-adjusted mean gain was +5.902%, with all 4/4 sampled positions positive in both runs and no dominance failure.
- Paired A/B: `analysis-runs\evaluation-cache-vs-6d9396e-20g-st1-20261012` scored `15 - 4 - 1 [0.775]`; candidate White `6 - 3 - 1`, Black `9 - 1 - 0`. Treat as a positive non-regression smoke, not an Elo estimate.
- ShallowBlue smoke: `analysis-runs\evaluation-cache-shallowblue1618-20g-st3-20261012` scored `10 - 10 - 0 [0.500]` at fixed 3 seconds per move. Every game was won by White (Coach White `10 - 0 - 0`, Coach Black `0 - 10 - 0`), so this is a strongly color-biased opening-policy sample rather than evidence that an exact cache changes Black play. All 20 games replayed cleanly; 1,515 Coach moves yielded 18 selected swings, chiefly existing long endgame conversion/mate entries on the Black side.
- Decision: accept narrowly. This is a measured, bounded, collision-safe pure static-evaluation cache rather than an incremental-evaluation rewrite. It provides repeatable +5.9% control-adjusted speed while preserving fixed-depth decisions and all correctness sentinels. The color-biased 3-second smoke is non-regression support only; future candidate matches should use varied paired openings before treating that opponent result as a strength estimate.
