// Name: Speech to Text
// ID: speechtotext
// Description: Speak to your projects!
// By: Noahscratch493
// License: MIT

(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        alert('This extension must run unsandboxed.');
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
            this.isListeningUntilPause = false;
            this.shouldBeListening = false;
            this.projectStopped = false;

            this.restartTimer = null;

            // Wakewords found in the project.
            this.registeredWakewords = new Set();

            // The wakeword currently being fired.
            // This is only set while runtime.startHats() is running.
            this.triggeringWakeword = null;

            // Wakewords whose HAT scripts are currently running.
            this.activeWakewords = new Set();

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
            text = this.normalizeText(text);
            wakeword = this.normalizeText(wakeword);

            if (!text || !wakeword) {
                return false;
            }

            const regex = new RegExp(
                '(?:^|\\s)' +
                this.escapeRegex(wakeword) +
                '(?=\\s|$)',
                'i'
            );

            return regex.test(text);
        }

        discoverWakewords() {
            const runtime = Scratch.vm.runtime;

            if (!runtime || !runtime.targets) {
                return;
            }

            for (const target of runtime.targets) {
                if (!target.blocks) {
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

                    let word = '';

                    if (
                        block.fields &&
                        block.fields.WORD
                    ) {
                        word =
                            block.fields.WORD.value;
                    }

                    if (!word) {
                        continue;
                    }

                    word =
                        this.normalizeText(word);

                    if (word) {
                        this.registeredWakewords.add(word);
                    }
                }
            }
        }

        startProjectSession() {
            if (!this.SpeechRecognition) {
                return;
            }

            this.projectStopped = false;
            this.shouldBeListening = true;
            this.isListening = false;
            this.isListeningUntilPause = false;

            this.transcript = '';
            this.backgroundTranscript = '';

            this.triggeringWakeword = null;
            this.activeWakewords.clear();

            this.clearRestartTimer();
            this.abortRecognition();

            this.registeredWakewords.clear();

            this.discoverWakewords();

            this.startBackgroundListening();
        }

        stopAllListening() {
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.triggeringWakeword = null;
            this.activeWakewords.clear();

            this.clearRestartTimer();
            this.abortRecognition();
        }

        createRecognition() {
            const recognition =
                new this.SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.interimResults = true;

            return recognition;
        }

        abortRecognition() {
            const recognition = this.recognition;

            this.recognition = null;
            this.isListening = false;

            if (recognition) {
                try {
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.onend = null;
                    recognition.abort();
                } catch (e) {}
            }
        }

        startBackgroundListening() {
            if (
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.isListening
            ) {
                return;
            }

            this.clearRestartTimer();

            const recognition =
                this.createRecognition();

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

                let text = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    text +=
                        event.results[i][0].transcript;
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

                if (
                    this.backgroundTranscript.length >
                    300
                ) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-300);
                }

                this.checkForWakeword();
            };

            recognition.onerror = (event) => {
                if (
                    event.error !== 'no-speech' &&
                    event.error !== 'aborted' &&
                    event.error !== 'network'
                ) {
                    console.warn(
                        'Speech recognition:',
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

                this.scheduleRestart(50);
            };

            try {
                recognition.start();
            } catch (e) {
                this.recognition = null;
                this.isListening = false;

                this.scheduleRestart(100);
            }
        }

        checkForWakeword() {
            if (
                this.projectStopped ||
                this.isListeningUntilPause
            ) {
                return;
            }

            // Discover newly-added HATs.
            this.discoverWakewords();

            for (
                const wakeword of
                    this.registeredWakewords
            ) {
                if (
                    this.activeWakewords.has(
                        wakeword
                    )
                ) {
                    continue;
                }

                if (
                    !this.containsWakeword(
                        this.backgroundTranscript,
                        wakeword
                    )
                ) {
                    continue;
                }

                // Prevent the same recognition text
                // from triggering repeatedly.
                this.backgroundTranscript = '';

                this.fireWakeword(wakeword);

                return;
            }
        }

        fireWakeword(wakeword) {
            if (
                this.projectStopped ||
                this.activeWakewords.has(wakeword)
            ) {
                return;
            }

            const runtime = Scratch.vm.runtime;

            if (!runtime) {
                return;
            }

            /*
             * IMPORTANT:
             *
             * Predicate HATs are NOT automatically
             * started by TurboWarp.
             *
             * We start the HAT manually here.
             *
             * We do NOT pass WORD as a startHats
             * filter because WORD is a normal
             * string input, not a menu field.
             */
            this.triggeringWakeword = wakeword;

            let threads = [];

            try {
                threads =
                    runtime.startHats(
                        'speechtotext_onWakeword'
                    );
            } catch (e) {
                console.error(
                    'Could not start wakeword HAT:',
                    e
                );
            }

            this.triggeringWakeword = null;

            if (
                !threads ||
                threads.length === 0
            ) {
                return;
            }

            // At least one HAT script actually started.
            this.activeWakewords.add(wakeword);

            this.waitForWakewordThreads(
                wakeword,
                threads
            );
        }

        waitForWakewordThreads(
            wakeword,
            threads
        ) {
            const check = () => {
                if (this.projectStopped) {
                    this.activeWakewords.delete(
                        wakeword
                    );
                    return;
                }

                const runtime =
                    Scratch.vm.runtime;

                if (!runtime) {
                    this.activeWakewords.delete(
                        wakeword
                    );
                    return;
                }

                const stillRunning =
                    threads.some(
                        thread =>
                            runtime.threads.includes(
                                thread
                            )
                    );

                if (!stillRunning) {
                    /*
                     * The ENTIRE HAT script has finished.
                     *
                     * Wakeword activation is allowed
                     * again now.
                     */
                    this.activeWakewords.delete(
                        wakeword
                    );

                    return;
                }

                setTimeout(check, 25);
            };

            setTimeout(check, 25);
        }

        /*
         * This is the actual HAT predicate.
         *
         * TurboWarp calls this when startHats()
         * checks the HAT.
         */
        onWakeword(args) {
            if (
                this.projectStopped ||
                this.isListeningUntilPause
            ) {
                return false;
            }

            const word =
                this.normalizeText(args.WORD);

            if (!word) {
                return false;
            }

            // Remember this HAT for future detection.
            this.registeredWakewords.add(word);

            /*
             * Only the HAT whose WORD matches the
             * wakeword currently being fired gets
             * started.
             */
            return (
                this.triggeringWakeword === word
            );
        }

        listenUntilPause() {
            if (
                !this.SpeechRecognition ||
                this.projectStopped
            ) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
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

                let finalText = '';

                setTimeout(() => {
                    if (this.projectStopped) {
                        this.isListeningUntilPause =
                            false;

                        resolve();
                        return;
                    }

                    const recognition =
                        this.createRecognition();

                    this.recognition =
                        recognition;

                    this.isListening = true;

                    recognition.continuous = false;
                    recognition.interimResults = true;

                    recognition.onresult =
                        (event) => {
                            let text = '';

                            for (
                                let i =
                                    event.resultIndex;
                                i <
                                    event.results
                                        .length;
                                i++
                            ) {
                                text +=
                                    event.results[i][0]
                                        .transcript;
                            }

                            if (text.trim()) {
                                finalText =
                                    text.trim();
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
                                    'Listen until Pause:',
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
                            finalText;

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

                        /*
                         * The HAT's Listen Until Pause
                         * has finished.
                         *
                         * Background wakeword
                         * listening can resume.
                         */
                        this.shouldBeListening =
                            true;

                        this.scheduleRestart(50);

                        resolve();
                    };

                    try {
                        recognition.start();
                    } catch (e) {
                        this.recognition = null;
                        this.isListening = false;

                        this.isListeningUntilPause =
                            false;

                        if (
                            !this.projectStopped
                        ) {
                            this.shouldBeListening =
                                true;

                            this.scheduleRestart(
                                100
                            );
                        }

                        resolve();
                    }
                }, 100);
            });
        }

        scheduleRestart(delay) {
            if (
                this.restartTimer !== null ||
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.isListening
            ) {
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
                clearTimeout(
                    this.restartTimer
                );

                this.restartTimer = null;
            }
        }

        getSpeechText() {
            return this.transcript;
        }

        cancelListening() {
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.clearRestartTimer();
            this.abortRecognition();
        }

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
