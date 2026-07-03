//==================================================
// enginepanel.js
//==================================================

export default class EnginePanel {

    constructor() {

        this.element =
            document.getElementById("engine-panel");

        if (!this.element)
            return;

        this.element.innerHTML = `

            <h3>Coach</h3>
            <hr>

            <div class="engineRow">
                <span>Status</span>
                <span id="engineStatus">Ready</span>
            </div>

            <div class="engineRow">
                <span>Best Move</span>
                <span id="engineBestMove">-</span>
            </div>

            <div class="engineRow">
                <span>Search Eval (White)</span>
                <span id="engineEval">0.00</span>
            </div>

            <div class="engineRow">
                <span>Depth</span>
                <span id="engineDepth">-</span>
            </div>

            <div class="engineRow">
                <span>Nodes</span>
                <span id="engineNodes">-</span>
            </div>

            <div class="engineRow">
                <span>NPS</span>
                <span id="engineNps">-</span>
            </div>

            <div class="engineRow">
                <span>Time</span>
                <span id="engineTime">-</span>
            </div>

        `;

        this.status =
            document.getElementById("engineStatus");

        this.bestMove =
            document.getElementById("engineBestMove");

        this.eval =
            document.getElementById("engineEval");

        this.depth =
            document.getElementById("engineDepth");

        this.nodes =
            document.getElementById("engineNodes");

        this.nps =
            document.getElementById("engineNps");

        this.time =
            document.getElementById("engineTime");

    }

    //----------------------------------
    // Update
    //----------------------------------

    update(result) {

        if (!this.element)
            return;

        this.status.textContent = "Ready";

        this.bestMove.textContent =
            result.notation;

        this.eval.textContent =
            Number(result.evaluation).toFixed(2);

        this.depth.textContent =
            result.depth;

        this.nodes.textContent =
            result.nodes.toLocaleString();

        this.nps.textContent =
            result.nps.toLocaleString();

        this.time.textContent =
            result.elapsedMs + " ms";

    }

    setStatus(text) {

        this.status.textContent = text;

    }

    clear() {

        this.setStatus("Ready");

        this.bestMove.textContent = "-";

        this.eval.textContent = "0.00";

        this.depth.textContent = "-";

        this.nodes.textContent = "-";

        this.nps.textContent = "-";

        this.time.textContent = "-";

    }

}
