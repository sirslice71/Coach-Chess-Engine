export default class CoachLabPanel {

    constructor({ onLoadFen } = {}) {

        this.onLoadFen =
            typeof onLoadFen === "function"
                ? onLoadFen
                : null;

        this.fileInput =
            document.getElementById("labFileInput");

        this.statusElement =
            document.getElementById("labStatus");

        this.summaryElement =
            document.getElementById("labSummary");

        this.candidatesElement =
            document.getElementById("labCandidates");

        this.detailElement =
            document.getElementById("labDetail");

        this.gameTabButton =
            document.getElementById("gameTabBtn");

        this.labTabButton =
            document.getElementById("labTabBtn");

        this.gamePanel =
            document.getElementById("gamePanel");

        this.labPanel =
            document.getElementById("labPanel");

    }

    initialize() {

        if (!this.fileInput) {
            return;
        }

        this.fileInput.addEventListener(
            "change",
            () => this.loadSelectedFile()
        );

        this.gameTabButton?.addEventListener(
            "click",
            () => this.showPane("game")
        );

        this.labTabButton?.addEventListener(
            "click",
            () => this.showPane("lab")
        );

        this.renderEmpty();

    }

    showPane(name) {

        const labActive =
            name === "lab";

        this.gameTabButton?.classList.toggle("active", !labActive);
        this.labTabButton?.classList.toggle("active", labActive);
        this.gamePanel?.classList.toggle("active", !labActive);
        this.labPanel?.classList.toggle("active", labActive);

    }

    renderEmpty() {

        this.setStatus("No analysis loaded.");

        if (this.summaryElement) {
            this.summaryElement.innerHTML = "";
        }

        if (this.candidatesElement) {
            this.candidatesElement.innerHTML = "";
        }

        if (this.detailElement) {
            this.detailElement.innerHTML = "";
        }

    }

    async loadSelectedFile() {

        const file =
            this.fileInput.files &&
            this.fileInput.files[0];

        if (!file) {
            this.renderEmpty();
            return;
        }

        try {
            const text =
                await file.text();

            const analysis =
                JSON.parse(text);

            this.renderAnalysis(analysis, file.name);
        }
        catch (error) {
            this.setStatus(`Could not load analysis: ${error.message}`);
        }

    }

    renderAnalysis(analysis, fileName) {

        const positions =
            Array.isArray(analysis.positions)
                ? analysis.positions
                : [];

        const candidates =
            this.topCandidates(positions);

        this.setStatus(fileName);
        this.showPane("lab");
        this.renderSummary(analysis.summary, candidates.length);
        this.renderCandidates(candidates);

        if (candidates.length > 0) {
            this.renderDetail(candidates[0]);
        }
        else if (this.detailElement) {
            this.detailElement.innerHTML = "";
        }

    }

    renderSummary(summary = {}, candidateCount = 0) {

        if (!this.summaryElement) {
            return;
        }

        this.summaryElement.innerHTML = "";

        const items = [
            ["Positions", summary.analyzed],
            ["Failures", summary.failed],
            [
                "Agreement",
                this.ratioText(
                    summary.bestMoveAgreements,
                    summary.comparablePositions
                )
            ],
            ["Avg Diff", this.cp(summary.averageAbsEvalDiffCp)],
            ["Strongly Disliked", summary.stronglyDislikedMoves],
            ["Candidates", candidateCount]
        ];

        for (const [label, value] of items) {
            const tile =
                document.createElement("div");

            tile.className = "labMetric";

            const metricValue =
                document.createElement("strong");

            metricValue.textContent =
                this.valueText(value);

            const metricLabel =
                document.createElement("span");

            metricLabel.textContent = label;

            tile.appendChild(metricValue);
            tile.appendChild(metricLabel);
            this.summaryElement.appendChild(tile);
        }

    }

    renderCandidates(candidates) {

        if (!this.candidatesElement) {
            return;
        }

        this.candidatesElement.innerHTML = "";

        for (const candidate of candidates.slice(0, 12)) {
            const button =
                document.createElement("button");

            button.type = "button";
            button.className = "labCandidate";

            const title =
                document.createElement("span");

            title.className = "labCandidateTitle";
            title.textContent = candidate.label || "Position";

            const meta =
                document.createElement("span");

            meta.className = "labCandidateMeta";
            meta.textContent =
                [
                    candidate.priority || "review",
                    this.cp(candidate.comparison?.evalDiffCp),
                    this.movePair(candidate)
                ]
                    .filter(Boolean)
                    .join(" | ");

            button.appendChild(title);
            button.appendChild(meta);

            button.addEventListener(
                "click",
                () => this.renderDetail(candidate)
            );

            this.candidatesElement.appendChild(button);
        }

    }

    renderDetail(candidate) {

        if (!this.detailElement) {
            return;
        }

        this.detailElement.innerHTML = "";

        const title =
            document.createElement("h4");

        title.textContent =
            candidate.label || "Position";

        const grid =
            document.createElement("div");

        grid.className = "labDetailGrid";

        const rows = [
            ["Priority", candidate.priority],
            ["Coach", this.engineLine(candidate.coach)],
            ["Reference", this.engineLine(candidate.reference)],
            ["Eval Diff", this.cp(candidate.comparison?.evalDiffCp)],
            ["Themes", (candidate.themes || []).join(", ")]
        ];

        for (const [label, value] of rows) {
            const row =
                document.createElement("div");

            const key =
                document.createElement("span");

            key.textContent = label;

            const data =
                document.createElement("strong");

            data.textContent =
                this.valueText(value);

            row.appendChild(key);
            row.appendChild(data);
            grid.appendChild(row);
        }

        const fen =
            document.createElement("code");

        fen.className = "labFen";
        fen.textContent = candidate.fen || "";

        const actions =
            document.createElement("div");

        actions.className = "labActions";

        const loadButton =
            document.createElement("button");

        loadButton.type = "button";
        loadButton.textContent = "Load FEN";
        loadButton.disabled =
            !candidate.fen || !this.onLoadFen;

        loadButton.addEventListener(
            "click",
            () => this.onLoadFen(candidate.fen)
        );

        actions.appendChild(loadButton);

        detailAppend(
            this.detailElement,
            title,
            grid,
            fen,
            actions
        );

    }

    topCandidates(positions) {

        return positions
            .filter(position => position && position.fen)
            .filter(position => {
                const severity =
                    Number(position.comparison?.severity || 0);

                const priority =
                    String(position.priority || "").toLowerCase();

                return severity > 0 ||
                    priority === "high" ||
                    position.comparison?.bestMoveAgree === false;
            })
            .sort((left, right) => {
                const leftSeverity =
                    Number(left.comparison?.severity || 0);

                const rightSeverity =
                    Number(right.comparison?.severity || 0);

                if (rightSeverity !== leftSeverity) {
                    return rightSeverity - leftSeverity;
                }

                return Number(right.comparison?.evalDiffCp || 0) -
                    Number(left.comparison?.evalDiffCp || 0);
            });

    }

    setStatus(text) {

        if (this.statusElement) {
            this.statusElement.textContent = text;
        }

    }

    ratioText(value, total) {

        if (!Number.isFinite(value) || !Number.isFinite(total)) {
            return "";
        }

        return `${value}/${total}`;

    }

    cp(value) {

        if (!Number.isFinite(value)) {
            return "";
        }

        return `${value}cp`;

    }

    movePair(candidate) {

        const coach =
            candidate.coach?.bestMove ||
            candidate.coach?.rawBestMove;

        const reference =
            candidate.reference?.bestMove ||
            candidate.reference?.rawBestMove;

        if (!coach && !reference) {
            return "";
        }

        return `${coach || "?"} vs ${reference || "?"}`;

    }

    engineLine(engine) {

        if (!engine) {
            return "";
        }

        const move =
            engine.bestMove ||
            engine.rawBestMove ||
            "?";

        const score =
            typeof engine.score === "string"
                ? engine.score
                : "";

        const depth =
            Number.isFinite(engine.depth)
                ? `d${engine.depth}`
                : "";

        return [move, score, depth]
            .filter(Boolean)
            .join(" ");

    }

    valueText(value) {

        if (value === null || value === undefined || value === "") {
            return "n/a";
        }

        return String(value);

    }

}

function detailAppend(parent, ...children) {

    for (const child of children) {
        parent.appendChild(child);
    }

}
