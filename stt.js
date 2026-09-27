// Name: Speech to Text
// ID: speechtotext
// Description: Speak to your projects!
// By: Noahscratch493
// License: MIT

(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        alert('This extension must run unsandboxed to access the microphone.');
        return;
    }

    class SpeechToTextExtension {
        constructor() {
            this.transcript = '';
            this.backgroundTranscript = '';

            this.recognition = null;
            this.isListening = false;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.projectStopped = false;

            this.lastTriggerTime = 0;
            this.restartTimer = null;

            // Wakewords discovered from the project.
            this.registeredWakewords = new Set();

            // Number of times each wakeword has been detected.
            this.wakewordTokens = new Map();

            // Number of detections already consumed by Scratch.
            this.consumedWakewordTokens = new Map();

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn(
                    'Speech recognition is not supported by this browser.'
                );
                return;
            }

            this.recognition = new SpeechRecognition();

            this.recognition.lang = 'en-US';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.setupBackgroundHandlers();

            // --------------------------------------------------------
            // PROJECT STOP
            // --------------------------------------------------------

            Scratch.vm.runtime.on(
                'PROJECT_STOP_ALL',
                () => {
                    this.stopAllListening();
                }
            );

            // --------------------------------------------------------
            // PROJECT START
            // --------------------------------------------------------

            Scratch.vm.runtime.on(
                'PROJECT_START',
                () => {
                    this.startProjectSession();
                }
            );
        }

        // ============================================================
        // PROJECT LIFECYCLE
        // ============================================================

        startProjectSession() {
            if (!this.recognition) {
                return;
            }

            this.projectStopped = false;

            this.isListeningUntilPause = false;
            this.isListening = false;

            this.backgroundTranscript = '';
            this.transcript = '';

            this.lastTriggerTime = 0;

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.clearRestartTimer();

            this.setupBackgroundHandlers();

            // --------------------------------------------------------
            // IMPORTANT:
            //
            // Find the wakewords BEFORE starting recognition.
            //
            // This prevents the first "Dango" from being missed.
            // --------------------------------------------------------

            this.discoverWakewords();

            // Start listening immediately.
            this.shouldBeListening = true;
            this.startBackgroundListening();
        }

        // ============================================================
        // DISCOVER WAKEWORDS FROM THE PROJECT
        // ============================================================

        discoverWakewords() {
            this.registeredWakewords.clear();

            const runtime = Scratch.vm.runtime;

            if (!runtime || !runtime.targets) {
                return;
            }

            for (const target of runtime.targets) {
                if (!target || !target.blocks) {
                    continue;
                }

                const blocks = target.blocks._blocks;

                if (!blocks) {
                    continue;
                }

                for (const id in blocks) {
                    const block = blocks[id];

                    if (!block) {
                        continue;
                    }

                    // Find our wakeword hat.
                    if (block.opcode !== 'speechtotext_onWakeword') {
                        continue;
                    }

                    let wakeword = '';

                    // Scratch stores block inputs/fields differently
                    // depending on the VM version, so check both.
                    if (
                        block.fields &&
                        block.fields.WORD
                    ) {
                        wakeword =
                            block.fields.WORD.value;
                    }

                    if (
                        !wakeword &&
                        block.inputs &&
                        block.inputs.WORD
                    ) {
                        const input =
                            block.inputs.WORD;

                        if (
                            Array.isArray(input) &&
                            input.length > 0
                        ) {
                            wakeword = input[0];
                        } else if (
                            typeof input === 'string'
                        ) {
                            wakeword = input;
                        }
                    }

                    wakeword =
                        this.normalizeText(wakeword);

                    if (wakeword) {
                        this.registeredWakewords.add(
                            wakeword
                        );
                    }
                }
            }
        }

        // ============================================================
        // STOP EVERYTHING
        // ============================================================

        stopAllListening() {
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.clearRestartTimer();

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            this.setupBackgroundHandlers();
        }

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }

        // ============================================================
        // TEXT UTILITIES
        // ============================================================

        normalizeText(text) {
            return String(text)
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        }

        escapeRegex(text) {
            return text.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );
        }

        containsWakeword(text, wakeword) {
            const normalizedText =
                this.normalizeText(text);

            const normalizedWakeword =
                this.normalizeText(wakeword);

            if (
                !normalizedText ||
                !normalizedWakeword
            ) {
                return false;
            }

            const escaped =
                this.escapeRegex(normalizedWakeword);

            const regex = new RegExp(
                '(^|\\s)' +
                escaped +
                '(?=\\s|$)',
                'i'
            );

            return regex.test(normalizedText);
        }

        // ============================================================
        // WAKEWORD DETECTION
        // ============================================================

        detectWakewords(text) {
            if (!text) {
                return;
            }

            const now = Date.now();

            if (
                now - this.lastTriggerTime < 700
            ) {
                return;
            }

            for (
                const wakeword of
                this.registeredWakewords
            ) {
                if (
                    this.containsWakeword(
                        text,
                        wakeword
                    )
                ) {
                    this.lastTriggerTime = now;

                    const current =
                        this.wakewordTokens.get(
                            wakeword
                        ) || 0;

                    this.wakewordTokens.set(
                        wakeword,
                        current + 1
                    );

                    // Clear the phrase so the same word
                    // cannot immediately trigger again.
                    this.backgroundTranscript = '';

                    break;
                }
            }
        }

        // ============================================================
        // BACKGROUND HANDLERS
        // ============================================================

        setupBackgroundHandlers() {
            if (!this.recognition) {
                return;
            }

            const recognition = this.recognition;

            recognition.continuous = true;
            recognition.interimResults = true;

            // --------------------------------------------------------
            // RESULT
            // --------------------------------------------------------

            recognition.onresult = (event) => {
                if (this.projectStopped) {
                    return;
                }

                if (this.isListeningUntilPause) {
                    return;
                }

                if (!this.shouldBeListening) {
                    return;
                }

                let currentChunk = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    currentChunk +=
                        event.results[i][0].transcript;
                }

                currentChunk =
                    this.normalizeText(
                        currentChunk
                    );

                if (!currentChunk) {
                    return;
                }

                this.backgroundTranscript =
                    (
                        this.backgroundTranscript +
                        ' ' +
                        currentChunk
                    )
                        .replace(/\s+/g, ' ')
                        .trim();

                if (
                    this.backgroundTranscript.length >
                    500
                ) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-500);
                }

                // Detect immediately.
                this.detectWakewords(
                    this.backgroundTranscript
                );
            };

            // --------------------------------------------------------
            // ERROR
            // --------------------------------------------------------

            recognition.onerror = (event) => {
                if (
                    event.error !== 'no-speech' &&
                    event.error !== 'aborted'
                ) {
                    console.error(
                        'Speech recognition error:',
                        event.error
                    );
                }
            };

            // --------------------------------------------------------
            // END
            // --------------------------------------------------------

            recognition.onend = () => {
                this.isListening = false;

                if (this.projectStopped) {
                    return;
                }

                if (this.isListeningUntilPause) {
                    return;
                }

                if (!this.shouldBeListening) {
                    return;
                }

                this.scheduleBackgroundRestart(150);
            };
        }

        // ============================================================
        // RESTART
        // ============================================================

        scheduleBackgroundRestart(delay) {
            if (!this.recognition) {
                return;
            }

            if (this.projectStopped) {
                return;
            }

            if (this.isListeningUntilPause) {
                return;
            }

            if (!this.shouldBeListening) {
                return;
            }

            if (this.isListening) {
                return;
            }

            if (this.restartTimer !== null) {
                return;
            }

            this.restartTimer = setTimeout(() => {
                this.restartTimer = null;

                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening ||
                    this.isListening
                ) {
                    return;
                }

                this.startBackgroundListening();
            }, delay);
        }

        // ============================================================
        // START BACKGROUND LISTENING
        // ============================================================

        startBackgroundListening() {
            if (!this.recognition) {
                return;
            }

            if (this.projectStopped) {
                return;
            }

            if (this.isListeningUntilPause) {
                return;
            }

            if (!this.shouldBeListening) {
                return;
            }

            if (this.isListening) {
                return;
            }

            this.clearRestartTimer();

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            try {
                this.recognition.start();

                this.isListening = true;
            } catch (e) {
                this.isListening = false;

                this.scheduleBackgroundRestart(250);
            }
        }

        // ============================================================
        // SCRATCH INFO
        // ============================================================

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',

                docsURI:
                    'https://cattymod.app/docs/extensions/stt',

                color1: '#CF63CF',
                color2: '#B84CB8',
                color3: '#E07CE0',

                blocks: [
                    {
                        opcode: 'onWakeword',
                        blockType: Scratch.BlockType.HAT,
                        text: 'on wakeword [WORD]',
                        arguments: {
                            WORD: {
                                type:
                                    Scratch.ArgumentType.STRING,
                                defaultValue: 'computer'
                            }
                        }
                    },

                    {
                        opcode: 'listenUntilPause',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Listen until Pause'
                    },

                    {
                        opcode: 'getSpeechText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'Speech Text'
                    },

                    {
                        opcode: 'cancelListening',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'Cancel All Listening'
                    }
                ]
            };
        }

        // ============================================================
        // WAKEWORD HAT
        // ============================================================

        onWakeword(args) {
            if (!this.recognition) {
                return false;
            }

            if (this.projectStopped) {
                return false;
            }

            if (this.isListeningUntilPause) {
                return false;
            }

            const wakeword =
                this.normalizeText(args.WORD);

            if (!wakeword) {
                return false;
            }

            // Also register it here in case the block was added
            // dynamically while the project is running.
            this.registeredWakewords.add(wakeword);

            // Make sure recognition is alive.
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            } else if (!this.isListening) {
                this.startBackgroundListening();
            }

            const detected =
                this.wakewordTokens.get(
                    wakeword
                ) || 0;

            const consumed =
                this.consumedWakewordTokens.get(
                    wakeword
                ) || 0;

            if (detected <= consumed) {
                return false;
            }

            // Consume exactly one detection.
            this.consumedWakewordTokens.set(
                wakeword,
                consumed + 1
            );

            return true;
        }

        // ============================================================
        // LISTEN UNTIL PAUSE
        // ============================================================

        listenUntilPause() {
            if (!this.recognition) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                const startSession = () => {
                    if (this.projectStopped) {
                        resolve();
                        return;
                    }

                    this.shouldBeListening = false;
                    this.isListeningUntilPause = true;

                    this.clearRestartTimer();

                    let sessionTranscript = '';

                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    // ------------------------------------------------
                    // RESULT
                    // ------------------------------------------------

                    this.recognition.onresult = (event) => {
                        let interim = '';
                        let finalTranscript = '';

                        for (
                            let i = event.resultIndex;
                            i < event.results.length;
                            i++
                        ) {
                            const result =
                                event.results[i];

                            if (result.isFinal) {
                                finalTranscript +=
                                    result[0].transcript;
                            } else {
                                interim +=
                                    result[0].transcript;
                            }
                        }

                        if (
                            finalTranscript.trim()
                        ) {
                            sessionTranscript =
                                finalTranscript.trim();
                        } else if (
                            interim.trim()
                        ) {
                            sessionTranscript =
                                interim.trim();
                        }
                    };

                    // ------------------------------------------------
                    // ERROR
                    // ------------------------------------------------

                    this.recognition.onerror = (event) => {
                        if (
                            event.error !== 'no-speech' &&
                            event.error !== 'aborted'
                        ) {
                            console.error(
                                'Speech recognition error:',
                                event.error
                            );
                        }
                    };

                    // ------------------------------------------------
                    // END
                    // ------------------------------------------------

                    this.recognition.onend = () => {
                        this.isListening = false;
                        this.isListeningUntilPause = false;

                        this.transcript =
                            sessionTranscript;

                        this.backgroundTranscript = '';

                        this.setupBackgroundHandlers();

                        if (this.projectStopped) {
                            this.shouldBeListening = false;
                            resolve();
                            return;
                        }

                        // Wakeword listening resumes.
                        this.shouldBeListening = true;

                        this.scheduleBackgroundRestart(
                            150
                        );

                        resolve();
                    };

                    this.isListening = true;

                    try {
                        this.recognition.start();
                    } catch (e) {
                        this.isListening = false;
                        this.isListeningUntilPause = false;

                        this.setupBackgroundHandlers();

                        if (!this.projectStopped) {
                            this.shouldBeListening = true;

                            this.scheduleBackgroundRestart(
                                250
                            );
                        }

                        resolve();
                    }
                };

                // ----------------------------------------------------
                // Stop background recognition first.
                // ----------------------------------------------------

                if (this.isListening) {
                    this.recognition.onend = () => {
                        this.isListening = false;

                        if (this.projectStopped) {
                            resolve();
                            return;
                        }

                        startSession();
                    };

                    try {
                        this.recognition.stop();
                    } catch (e) {
                        this.isListening = false;

                        if (this.projectStopped) {
                            resolve();
                        } else {
                            startSession();
                        }
                    }
                } else {
                    startSession();
                }
            });
        }

        // ============================================================
        // SPEECH TEXT
        // ============================================================

        getSpeechText() {
            return this.transcript;
        }

        // ============================================================
        // CANCEL ALL LISTENING
        // ============================================================

        cancelListening() {
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.clearRestartTimer();

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            this.setupBackgroundHandlers();
        }
    }

    // ================================================================
    // REGISTER EXTENSION
    // ================================================================

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
