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

            // Whether Listen until Pause currently owns recognition.
            this.isListeningUntilPause = false;

            // Prevent duplicate wakeword triggers.
            this.lastTriggerTime = 0;

            // True after Scratch stops the project.
            this.projectStopped = false;

            // Used to identify the current recognition session.
            // This prevents callbacks from an old session from
            // interfering with a newer one.
            this.recognitionGeneration = 0;

            // Prevent multiple restart timers.
            this.restartTimer = null;

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn(
                    'Speech recognition is not supported by this browser.'
                );
                return;
            }

            this.recognition = new SpeechRecognition();

            this.recognition.lang = 'en-US';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.setupBackgroundHandlers();

            // --------------------------------------------------------
            // SCRATCH PROJECT STOP
            // --------------------------------------------------------

            Scratch.vm.runtime.on(
                'PROJECT_STOP_ALL',
                () => {
                    this.stopAllListening();
                }
            );

            // --------------------------------------------------------
            // SCRATCH PROJECT START
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

            // A new green-flag run is a new project session.
            this.projectStopped = false;

            this.isListeningUntilPause = false;
            this.isListening = false;

            this.backgroundTranscript = '';
            this.transcript = '';

            this.lastTriggerTime = 0;

            this.clearRestartTimer();

            // Make sure the normal background handlers are installed.
            this.setupBackgroundHandlers();

            // Do NOT start recognition here.
            //
            // The wakeword hat will request it when the hat is
            // evaluated. This avoids starting the microphone merely
            // because the project was started.
        }

        stopAllListening() {
            // Mark stopped BEFORE aborting.
            //
            // SpeechRecognition.abort() can cause onend to fire
            // asynchronously. The onend handler must know that the
            // project is actually stopped.
            this.projectStopped = true;

            this.shouldBeListening = false;
            this.isListeningUntilPause = false;

            this.backgroundTranscript = '';

            this.clearRestartTimer();

            // Invalidate every previous recognition callback.
            this.recognitionGeneration++;

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            // Restore normal handlers.
            if (this.recognition) {
                this.setupBackgroundHandlers();
            }
        }

        clearRestartTimer() {
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }

        // ============================================================
        // BACKGROUND WAKEWORD HANDLERS
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
                // Ignore results when the project is stopped.
                if (this.projectStopped) {
                    return;
                }

                // Listen until Pause owns recognition.
                if (this.isListeningUntilPause) {
                    return;
                }

                // Background listening isn't wanted.
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
                    currentChunk
                        .toLowerCase()
                        .trim();

                if (!currentChunk) {
                    return;
                }

                // Keep accumulating speech so a wakeword can be
                // detected even if it appears inside a longer phrase.
                this.backgroundTranscript +=
                    ' ' + currentChunk;

                this.backgroundTranscript =
                    this.backgroundTranscript
                        .replace(/\s+/g, ' ')
                        .trim();

                // Keep the buffer reasonably small.
                if (this.backgroundTranscript.length > 500) {
                    this.backgroundTranscript =
                        this.backgroundTranscript.slice(-500);
                }
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

                // Some browsers end recognition after certain errors.
                // onend will take care of restarting it.
            };

            // --------------------------------------------------------
            // END
            // --------------------------------------------------------

            recognition.onend = () => {
                this.isListening = false;

                // Project has stopped.
                if (this.projectStopped) {
                    return;
                }

                // Listen until Pause owns the microphone.
                if (this.isListeningUntilPause) {
                    return;
                }

                // Background wakeword listening isn't requested.
                if (!this.shouldBeListening) {
                    return;
                }

                // Recognition ended unexpectedly.
                //
                // Restart it automatically.
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

            // Don't create multiple restart timers.
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
                // The browser may still be finishing the previous
                // recognition session.
                //
                // Do NOT disable wakeword listening. Just retry.
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

            // Never allow an old hat evaluation to revive a
            // project that has actually been stopped.
            if (this.projectStopped) {
                return false;
            }

            // Listen until Pause temporarily disables wakewords.
            if (this.isListeningUntilPause) {
                return false;
            }

            const wakeword =
                String(args.WORD)
                    .toLowerCase()
                    .trim();

            if (!wakeword) {
                return false;
            }

            // --------------------------------------------------------
            // IMPORTANT:
            //
            // Once the wakeword system is enabled, it stays enabled.
            //
            // Triggering the wakeword DOES NOT set
            // shouldBeListening to false.
            // --------------------------------------------------------

            if (!this.shouldBeListening) {
                this.shouldBeListening = true;

                this.startBackgroundListening();
            } else if (!this.isListening) {
                // Recognition may have ended by itself.
                // Make sure it comes back.
                this.startBackgroundListening();
            }

            const currentText =
                this.backgroundTranscript;

            if (!currentText) {
                return false;
            }

            // Use word boundaries when possible.
            //
            // This prevents something like "computer" accidentally
            // matching the middle of another word.
            const escapedWakeword =
                wakeword.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                );

            const wakewordRegex =
                new RegExp(
                    '(^|\\s)' +
                    escapedWakeword +
                    '(?=\\s|$)',
                    'i'
                );

            if (!wakewordRegex.test(currentText)) {
                return false;
            }

            const now = Date.now();

            // Prevent the same recognition result from triggering
            // the hat repeatedly.
            if (
                now - this.lastTriggerTime < 1000
            ) {
                return false;
            }

            this.lastTriggerTime = now;

            // --------------------------------------------------------
            // IMPORTANT:
            //
            // Clear the old phrase, BUT KEEP THE MICROPHONE RUNNING.
            //
            // This is what allows:
            //
            // "computer"
            // -> trigger
            //
            // "computer"
            // -> trigger again
            //
            // without stopping the project.
            // --------------------------------------------------------

            this.backgroundTranscript = '';

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

                    // Wakeword temporarily gives control to
                    // Listen until Pause.
                    this.shouldBeListening = false;
                    this.isListeningUntilPause = true;

                    this.clearRestartTimer();

                    let sessionTranscript = '';

                    // Stop any previous background recognition
                    // session before taking ownership.
                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

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

                        // Prefer final speech.
                        if (finalTranscript.trim()) {
                            sessionTranscript =
                                finalTranscript.trim();
                        } else if (interim.trim()) {
                            sessionTranscript =
                                interim.trim();
                        }
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

                        // Remove anything left over from the
                        // previous wakeword session.
                        this.backgroundTranscript = '';

                        // Restore normal background handlers.
                        this.setupBackgroundHandlers();

                        if (this.projectStopped) {
                            this.shouldBeListening = false;
                            resolve();
                            return;
                        }

                        // Wakeword listening automatically resumes.
                        this.shouldBeListening = true;

                        // Give the browser a moment to completely
                        // close the previous recognition session.
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
                // Stop background recognition first.
                // ----------------------------------------------------

                if (this.isListening) {
                    const oldOnEnd =
                        this.recognition.onend;

                    this.recognition.onend = () => {
                        this.isListening = false;

                        if (this.projectStopped) {
                            resolve();
                            return;
                        }

                        // Now that background recognition has
                        // actually ended, start the command session.
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

            // Invalidate old callbacks.
            this.recognitionGeneration++;

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.isListening = false;

            // Restore normal handlers.
            if (this.recognition) {
                this.setupBackgroundHandlers();
            }
        }
    }

    // ================================================================
    // REGISTER EXTENSION
    // ================================================================

    Scratch.extensions.register(
        new SpeechToTextExtension()
    );

})(Scratch);
