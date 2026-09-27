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

            // Whether background wakeword listening should be active.
            this.shouldBeListening = false;

            // Whether Listen until Pause is currently active.
            this.isListeningUntilPause = false;

            this.lastTriggerTime = 0;

            // Used to prevent old recognition callbacks from
            // restarting recognition after the project was stopped.
            this.projectStopped = false;

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();

                this.recognition.lang = 'en-US';
                this.recognition.continuous = true;
                this.recognition.interimResults = true;

                this.setupBackgroundHandlers();

                // Stop microphone recognition when Scratch stops
                // all scripts in the project.
                Scratch.vm.runtime.on(
                    'PROJECT_STOP_ALL',
                    () => {
                        this.stopAllListening();
                    }
                );
            }
        }

        // ------------------------------------------------------------
        // BACKGROUND WAKEWORD HANDLERS
        // ------------------------------------------------------------

        setupBackgroundHandlers() {
            if (!this.recognition) return;

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                // If the project was stopped or Listen until Pause
                // is active, don't process background results.
                if (
                    this.projectStopped ||
                    this.isListeningUntilPause ||
                    !this.shouldBeListening
                ) {
                    return;
                }

                let currentChunk = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    ++i
                ) {
                    currentChunk +=
                        event.results[i][0].transcript;
                }

                currentChunk =
                    currentChunk
                        .toLowerCase()
                        .trim();

                if (currentChunk) {
                    this.backgroundTranscript +=
                        ' ' + currentChunk;

                    this.backgroundTranscript =
                        this.backgroundTranscript.trim();

                    // Keep the buffer reasonably small.
                    if (
                        this.backgroundTranscript.length > 300
                    ) {
                        this.backgroundTranscript =
                            this.backgroundTranscript.slice(-300);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                // Don't report normal browser recognition errors.
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

                // NEVER restart if the project was stopped.
                if (this.projectStopped) {
                    return;
                }

                // NEVER restart background listening while
                // Listen until Pause is using recognition.
                if (this.isListeningUntilPause) {
                    return;
                }

                // Restart background recognition if it should
                // still be active.
                if (this.shouldBeListening) {
                    this.startBackgroundListening();
                }
            };
        }

        // ------------------------------------------------------------
        // START BACKGROUND LISTENING
        // ------------------------------------------------------------

        startBackgroundListening() {
            if (!this.recognition) return;

            // Project has been stopped.
            if (this.projectStopped) return;

            // Listen until Pause has priority.
            if (this.isListeningUntilPause) return;

            // Background listening isn't requested.
            if (!this.shouldBeListening) return;

            // Already listening.
            if (this.isListening) return;

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            try {
                this.recognition.start();
                this.isListening = true;
            } catch (e) {
                // The browser can briefly still consider the
                // previous recognition session active.

                setTimeout(() => {
                    if (
                        this.projectStopped ||
                        this.isListeningUntilPause ||
                        !this.shouldBeListening ||
                        this.isListening
                    ) {
                        return;
                    }

                    try {
                        this.recognition.start();
                        this.isListening = true;
                    } catch (err) {
                        // One more attempt.
                        setTimeout(() => {
                            if (
                                this.projectStopped ||
                                this.isListeningUntilPause ||
                                !this.shouldBeListening ||
                                this.isListening
                            ) {
                                return;
                            }

                            try {
                                this.recognition.start();
                                this.isListening = true;
                            } catch (ignored) {}
                        }, 500);
                    }
                }, 100);
            }
        }

        // ------------------------------------------------------------
        // SCRATCH INFO
        // ------------------------------------------------------------

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

        // ------------------------------------------------------------
        // WAKEWORD HAT
        // ------------------------------------------------------------

        onWakeword(args) {
            if (!this.recognition) {
                return false;
            }

            // A new project run can use the wakeword again.
            this.projectStopped = false;

            // Listen until Pause must NOT allow the wakeword
            // to run while it is active.
            if (this.isListeningUntilPause) {
                return false;
            }

            // Start background recognition if necessary.
            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startBackgroundListening();
            }

            const wakeword =
                String(args.WORD)
                    .toLowerCase()
                    .trim();

            const currentText =
                this.backgroundTranscript;

            if (
                wakeword &&
                currentText.includes(wakeword)
            ) {
                const now = Date.now();

                // Prevent repeated triggers from the same phrase.
                if (
                    now - this.lastTriggerTime > 600
                ) {
                    this.lastTriggerTime = now;

                    // Clear the detected phrase.
                    this.backgroundTranscript = '';

                    return true;
                }
            }

            return false;
        }

        // ------------------------------------------------------------
        // LISTEN UNTIL PAUSE
        // ------------------------------------------------------------

        listenUntilPause() {
            if (!this.recognition) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                const startSession = () => {
                    // Wakeword is disabled while this block runs.
                    this.shouldBeListening = false;
                    this.isListeningUntilPause = true;

                    let sessionTranscript = '';

                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    this.recognition.onresult = (event) => {
                        let interim = '';
                        let finalTranscript = '';

                        for (
                            let i = event.resultIndex;
                            i < event.results.length;
                            ++i
                        ) {
                            if (
                                event.results[i].isFinal
                            ) {
                                finalTranscript +=
                                    event.results[i][0].transcript;
                            } else {
                                interim +=
                                    event.results[i][0].transcript;
                            }
                        }

                        // Prefer final speech when available.
                        sessionTranscript =
                            (
                                finalTranscript ||
                                interim
                            ).trim();
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
                        this.isListeningUntilPause = false;

                        this.transcript =
                            sessionTranscript;

                        // Remove old wakeword text.
                        this.backgroundTranscript = '';

                        // If the project was stopped while the
                        // block was running, DON'T restart.
                        if (this.projectStopped) {
                            this.shouldBeListening = false;

                            this.setupBackgroundHandlers();

                            resolve();
                            return;
                        }

                        // Restore background handlers.
                        this.setupBackgroundHandlers();

                        // Wakeword listening resumes after
                        // Listen until Pause ends.
                        this.shouldBeListening = true;

                        setTimeout(() => {
                            if (
                                !this.projectStopped &&
                                !this.isListeningUntilPause &&
                                this.shouldBeListening &&
                                !this.isListening
                            ) {
                                this.startBackgroundListening();
                            }
                        }, 100);

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

                            setTimeout(() => {
                                this.startBackgroundListening();
                            }, 100);
                        }

                        resolve();
                    }
                };

                // If background recognition is running,
                // stop it before starting Listen until Pause.
                if (this.isListening) {
                    this.recognition.onend = () => {
                        this.isListening = false;

                        // If the project was stopped while
                        // stopping recognition, don't start
                        // Listen until Pause.
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

        // ------------------------------------------------------------
        // SPEECH TEXT
        // ------------------------------------------------------------

        getSpeechText() {
            return this.transcript;
        }

        // ------------------------------------------------------------
        // CANCEL ALL LISTENING
        // ------------------------------------------------------------

        cancelListening() {
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.backgroundTranscript = '';

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            // Restore the background handlers.
            if (this.recognition) {
                this.setupBackgroundHandlers();
            }
        }

        // ------------------------------------------------------------
        // PROJECT STOP CLEANUP
        // ------------------------------------------------------------

        stopAllListening() {
            // Mark the project as stopped BEFORE aborting recognition.
            // This is important because abort() can cause onend to fire.
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.backgroundTranscript = '';

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            // Restore normal handlers so the extension is ready
            // for the next project run.
            if (this.recognition) {
                this.setupBackgroundHandlers();
            }
        }
    }

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
