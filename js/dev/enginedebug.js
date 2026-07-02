//==================================================
// enginedebug.js
//==================================================

export default class EngineDebug {

    static search = false;
    static moveOrdering = false;
    static evaluation = false;
    static attacks = false;
    static perft = false;
    static repetition = false;

    static searchLog(...args) {

        if (!this.search)
            return;

        console.log(...args);

    }

    static moveOrderingLog(...args) {

        if (!this.moveOrdering)
            return;

        console.log(...args);

    }

    static moveOrderingTable(data) {

        if (!this.moveOrdering)
            return;

        console.table(data);

    }

    static evaluationLog(...args) {

        if (!this.evaluation)
            return;

        console.log(...args);

    }

    static attackLog(...args) {

        if (!this.attacks)
            return;

        console.log(...args);

    }

    static perftLog(...args) {

        if (!this.perft)
            return;

        console.log(...args);

    }

    static attackLog(...args) {

        if (!this.attacks)
            return;

        console.log(...args);

    }

    static attackSummary(board, square, byWhite, attack) {

        if (!this.attacks)
            return;

        console.log("Pawn   :", attack.pawn(board, square, byWhite));
        console.log("Knight :", attack.knight(board, square, byWhite));
        console.log("Bishop :", attack.bishop(board, square, byWhite));
        console.log("Rook   :", attack.rook(board, square, byWhite));
        console.log("Queen  :", attack.queen(board, square, byWhite));
        console.log("King   :", attack.king(board, square, byWhite));

    }

    static disableAll() {

        this.search = false;
        this.moveOrdering = false;
        this.evaluation = false;
        this.attacks = false;
        this.perft = false;
        this.repetition = false;

    }

    static enableAll() {

        this.search = true;
        this.moveOrdering = true;
        this.evaluation = true;
        this.attacks = true;
        this.perft = true;
        this.repetition = true;

    }

}