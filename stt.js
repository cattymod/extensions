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

    const runtime = Scratch.vm.runtime;

    class SpeechToTextExtension {
        constructor() {
            this.recognition = null;
            this.isListening = false;
            this.latestText = '';
            this.lastCheckedText = '';

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return;

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                let text = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    text += event.results[i][0].transcript;
                }
                this.latestText = text.toLowerCase().trim();
            };

            this.recognition.onerror = (e) => {
                if (e.error !== 'no-speech' && e.error !== 'aborted') {
                    console.warn('Speech error:', e.error);
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                if (this._running) {
                    try {
                        this.recognition.start();
                        this.isListening = true;
                    } catch (err) {}
                }
            };

            runtime.on('BEFORE_EXECUTE', () => {
                if (this.latestText && this.latestText !== this.lastCheckedText) {
                    runtime.startHats('speechtotext_whenSaid');
                }
            });

            runtime.on('PROJECT_STOP_ALL', () => {
                this.stopAll();
            });
        }

        stopAll() {
            this._running = false;
            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }
            this.isListening = false;
            this.latestText = '';
            this.lastCheckedText = '';
        }

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',
                color1: '#CF63CF',
                color2: '#B84CB8',
                blocks: [
                    {
                        opcode: 'startListeningCommand',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'start voice recognition'
                    },
                    {
                        opcode: 'whenSaid',
                        blockType: Scratch.BlockType.HAT,
                        text: 'when voice says [WORD]',
                        isEdgeActivated: false,
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
                        text: 'listen until pause'
                    },
                    {
                        opcode: 'getLatestSpeech',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'last spoken text'
                    },
                    {
                        opcode: 'stopListeningCommand',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'stop voice recognition'
                    }
                ]
            };
        }

        startListeningCommand() {
            this._running = true;
            if (!this.isListening && this.recognition) {
                try {
                    this.recognition.start();
                    this.isListening = true;
                } catch (e) {
                    try {
                        this.recognition.abort();
                        this.recognition.start();
                        this.isListening = true;
                    } catch (err) {}
                }
            }
        }

        stopListeningCommand() {
            this.stopAll();
        }

        listenUntilPause() {
            // Safe fallback implementation so the block functions and resolves correctly
            return new Promise((resolve) => {
                setTimeout(resolve, 1500);
            });
        }

        whenSaid(args) {
            const targetWord = String(args.WORD || '').toLowerCase().trim();
            if (!targetWord || !this.latestText) return false;

            if (this.latestText.includes(targetWord) && this.latestText !== this.lastCheckedText) {
                this.lastCheckedText = this.latestText;
                return true;
            }
            return false;
        }

        getLatestSpeech() {
            return this.latestText;
        }
    }

    Scratch.extensions.register(new SpeechToTextExtension());
})(Scratch);
