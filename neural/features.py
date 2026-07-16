"""features.py (stage-5 groundwork).

Python twin of neural/lib/features.mjs. Pure function of the FEN
string so JS and Python produce identical sparse feature indices.
See lib/features.mjs for the authoritative index-layout docstring.
"""

FEATURE_DIM = 781
_PLANE = {"P": 0, "N": 1, "B": 2, "R": 3, "Q": 4, "K": 5,
          "p": 6, "n": 7, "b": 8, "r": 9, "q": 10, "k": 11}


def encode_fen(fen: str):
    parts = fen.strip().split()
    placement = parts[0]
    stm = parts[1]
    castling = parts[2] if len(parts) > 2 else "-"
    ep = parts[3] if len(parts) > 3 else "-"

    idx = []
    rows = placement.split("/")  # rows[0] = rank 8
    for r in range(8):
        file = 0
        for ch in rows[r]:
            if ch.isdigit():
                file += int(ch)
                continue
            plane = _PLANE[ch]
            rank0 = 7 - r
            sq = rank0 * 8 + file
            idx.append(plane * 64 + sq)
            file += 1
    if stm == "w":
        idx.append(768)
    if "K" in castling:
        idx.append(769)
    if "Q" in castling:
        idx.append(770)
    if "k" in castling:
        idx.append(771)
    if "q" in castling:
        idx.append(772)
    if ep != "-":
        f = ord(ep[0]) - 97
        if 0 <= f < 8:
            idx.append(773 + f)
    return sorted(idx)


# ---- optional endgame groups (twin of lib/features.mjs) -------------------
import endgame as E  # noqa: E402

BASE_DIM = 781
GROUP_ORDER = ["endgame-material-class", "passed-pawns", "king-distance",
               "king-pawn-geometry", "rook-ending", "interactions"]
GROUP_DIM = {"endgame-material-class": 13, "passed-pawns": 38, "king-distance": 34,
             "king-pawn-geometry": 11, "rook-ending": 16, "interactions": 8}
FEATURE_SCHEMA_VERSION = "coach-neural-features-2"


def feature_layout(groups=()):
    for g in groups:
        if g not in GROUP_DIM:
            raise ValueError("unknown feature group: " + g)
    canon = [g for g in GROUP_ORDER if g in groups]
    offsets, off = {}, BASE_DIM
    for g in canon:
        offsets[g] = off
        off += GROUP_DIM[g]
    return {"groups": canon, "dim": off, "offsets": offsets}


def _bucket(v, edges):
    for i, e in enumerate(edges):
        if v <= e:
            return i
    return len(edges)


def _best_passer(ps, white):
    if not ps:
        return None
    best = ps[0]
    for p in ps[1:]:
        if (p["rank"] > best["rank"]) if white else (p["rank"] < best["rank"]):
            best = p
    return best


def _emit_material_class(board, push):
    order = ["pawn-only", "minor-piece", "rook", "queen", "queenless-mixed", "mixed"]
    cls = E.material_class(board)
    if cls in order:
        push(order.index(cls))
    bc = E.bishop_colour_state(board)
    if bc == "opposite-coloured":
        push(6)
    if bc == "same-coloured":
        push(7)
    push(8 + _bucket(E.non_pawn_material(board)["total"], [3, 6, 12, 20]))


def _emit_passed_pawns(board, push):
    for white, base in ((True, 0), (False, 19)):
        ps = E.passed_pawns(board, white)
        push(base + min(3, len(ps)))
        best = _best_passer(ps, white)
        if best:
            advance = best["rank"] if white else 7 - best["rank"]
            push(base + 4 + min(5, max(0, advance - 1)))
            if any(p["isProtected"] for p in ps):
                push(base + 10)
            if any(p["connected"] for p in ps):
                push(base + 11)
            if any(p["outside"] for p in ps):
                push(base + 12)
            if any(p["mobile"] for p in ps):
                push(base + 13)
            push(base + 14 + _bucket(best["steps"], [1, 2, 3, 4]))


