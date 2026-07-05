# Coach Game Analysis — 2026-07-05 Loss 1

Source: `Coach_v_old_Coach_260705_5_0_v2`, Round 9, White = Coach-uci (New Coach),
Black = Coach-uci [001] (Old Coach). Result 1-0 (New Coach won as White).
Annotated by Stockfish 18 (10s/move).

This loss is one game from a small Arena sample (4 wins / 2 losses / 4 draws)
where New Coach appears stronger overall. This report only extracts and
documents candidate diagnostic positions. No engine code was changed.

## Summary

Old Coach (Black) made two significant middlegame errors early (12...Nxd5?
and 14...Bxc5?) that gave New Coach (White) a large, fairly stable advantage
by move 20. The game then ground through a long rook-and-pawn phase where
Black's position slowly disintegrated; a bad pawn push (45...b2?) let White
consolidate. The endgame reached a real Black fighting chance around move
73-75 (White up a rook for a pawn but Black had an active king and connected
kingside pawns); two further errors — 75...Rf4? and 78...Kd5? — threw away
Black's last practical chances and let White's king and rook coordinate to
round up the pawns and eventually promote.

Major themes for Coach's own diagnostic value: (1) whether Coach's search at
practical depths (5-6) independently reproduces these blunders when it is
put on the losing side of the position, which would indicate a real
evaluation/search blind spot rather than a one-off; and (2) rook-endgame
technique in races between an advanced passed pawn and outside checks.

All FENs below were reconstructed by replaying the PGN mainline (variations
ignored) with `python-chess`, and cross-checked against the actual move
played at each target ply (all five matched exactly, so the FENs are
confirmed correct).

All Coach depth 5/6 results below were produced by running the current
committed engine (`js/engine/search.js` `bestMove()`) directly against each
FEN in an isolated scratch copy of the repository at HEAD — not through a
live UCI clock-based search. No source files were modified to produce these
numbers.

## Candidate Regression FENs

### 1. Before 12...Nxd5?

- Move: 12, Black to move
- FEN: `r2q1rk1/p1p2ppp/5nn1/1pPPp3/1b2P1b1/3BBN2/P2N1PPP/R2QK2R b KQ - 2 12`
- Game move: 12...Nxd5? (Black, flagged `$4`)
- Stockfish recommendation: 12...c6 (keeps rough equality, $17 for White after the game continuation vs $4 for the blunder)
- Coach depth 5: `g6h4` (Ng6-h4), eval (side to move, Black) = +25 cp
- Coach depth 6: `f6d5` (Nf6xd5) — **the same move flagged as the blunder** — eval (side to move, Black) = +52 cp
- Theme: middlegame tactic
- Notes: Coach's own depth-6 search independently selects the exact move Stockfish marked as a losing error, and scores it as *better* for Black than depth 5's alternative. This suggests the tactical point Stockfish is making (why Nxd5 fails) sits beyond a 6-ply horizon for Coach, or that Coach's evaluation misjudges the resulting position after `exd5 Qxd5`. High-value regression candidate: worth testing at deeper depths (8-10) to see where Coach starts to see the problem, if ever.

### 2. Before 14...Bxc5?

