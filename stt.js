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

            // Background wakeword listening.
            this.shouldBeListening = false;

            // True while "Listen until Pause" owns recognition.
            this.isListeningUntilPause = false;

            // Scratch project state.
            this.projectStopped = false;

            // Prevent duplicate triggers.
            this.lastTriggerTime = 0;

            // Restart timer.
            this.restartTimer = null;

            // Wakewords that Scratch has asked us to monitor.
            this.registeredWakewords = new Set();

            // Wakewords detected by the speech recognizer.
            //
            // Each detected wakeword gets a token.
            // The Scratch hat consumes that token.
            this.wakewordTokens = new Map();

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn(
                    'Speech recognition is not supported by this browser.'
                );
                return;
            }

            this.SpeechRecognition = SpeechRecognition;

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

            this.clearRestartTimer();

            this.setupBackgroundHandlers();

            // IMPORTANT:
            //
            // Start listening immediately when the green flag is
            // pressed, so the first wakeword is actually heard.
            this.shouldBeListening = true;

            this.startBackgroundListening();
        }

        stopAllListening() {
            // Mark the project stopped BEFORE aborting.
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.wakewordTokens.clear();

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
        // WAKEWORD UTILITIES
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

            if (!normalizedText || !normalizedWakeword) {
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

        detectWakewords(text) {
            if (!text) {
                return;
            }

            const now = Date.now();

            // Prevent the same recognition result from creating
            // lots of wakeword events.
            if (now - this.lastTriggerTime < 700) {
                return;
            }

            for (const wakeword of this.registeredWakewords) {
                if (
                    this.containsWakeword(
                        text,
                        wakeword
                    )
                ) {
                    this.lastTriggerTime = now;

                    const oldToken =
                        this.wakewordTokens.get(wakeword) || 0;

                    this.wakewordTokens.set(
                        wakeword,
                        oldToken + 1
                    );

                    // Clear the old phrase after detection.
                    //
                    // The microphone itself keeps running.
                    this.backgroundTranscript = '';

                    break;
                }
            }
        }

        // ============================================================
        // BACKGROUND RECOGNITION
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
                    this.normalizeText(currentChunk);

                if (!currentChunk) {
                    return;
                }

                // Store the speech.
                this.backgroundTranscript =
                    (
                        this.backgroundTranscript +
                        ' ' +
                        currentChunk
                    )
                        .replace(/\s+/g, ' ')
                        .trim();

                // Keep the buffer small.
                if (
                    this.backgroundTranscript.length > 500
                ) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-500);
                }

                // ----------------------------------------------------
                // IMPORTANT:
                //
                // Detect the wakeword RIGHT HERE.
                //
                // We don't wait for Scratch to notice it later.
                // ----------------------------------------------------

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

                // Browser stopped recognition.
                // Automatically bring it back.
                this.scheduleBackgroundRestart(150);
            };
        }

        // ============================================================
        // BACKGROUND RESTART
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
                // Recognition may still be closing from the previous
                // session. Keep trying instead of disabling wakewords.
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

            // Register this wakeword so the speech recognizer knows
            // what it should be looking for.
            this.registeredWakewords.add(wakeword);

            // Make sure background recognition is running.
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            } else if (!this.isListening) {
                this.startBackgroundListening();
            }

            // Has the recognizer already detected this wakeword?
            const token =
                this.wakewordTokens.get(wakeword) || 0;

            // Each token represents ONE actual wakeword detection.
            const lastConsumed =
                this['lastConsumed_' + wakeword] || 0;

            if (token <= lastConsumed) {
                return false;
            }

            // Consume exactly one detection.
            this['lastConsumed_' + wakeword] = token;

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

                    // Temporarily give recognition to this command.
                    this.shouldBeListening = false;
                    this.isListeningUntilPause = true;

                    this.clearRestartTimer();

                    let sessionTranscript = '';

                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    // ------------------------------------------------
                    // COMMAND RESULT
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

                        if (finalTranscript.trim()) {
                            sessionTranscript =
                                finalTranscript.trim();
                        } else if (interim.trim()) {
                            sessionTranscript =
                                interim.trim();
                        }
                    };

                    // ------------------------------------------------
                    // COMMAND ERROR
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
                    // COMMAND END
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

                        // Wakeword mode comes back automatically.
                        this.shouldBeListening = true;

                        this.scheduleBackgroundRestart(150);

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
                            this.scheduleBackgroundRestart(250);
                        }

                        resolve();
                    }
                };

                // ----------------------------------------------------
                // If background recognition is running, stop it first.
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
