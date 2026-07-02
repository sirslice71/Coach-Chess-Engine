//======================================
// logger.js
//======================================

export default class Logger {

    static enabled = true;

    static info(...args) {

        if (!Logger.enabled)
            return;

        console.log(
            "%c[INFO]",
            "color:#4CAF50;font-weight:bold;",
            ...args
        );

    }

    static warn(...args) {

        if (!Logger.enabled)
            return;

        console.warn(
            "%c[WARN]",
            "color:#FF9800;font-weight:bold;",
            ...args
        );

    }

    static error(...args) {

        if (!Logger.enabled)
            return;

        console.error(
            "%c[ERROR]",
            "color:#F44336;font-weight:bold;",
            ...args
        );

    }

}