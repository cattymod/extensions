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

            // --------------------------------------------------------
            // HAT THREAD LOCKING
            // --------------------------------------------------------
            //
            // A wakeword cannot start another copy of the same HAT
            // while its previous script is still running.
            //
            // Each entry is:
            // {
            //     thread: TurboWarp/Scratch VM Thread,
            //     wakeword: normalized wakeword
            // }
            //
            this.runningWakewordThreads = [];

            // Check running HAT threads periodically.
            this.threadCheckTimer = null;

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

            // Keep track of finished Scratch threads.
            this.startThreadMonitor();
        }

        // ============================================================
        // PROJECT LIFECYCLE
        // ============================================================

        startProjectSession() {
            if (!this.SpeechRecognition) {
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

            this.runningWakewordThreads = [];

            this.clearRestartTimer();

            this.abortCurrentRecognition();

            this.discoverWakewords();

            // Start background listening immediately.
            this.shouldBeListening = true;
            this.startBackgroundListening();
        }

        // ============================================================
        // THREAD MONITOR
        // ============================================================

        startThreadMonitor() {
            if (this.threadCheckTimer !== null) {
                clearInterval(this.threadCheckTimer);
            }

            this.threadCheckTimer = setInterval(() => {
                this.cleanupFinishedWakewordThreads();
            }, 50);
        }

        cleanupFinishedWakewordThreads() {
            if (
                this.projectStopped ||
                !this.runningWakewordThreads.length
            ) {
                return;
            }

            const runtime = Scratch.vm.runtime;

            if (!runtime || !runtime.threads) {
                return;
            }

            const currentThreads = runtime.threads;

            this.runningWakewordThreads =
                this.runningWakewordThreads.filter(entry => {
                    if (!entry || !entry.thread) {
                        return false;
                    }

                    // The VM removes finished threads from runtime.threads.
                    return currentThreads.includes(entry.thread);
                });
        }

        // ============================================================
        // CHECK WHETHER A WAKEWORD IS CURRENTLY RUNNING
        // ============================================================

        isWakewordRunning(wakeword) {
            this.cleanupFinishedWakewordThreads();

            const normalized =
                this.normalizeText(wakeword);

            for (const entry of this.runningWakewordThreads) {
                if (
                    entry &&
                    entry.wakeword === normalized &&
                    entry.thread
                ) {
                    return true;
                }
            }

            return false;
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

            this.runningWakewordThreads = [];

            this.clearRestartTimer();

            this.abortCurrentRecognition();

            this.isListening = false;
        }

        // ============================================================
        // ABORT CURRENT RECOGNITION
        // ============================================================

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
                if (
                    this.containsWakeword(
                        text,
                        wakeword
                    )
                ) {
                    // IMPORTANT:
                    //
                    // If this wakeword already has a running HAT,
                    // ignore it completely.
                    //
                    // This means:
                    //
                    // on wakeword [WORD]
                    //     Listen until Pause
                    //
                    // cannot be triggered again while it is already
                    // running.
                    if (
                        this.isWakewordRunning(
                            wakeword
                        )
                    ) {
                        return;
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

                    // Clear old speech so the same wakeword
                    // isn't detected repeatedly.
                    this.backgroundTranscript = '';

                    break;
                }
            }
        }

        // ============================================================
        // BACKGROUND LISTENING
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
                    this.normalizeText(
                        currentChunk
                    );

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
                    this.backgroundTranscript.length >
                    200
                ) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(
                            -200
                        );
                }

                this.detectWakewords(
                    this.backgroundTranscript
                );
            };

            recognition.onerror = (event) => {
                if (
                    this.recognition !== recognition
                ) {
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

            recognition.onend = () => {
                if (
                    this.recognition !== recognition
                ) {
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
                if (
                    this.recognition === recognition
                ) {
                    this.recognition = null;
                }

                this.isListening = false;

                this.scheduleBackgroundRestart(
                    100
                );
            }
        }

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
        // TURBOWARP INFO
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
                        blockType:
                            Scratch.BlockType.HAT,

                        // IMPORTANT:
                        //
                        // Do NOT use shouldRestartExistingThreads.
                        //
                        // We specifically want the current script
                        // to keep running and reject another wakeword
                        // until it finishes.
                        isEdgeActivated: false,

                        text:
                            'on wakeword [WORD]',

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
                        opcode:
                            'listenUntilPause',
                        blockType:
                            Scratch.BlockType.COMMAND,
                        text:
                            'Listen until Pause'
                    },

                    {
                        opcode:
                            'getSpeechText',
                        blockType:
                            Scratch.BlockType.REPORTER,
                        text:
                            'Speech Text'
                    },

                    {
                        opcode:
                            'cancelListening',
                        blockType:
                            Scratch.BlockType.COMMAND,
                        text:
                            'Cancel All Listening'
                    }
                ]
            };
        }

        // ============================================================
        // WAKEWORD HAT
        // ============================================================

        onWakeword(args) {
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

            this.registeredWakewords.add(
                wakeword
            );

            // If this wakeword already has a running
            // Scratch script, DO NOT activate it again.
            if (
                this.isWakewordRunning(
                    wakeword
                )
            ) {
                return false;
            }

            // Make sure background recognition is alive.
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            } else if (
                !this.isListening &&
                !this.restartTimer
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

            // Consume exactly one wakeword detection.
            this.consumedWakewordTokens.set(
                wakeword,
                consumed + 1
            );

            /*
             * The HAT itself will now be started by TurboWarp.
             *
             * We cannot get its Thread object directly from this
             * predicate function, so schedule a tiny check after
             * this frame and find the newly-created thread.
             */
            this.trackNewWakewordThread(
                wakeword
            );

            return true;
        }

        // ============================================================
        // TRACK THE THREAD STARTED BY THE HAT
        // ============================================================

        trackNewWakewordThread(wakeword) {
            setTimeout(() => {
                if (
                    this.projectStopped ||
                    !Scratch.vm ||
                    !Scratch.vm.runtime
                ) {
                    return;
                }

                const runtime =
                    Scratch.vm.runtime;

                if (!runtime.threads) {
                    return;
                }

                // Find threads whose top block is our
                // wakeword HAT and which are not already tracked.
                for (const thread of runtime.threads) {
                    if (!thread) {
                        continue;
                    }

                    if (
                        this.runningWakewordThreads.some(
                            entry =>
                                entry.thread ===
                                thread
                        )
                    ) {
                        continue;
                    }

                    if (
                        this.threadStartsWithWakewordHat(
                            thread,
                            wakeword
                        )
                    ) {
                        this.runningWakewordThreads.push({
                            thread: thread,
                            wakeword: wakeword
                        });
                    }
                }
            }, 0);
        }

        threadStartsWithWakewordHat(
            thread,
            wakeword
        ) {
            if (!thread) {
                return false;
            }

            /*
             * TurboWarp/Scratch threads normally keep their
             * top block ID in topBlock.
             */
            const topBlock =
                thread.topBlock;

            if (!topBlock) {
                return false;
            }

            const runtime =
                Scratch.vm.runtime;

            if (
                !runtime ||
                !runtime.targets
            ) {
                return false;
            }

            for (
                const target of runtime.targets
            ) {
                if (
                    !target ||
                    !target.blocks ||
                    !target.blocks._blocks
                ) {
                    continue;
                }

                const block =
                    target.blocks._blocks[
                        topBlock
                    ];

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
                        input.length
                    ) {
                        blockWakeword =
                            input[0];
                    } else if (
                        typeof input === 'string'
                    ) {
                        blockWakeword =
                            input;
                    }
                }

                return (
                    this.normalizeText(
                        blockWakeword
                    ) ===
                    this.normalizeText(
                        wakeword
                    )
                );
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
                // Completely disable wakeword detection while
                // this command is listening.
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

                // Give the old recognition session time to close.
                setTimeout(() => {
                    if (this.projectStopped) {
                        this.isListeningUntilPause =
                            false;
                        resolve();
                        return;
                    }

                    const recognition =
                        this.createRecognition();

                    if (!recognition) {
                        this.isListeningUntilPause =
                            false;
                        this.shouldBeListening =
                            true;
                        this.scheduleBackgroundRestart(
                            50
                        );
                        resolve();
                        return;
                    }

                    this.recognition =
                        recognition;

                    this.isListening = true;

                    recognition.continuous = false;
                    recognition.interimResults = true;

                    recognition.onresult =
                        (event) => {
                            let interim = '';
                            let finalTranscript = '';

                            for (
                                let i =
                                    event.resultIndex;
                                i <
                                    event.results
                                        .length;
                                i++
                            ) {
                                const result =
                                    event.results[
                                        i
                                    ];

                                if (
                                    result.isFinal
                                ) {
                                    finalTranscript +=
                                        result[0]
                                            .transcript;
                                } else {
                                    interim +=
                                        result[0]
                                            .transcript;
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

                    recognition.onerror =
                        (event) => {
                            if (
                                event.error !==
                                    'no-speech' &&
                                event.error !==
                                    'aborted'
                            ) {
                                console.warn(
                                    'Speech recognition warning:',
                                    event.error
                                );
                            }
                        };

                    recognition.onend = () => {
                        if (
                            this.recognition !==
                            recognition
                        ) {
                            return;
                        }

                        this.recognition = null;
                        this.isListening = false;

                        this.transcript =
                            sessionTranscript;

                        this.backgroundTranscript =
                            '';

                        this.isListeningUntilPause =
                            false;

                        if (
                            this.projectStopped
                        ) {
                            this.shouldBeListening =
                                false;

                            resolve();
                            return;
                        }

                        // Wakeword listening becomes available
                        // again AFTER Listen Until Pause finishes.
                        this.shouldBeListening =
                            true;

                        this.scheduleBackgroundRestart(
                            30
                        );

                        resolve();
                    };

                    try {
                        recognition.start();
                    } catch (e) {
                        if (
                            this.recognition ===
                            recognition
                        ) {
                            this.recognition =
                                null;
                        }

                        this.isListening = false;
                        this.isListeningUntilPause =
                            false;

                        if (
                            !this.projectStopped
                        ) {
                            this.shouldBeListening =
                                true;

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
    // REGISTER EXTENSION
    // ================================================================

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
