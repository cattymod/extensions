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

            this.SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            this.recognition = null;
            this.isListening = false;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.projectStopped = false;

            this.restartTimer = null;
            this.lastTriggerTime = 0;

            // Wakewords found in the project.
            this.registeredWakewords = new Set();

            // Wakewords that have been detected but have not
            // yet been accepted by the HAT.
            this.pendingWakewords = new Map();

            // Wakewords whose HAT scripts are currently running.
            //
            // Example:
            //
            // Dango -> HAT running -> Dango is locked
            //
            // When the HAT thread finishes:
            //
            // Dango -> unlocked
            this.activeWakewords = new Map();

            if (!this.SpeechRecognition) {
                console.warn(
                    'Speech recognition is not supported by this browser.'
                );
                return;
            }

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

        // ============================================================
        // PROJECT
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

            this.pendingWakewords.clear();
            this.activeWakewords.clear();

            this.lastTriggerTime = 0;

            this.clearRestartTimer();
            this.abortCurrentRecognition();

            this.discoverWakewords();

            // Background microphone listening.
            this.shouldBeListening = true;
            this.startBackgroundListening();
        }

        stopAllListening() {
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.pendingWakewords.clear();
            this.activeWakewords.clear();

            this.clearRestartTimer();
            this.abortCurrentRecognition();
        }

        // ============================================================
        // WAKEWORD DISCOVERY
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
        // TEXT
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
        // RECOGNITION
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
            const recognition =
                this.recognition;

            this.recognition = null;

            if (recognition) {
                try {
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.onend = null;
                    recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;
        }

        // ============================================================
        // BACKGROUND LISTENING
        // ============================================================

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
                        this.backgroundTranscript.slice(-200);
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

                this.scheduleBackgroundRestart(100);
            }
        }

        scheduleBackgroundRestart(delay) {
            if (
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

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
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

            if (
                now - this.lastTriggerTime <
                250
            ) {
                return;
            }

            for (
                const wakeword of
                    this.registeredWakewords
            ) {
                if (
                    !this.containsWakeword(
                        text,
                        wakeword
                    )
                ) {
                    continue;
                }

                // ----------------------------------------------------
                // Ignore this wakeword while its HAT is running.
                // ----------------------------------------------------

                if (
                    this.activeWakewords.has(
                        wakeword
                    )
                ) {
                    return;
                }

                this.lastTriggerTime = now;

                // Store a pending detection.
                const count =
                    this.pendingWakewords.get(
                        wakeword
                    ) || 0;

                this.pendingWakewords.set(
                    wakeword,
                    count + 1
                );

                // Clear old speech.
                this.backgroundTranscript = '';

                // ----------------------------------------------------
                // THIS IS THE IMPORTANT PART.
                //
                // Predicate HATs are NOT automatically started.
                // We explicitly start the HAT here.
                // ----------------------------------------------------

                this.startWakewordHats(
                    wakeword
                );

                break;
            }
        }

        // ============================================================
        // START WAKEWORD HATS
        // ============================================================

        startWakewordHats(wakeword) {
            if (
                this.projectStopped ||
                this.activeWakewords.has(
                    wakeword
                )
            ) {
                return;
            }

            const opcode =
                'speechtotext_onWakeword';

            const threads =
                Scratch.vm.runtime.startHats(
                    opcode,
                    {
                        WORD: wakeword
                    }
                );

            // --------------------------------------------------------
            // If no script actually matched, remove the pending
            // detection.
            // --------------------------------------------------------

            if (
                !threads ||
                threads.length === 0
            ) {
                this.pendingWakewords.delete(
                    wakeword
                );

                return;
            }

            // --------------------------------------------------------
            // Lock the wakeword.
            // --------------------------------------------------------

            this.activeWakewords.set(
                wakeword,
                threads.slice()
            );

            // --------------------------------------------------------
            // Monitor those exact Thread objects.
            // --------------------------------------------------------

            this.monitorWakewordThreads(
                wakeword,
                threads
            );
        }

        monitorWakewordThreads(
            wakeword,
            threads
        ) {
            const check = () => {
                if (
                    this.projectStopped
                ) {
                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                const runtime =
                    Scratch.vm.runtime;

                if (
                    !runtime ||
                    !runtime.threads
                ) {
                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                // A thread is still running if it remains
                // in runtime.threads.
                const stillRunning =
                    threads.some(
                        thread =>
                            runtime.threads.includes(
                                thread
                            )
                    );

                if (!stillRunning) {
                    // ------------------------------------------------
                    // THE ENTIRE HAT SCRIPT HAS FINISHED.
                    //
                    // Wakeword can now activate again.
                    // ------------------------------------------------

                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                setTimeout(
                    check,
                    25
                );
            };

            setTimeout(
                check,
                25
            );
        }

        // ============================================================
        // HAT
        // ============================================================

        onWakeword(args) {
            if (
                this.projectStopped ||
                this.isListeningUntilPause
            ) {
                return false;
            }

            const wakeword =
                this.normalizeText(
                    args.WORD
                );

            if (!wakeword) {
                return false;
            }

            this.registeredWakewords.add(
                wakeword
            );

            // Only allow the HAT that was explicitly
            // started by startWakewordHats().
            const pending =
                this.pendingWakewords.get(
                    wakeword
                ) || 0;

            if (pending <= 0) {
                return false;
            }

            // Consume this pending event.
            if (pending === 1) {
                this.pendingWakewords.delete(
                    wakeword
                );
            } else {
                this.pendingWakewords.set(
                    wakeword,
                    pending - 1
                );
            }

            return true;
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
                // Stop background wakeword recognition.
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
                            let finalText = '';

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
                                    finalText +=
                                        result[0]
                                            .transcript;
                                } else {
                                    interim +=
                                        result[0]
                                            .transcript;
                                }
                            }

                            if (
                                finalText.trim()
                            ) {
                                sessionTranscript =
                                    finalText.trim();
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

                        this.recognition =
                            null;

                        this.isListening =
                            false;

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

                        // Background wakeword detection
                        // becomes available again.
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

                        this.isListening =
                            false;

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
        // REPORTER
        // ============================================================

        getSpeechText() {
            return this.transcript;
        }

        // ============================================================
        // CANCEL
        // ============================================================

        cancelListening() {
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.clearRestartTimer();

            this.abortCurrentRecognition();

            this.isListening = false;
        }

        // ============================================================
        // INFO
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

                        text:
                            'on wakeword [WORD]',

                        isEdgeActivated: false,

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
    }

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
