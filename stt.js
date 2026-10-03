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
            // ========================================================
            // STATE
            // ========================================================

            this.transcript = '';
            this.backgroundTranscript = '';

            this.recognition = null;

            // Current recognition state
            this.isListening = false;
            this.startingRecognition = false;

            // What the extension wants to be doing
            this.shouldBeListening = false;

            // A Listen Until Pause session is active
            this.isListeningUntilPause = false;

            // Project lifecycle
            this.projectStopped = false;

            // Restart management
            this.restartTimer = null;

            // Detection cooldown
            this.lastTriggerTime = 0;

            // --------------------------------------------------------
            // Wakewords
            // --------------------------------------------------------

            // Wakewords currently used by the project
            this.registeredWakewords = new Set();

            // Number of detections for each wakeword
            this.wakewordTokens = new Map();

            // Number of detections already consumed by Scratch
            this.consumedWakewordTokens = new Map();

            // --------------------------------------------------------
            // Recognition sessions
            // --------------------------------------------------------

            /*
             * Every time recognition is started, this number changes.
             *
             * This prevents an old onend/onresult event from interfering
             * with a newer recognition session.
             */
            this.recognitionSession = 0;

            /*
             * Used for Listen Until Pause promises.
             */
            this.pauseSessionId = 0;

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

            // We control restarts ourselves.
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            // Set up the initial background handlers.
            this.installBackgroundHandlers();

            // ========================================================
            // PROJECT STOP
            // ========================================================

            Scratch.vm.runtime.on(
                'PROJECT_STOP_ALL',
                () => {
                    this.stopAllListening();
                }
            );

            // ========================================================
            // PROJECT START
            // ========================================================

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

            this.isListening = false;
            this.startingRecognition = false;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.transcript = '';
            this.backgroundTranscript = '';

            this.lastTriggerTime = 0;

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();
            this.registeredWakewords.clear();

            this.clearRestartTimer();

            /*
             * Invalidate any old recognition callbacks.
             */
            this.recognitionSession++;

            this.installBackgroundHandlers();

            /*
             * Find wakewords before starting the microphone.
             */
            this.discoverWakewords();

            /*
             * Start the background listener.
             */
            this.shouldBeListening = true;

            this.startBackgroundListening();
        }

        // ============================================================
        // DISCOVER WAKEWORDS
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

                    // Normal Scratch field
                    if (
                        block.fields &&
                        block.fields.WORD
                    ) {
                        wakeword =
                            block.fields.WORD.value;
                    }

                    // Input fallback
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

            this.clearRestartTimer();

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            /*
             * Invalidate every existing recognition callback.
             */
            this.recognitionSession++;

            this.startingRecognition = false;

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            this.installBackgroundHandlers();
        }

        // ============================================================
        // RESTART TIMER
        // ============================================================

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }

        scheduleBackgroundRestart(delay = 100) {
            if (
                !this.recognition ||
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
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
                    !this.shouldBeListening ||
                    this.isListeningUntilPause ||
                    this.isListening ||
                    this.startingRecognition
                ) {
                    return;
                }

                this.startBackgroundListening();
            }, delay);
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

            /*
             * Match complete words/phrases.
             *
             * "computer"
             * "hey computer"
             *
             * will match.
             *
             * "computers"
             *
             * will not match "computer".
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

            /*
             * Always make sure the current project wakewords
             * are registered.
             */
            this.discoverWakewords();

            const now = Date.now();

            /*
             * Prevent Chrome/Edge interim results from repeatedly
             * triggering the same word.
             */
            if (
                now - this.lastTriggerTime < 350
            ) {
                return;
            }

            for (
                const wakeword of this.registeredWakewords
            ) {
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
                    this.wakewordTokens.get(
                        wakeword
                    ) || 0;

                this.wakewordTokens.set(
                    wakeword,
                    current + 1
                );

                /*
                 * Clear old speech after detection.
                 *
                 * This is important because otherwise the same
                 * wakeword can remain in the 200-character buffer
                 * and fire again after recognition restarts.
                 */
                this.backgroundTranscript = '';

                return;
            }
        }

        // ============================================================
        // BACKGROUND RECOGNITION HANDLERS
        // ============================================================

        installBackgroundHandlers() {
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
                /*
                 * If Listen Until Pause has taken control,
                 * background recognition must ignore this event.
                 */
                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

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

                speech =
                    this.normalizeText(speech);

                if (!speech) {
                    return;
                }

                /*
                 * Add the new recognition result to our small
                 * rolling buffer.
                 */
                this.backgroundTranscript = (
                    this.backgroundTranscript +
                    ' ' +
                    speech
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                /*
                 * Keep enough text for multi-word wakewords,
                 * but don't keep an unlimited transcript.
                 */
                if (
                    this.backgroundTranscript.length > 200
                ) {
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
                /*
                 * Most of these are normal Web Speech API events.
                 */
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
            };

            // --------------------------------------------------------
            // END
            // --------------------------------------------------------

            recognition.onend = () => {
                this.isListening = false;
                this.startingRecognition = false;

                /*
                 * Never restart background recognition if something
                 * else has taken control.
                 */
                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                /*
                 * Recognition ending is normal with Chromium's
                 * SpeechRecognition API.
                 *
                 * Restart it automatically.
                 */
                this.scheduleBackgroundRestart(100);
            };
        }

        // ============================================================
        // START BACKGROUND LISTENING
        // ============================================================

        startBackgroundListening() {
            if (
                !this.recognition ||
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.isListening ||
                this.startingRecognition
            ) {
                return;
            }

            this.clearRestartTimer();

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.installBackgroundHandlers();

            this.startingRecognition = true;

            try {
                this.recognition.start();

                this.isListening = true;
                this.startingRecognition = false;
            } catch (e) {
                /*
                 * InvalidStateError can happen if Chrome thinks
                 * recognition is still shutting down.
                 */
                this.isListening = false;
                this.startingRecognition = false;

                this.scheduleBackgroundRestart(200);
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
                                defaultValue:
                                    'computer'
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

            /*
             * Register this wakeword immediately.
             */
            this.registeredWakewords.add(
                wakeword
            );

            /*
             * Make sure background recognition is running.
             */
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;

                this.startBackgroundListening();
            } else if (
                !this.isListening &&
                !this.startingRecognition &&
                this.restartTimer === null
            ) {
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

            /*
             * Consume exactly one detection.
             */
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

            /*
             * If the project was stopped, don't do anything.
             */
            if (this.projectStopped) {
                return Promise.resolve();
            }

            /*
             * If another Listen Until Pause is already active,
             * don't start a second microphone session.
             */
            if (this.isListeningUntilPause) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                /*
                 * Create a unique ID for this pause session.
                 */
                const pauseSession =
                    ++this.pauseSessionId;

                /*
                 * Background recognition must stop.
                 */
                this.shouldBeListening = false;

                this.isListeningUntilPause = true;

                this.clearRestartTimer();

                /*
                 * Invalidate background callbacks.
                 */
                this.recognitionSession++;

                /*
                 * Wait for the current recognition session to end
                 * before starting the one-shot session.
                 */
                const startPauseSession = () => {
                    /*
                     * Check that this is still the current request.
                     */
                    if (
                        pauseSession !==
                        this.pauseSessionId
                    ) {
                        resolve();
                        return;
                    }

                    if (this.projectStopped) {
                        this.isListeningUntilPause = false;
                        resolve();
                        return;
                    }

                    let sessionTranscript = '';

                    /*
                     * One-shot recognition.
                     */
                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    /*
                     * RESULT
                     */
                    this.recognition.onresult = (event) => {
                        if (
                            pauseSession !==
                            this.pauseSessionId
                        ) {
                            return;
                        }

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
                                    ' ' +
                                    result[0].transcript;
                            } else {
                                interim +=
                                    ' ' +
                                    result[0].transcript;
                            }
                        }

                        /*
                         * Keep the complete final transcript,
                         * rather than replacing it every time.
                         */
                        if (finalTranscript.trim()) {
                            sessionTranscript = (
                                sessionTranscript +
                                ' ' +
                                finalTranscript
                            )
                                .replace(/\s+/g, ' ')
                                .trim();
                        } else if (
                            interim.trim() &&
                            !sessionTranscript
                        ) {
                            sessionTranscript =
                                interim.trim();
                        }
                    };

                    /*
                     * ERROR
                     */
                    this.recognition.onerror = (event) => {
                        if (
                            event.error !== 'no-speech' &&
                            event.error !== 'aborted'
                        ) {
                            console.warn(
                                'Speech recognition error:',
                                event.error
                            );
                        }
                    };

                    /*
                     * END
                     */
                    this.recognition.onend = () => {
                        /*
                         * Ignore an old session ending after a
                         * newer session has started.
                         */
                        if (
                            pauseSession !==
                            this.pauseSessionId
                        ) {
                            return;
                        }

                        this.isListening = false;
                        this.startingRecognition = false;

                        this.isListeningUntilPause =
                            false;

                        this.transcript =
                            sessionTranscript.trim();

                        this.backgroundTranscript = '';

                        /*
                         * If the project was stopped while listening,
                         * don't restart anything.
                         */
                        if (this.projectStopped) {
                            this.shouldBeListening = false;

                            this.installBackgroundHandlers();

                            resolve();
                            return;
                        }

                        /*
                         * Give recognition control back to the
                         * background wakeword system.
                         */
                        this.installBackgroundHandlers();

                        this.shouldBeListening = true;

                        /*
                         * Restart the background listener.
                         */
                        this.scheduleBackgroundRestart(100);

                        resolve();
                    };

                    /*
                     * START
                     */
                    this.startingRecognition = true;

                    try {
                        this.recognition.start();

                        this.isListening = true;
                        this.startingRecognition = false;
                    } catch (e) {
                        /*
                         * Sometimes Chromium reports that
                         * recognition is already starting/stopping.
                         *
                         * Give it a moment and try again.
                         */
                        this.isListening = false;
                        this.startingRecognition = false;

                        setTimeout(() => {
                            if (
                                pauseSession !==
                                this.pauseSessionId
                            ) {
                                return;
                            }

                            if (this.projectStopped) {
                                this.isListeningUntilPause =
                                    false;

                                resolve();
                                return;
                            }

                            /*
                             * Try the one-shot session again.
                             */
                            startPauseSession();
                        }, 150);
                    }
                };

                /*
                 * If background recognition is currently active,
                 * stop it first.
                 */
                if (this.isListening) {
                    const oldSession =
                        ++this.recognitionSession;

                    /*
                     * Temporarily listen for the end of the old
                     * recognition session.
                     */
                    this.recognition.onend = () => {
                        this.isListening = false;
                        this.startingRecognition = false;

                        /*
                         * Make sure this wasn't cancelled.
                         */
                        if (
                            pauseSession !==
                            this.pauseSessionId
                        ) {
                            return;
                        }

                        if (this.projectStopped) {
                            this.isListeningUntilPause =
                                false;

                            resolve();
                            return;
                        }

                        startPauseSession();
                    };

                    try {
                        this.recognition.stop();
                    } catch (e) {
                        /*
                         * If stop() fails because recognition has
                         * already ended, continue immediately.
                         */
                        this.isListening = false;
                        this.startingRecognition = false;

                        if (
                            pauseSession ===
                            this.pauseSessionId
                        ) {
                            startPauseSession();
                        }
                    }
                } else {
                    startPauseSession();
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
            /*
             * Invalidate any Listen Until Pause operation.
             */
            this.pauseSessionId++;

            /*
             * Stop automatic background listening.
             */
            this.shouldBeListening = false;

            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.clearRestartTimer();

            /*
             * Invalidate old recognition callbacks.
             */
            this.recognitionSession++;

            this.startingRecognition = false;

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            this.installBackgroundHandlers();
        }
    }

    // ================================================================
    // REGISTER EXTENSION
    // ================================================================

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
