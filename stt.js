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
                let currentChunk = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    currentChunk += event.results[i][0].transcript;
                }
                
                // Keep the rolling buffer clean and updated with recent speech
                this.backgroundTranscript = currentChunk.toLowerCase().trim();
            };

            this.recognition.onerror = (event) => {
                // Ignore 'no-speech' errors as they happen frequently during pauses
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.error('Speech recognition error:', event.error);
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                // Instantly restart if background listening is supposed to be active
                if (this.shouldBeListening) {
                    setTimeout(() => {
                        if (this.shouldBeListening && !this.isListening) {
                            try {
                                this.recognition.start();
                                this.isListening = true;
                            } catch (err) {
                                // Retry shortly if browser is busy
                                setTimeout(() => {
                                    if (this.shouldBeListening && !this.isListening) {
                                        try {
                                            this.recognition.start();
                                            this.isListening = true;
                                        } catch (e) {}
                                    }
                                }, 500);
                            }
                        }
                    }, 100);
                }
            };
        }

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',
                docsURI: `https://cattymod.app/docs/extensions/stt`,
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

        onWakeword(args) {
            // Ensure background listener is running whenever this hat block is active in the project
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
            const currentText = this.backgroundTranscript;

            if (wakeword && currentText.includes(wakeword)) {
                const now = Date.now();
                // 600ms cooldown to prevent multi-triggering on the same spoken phrase
                if (now - this.lastTriggerTime > 600) {
                    this.lastTriggerTime = now;
                    // Clear the buffer so it doesn't loop-trigger on the same sentence
                    this.backgroundTranscript = '';
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
                        this.transcript = sessionTranscript;
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
