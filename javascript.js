// Name: JavaScript
// ID: javascript
// Description: Run JavaScript commands and more inside of your project.
// By: Noahscratch493
// License: MIT

class JavaScriptExtension {
    getInfo() {
        return {
            id: "javascript",
            name: "JavaScript",
            docsURI: "https://cattymod.app/docs/extensions/javascript",

            // Extension colour
            color1: "#BC7FFF",
            color2: "#965FCC",
            color3: "#704599",

            blocks: [
                // =========================
                // EVAL
                // =========================

                {
                    opcode: "evalCommand",
                    blockType: Scratch.BlockType.COMMAND,
                    text: "eval [CODE]",
                    arguments: {
                        CODE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "alert('Hello!')"
                        }
                    }
                },

                {
                    opcode: "evalReporter",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "eval [CODE]",
                    arguments: {
                        CODE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "2 + 2"
                        }
                    }
                },

                // =========================
                // JAVASCRIPT VALUES
                // =========================

                {
                    opcode: "typeofValue",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "JavaScript type of [VALUE]",
                    arguments: {
                        VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "Hello"
                        }
                    }
                },

                // =========================
                // CONSOLE
                // =========================

                {
                    opcode: "consoleLog",
                    blockType: Scratch.BlockType.COMMAND,
                    text: "console log [VALUE]",
                    arguments: {
                        VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "Hello!"
                        }
                    }
                },

                {
                    opcode: "consoleWarn",
                    blockType: Scratch.BlockType.COMMAND,
                    text: "console warn [VALUE]",
                    arguments: {
                        VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "Warning!"
                        }
                    }
                },

                {
                    opcode: "consoleError",
                    blockType: Scratch.BlockType.COMMAND,
                    text: "console error [VALUE]",
                    arguments: {
                        VALUE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "Error!"
                        }
                    }
                },

                // =========================
                // JAVASCRIPT GLOBALS
                // =========================

                {
                    opcode: "getGlobal",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "JavaScript global [NAME]",
                    arguments: {
                        NAME: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "innerWidth"
                        }
                    }
                },

                {
                    opcode: "getGlobalProperty",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "property [PROPERTY] of global [GLOBAL]",
                    arguments: {
                        PROPERTY: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "userAgent"
                        },
                        GLOBAL: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "navigator"
                        }
                    }
                },

                // =========================
                // TIME / RANDOM
                // =========================

                {
                    opcode: "dateNow",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "current JavaScript time"
                },

                {
                    opcode: "random",
                    blockType: Scratch.BlockType.REPORTER,
                    text: "JavaScript random"
                }
            ]
        };
    }

    // =========================
    // CONFIRMATION
    // =========================

    confirmExecution() {
        return window.confirm("Run custom unsafe code?");
    }

    // =========================
    // EVAL COMMAND
    // =========================

    evalCommand(args) {
        if (!this.confirmExecution()) {
            return;
        }

        try {
            eval(String(args.CODE));
        } catch (error) {
            console.error("JavaScript eval error:", error);
        }
    }

    // =========================
    // EVAL REPORTER
    // =========================

    evalReporter(args) {
        if (!this.confirmExecution()) {
            return "";
        }

        try {
            const result = eval(String(args.CODE));

            if (result === undefined || result === null) {
                return "";
            }

            return result;
        } catch (error) {
            console.error("JavaScript eval error:", error);
            return "";
        }
    }

    // =========================
    // JAVASCRIPT TYPE
    // =========================

    typeofValue(args) {
        const value = String(args.VALUE);

        try {
            return typeof eval("(" + value + ")");
        } catch {
            return "string";
        }
    }

    // =========================
    // CONSOLE.LOG
    // =========================

    consoleLog(args) {
        console.log(String(args.VALUE));
    }

    // =========================
    // CONSOLE.WARN
    // =========================

    consoleWarn(args) {
        console.warn(String(args.VALUE));
    }

    // =========================
    // CONSOLE.ERROR
    // =========================

    consoleError(args) {
        console.error(String(args.VALUE));
    }

    // =========================
    // JAVASCRIPT GLOBAL
    // =========================

    getGlobal(args) {
        const name = String(args.NAME);

        try {
            return window[name];
        } catch (error) {
            console.error("Could not access global:", error);
            return "";
        }
    }

    // =========================
    // GLOBAL PROPERTY
    // =========================

    getGlobalProperty(args) {
        const globalName = String(args.GLOBAL);
        const propertyName = String(args.PROPERTY);

        try {
            const globalObject = window[globalName];

            if (globalObject === undefined || globalObject === null) {
                return "";
            }

            const value = globalObject[propertyName];

            if (value === undefined || value === null) {
                return "";
            }

            if (typeof value === "object") {
                try {
                    return JSON.stringify(value);
                } catch {
                    return String(value);
                }
            }

            return value;
        } catch (error) {
            console.error("Could not access global property:", error);
            return "";
        }
    }

    // =========================
    // DATE.NOW
    // =========================

    dateNow() {
        return Date.now();
    }

    // =========================
    // MATH.RANDOM
    // =========================

    random() {
        return Math.random();
    }
}

Scratch.extensions.register(new JavaScriptExtension());
