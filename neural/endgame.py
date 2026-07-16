"""endgame.py — pure-stdlib Python twin of lib/endgame.mjs.

Deterministic board primitives for endgame-aware features, derived ONLY from
the FEN. No engine, no labels, no metadata. Squares are 0..63 with a1=0 ...
h8=63 (rank0*8 + file), matching lib/features.mjs. Must stay behaviourally
identical to lib/endgame.mjs — parity fixtures pin this.
"""

PIECE_VALUES = {"N": 3, "B": 3, "R": 5, "Q": 9}


def parse_board(fen):
    parts = str(fen).strip().split()
    rows = parts[0].split("/")
    squares = [None] * 64
    for r in range(8):
        file = 0
        for ch in rows[r]:
            if ch.isdigit():
                file += int(ch)
                continue
            squares[(7 - r) * 8 + file] = ch
            file += 1
    hm = int(parts[4]) if len(parts) > 4 and parts[4].lstrip("-").isdigit() else 0
    return {"squares": squares, "stm": "w" if (len(parts) > 1 and parts[1] == "w") else "b", "halfmove": hm}


def file_of(sq):
    return sq & 7


def rank_of(sq):
    return sq >> 3


def chebyshev(a, b):
    return max(abs(file_of(a) - file_of(b)), abs(rank_of(a) - rank_of(b)))


def piece_list(board, piece):
    return [s for s in range(64) if board["squares"][s] == piece]


def counts(board):
    c = {}
    for p in board["squares"]:
        if p:
            c[p] = c.get(p, 0) + 1
    return c


def king_sq(board, white):
    lst = piece_list(board, "K" if white else "k")
    return lst[0] if lst else None


def centralization(sq):
    f, r = file_of(sq), rank_of(sq)
    return max(abs(f - 3.5) - 0.5, abs(r - 3.5) - 0.5)


def passed_pawns(board, white):
    own = piece_list(board, "P" if white else "p")
    enemy = piece_list(board, "p" if white else "P")
    out = []
    for sq in own:
        f, r = file_of(sq), rank_of(sq)
        blocked = False
        for e in enemy:
            ef, er = file_of(e), rank_of(e)
            if abs(ef - f) > 1:
                continue
            if (er > r) if white else (er < r):
                blocked = True
                break
        if blocked:
            continue
        home = 1 if white else 6
        steps_plain = (7 - r) if white else r
        steps = steps_plain - 1 if r == home else steps_plain
        back_r = r - 1 if white else r + 1
        is_protected = any(rank_of(o) == back_r and abs(file_of(o) - f) == 1 for o in own)
        ahead = sq + 8 if white else sq - 8
        mobile = 0 <= ahead < 64 and board["squares"][ahead] is None
        out.append({"sq": sq, "file": f, "rank": r, "steps": steps,
                    "promoSq": 56 + f if white else f,
                    "isProtected": is_protected, "mobile": mobile})
    for p in out:
        p["connected"] = any(q is not p and abs(q["file"] - p["file"]) == 1 for q in out)
    others = piece_list(board, "P") + piece_list(board, "p")
    for p in out:
        rest = [s for s in others if s != p["sq"]]
        if not rest:
            p["outside"] = False
            continue
        com = sum(file_of(s) for s in rest) / len(rest)
        p["outside"] = abs(p["file"] - com) >= 3
    return out


def enemy_king_outside_square(board, passer, white):
    ek = king_sq(board, not white)
    if ek is None:
        return False
    kd = chebyshev(ek, passer["promoSq"])
    defender_to_move = board["stm"] == ("b" if white else "w")
    budget = passer["steps"] if defender_to_move else passer["steps"] - 1
    return kd > budget


def opposition_state(board):
    wk, bk = king_sq(board, True), king_sq(board, False)
    if wk is None or bk is None:
        return {"kind": "none", "holder": None}
    df = abs(file_of(wk) - file_of(bk))
    dr = abs(rank_of(wk) - rank_of(bk))
    aligned = df == 0 or dr == 0 or df == dr  # same file, same rank, or same diagonal
    if not aligned:
        return {"kind": "none", "holder": None}
    gap = max(df, dr) - 1  # squares strictly between the kings
    if gap not in (1, 3, 5):
        return {"kind": "none", "holder": None}
    holder = "b" if board["stm"] == "w" else "w"
    return {"kind": "direct" if gap == 1 else "distant", "holder": holder}


def material_class(board):
    c = counts(board)

    def n(k):
        return c.get(k, 0) + c.get(k.lower(), 0)

    q, r = n("Q"), n("R")
    minors = n("B") + n("N")
    if q == 0 and r == 0 and minors == 0:
        return "pawn-only"
    if q == 0 and r == 0 and minors > 0:
        return "minor-piece"
    if q == 0 and r > 0 and minors == 0:
        return "rook"
    if q > 0 and r == 0 and minors == 0:
        return "queen"
    if q == 0:
        return "queenless-mixed"
    return "mixed"


def bishop_colour_state(board):
    wb, bb = piece_list(board, "B"), piece_list(board, "b")
    if len(wb) != 1 or len(bb) != 1:
        return "n/a"

    def col(s):
        return (file_of(s) + rank_of(s)) % 2

    return "same-coloured" if col(wb[0]) == col(bb[0]) else "opposite-coloured"


def non_pawn_material(board):
    c = counts(board)
    w = sum(c.get(k, 0) * v for k, v in PIECE_VALUES.items())
    b = sum(c.get(k.lower(), 0) * v for k, v in PIECE_VALUES.items())
    return {"white": w, "black": b, "total": w + b}


def rook_behind_passer(board, white):
    rooks = piece_list(board, "R" if white else "r")
    e_rooks = piece_list(board, "r" if white else "R")
    own_behind = enemy_behind = 0
    for p in passed_pawns(board, white):
        for rk in rooks:
            if file_of(rk) == p["file"] and ((rank_of(rk) < p["rank"]) if white else (rank_of(rk) > p["rank"])):
                own_behind += 1
        for rk in e_rooks:
            if file_of(rk) == p["file"] and ((rank_of(rk) < p["rank"]) if white else (rank_of(rk) > p["rank"])):
                enemy_behind += 1
    return {"ownBehind": own_behind, "enemyBehind": enemy_behind}


def rooks_on_seventh(board, white):
    rooks = piece_list(board, "R" if white else "r")
    target = 6 if white else 1
    return len([s for s in rooks if rank_of(s) == target])


def rook_file_state(board, white):
    rooks = piece_list(board, "R" if white else "r")
    own_p = [file_of(s) for s in piece_list(board, "P" if white else "p")]
    enemy_p = [file_of(s) for s in piece_list(board, "p" if white else "P")]
    open_, semi = 0, 0
    for rk in rooks:
        f = file_of(rk)
        has_own, has_enemy = f in own_p, f in enemy_p
        if not has_own and not has_enemy:
            open_ += 1
        elif not has_own:
            semi += 1
    return {"open": open_, "semiOpen": semi}


def king_cut_off_from_passer(board, white):
    rooks = piece_list(board, "R" if white else "r")
    ek = king_sq(board, not white)
    if ek is None:
        return 0
    cut = 0
    for p in passed_pawns(board, white):
        for rk in rooks:
            rf, kf, pf = file_of(rk), file_of(ek), p["file"]
            if (pf < rf < kf) or (kf < rf < pf):
                cut += 1
                break
    return cut
