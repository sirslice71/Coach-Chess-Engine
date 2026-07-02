test("Opening", () => {

    board.load(
        START_FEN
    );

    const result =
        search.bestMove(1);

    expect([
        "e2-e4",
        "d2-d4"
    ]).toContain(
        result.move.toString()
    );

});