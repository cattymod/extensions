(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        alert('Speech to Text must run unsandboxed.');
        return;
    }

    class SpeechToTextExtension {
        constructor() {
            this.transcript = '';
            this.backgroundTranscript = '';

            this.recognition = null;
            this.mode = 'idle';

            this.shouldBeListening = false;
            this.isListening = false;
            this.isListeningUntilPause = false;
            this.projectStopped = false;

            this.restartTimer = null;
            this.startingRecognition = false;

            // Every new recognition session gets a new ID.
            // This makes old callbacks harmless.
            this.sessionId = 0;

            // Used to prevent multiple Listen Until Pause calls
            // from overlapping.
            this.pauseRequestId = 0;

            this.lastTriggerTime = 0;

            this.registeredWakewords = new Set();
            this.wakewordTokens = new Map();
            this.consumedWakewordTokens = new Map();

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn(
                    'Speech Recognition is not supported in this browser.'
                );
                this.SpeechRecognition = null;
                return;
            }

            this.SpeechRecognition = SpeechRecognition;

            const runtime = Scratch.vm.runtime;

            runtime.on('PROJECT_STOP_ALL', () => {
                this.stopAllListening();
            });

            runtime.on('PROJECT_START', () => {
                this.startProjectSession();
            });

            // Start immediately if the project is already running.
            setTimeout(() => {
                if (!this.projectStopped) {
                    this.startProjectSession();
                }
            }, 100);
        }

        // ------------------------------------------------------------
        // PROJECT SESSION
        // ------------------------------------------------------------

        startProjectSession() {
            if (!this.SpeechRecognition) {
                return;
            }

            this.projectStopped = false;
            this.shouldBeListening = true;
            this.isListeningUntilPause = false;

            this.clearRestartTimer();

            // Invalidate every old recognition callback.
            this.sessionId++;

            this.abortCurrentRecognition();

            this.transcript = '';
            this.backgroundTranscript = '';

            this.registeredWakewords.clear();
            this.wakewordTokens.clear();
            this.consumedWakewordTokens.clear();

            this.discoverWakewords();

            // Small delay gives the browser time to release
            // the previous recognition session.
            this.scheduleBackgroundRestart(150);
        }

        stopAllListening() {
            this.projectStopped = true;
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.pauseRequestId++;

            this.clearRestartTimer();

            // Invalidate all old callbacks.
            this.sessionId++;

            this.abortCurrentRecognition();

            this.mode = 'idle';
            this.isListening = false;
            this.startingRecognition = false;

            this.backgroundTranscript = '';
        }

        // ------------------------------------------------------------
        // WAKEWORD DISCOVERY
        // ------------------------------------------------------------

        discoverWakewords() {
            const runtime = Scratch.vm.runtime;

            try {
                for (const target of runtime.targets || []) {
                    const blocks = target.blocks;

                    if (!blocks || !blocks._blocks) {
                        continue;
                    }

                    for (const blockId in blocks._blocks) {
                        const block = blocks._blocks[blockId];

                        if (
                            !block ||
                            block.opcode !== 'speechtotext_onWakeword'
                        ) {
                            continue;
                        }

                        let word = '';

                        if (
                            block.fields &&
                            block.fields.WORD &&
                            block.fields.WORD.value !== undefined
                        ) {
                            word = block.fields.WORD.value;
                        }

                        if (!word && block.inputs && block.inputs.WORD) {
                            const input = block.inputs.WORD;

                            if (Array.isArray(input)) {
                                word = input[0];
                            } else {
                                word = input;
                            }
                        }

                        if (typeof word === 'string') {
                            word = this.normalizeText(word);

                            if (word) {
                                this.registeredWakewords.add(word);

                                if (!this.wakewordTokens.has(word)) {
                                    this.wakewordTokens.set(word, 0);
                                }

                                if (!this.consumedWakewordTokens.has(word)) {
                                    this.consumedWakewordTokens.set(word, 0);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    'Could not discover wakewords:',
                    error
                );
            }
        }

        // ------------------------------------------------------------
        // TEXT HELPERS
        // ------------------------------------------------------------

        normalizeText(text) {
            return String(text || '')
                .toLowerCase()
                .replace(/[.,!?;:"'()[\]{}<>]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        escapeRegex(text) {
            return String(text).replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );
        }

        containsWakeword(text, wakeword) {
            const normalizedText = this.normalizeText(text);
            const normalizedWakeword = this.normalizeText(wakeword);

            if (!normalizedText || !normalizedWakeword) {
                return false;
            }

            const escaped = this.escapeRegex(normalizedWakeword);

            const regex = new RegExp(
                `(?:^|\\s)${escaped}(?=\\s|$)`,
                'i'
            );

            return regex.test(normalizedText);
        }

        // ------------------------------------------------------------
        // WAKEWORD DETECTION
        // ------------------------------------------------------------

        detectWakewords(text) {
            if (!text) {
                return;
            }

            this.discoverWakewords();

            if (this.registeredWakewords.size === 0) {
                return;
            }

            const now = Date.now();

            // Prevent duplicate detections from the same speech event.
            if (now - this.lastTriggerTime < 350) {
                return;
            }

            for (const wakeword of this.registeredWakewords) {
                if (!this.containsWakeword(text, wakeword)) {
                    continue;
                }

                this.lastTriggerTime = now;

                const current =
                    this.wakewordTokens.get(wakeword) || 0;

                this.wakewordTokens.set(
                    wakeword,
                    current + 1
                );

                // Clear the buffer so the same result cannot
                // immediately trigger again.
                this.backgroundTranscript = '';

                return;
            }
        }

        // ------------------------------------------------------------
        // RECOGNITION MANAGEMENT
        // ------------------------------------------------------------

        createRecognition() {
            if (!this.SpeechRecognition) {
                return null;
            }

            const recognition = new this.SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.interimResults = true;

            return recognition;
        }

        abortCurrentRecognition() {
            const recognition = this.recognition;

            if (!recognition) {
                return;
            }

            // Make old callbacks invalid first.
            this.sessionId++;

            this.recognition = null;
            this.isListening = false;
            this.startingRecognition = false;

            try {
                recognition.onresult = null;
                recognition.onerror = null;
                recognition.onend = null;
                recognition.abort();
            } catch (error) {
                // Ignore browser shutdown errors.
            }
        }

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }

        scheduleBackgroundRestart(delay = 150) {
            this.clearRestartTimer();

            if (
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause ||
                this.mode === 'pause'
            ) {
                return;
            }

            this.restartTimer = setTimeout(() => {
                this.restartTimer = null;

                if (
                    this.projectStopped ||
                    !this.shouldBeListening ||
                    this.isListeningUntilPause
                ) {
                    return;
                }

                this.startBackgroundListening();
            }, delay);
        }

        // ------------------------------------------------------------
        // BACKGROUND LISTENING
        // ------------------------------------------------------------

        startBackgroundListening() {
            if (!this.SpeechRecognition) {
                return;
            }

            if (
                this.projectStopped ||
                !this.shouldBeListening ||
                this.isListeningUntilPause
            ) {
                return;
            }

            if (this.recognition || this.startingRecognition) {
                return;
            }

            this.discoverWakewords();

            this.mode = 'background';
            this.startingRecognition = true;

            const recognition = this.createRecognition();

            if (!recognition) {
                this.startingRecognition = false;
                return;
            }

            recognition.continuous = true;
            recognition.interimResults = true;

            const session = ++this.sessionId;

            this.recognition = recognition;

            recognition.onresult = (event) => {
                if (
                    session !== this.sessionId ||
                    this.recognition !== recognition ||
                    this.mode !== 'background'
                ) {
                    return;
                }

                let combinedText = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    const result = event.results[i];

                    if (!result || !result[0]) {
                        continue;
                    }

                    combinedText +=
                        ' ' + result[0].transcript;
                }

                combinedText = combinedText.trim();

                if (!combinedText) {
                    return;
                }

                this.backgroundTranscript =
                    (
                        this.backgroundTranscript +
                        ' ' +
                        combinedText
                    )
                        .trim()
                        .slice(-500);

                this.detectWakewords(
                    this.backgroundTranscript
                );
            };

            recognition.onerror = (event) => {
                if (
                    session !== this.sessionId ||
                    this.recognition !== recognition
                ) {
                    return;
                }

                // These are normal browser SpeechRecognition errors.
                if (
                    event.error !== 'aborted' &&
                    event.error !== 'no-speech'
                ) {
                    console.warn(
                        'Speech recognition error:',
                        event.error
                    );
                }
            };

            recognition.onend = () => {
                if (
                    session !== this.sessionId ||
                    this.recognition !== recognition
                ) {
                    return;
                }

                this.recognition = null;
                this.isListening = false;
                this.startingRecognition = false;

                if (
                    this.projectStopped ||
                    !this.shouldBeListening ||
                    this.isListeningUntilPause ||
                    this.mode !== 'background'
                ) {
                    return;
                }

                // IMPORTANT:
                // Do not reuse this recognition object.
                // Create a completely new one.
                this.scheduleBackgroundRestart(100);
            };

            try {
                recognition.start();

                this.isListening = true;
                this.startingRecognition = false;
            } catch (error) {
                if (
                    session === this.sessionId &&
                    this.recognition === recognition
                ) {
                    this.recognition = null;
                    this.isListening = false;
                    this.startingRecognition = false;

                    console.warn(
                        'Could not start background speech recognition:',
                        error
                    );

                    this.scheduleBackgroundRestart(300);
                }
            }
        }

        // ------------------------------------------------------------
        // STOP CURRENT SESSION AND WAIT FOR BROWSER TO RELEASE IT
        // ------------------------------------------------------------

        stopCurrentRecognitionAndWait() {
            const recognition = this.recognition;

            if (!recognition) {
                this.isListening = false;
                this.startingRecognition = false;

                return Promise.resolve();
            }

            // Invalidate all of the old callbacks.
            this.sessionId++;

            this.recognition = null;
            this.isListening = false;
            this.startingRecognition = false;
            this.mode = 'idle';

            return new Promise((resolve) => {
                let finished = false;

                const finish = () => {
                    if (finished) {
                        return;
                    }

                    finished = true;
                    resolve();
                };

                // Replace the old callback so it cannot restart
                // background recognition.
                recognition.onresult = null;
                recognition.onerror = null;
                recognition.onend = finish;

                try {
                    recognition.abort();
                } catch (error) {
                    finish();
                }

                // Safety timeout in case a browser does not
                // fire onend after abort().
                setTimeout(finish, 1000);
            });
        }

        // ------------------------------------------------------------
        // LISTEN UNTIL PAUSE
        // ------------------------------------------------------------

        listenUntilPause() {
            if (!this.SpeechRecognition) {
                return;
            }

            // Do not allow two pause sessions to overlap.
            if (this.isListeningUntilPause) {
                return;
            }

            const requestId = ++this.pauseRequestId;

            this.clearRestartTimer();

            this.shouldBeListening = false;
            this.isListeningUntilPause = true;

            this.transcript = '';
            this.mode = 'idle';

            // Completely stop the old background recognizer.
            return this.stopCurrentRecognitionAndWait().then(() => {
                if (
                    requestId !== this.pauseRequestId ||
                    this.projectStopped
                ) {
                    this.isListeningUntilPause = false;
                    return;
                }

                return this.startPauseRecognition(
                    requestId
                );
            });
        }

        startPauseRecognition(requestId) {
            return new Promise((resolve) => {
                if (
                    requestId !== this.pauseRequestId ||
                    this.projectStopped
                ) {
                    this.isListeningUntilPause = false;
                    resolve();
                    return;
                }

                const recognition = this.createRecognition();

                if (!recognition) {
                    this.isListeningUntilPause = false;
                    this.shouldBeListening = true;
                    this.scheduleBackgroundRestart(150);
                    resolve();
                    return;
                }

                recognition.continuous = false;
                recognition.interimResults = true;

                const session = ++this.sessionId;

                this.recognition = recognition;
                this.mode = 'pause';
                this.isListening = false;

                let finalParts = [];
                let latestInterim = '';

                let finished = false;

                const finish = () => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    if (
                        session !== this.sessionId ||
                        this.recognition !== recognition
                    ) {
                        resolve();
                        return;
                    }

                    const finalText = finalParts
                        .join(' ')
                        .trim();

                    this.transcript =
                        finalText ||
                        latestInterim ||
                        '';

                    this.recognition = null;
                    this.isListening = false;
                    this.startingRecognition = false;

                    this.isListeningUntilPause = false;
                    this.mode = 'idle';

                    if (
                        requestId === this.pauseRequestId &&
                        !this.projectStopped
                    ) {
                        this.shouldBeListening = true;

                        // Start a completely new background
                        // recognizer after Listen Until Pause.
                        this.scheduleBackgroundRestart(150);
                    }

                    resolve();
                };

                recognition.onresult = (event) => {
                    if (
                        session !== this.sessionId ||
                        this.recognition !== recognition ||
                        this.mode !== 'pause'
                    ) {
                        return;
                    }

                    for (
                        let i = event.resultIndex;
                        i < event.results.length;
                        i++
                    ) {
                        const result = event.results[i];

                        if (!result || !result[0]) {
                            continue;
                        }

                        const text =
                            result[0].transcript.trim();

                        if (!text) {
                            continue;
                        }

                        if (result.isFinal) {
                            finalParts.push(text);
                        } else {
                            latestInterim = text;
                        }
                    }
                };

                recognition.onerror = (event) => {
                    if (
                        session !== this.sessionId ||
                        this.recognition !== recognition
                    ) {
                        return;
                    }

                    if (
                        event.error !== 'aborted' &&
                        event.error !== 'no-speech'
                    ) {
                        console.warn(
                            'Listen Until Pause error:',
                            event.error
                        );
                    }
                };

                recognition.onend = finish;

                try {
                    recognition.start();

                    this.isListening = true;
                    this.startingRecognition = false;
                } catch (error) {
                    console.warn(
                        'Could not start Listen Until Pause:',
                        error
                    );

                    finish();
                }
            });
        }

        // ------------------------------------------------------------
        // WAKEWORD HAT
        // ------------------------------------------------------------

        onWakeword(args) {
            const word = this.normalizeText(
                args.WORD || 'computer'
            );

            if (!word) {
                return false;
            }

            // Register it immediately.
            this.registeredWakewords.add(word);

            if (!this.wakewordTokens.has(word)) {
                this.wakewordTokens.set(word, 0);
            }

            if (!this.consumedWakewordTokens.has(word)) {
                this.consumedWakewordTokens.set(word, 0);
            }

            // If the project is running, make sure the
            // background recognizer exists.
            if (
                !this.projectStopped &&
                this.shouldBeListening &&
                !this.isListeningUntilPause &&
                !this.recognition &&
                !this.startingRecognition
            ) {
                this.startBackgroundListening();
            }

            const detected =
                this.wakewordTokens.get(word) || 0;

            const consumed =
                this.consumedWakewordTokens.get(word) || 0;

            if (detected > consumed) {
                this.consumedWakewordTokens.set(
                    word,
                    consumed + 1
                );

                return true;
            }

            return false;
        }

        // ------------------------------------------------------------
        // SPEECH TEXT
        // ------------------------------------------------------------

        getSpeechText() {
            return this.transcript || '';
        }

        // ------------------------------------------------------------
        // CANCEL LISTENING
        // ------------------------------------------------------------

        cancelListening() {
            this.pauseRequestId++;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.clearRestartTimer();

            // Invalidate all callbacks.
            this.sessionId++;

            this.abortCurrentRecognition();

            this.mode = 'idle';
            this.backgroundTranscript = '';
        }

        // ------------------------------------------------------------
        // SCRATCH BLOCKS
        // ------------------------------------------------------------

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',
                color1: '#5C4BFF',
                color2: '#4938D6',
                color3: '#3829B8',

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
    }

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );
})(Scratch);