- Move: 14, Black to move
- FEN: `r4rk1/p1p2ppp/6n1/1pPqp3/1b4b1/4BN2/P2NBPPP/R2QK2R b KQ - 1 14`
- Game move: 14...Bxc5? (Black, flagged `$4`)
- Stockfish recommendation: 14...e4, "worth consideration" ($14 for White after the game continuation, i.e. a much smaller advantage than what Black's blunder gave up)
- Coach depth 5: `a7a6` (a7-a6) — a different, quiet move, eval (side to move, Black) = +14 cp
- Coach depth 6: not practical — exceeded the available runtime budget in this environment (>40s, aborted). Depth 5 shows more legal material on the board than the other four positions, which makes each additional ply noticeably more expensive here.
- Theme: middlegame tactic
- Notes: unlike position 1, Coach's own depth-5 search does *not* reproduce this blunder — it picks a quiet, reasonable move instead. This suggests 14...Bxc5? may have been more specific to the actual game conditions (e.g. clock pressure or a different search depth/mode used mid-game) rather than a structural blind spot reproducible from a cold static search. Recommend re-testing at depth 6+ if/when a faster verification environment is available, before concluding this is a real regression case.

### 3. Before 45...b2?

- Move: 45, Black to move
- FEN: `8/R5N1/2p2pkp/4p3/P7/1p3P1P/2r3PK/8 b - - 0 45`
- Game move: 45...b2? (Black, flagged `$4`)
- Stockfish recommendation: 45...c5, "was possible" ($11, roughly balanced, vs $18/clearly winning for White after the game continuation)
- Coach depth 5: `b3b2` (b3-b2) — **the same move flagged as the blunder**, eval (side to move, Black) = +21 cp
- Coach depth 6: `b3b2` — same move again, eval (side to move, Black) = -1 cp
- Theme: pawn-race judgment
- Notes: this is the clearest, most reproducible blind spot in the set. Both depth 5 and depth 6 independently select the exact blunder move, with depth 6 showing that the position is actually roughly equal at best (score collapses from +21 to -1 cp) rather than clearly good for Black. Coach appears to overvalue a passed b-pawn's push here without properly accounting for the White knight and rook combining to win it. Best candidate in this set for a future regression/benchmark test.

### 4. Before 75...Rf4?

- Move: 75, Black to move
- FEN: `8/8/7R/5p2/4k1PK/5r1P/8/8 b - - 0 75`
- Game move: 75...Rf4? (Black, flagged `$4`, "lets it slip away")
- Stockfish recommendation: 75...Rf1, "the only rescuing move" ($11, drawing, vs $18/winning for White after the game continuation)
- Coach depth 5: `f5g4` (f5-g4, a pawn push) — a different move, eval (side to move, Black) = -70 cp
- Coach depth 6: `f3f4` (Rf3-f4) — **the same move as the blunder** (Rf4), eval (side to move, Black) = -90 cp
- Theme: rook endgame defense
- Notes: depth 5 avoids the losing move, but depth 6 converges onto exactly the move Stockfish condemns, and rates the position as (correctly, per Stockfish) losing either way. This depth-dependent flip (5 avoids it, 6 walks into it) is itself notable and worth a closer look — it may indicate a horizon effect specific to this pawn-and-rook race rather than a stable preference.

### 5. Before 78...Kd5?

- Move: 78, Black to move
- FEN: `8/4R3/8/8/4kpPK/7P/5r2/8 b - - 1 78`
- Game move: 78...Kd5? (Black, flagged `$4`, "ruins a clearly superior position")
- Stockfish recommendation: 78...Kf3, "just about the only chance" ($11, drawing, vs $18/winning for White after the game continuation)
- Coach depth 5: `e4d5` (Ke4-d5) — **the same move flagged as the blunder**, eval (side to move, Black) = -80 cp
- Coach depth 6: `e4d4` (Ke4-d4) — a different move from the blunder, but also different from Stockfish's Kf3, eval (side to move, Black) = -102 cp
- Theme: king activity / passed-pawn conversion (from White's side)
- Notes: depth 5 reproduces the exact blunder. Depth 6 avoids that specific move but still does not find Stockfish's actual saving try (Kf3), and reports an even worse score for its own chosen alternative. This suggests Coach's king-activity/king-safety judgment in this specific king-and-pawn-vs-rook race is weak at both tested depths, even though depth 6 "improves" on the literal game move.

## Improvement Buckets

1. **Tactical search/eval misses** — Position 1 (12...Nxd5?) is the clearest case: Coach's own depth-6 search prefers the refuted move and rates it favorably. Position 2 (14...Bxc5?) did not reproduce under cold static search at depth 5, so it is a weaker candidate until retested at depth 6+.

2. **Passed-pawn race judgment** — Position 3 (45...b2?) is a strong, clean regression candidate: both tested depths independently choose the same losing pawn push, and depth 6's own score shows it barely holds equality rather than the advantage Coach's shallower search implied. This lines up with the recent passed-pawn evaluation work and suggests the *pushing* side's judgment (not just the defending/converting side) may need attention — Coach is the side pushing b3-b2 here and misjudging it.

3. **Rook endgame defense** — Position 4 (75...Rf4?) and position 5 (78...Kd5?) are both in the same long rook-and-pawn ending and both show a depth-5-vs-depth-6 disagreement, with depth 6 landing closer to (position 4) or still missing (position 5) the objectively correct defensive try. This looks like a genuine soft spot in Coach's rook-endgame defensive technique under time/depth pressure, distinct from the passed-pawn conversion work already done (that work targets the attacking side; these positions are about the defending side finding only-moves).

4. **Time-management observations** — No UCI clock data is available from this PGN (no `go wtime` logs), so no direct conclusion can be drawn about whether time pressure contributed to these specific blunders. Flagging as an open question rather than a finding: it would be useful to capture actual `go` parameters from future Arena games so blunders can be correlated with clock state, not just static depth.

5. **Candidate future regression tests** — Positions 1, 3, 4, and 5 are recommended as reproducible FEN-based regression/benchmark cases (position 2 is weaker evidence pending a deeper retest). Position 3 in particular is the strongest single candidate: fast to search, reproducible at two depths, and directly relevant to the recently-changed passed-pawn evaluation code.

## Recommendations

Do not implement any code changes yet. This report is diagnostic only.

Recommended next safest follow-up task: add position 3 (`8/R5N1/2p2pkp/4p3/P7/1p3P1P/2r3PK/8 b - - 0 45`) as a small, isolated regression test (e.g. asserting Coach's search does *not* prefer `b3b2` once a fix is attempted, or at minimum recording today's baseline move/score so future evaluation changes can be checked against it). This is the cleanest, most reproducible finding in the set and touches the pawn-evaluation code most recently modified, so it is the lowest-risk place to start. Positions 1, 4, and 5 are good secondary candidates once a deeper-search verification environment is available (depth 8-10 for position 1 in particular, to see whether Coach ever finds the refutation of Nxd5).
