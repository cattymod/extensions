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
            this.lastTriggerTime = 0;

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();

                this.recognition.lang = 'en-US';
                this.recognition.continuous = true;
                this.recognition.interimResults = true;

                this.setupBackgroundHandlers();
            }
        }

        // ------------------------------------------------------------
        // BACKGROUND WAKEWORD LISTENING
        // ------------------------------------------------------------

        setupBackgroundHandlers() {
            if (!this.recognition) return;

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                let currentChunk = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    ++i
                ) {
                    currentChunk += event.results[i][0].transcript;
                }

                currentChunk = currentChunk
                    .toLowerCase()
                    .trim();

                if (currentChunk) {
                    this.backgroundTranscript += ' ' + currentChunk;
                    this.backgroundTranscript =
                        this.backgroundTranscript.trim();

                    // Prevent the buffer from becoming huge.
                    if (this.backgroundTranscript.length > 300) {
                        this.backgroundTranscript =
                            this.backgroundTranscript.slice(-300);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                // These are normal/frequent browser recognition errors.
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

                // Only restart if background wakeword listening
                // is supposed to be active.
                if (this.shouldBeListening) {
                    this.startBackgroundListening();
                }
            };
        }

        startBackgroundListening() {
            if (!this.recognition) return;

            // Already running.
            if (this.isListening) return;

            // Do not start if something explicitly disabled
            // background listening.
            if (!this.shouldBeListening) return;

            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            try {
                this.recognition.start();
                this.isListening = true;
            } catch (e) {
                // The browser can briefly consider recognition
                // "busy" after a previous session ended.
                setTimeout(() => {
                    if (
                        this.shouldBeListening &&
                        !this.isListening
                    ) {
                        try {
                            this.recognition.start();
                            this.isListening = true;
                        } catch (err) {
                            // Try again later.
                            setTimeout(() => {
                                if (
                                    this.shouldBeListening &&
                                    !this.isListening
                                ) {
                                    try {
                                        this.recognition.start();
                                        this.isListening = true;
                                    } catch (ignored) {}
                                }
                            }, 500);
                        }
                    }
                }, 100);
            }
        }

        // ------------------------------------------------------------
        // SCRATCH BLOCKS
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

        // ------------------------------------------------------------
        // WAKEWORD HAT
        // ------------------------------------------------------------

        onWakeword(args) {
            if (!this.recognition) {
                return false;
            }

            // If wakeword listening isn't active, start it.
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

                // Prevent the same word from triggering
                // repeatedly in a very short period.
                if (
                    now - this.lastTriggerTime > 600
                ) {
                    this.lastTriggerTime = now;

                    // Remove the detected speech so the
                    // same wakeword doesn't immediately
                    // trigger again.
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
                    // IMPORTANT:
                    // Wakeword listening is disabled while
                    // Listen until Pause is active.
                    this.shouldBeListening = false;

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

                        // Keep the newest available text.
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

                        this.transcript =
                            sessionTranscript;

                        // Clear any old wakeword text.
                        this.backgroundTranscript = '';

                        // Restore background handlers.
                        this.setupBackgroundHandlers();

                        // Wakeword listening resumes ONLY
                        // after Listen until Pause has ended.
                        this.shouldBeListening = true;

                        setTimeout(() => {
                            if (
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

                        this.setupBackgroundHandlers();

                        this.shouldBeListening = true;

                        setTimeout(() => {
                            this.startBackgroundListening();
                        }, 100);

                        resolve();
                    }
                };

                // If background recognition is currently active,
                // stop it before starting the one-shot session.
                if (this.isListening) {

                    this.recognition.onend = () => {
                        this.isListening = false;
                        startSession();
                    };

                    try {
                        this.recognition.stop();
                    } catch (e) {
                        this.isListening = false;
                        startSession();
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
            this.backgroundTranscript = '';

            if (
                this.recognition &&
                this.isListening
            ) {
                try {
                    this.recognition.abort();
                } catch (e) {}

                this.isListening = false;
            }
        }
    }

    Scratch.extensions.register(new SpeechToTextExtension());
})(Scratch);
