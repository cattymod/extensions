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
            this.recognition = null;
            this.isListening = false;
            this.shouldBeListening = false;
            this.lastTriggeredTranscript = '';
            this.lastTriggerTime = 0; // Tracks when the wakeword was last triggered
            
            // Initialize Web Speech API Recognition if available
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true; // Keep listening continuously in the background
                this.recognition.interimResults = true;
                this.recognition.lang = 'en-US';

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
                    
                    const fullText = (finalTranscript || interim).trim();
                    this.transcript = fullText;
                };

                this.recognition.onerror = (event) => {
                    console.error('Speech recognition error', event.error);
                };

                this.recognition.onend = () => {
                    this.isListening = false;
                    // Automatically restart continuous listening if it was active and not manually stopped
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
            const currentText = this.transcript.toLowerCase();

            if (wakeword && currentText.includes(wakeword)) {
                const now = Date.now();
                // Check if 1 second (1000 milliseconds) has passed since the last trigger
                if (now - this.lastTriggerTime > 1000 && this.transcript !== this.lastTriggeredTranscript) {
                    this.lastTriggerTime = now;
                    this.lastTriggeredTranscript = this.transcript;
                    
                    // Clear the transcript shortly after firing so stale text doesn't linger
                    setTimeout(() => {
                        this.transcript = '';
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
                if (this.isListening) {
                    this.recognition.stop();
                }

                this.shouldBeListening = false;
                this.transcript = '';
                this.isListening = true;

                this.recognition.onend = () => {
                    this.isListening = false;
                    resolve();
                };

                try {
                    this.recognition.start();
                } catch (e) {
                    this.isListening = false;
                    resolve();
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
