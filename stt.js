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

            // Number of detections waiting to be consumed.
            this.wakewordTokens = new Map();

            // Number of detections already consumed.
            this.consumedWakewordTokens = new Map();

            // --------------------------------------------------------
            // IMPORTANT:
            //
            // Wakewords that currently have a running HAT script.
            //
            // Example:
            //
            // on wakeword [Dango]
            //     Listen until Pause
            //
            // "Dango" stays locked until that whole script finishes.
            // --------------------------------------------------------
            this.activeWakewords = new Set();

            // Used to notice when a Scratch thread has finished.
            this.wakewordThreadChecks = new Map();

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

            this.activeWakewords.clear();

            for (const timer of this.wakewordThreadChecks.values()) {
                clearInterval(timer);
            }

            this.wakewordThreadChecks.clear();

            this.clearRestartTimer();

            this.abortCurrentRecognition();

            this.discoverWakewords();

            // Start background listening.
            this.shouldBeListening = true;
            this.startBackgroundListening();
        }

        // ============================================================
        // PROJECT STOP
        // ============================================================

        stopAllListening() {
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.isListening = false;

            this.backgroundTranscript = '';

            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.activeWakewords.clear();

            for (const timer of this.wakewordThreadChecks.values()) {
                clearInterval(timer);
            }

            this.wakewordThreadChecks.clear();

            this.clearRestartTimer();

            this.abortCurrentRecognition();
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
                        block.opcode !== 'speechtotext_onWakeword'
                    ) {
                        continue;
                    }

                    let wakeword = '';

                    if (
                        block.fields &&
                        block.fields.WORD
                    ) {
                        wakeword = block.fields.WORD.value;
                    }

                    if (
                        !wakeword &&
                        block.inputs &&
                        block.inputs.WORD
                    ) {
                        const input = block.inputs.WORD;

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

                    wakeword = this.normalizeText(wakeword);

                    if (wakeword) {
                        this.registeredWakewords.add(wakeword);
                    }
                }
            }
        }

        // ============================================================
        // RECOGNITION HELPERS
        // ============================================================

        createRecognition() {
            if (!this.SpeechRecognition) {
                return null;
            }

            const recognition =
                new this.SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.continuous = true;
            recognition.interimResults = true;

            return recognition;
        }

        abortCurrentRecognition() {
            const recognition = this.recognition;

            this.recognition = null;

            if (recognition) {
                try {
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.onend = null;
                    recognition.abort();
                } catch (e) {}
            }
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
                this.escapeRegex(normalizedWakeword);

            const regex = new RegExp(
                '(?:^|\\s|[^a-z0-9])' +
                escaped +
                '(?:\\s|$|[^a-z0-9])',
                'i'
            );

            return regex.test(normalizedText);
        }

        // ============================================================
        // WAKEWORD DETECTION
        // ============================================================

        detectWakewords(text) {
            if (
                !text ||
                this.projectStopped ||
                this.isListeningUntilPause
            ) {
                return;
            }

            const now = Date.now();

            if (now - this.lastTriggerTime < 250) {
                return;
            }

            for (const wakeword of this.registeredWakewords) {

                if (!this.containsWakeword(text, wakeword)) {
                    continue;
                }

                // ----------------------------------------------------
                // DO NOT DETECT A WAKEWORD WHILE ITS HAT IS RUNNING.
                // ----------------------------------------------------

                if (this.activeWakewords.has(wakeword)) {
                    return;
                }

                this.lastTriggerTime = now;

                const current =
                    this.wakewordTokens.get(wakeword) || 0;

                this.wakewordTokens.set(
                    wakeword,
                    current + 1
                );

                // Clear the buffer after detecting a wakeword.
                // This prevents the same word from being detected
                // again from the same speech.
                this.backgroundTranscript = '';

                break;
            }
        }

        // ============================================================
        // BACKGROUND LISTENING
        // ============================================================

        startBackgroundListening() {
            if (
                !this.SpeechRecognition ||
                this.projectStopped ||
                this.isListeningUntilPause ||
                !this.shouldBeListening ||
                this.isListening
            ) {
                return;
            }

            this.clearRestartTimer();

            // Use a completely fresh recognition object.
            this.abortCurrentRecognition();

            const recognition =
                this.createRecognition();

            if (!recognition) {
                return;
            }

            this.recognition = recognition;
            this.isListening = true;

            recognition.continuous = true;
            recognition.interimResults = true;

            // --------------------------------------------------------
            // RESULT
            // --------------------------------------------------------

            recognition.onresult = (event) => {
                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening ||
                    this.recognition !== recognition
                ) {
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

                this.backgroundTranscript = (
                    this.backgroundTranscript +
                    ' ' +
                    currentChunk
                )
                    .replace(/\s+/g, ' ')
                    .trim();

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
                if (this.recognition !== recognition) {
                    return;
                }

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
                if (this.recognition !== recognition) {
                    return;
                }

                this.recognition = null;
                this.isListening = false;

                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                this.scheduleBackgroundRestart(30);
            };

            try {
                recognition.start();
            } catch (e) {
                if (this.recognition === recognition) {
                    this.recognition = null;
                }

                this.isListening = false;

                this.scheduleBackgroundRestart(100);
            }
        }

        // ============================================================
        // BACKGROUND RESTART
        // ============================================================

        scheduleBackgroundRestart(delay) {
            if (
                this.projectStopped ||
                this.isListeningUntilPause ||
                !this.shouldBeListening ||
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
        // TURBOWARP BLOCK INFO
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

                        // Predicate HAT.
                        //
                        // We deliberately DO NOT use
                        // shouldRestartExistingThreads.
                        isEdgeActivated: false,

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

        // ============================================================
        // WAKEWORD HAT
        // ============================================================

        onWakeword(args, util) {
            if (
                !this.SpeechRecognition ||
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

            this.registeredWakewords.add(wakeword);

            // --------------------------------------------------------
            // If this wakeword's script is already running,
            // do NOT start another copy.
            // --------------------------------------------------------

            if (this.activeWakewords.has(wakeword)) {
                return false;
            }

            const detected =
                this.wakewordTokens.get(wakeword) || 0;

            const consumed =
                this.consumedWakewordTokens.get(wakeword) || 0;

            if (detected <= consumed) {
                return false;
            }

            // --------------------------------------------------------
            // Consume the detection.
            // --------------------------------------------------------

            this.consumedWakewordTokens.set(
                wakeword,
                consumed + 1
            );

            // --------------------------------------------------------
            // LOCK THIS WAKEWORD.
            //
            // This happens before the HAT script starts.
            // --------------------------------------------------------

            this.activeWakewords.add(wakeword);

            // --------------------------------------------------------
            // Find out when this particular Scratch HAT script
            // finishes.
            // --------------------------------------------------------

            this.watchWakewordThread(
                wakeword,
                util
            );

            return true;
        }

        // ============================================================
        // WATCH THE HAT'S SCRATCH THREAD
        // ============================================================

        watchWakewordThread(wakeword, util) {
            // Avoid multiple watchers.
            if (
                this.wakewordThreadChecks.has(wakeword)
            ) {
                return;
            }

            let checks = 0;

            const timer = setInterval(() => {
                checks++;

                const runtime = Scratch.vm.runtime;

                if (!runtime) {
                    clearInterval(timer);

                    this.wakewordThreadChecks.delete(
                        wakeword
                    );

                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                let running = false;

                // Look through the VM's current threads.
                if (runtime.threads) {
                    for (const thread of runtime.threads) {
                        if (
                            this.threadContainsWakeword(
                                thread,
                                wakeword
                            )
                        ) {
                            running = true;
                            break;
                        }
                    }
                }

                // ----------------------------------------------------
                // If the HAT thread has disappeared, the script
                // has finished.
                // ----------------------------------------------------

                if (!running) {
                    clearInterval(timer);

                    this.wakewordThreadChecks.delete(
                        wakeword
                    );

                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                // Safety timeout.
                //
                // This should never normally be reached, but it
                // prevents a broken thread from permanently locking
                // a wakeword.
                if (checks > 1200) {
                    clearInterval(timer);

                    this.wakewordThreadChecks.delete(
                        wakeword
                    );

                    this.activeWakewords.delete(
                        wakeword
                    );
                }
            }, 25);

            this.wakewordThreadChecks.set(
                wakeword,
                timer
            );
        }

        // ============================================================
        // DOES A THREAD CONTAIN OUR HAT?
        // ============================================================

        threadContainsWakeword(thread, wakeword) {
            if (!thread) {
                return false;
            }

            const runtime = Scratch.vm.runtime;

            if (!runtime || !runtime.targets) {
                return false;
            }

            // Scratch/TurboWarp threads contain a stack of block IDs.
            const stack = thread.stack || [];

            if (!stack.length) {
                return false;
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

                for (const blockId of stack) {
                    const block = blocks[blockId];

                    if (
                        !block ||
                        block.opcode !==
                            'speechtotext_onWakeword'
                    ) {
                        continue;
                    }

                    let blockWakeword = '';

                    if (
                        block.fields &&
                        block.fields.WORD
                    ) {
                        blockWakeword =
                            block.fields.WORD.value;
                    }

                    if (
                        !blockWakeword &&
                        block.inputs &&
                        block.inputs.WORD
                    ) {
                        const input =
                            block.inputs.WORD;

                        if (
                            Array.isArray(input) &&
                            input.length > 0
                        ) {
                            blockWakeword = input[0];
                        } else if (
                            typeof input === 'string'
                        ) {
                            blockWakeword = input;
                        }
                    }

                    if (
                        this.normalizeText(
                            blockWakeword
                        ) ===
                        this.normalizeText(
                            wakeword
                        )
                    ) {
                        return true;
                    }
                }
            }

            return false;
        }

        // ============================================================
        // LISTEN UNTIL PAUSE
        // ============================================================

        listenUntilPause() {
            if (
                !this.SpeechRecognition ||
                this.projectStopped
            ) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                // ----------------------------------------------------
                // Stop background wakeword listening.
                //
                // The HAT remains locked while this is running.
                // ----------------------------------------------------

                this.shouldBeListening = false;
                this.isListeningUntilPause = true;

                this.clearRestartTimer();

                const oldRecognition =
                    this.recognition;

                this.recognition = null;
                this.isListening = false;

                if (oldRecognition) {
                    try {
                        oldRecognition.onresult = null;
                        oldRecognition.onerror = null;
                        oldRecognition.onend = null;
                        oldRecognition.abort();
                    } catch (e) {}
                }

                let sessionTranscript = '';

                // Give the old recognition object time to close.
                setTimeout(() => {
                    if (this.projectStopped) {
                        this.isListeningUntilPause = false;
                        resolve();
                        return;
                    }

                    const recognition =
                        this.createRecognition();

                    if (!recognition) {
                        this.isListeningUntilPause = false;
                        this.shouldBeListening = true;

                        this.scheduleBackgroundRestart(50);

                        resolve();
                        return;
                    }

                    this.recognition = recognition;
                    this.isListening = true;

                    recognition.continuous = false;
                    recognition.interimResults = true;

                    // ------------------------------------------------
                    // RESULT
                    // ------------------------------------------------

                    recognition.onresult = (event) => {
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
                    // ERROR
                    // ------------------------------------------------

                    recognition.onerror = (event) => {
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

                    // ------------------------------------------------
                    // END
                    // ------------------------------------------------

                    recognition.onend = () => {
                        if (
                            this.recognition !== recognition
                        ) {
                            return;
                        }

                        this.recognition = null;
                        this.isListening = false;

                        this.transcript =
                            sessionTranscript;

                        this.backgroundTranscript = '';

                        // Listen Until Pause is over.
                        this.isListeningUntilPause = false;

                        if (this.projectStopped) {
                            this.shouldBeListening = false;
                            resolve();
                            return;
                        }

                        // Wakeword recognition becomes active again.
                        this.shouldBeListening = true;

                        this.scheduleBackgroundRestart(30);

                        resolve();
                    };

                    try {
                        recognition.start();
                    } catch (e) {
                        if (
                            this.recognition === recognition
                        ) {
                            this.recognition = null;
                        }

                        this.isListening = false;
                        this.isListeningUntilPause = false;

                        if (!this.projectStopped) {
                            this.shouldBeListening = true;

                            this.scheduleBackgroundRestart(
                                100
                            );
                        }

                        resolve();
                    }
                }, 100);
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

            this.abortCurrentRecognition();

            this.isListening = false;
        }
    }

    // ================================================================
    // REGISTER
    // ================================================================

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
