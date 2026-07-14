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


if __name__ == "__main__":
    import json
    import sys
    data = json.load(open(sys.argv[1]))
    bad = 0
    for row in data["fixtures"]:
        got = encode_fen(row["fen"])
        if got != row["indices"]:
            bad += 1
            print("MISMATCH", row["fen"])
    print(f"checked {len(data['fixtures'])} fixtures, {bad} mismatches")
    sys.exit(1 if bad else 0)
