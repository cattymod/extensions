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

            // Prevent multiple recognition.start() calls
            this.startingRecognition = false;

            // Wakewords currently used by the project
            this.registeredWakewords = new Set();

            // Number of times each wakeword was detected
            this.wakewordTokens = new Map();

            // Number of detections already consumed by Scratch
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
            this.startingRecognition = false;

            this.backgroundTranscript = '';
            this.transcript = '';

            this.lastTriggerTime = 0;

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();
            this.registeredWakewords.clear();

            this.clearRestartTimer();

            this.setupBackgroundHandlers();

            // Discover wakewords BEFORE starting recognition.
            this.discoverWakewords();

            this.shouldBeListening = true;
            this.startBackgroundListening();
        }

        // ============================================================
        // DISCOVER WAKEWORDS FROM THE PROJECT
        // ============================================================

        discoverWakewords() {
            const runtime = Scratch.vm.runtime;

            if (!runtime || !runtime.targets) {
                return;
            }

            for (const target of runtime.targets) {
                if (
                    !target ||
                    !target.blocks ||
                    !target.blocks._blocks
                ) {
                    continue;
                }

                const blocks = target.blocks._blocks;

                for (const id in blocks) {
                    const block = blocks[id];

                    if (
                        !block ||
                        block.opcode !== 'speechtotext_onWakeword'
                    ) {
                        continue;
                    }

                    let wakeword = '';

                    // Normal Scratch block field
                    if (block.fields && block.fields.WORD) {
                        wakeword = block.fields.WORD.value;
                    }

                    // Fallback for input storage
                    if (
                        !wakeword &&
                        block.inputs &&
                        block.inputs.WORD
                    ) {
                        const input = block.inputs.WORD;

                        if (Array.isArray(input)) {
                            wakeword = input[0];
                        } else {
                            wakeword = input;
                        }
                    }

                    wakeword = this.normalizeText(wakeword);

                    if (wakeword) {
                        this.registeredWakewords.add(wakeword);
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

            this.startingRecognition = false;

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
            return String(text || '')
                .toLowerCase()
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        escapeRegex(text) {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

            /*
             * Match complete words/phrases instead of partial words.
             *
             * Examples:
             * "computer" -> matches "computer"
             * "hey computer" -> matches "computer"
             * "computers" -> does not match "computer"
             */
            const regex = new RegExp(
                '(?:^|\\s)' +
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

            // Prevent duplicate firing from rapid interim results.
            if (
                now - this.lastTriggerTime < 300
            ) {
                return;
            }

            // Pick up wakewords that may have been added
            // since the project started.
            this.discoverWakewords();

            for (const wakeword of this.registeredWakewords) {
                if (
                    !this.containsWakeword(
                        text,
                        wakeword
                    )
                ) {
                    continue;
                }

                this.lastTriggerTime = now;

                const current =
                    this.wakewordTokens.get(wakeword) || 0;

                this.wakewordTokens.set(
                    wakeword,
                    current + 1
                );

                /*
                 * Remove old speech after a successful detection.
                 * Keeping a small amount of context prevents
                 * multi-word wakewords from being lost.
                 */
                if (this.backgroundTranscript.length > 60) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-30);
                } else {
                    this.backgroundTranscript = '';
                }

                return;
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
                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                // Make sure newly added wakewords are registered.
                this.discoverWakewords();

                let speech = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    speech +=
                        ' ' +
                        event.results[i][0].transcript;
                }

                speech = this.normalizeText(speech);

                if (!speech) {
                    return;
                }

                this.backgroundTranscript = (
                    this.backgroundTranscript +
                    ' ' +
                    speech
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                // Keep enough history for multi-word wakewords.
                if (this.backgroundTranscript.length > 200) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-200);
                }

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
                    event.error !== 'aborted' &&
                    event.error !== 'network'
                ) {
                    console.warn(
                        'Speech recognition warning/error:',
                        event.error
                    );
                }

                /*
                 * Some Chromium versions end recognition after
                 * certain errors. onend will handle restarting.
                 */
            };

            // --------------------------------------------------------
            // END
            // --------------------------------------------------------

            recognition.onend = () => {
                this.isListening = false;
                this.startingRecognition = false;

                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                // Restart quickly, but through the guarded
                // restart function so start() cannot race itself.
                this.scheduleBackgroundRestart(50);
            };
        }

        // ============================================================
        // RESTART
        // ============================================================

        scheduleBackgroundRestart(delay) {
            if (
                !this.recognition ||
                this.projectStopped ||
                this.isListeningUntilPause ||
                !this.shouldBeListening ||
                this.isListening ||
                this.startingRecognition
            ) {
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
                    this.isListening ||
                    this.startingRecognition
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
            if (
                !this.recognition ||
                this.projectStopped ||
                this.isListeningUntilPause ||
                !this.shouldBeListening ||
                this.isListening ||
                this.startingRecognition
            ) {
                return;
            }

            this.clearRestartTimer();

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.startingRecognition = true;

            try {
                this.recognition.start();

                this.isListening = true;
                this.startingRecognition = false;
            } catch (e) {
                this.isListening = false;
                this.startingRecognition = false;

                this.scheduleBackgroundRestart(150);
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
                                type: Scratch.ArgumentType.STRING,
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
            if (
                !this.recognition ||
                this.projectStopped ||
                this.isListeningUntilPause
            ) {
                return false;
            }

            const wakeword =
                this.normalizeText(args.WORD);

            if (!wakeword) {
                return false;
            }

            // Register immediately.
            this.registeredWakewords.add(wakeword);

            // Make sure the background listener is active.
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            } else if (
                !this.isListening &&
                this.restartTimer === null &&
                !this.startingRecognition
            ) {
                this.startBackgroundListening();
            }

            const detected =
                this.wakewordTokens.get(wakeword) || 0;

            const consumed =
                this.consumedWakewordTokens.get(wakeword) || 0;

            if (detected <= consumed) {
                return false;
            }

            // Consume exactly one detection token.
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

                    this.startingRecognition = false;

                    let sessionTranscript = '';

                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    this.recognition.onresult = (event) => {
                        let interim = '';
                        let finalTranscript = '';

                        for (
                            let i = event.resultIndex;
                            i < event.results.length;
                            i++
                        ) {
                            const result = event.results[i];

                            if (result.isFinal) {
                                finalTranscript +=
                                    result[0].transcript;
                            } else {
                                interim +=
                                    result[0].transcript;
                            }
                        }

                        /*
                         * Keep the most recent recognized speech.
                         * Final speech takes priority over interim speech.
                         */
                        if (finalTranscript.trim()) {
                            sessionTranscript =
                                finalTranscript.trim();
                        } else if (interim.trim()) {
                            sessionTranscript =
                                interim.trim();
                        }
                    };

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

                    this.recognition.onend = () => {
                        this.isListening = false;
                        this.startingRecognition = false;

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

                        this.shouldBeListening = true;

                        this.scheduleBackgroundRestart(50);

                        resolve();
                    };

                    this.isListening = true;
                    this.startingRecognition = true;

                    try {
                        this.recognition.start();

                        this.startingRecognition = false;
                    } catch (e) {
                        this.isListening = false;
                        this.startingRecognition = false;

                        this.isListeningUntilPause = false;

                        this.setupBackgroundHandlers();

                        if (!this.projectStopped) {
                            this.shouldBeListening = true;
                            this.scheduleBackgroundRestart(150);
                        }

                        resolve();
                    }
                };

                /*
                 * If background recognition is already running,
                 * stop it first. The onend handler then starts
                 * the one-shot listening session.
                 */
                if (this.isListening) {
                    this.recognition.onend = () => {
                        this.isListening = false;
                        this.startingRecognition = false;

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
                        this.startingRecognition = false;

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

            this.startingRecognition = false;

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
