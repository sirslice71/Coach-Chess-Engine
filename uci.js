import readline from "node:readline";
import { UciSession } from "./js/uci/uciengine.js";

const session =
    new UciSession();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

for await (const line of rl) {

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
        rl.close();
        break;
    }

}
