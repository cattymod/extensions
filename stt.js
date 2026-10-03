// Name: Speech to Text
// ID: speechtotext
// Description: Speak to your projects!
// By: Noahscratch493
// License: MIT

(function (Scratch) {
    'use strict';

    // This extension needs to be unsandboxed.
    if (!Scratch.extensions.unsandboxed) {
        alert('Speech to Text must run unsandboxed.');
        return;
    }

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    class SpeechToTextExtension {
        constructor() {
            this.SpeechRecognition = SpeechRecognition;

            // Current SpeechRecognition instance.
            this.recognition = null;

            // Current recognition session ID.
            this.sessionId = 0;

            // Used to invalidate old Listen Until Pause requests.
            this.pauseRequestId = 0;

            // Project state.
            this.projectStopped = true;

            // Background listening state.
            this.shouldBeListening = false;
            this.isListening = false;

            // True while Listen Until Pause is running.
            this.isListeningUntilPause = false;

            // Last completed speech text.
            this.transcript = '';

            // Background speech buffer.
            this.backgroundTranscript = '';

            // Wakewords found in the project.
            this.registeredWakewords = new Set();

            // Number of wakeword detections.
            this.wakewordTokens = new Map();

            // Number of detections already consumed by the HAT.
            this.consumedWakewordTokens = new Map();

            // Prevent extremely rapid duplicate detections.
            this.lastTriggerTime = 0;

            // Background restart timer.
            this.restartTimer = null;

            if (!this.SpeechRecognition) {
                console.warn(
                    'Speech recognition is not supported by this browser.'
                );
                return;
            }

            // TurboWarp project events.
            Scratch.vm.runtime.on(
                'PROJECT_STOP_ALL',
                () => {
                    this.stopAllListening();
                }
            );

            Scratch.vm.runtime.on(
                'PROJECT_START',
                () => {
                    this.startProjectSession();
                }
            );
        }

        /*
         * ------------------------------------------------------------
         * PROJECT MANAGEMENT
         * ------------------------------------------------------------
         */

        startProjectSession() {
            if (!this.SpeechRecognition) {
                return;
            }

            this.projectStopped = false;

            this.shouldBeListening = false;
            this.isListening = false;
            this.isListeningUntilPause = false;

            this.transcript = '';
            this.backgroundTranscript = '';

            this.lastTriggerTime = 0;

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.clearRestartTimer();

            this.abortCurrentRecognition();

            this.discoverWakewords();

            this.shouldBeListening = true;

            this.startBackgroundListening();
        }

        stopAllListening() {
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.pauseRequestId++;

            this.clearRestartTimer();

            this.abortCurrentRecognition();
        }

        cancelListening() {
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.isListening = false;

            this.backgroundTranscript = '';

            this.pauseRequestId++;

            this.clearRestartTimer();

            this.abortCurrentRecognition();
        }

        /*
         * ------------------------------------------------------------
         * RECOGNITION MANAGEMENT
         * ------------------------------------------------------------
         */

        createRecognition() {
            if (!this.SpeechRecognition) {
                return null;
            }

            const recognition = new this.SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.continuous = true;
            recognition.interimResults = true;

            return recognition;
        }

        abortCurrentRecognition() {
            const recognition = this.recognition;

            this.recognition = null;

            // Invalidate callbacks belonging to the old recognition.
            this.sessionId++;

            if (recognition) {
                try {
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.onend = null;
                    recognition.abort();
                } catch (e) {
                    // Ignore abort errors.
                }
            }
        }

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }

        scheduleBackgroundRestart(delay) {
            if (
                !this.SpeechRecognition ||
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.isListening
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
                    this.isListening
                ) {
                    return;
                }

                this.startBackgroundListening();
            }, delay);
        }

        /*
         * ------------------------------------------------------------
         * BACKGROUND LISTENING
         * ------------------------------------------------------------
         */

        startBackgroundListening() {
            if (
                !this.SpeechRecognition ||
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.isListening
            ) {
                return;
            }

            this.clearRestartTimer();

            // Always create a completely fresh recognition object.
            this.abortCurrentRecognition();

            const recognition = this.createRecognition();

            if (!recognition) {
                return;
            }

            const currentSession = ++this.sessionId;

            this.recognition = recognition;
            this.isListening = true;

            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (event) => {
                if (
                    currentSession !== this.sessionId ||
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                let text = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    text += event.results[i][0].transcript;
                }

                text = this.normalizeText(text);

                if (!text) {
                    return;
                }

                this.backgroundTranscript = (
                    this.backgroundTranscript +
                    ' ' +
                    text
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                // Keep the buffer reasonably small.
                if (this.backgroundTranscript.length > 300) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-300);
                }

                this.detectWakewords(this.backgroundTranscript);
            };

            recognition.onerror = (event) => {
                if (currentSession !== this.sessionId) {
                    return;
                }

                if (
                    event.error !== 'no-speech' &&
                    event.error !== 'aborted' &&
                    event.error !== 'network'
                ) {
                    console.warn(
                        'Speech recognition warning:',
                        event.error
                    );
                }
            };

            recognition.onend = () => {
                if (currentSession !== this.sessionId) {
                    return;
                }

                if (this.recognition === recognition) {
                    this.recognition = null;
                }

                this.isListening = false;

                if (
                    this.projectStopped ||
                    !this.shouldBeListening ||
                    this.isListeningUntilPause
                ) {
                    return;
                }

                // Web Speech API ended.
                // Start a completely fresh session.
                this.scheduleBackgroundRestart(50);
            };

            try {
                recognition.start();
            } catch (e) {
                if (currentSession !== this.sessionId) {
                    return;
                }

                if (this.recognition === recognition) {
                    this.recognition = null;
                }

                this.isListening = false;

                this.scheduleBackgroundRestart(200);
            }
        }

        /*
         * ------------------------------------------------------------
         * LISTEN UNTIL PAUSE
         * ------------------------------------------------------------
         */

        listenUntilPause() {
            if (!this.SpeechRecognition) {
                return Promise.resolve();
            }

            if (this.projectStopped) {
                return Promise.resolve();
            }

            const requestId = ++this.pauseRequestId;

            return new Promise((resolve) => {
                // Stop the background recognizer first.
                this.shouldBeListening = false;
                this.isListeningUntilPause = true;

                this.clearRestartTimer();

                this.abortCurrentRecognition();

                let finished = false;
                let sessionTranscript = '';

                const finish = (restartBackground) => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    this.isListening = false;
                    this.isListeningUntilPause = false;

                    this.transcript =
                        sessionTranscript.trim();

                    this.backgroundTranscript = '';

                    if (
                        this.projectStopped ||
                        requestId !== this.pauseRequestId
                    ) {
                        this.shouldBeListening = false;
                        resolve();
                        return;
                    }

                    if (restartBackground) {
                        this.shouldBeListening = true;

                        // Give the browser a moment to finish
                        // closing the previous recognition session.
                        this.scheduleBackgroundRestart(50);
                    }

                    resolve();
                };

                // Small delay prevents "already started" errors
                // when switching from background recognition.
                setTimeout(() => {
                    if (
                        this.projectStopped ||
                        requestId !== this.pauseRequestId
                    ) {
                        finish(false);
                        return;
                    }

                    const recognition =
                        this.createRecognition();

                    if (!recognition) {
                        finish(true);
                        return;
                    }

                    const currentSession =
                        ++this.sessionId;

                    this.recognition = recognition;
                    this.isListening = true;

                    recognition.continuous = false;
                    recognition.interimResults = true;

                    recognition.onresult = (event) => {
                        if (
                            currentSession !== this.sessionId ||
                            requestId !== this.pauseRequestId
                        ) {
                            return;
                        }

                        let finalText = '';
                        let interimText = '';

                        for (
                            let i = event.resultIndex;
                            i < event.results.length;
                            i++
                        ) {
                            const result = event.results[i];

                            if (result.isFinal) {
                                finalText +=
                                    result[0].transcript;
                            } else {
                                interimText +=
                                    result[0].transcript;
                            }
                        }

                        if (finalText.trim()) {
                            sessionTranscript =
                                finalText.trim();
                        } else if (interimText.trim()) {
                            sessionTranscript =
                                interimText.trim();
                        }
                    };

                    recognition.onerror = (event) => {
                        if (
                            currentSession !== this.sessionId ||
                            requestId !== this.pauseRequestId
                        ) {
                            return;
                        }

                        if (
                            event.error !== 'no-speech' &&
                            event.error !== 'aborted'
                        ) {
                            console.warn(
                                'Speech recognition warning:',
                                event.error
                            );
                        }
                    };

                    recognition.onend = () => {
                        if (
                            currentSession !== this.sessionId
                        ) {
                            return;
                        }

                        if (this.recognition === recognition) {
                            this.recognition = null;
                        }

                        this.isListening = false;

                        finish(true);
                    };

                    try {
                        recognition.start();
                    } catch (e) {
                        if (
                            currentSession !== this.sessionId
                        ) {
                            return;
                        }

                        if (this.recognition === recognition) {
                            this.recognition = null;
                        }

                        this.isListening = false;

                        finish(true);
                    }
                }, 100);
            });
        }

        /*
         * ------------------------------------------------------------
         * WAKEWORDS
         * ------------------------------------------------------------
         */

        discoverWakewords() {
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

                    if (
                        !block ||
                        block.opcode !==
                            'speechtotext_onWakeword'
                    ) {
                        continue;
                    }

                    let wakeword = '';

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

        detectWakewords(text) {
            if (!text) {
                return;
            }

            const now = Date.now();

            // Prevent the same recognition result from
            // creating many tokens immediately.
            if (now - this.lastTriggerTime < 250) {
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

                    const current =
                        this.wakewordTokens.get(
                            wakeword
                        ) || 0;

                    this.wakewordTokens.set(
                        wakeword,
                        current + 1
                    );

                    // Don't allow an old wakeword to remain
                    // in the speech buffer forever.
                    this.backgroundTranscript = '';

                    break;
                }
            }
        }

        onWakeword(args) {
            if (
                !this.SpeechRecognition ||
                this.projectStopped
            ) {
                return false;
            }

            const wakeword =
                this.normalizeText(args.WORD);

            if (!wakeword) {
                return false;
            }

            // Dynamically register the wakeword.
            this.registeredWakewords.add(wakeword);

            // Make sure background recognition is running.
            if (
                !this.shouldBeListening &&
                !this.isListeningUntilPause
            ) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            }

            if (
                !this.isListening &&
                !this.isListeningUntilPause &&
                !this.restartTimer &&
                this.shouldBeListening
            ) {
                this.startBackgroundListening();
            }

            const detected =
                this.wakewordTokens.get(wakeword) || 0;

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

        /*
         * ------------------------------------------------------------
         * TEXT HELPERS
         * ------------------------------------------------------------
         */

        normalizeText(text) {
            return String(text || '')
                .toLowerCase()
                .replace(
                    /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,
                    ''
                )
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
                this.escapeRegex(
                    normalizedWakeword
                );

            const regex = new RegExp(
                '(?:^|\\s|[^a-z0-9])' +
                    escaped +
                    '(?:\\s|$|[^a-z0-9])',
                'i'
            );

            return regex.test(normalizedText);
        }

        /*
         * ------------------------------------------------------------
         * REPORTER
         * ------------------------------------------------------------
         */

        getSpeechText() {
            return this.transcript;
        }

        /*
         * ------------------------------------------------------------
         * TURBOWARP EXTENSION INFO
         * ------------------------------------------------------------
         */

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

                        // Important for TurboWarp:
                        // allow the wakeword event to restart
                        // the existing script.
                        shouldRestartExistingThreads: true,

                        isEdgeActivated: false,

                        text: 'on wakeword [WORD]',

                        arguments: {
                            WORD: {
                                type:
                                    Scratch.ArgumentType
                                        .STRING,
                                defaultValue:
                                    'computer'
                            }
                        }
                    },

                    {
                        opcode: 'listenUntilPause',
                        blockType:
                            Scratch.BlockType.COMMAND,
                        text: 'Listen until Pause'
                    },

                    {
                        opcode: 'getSpeechText',
                        blockType:
                            Scratch.BlockType.REPORTER,
                        text: 'Speech Text'
                    },

                    {
                        opcode: 'cancelListening',
                        blockType:
                            Scratch.BlockType.COMMAND,
                        text: 'Cancel All Listening'
                    }
                ]
            };
        }
    }

    // Register the extension.
    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
