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
            this.lastTriggeredTranscript = '';
            this.lastTriggerTime = 0; // Tracks when the wakeword was last triggered
            
            // Initialize Web Speech API Recognition if available
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.lang = 'en-US';
                this.setupBackgroundHandlers();
            }
        }

        setupBackgroundHandlers() {
            if (!this.recognition) return;
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                let interim = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                this.backgroundTranscript = (finalTranscript || interim).trim();
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
            };

            this.recognition.onend = () => {
                this.isListening = false;
                // Automatically restart continuous listening if background mode was active
                if (this.shouldBeListening) {
                    try {
                        this.recognition.start();
                        this.isListening = true;
                    } catch (e) {
                        setTimeout(() => {
                            if (this.shouldBeListening && !this.isListening) {
                                try {
                                    this.recognition.start();
                                    this.isListening = true;
                                } catch (err) {}
                            }
                        }, 300);
                    }
                }
            };
        }

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',
                color1: '#CF63CF', // Primary accent color
                color2: '#B84CB8', // Darker border shade
                color3: '#E07CE0', // Highlight shade
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

        // Hat block condition checker with a 1-second cooldown
        onWakeword(args) {
            // Ensure background continuous listening is active whenever this hat block is used
            if (!this.shouldBeListening && this.recognition) {
                this.shouldBeListening = true;
                if (!this.isListening) {
                    try {
                        this.recognition.start();
                        this.isListening = true;
                    } catch (e) {}
                }
            }

            const wakeword = String(args.WORD).toLowerCase().trim();
            const currentText = (this.backgroundTranscript || '').toLowerCase();

            if (wakeword && currentText.includes(wakeword)) {
                const now = Date.now();
                // Check if 1 second (1000 milliseconds) has passed since the last trigger
                if (now - this.lastTriggerTime > 1000 && this.backgroundTranscript !== this.lastTriggeredTranscript) {
                    this.lastTriggerTime = now;
                    this.lastTriggeredTranscript = this.backgroundTranscript;
                    
                    // Clear the background transcript shortly after firing so stale text doesn't linger
                    setTimeout(() => {
                        this.backgroundTranscript = '';
                        this.lastTriggeredTranscript = '';
                    }, 500);
                    
                    return true;
                }
            }
            return false;
        }

        listenUntilPause() {
            if (!this.recognition) return Promise.resolve();

            return new Promise((resolve) => {
                const startSession = () => {
                    this.shouldBeListening = false;
                    let sessionTranscript = '';

                    // Set continuous to false so the browser automatically stops when you pause speaking
                    this.recognition.continuous = false;
                    this.recognition.interimResults = true;

                    this.recognition.onresult = (event) => {
                        let interim = '';
                        let finalTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            if (event.results[i].isFinal) {
                                finalTranscript += event.results[i][0].transcript;
                            } else {
                                interim += event.results[i][0].transcript;
                            }
                        }
                        sessionTranscript = (finalTranscript || interim).trim();
                    };

                    this.recognition.onend = () => {
                        this.isListening = false;
                        // Update the public Speech Text reporter only when the pause finishes
                        this.transcript = sessionTranscript;

                        // Restore background handlers and continuous listening mode
                        this.setupBackgroundHandlers();
                        resolve();
                    };

                    this.isListening = true;
                    try {
                        this.recognition.start();
                    } catch (e) {
                        this.isListening = false;
                        this.setupBackgroundHandlers();
                        resolve();
                    }
                };

                // If it was already listening in the background, safely stop it first and wait for it to fully close
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

        getSpeechText() {
            return this.transcript;
        }

        cancelListening() {
            this.shouldBeListening = false;
            if (this.recognition && this.isListening) {
                this.recognition.abort();
                this.isListening = false;
            }
        }
    }

    Scratch.extensions.register(new SpeechToTextExtension());
})(Scratch);
