export default class CoachLab {

    constructor(board, search, evaluation) {

        this.board = board;

        this.search = search;

        this.evaluation = evaluation;

    }

    explain(move) {

        return this.search.explainMove(move);

    }

}