def _emit_king_distance(board, push):
    for white, base in ((True, 0), (False, 17)):
        ok, ek = E.king_sq(board, white), E.king_sq(board, not white)
        ps = E.passed_pawns(board, white)
        best = _best_passer(ps, white)
        if best and ok is not None:
            push(base + _bucket(E.chebyshev(ok, best["sq"]), [1, 3, 5]))
        if best and ek is not None:
            push(base + 4 + _bucket(E.chebyshev(ek, best["promoSq"]), [1, 3, 5]))
        if ok is not None:
            push(base + 8 + min(3, round(E.centralization(ok))))
        own_pawns = E.piece_list(board, "P" if white else "p")
        if ok is not None and own_pawns:
            d = min(E.chebyshev(ok, p) for p in own_pawns)
            push(base + 12 + _bucket(d, [1, 3]))
        if best and E.enemy_king_outside_square(board, best, white):
            push(base + 15)
            if board["stm"] == ("w" if white else "b"):
                push(base + 16)


def _emit_king_pawn_geometry(board, push):
    o = E.opposition_state(board)
    if o["kind"] == "direct":
        push(0 if o["holder"] == "w" else 1)
    if o["kind"] == "distant":
        push(2 if o["holder"] == "w" else 3)
    wk, bk = E.king_sq(board, True), E.king_sq(board, False)
    if wk is None or bk is None:
        return
    df = abs(E.file_of(wk) - E.file_of(bk))
    dr = abs(E.rank_of(wk) - E.rank_of(bk))
    if df == 0:
        push(4)
    if dr == 0:
        push(5)
    if df == dr:
        push(6)
    push(7 + _bucket(max(df, dr), [1, 2, 3]))


def _emit_rook_ending(board, push):
    for white, base in ((True, 0), (False, 8)):
        rb = E.rook_behind_passer(board, white)
        if rb["ownBehind"] > 0:
            push(base + 0)
        if rb["enemyBehind"] > 0:
            push(base + 1)
        push(base + 2 + min(2, E.rooks_on_seventh(board, white)))
        fs = E.rook_file_state(board, white)
        if fs["open"] > 0:
            push(base + 5)
        if fs["semiOpen"] > 0:
            push(base + 6)
        if E.king_cut_off_from_passer(board, white) > 0:
            push(base + 7)


def _emit_interactions(board, push):
    for white, base in ((True, 0), (False, 4)):
        ps = E.passed_pawns(board, white)
        best = _best_passer(ps, white)
        if not best:
            continue
        advance = best["rank"] if white else 7 - best["rank"]
        outside = E.enemy_king_outside_square(board, best, white)
        if advance >= 4 and outside:
            push(base + 0)
        if E.material_class(board) == "rook" and E.rook_behind_passer(board, white)["ownBehind"] > 0:
            push(base + 1)
        ok, ek = E.king_sq(board, white), E.king_sq(board, not white)
        if E.non_pawn_material(board)["total"] <= 6 and ok is not None and ek is not None \
                and E.chebyshev(ok, best["sq"]) < E.chebyshev(ek, best["sq"]):
            push(base + 2)
        if best["isProtected"] and advance >= 4:
            push(base + 3)


_EMITTERS = {
    "endgame-material-class": _emit_material_class,
    "passed-pawns": _emit_passed_pawns,
    "king-distance": _emit_king_distance,
    "king-pawn-geometry": _emit_king_pawn_geometry,
    "rook-ending": _emit_rook_ending,
    "interactions": _emit_interactions,
}


def encode_fen_extended(fen, groups=()):
    idx = encode_fen(fen)
    if not groups:
        return idx
    layout = feature_layout(groups)
    board = E.parse_board(fen)
    for g in layout["groups"]:
        off, dim = layout["offsets"][g], GROUP_DIM[g]

        def push(bit, _off=off, _dim=dim, _g=g):
            if bit < 0 or bit >= _dim:
                raise ValueError("feature group %s emitted out-of-range bit %d" % (_g, bit))
            idx.append(_off + bit)

        _EMITTERS[g](board, push)
    return sorted(idx)


if __name__ == "__main__":
    import json
    import sys
    data = json.load(open(sys.argv[1]))
    groups = data.get("groups", [])
    key = "indices"
    bad = 0
    for row in data["fixtures"]:
        got = encode_fen_extended(row["fen"], groups) if groups else encode_fen(row["fen"])
        if got != row[key]:
            bad += 1
            print("MISMATCH", row["fen"])
    label = ("extended[" + ",".join(groups) + "]") if groups else "baseline-781"
    print(f"checked {len(data['fixtures'])} fixtures ({label}), {bad} mismatches")
    sys.exit(1 if bad else 0)
