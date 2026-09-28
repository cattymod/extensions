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
            this.isListeningUntilPause = false;
            this.projectStopped = false;

            this.latestTranscript = '';
            this.triggeredWords = new Set();
            this.registeredWords = new Set();

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn('Speech recognition is not supported by this browser.');
                return;
            }

            Scratch.vm.runtime.on('PROJECT_STOP_ALL', () => {
                this.stopAll();
            });

            Scratch.vm.runtime.on('PROJECT_START', () => {
                this.startSession();
            });
        }

        startSession() {
            this.projectStopped = false;
            this.isListeningUntilPause = false;
            this.transcript = '';
            this.latestTranscript = '';
            this.triggeredWords.clear();
            this.registeredWords.clear();
            this.shouldBeListening = true;
            this.initRecognition();
            this.startListening();
        }

        stopAll() {
            this.projectStopped = true;
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }
            this.isListening = false;
        }

        normalize(text) {
            return String(text || '')
                .toLowerCase()
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        initRecognition() {
            if (this.recognition) return;

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) return;

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event) => {
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }

                let currentSentence = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    currentSentence += event.results[i][0].transcript;
                }

                const normalized = this.normalize(currentSentence);
                this.latestTranscript = normalized;

                if (!normalized) return;

                for (const word of this.registeredWords) {
                    const regex = new RegExp(`(^|\\s)${word}(\\s|$)`, 'i');
                    if (regex.test(normalized)) {
                        this.triggeredWords.add(word);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.warn('Speech recognition warning:', event.error);
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }
                // Quick auto-recovery loop
                setTimeout(() => {
                    this.startListening();
                }, 150);
            };
        }

        startListening() {
            if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening || this.isListening) {
                return;
            }

            if (!this.recognition) {
                this.initRecognition();
            }

            try {
                this.recognition.start();
                this.isListening = true;
            } catch (e) {
                // If it fails because instance was already running, abort and retry safely
                this.isListening = false;
                try {
                    this.recognition.abort();
                } catch (err) {}
                setTimeout(() => this.startListening(), 400);
            }
        }

        getInfo() {
            return {
                id: 'speechtotext',
                name: 'Speech to Text',
                color1: '#CF63CF',
                color2: '#B84CB8',
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
            if (this.projectStopped || this.isListeningUntilPause) {
                return false;
            }

            const word = this.normalize(args.WORD);
            if (!word) return false;

            this.registeredWords.add(word);

            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.initRecognition();
                this.startListening();
            }

            // Check if the word was triggered since the last block check
            if (this.triggeredWords.has(word)) {
                this.triggeredWords.delete(word);
                return true;
            }

            return false;
        }

        listenUntilPause() {
            if (!this.recognition) return Promise.resolve();

            return new Promise((resolve) => {
                this.shouldBeListening = false;
                this.isListeningUntilPause = true;

                try {
                    this.recognition.abort();
                } catch (e) {}

                const SpeechRecognition =
                    window.SpeechRecognition ||
                    window.webkitSpeechRecognition;

                const singleRec = new SpeechRecognition();
                singleRec.lang = 'en-US';
                singleRec.continuous = false;
                singleRec.interimResults = true;

                let phrase = '';

                singleRec.onresult = (e) => {
                    let text = '';
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        text += e.results[i][0].transcript;
                    }
                    phrase = text.trim();
                };

                singleRec.onend = () => {
                    this.isListening = false;
                    this.isListeningUntilPause = false;
                    this.transcript = phrase;

                    if (!this.projectStopped) {
                        this.shouldBeListening = true;
                        this.startListening();
                    }
                    resolve();
                };

                try {
                    singleRec.start();
                    this.isListening = true;
                } catch (err) {
                    this.isListening = false;
                    this.isListeningUntilPause = false;
                    resolve();
                }
            });
        }

        getSpeechText() {
            return this.transcript;
        }

        cancelListening() {
            this.stopAll();
        }
    }

    Scratch.extensions.register(new SpeechToTextExtension());
})(Scratch);
