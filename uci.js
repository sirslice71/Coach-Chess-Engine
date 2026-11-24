import readline from "node:readline";
import { UciSession } from "./js/uci/uciengine.js";

const session =
    new UciSession();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let shuttingDown = false;

function shutdown() {

    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    rl.close();
    process.stdin.pause();

}

rl.on("line", line => {

    let responses = [];

    try {

        responses =
            session.handleCommand(line);

    }

    catch (error) {

        responses = [
            `info string ${error.message}`,
            "bestmove 0000"
        ];

    }

    for (const response of responses) {
        process.stdout.write(response + "\n");
    }

    if (session.quitRequested) {
        shutdown();
    }

});

rl.on("close", () => {
    process.stdin.pause();
});
