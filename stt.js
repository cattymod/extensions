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

            // Stores which words were triggered since the last Scratch poll
            this.triggeredWakewords = new Set();
            this.registeredWakewords = new Set();

            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) {
                console.warn('Speech recognition is not supported by this browser.');
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.setupListeners();

            Scratch.vm.runtime.on('PROJECT_STOP_ALL', () => {
                this.stopAll();
            });

            Scratch.vm.runtime.on('PROJECT_START', () => {
                this.startSession();
            });
        }

        startSession() {
            if (!this.recognition) return;
            this.projectStopped = false;
            this.isListeningUntilPause = false;
            this.transcript = '';
            this.triggeredWakewords.clear();
            this.discoverWakewords();
            this.shouldBeListening = true;
            this.startListening();
        }

        stopAll() {
            this.projectStopped = true;
            this.shouldBeListening = false;
            this.isListeningUntilPause = false;
            this.triggeredWakewords.clear();
            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }
            this.isListening = false;
        }

        discoverWakewords() {
            const runtime = Scratch.vm.runtime;
            if (!runtime || !runtime.targets) return;

            for (const target of runtime.targets) {
                if (!target || !target.blocks) continue;
                const blocks = target.blocks._blocks;
                if (!blocks) continue;

                for (const id in blocks) {
                    const block = blocks[id];
                    if (!block || block.opcode !== 'speechtotext_onWakeword') continue;

                    let wakeword = '';
                    if (block.fields && block.fields.WORD) {
                        wakeword = block.fields.WORD.value;
                    } else if (block.inputs && block.inputs.WORD) {
                        const input = block.inputs.WORD;
                        if (Array.isArray(input)) wakeword = input[0];
                    }

                    wakeword = this.normalize(wakeword);
                    if (wakeword) {
                        this.registeredWakewords.add(wakeword);
                    }
                }
            }
        }

        normalize(text) {
            return String(text || '')
                .toLowerCase()
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        setupListeners() {
            if (!this.recognition) return;

            this.recognition.onresult = (event) => {
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }

                let spokenText = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    spokenText += event.results[i][0].transcript;
                }

                const normalizedSpeech = this.normalize(spokenText);
                if (!normalizedSpeech) return;

                // Check against all registered wakewords
                for (const word of this.registeredWakewords) {
                    // Match whole words or phrases flexibly
                    const regex = new RegExp(`(^|\\s)${word}(\\s|$)`, 'i');
                    if (regex.test(normalizedSpeech)) {
                        this.triggeredWakewords.add(word);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.warn('Speech recognition error:', event.error);
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }
                // Automatically restart recognition to keep it listening continuously
                setTimeout(() => {
                    this.startListening();
                }, 50);
            };
        }

        startListening() {
            if (!this.recognition || this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening || this.isListening) {
                return;
            }
            try {
                this.recognition.start();
                this.isListening = true;
            } catch (e) {
                this.isListening = false;
                setTimeout(() => this.startListening(), 200);
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

            this.registeredWakewords.add(word);

            if (!this.shouldBeListening) {
                this.shouldBeListening = true;
                this.startListening();
            }

            // If this wakeword was triggered since the last check, consume it and return true once
            if (this.triggeredWakewords.has(word)) {
                this.triggeredWakewords.delete(word);
                return true;
            }

            return false;
        }

        listenUntilPause() {
            if (!this.recognition) return Promise.resolve();

            return new Promise((resolve) => {
                this.shouldBeListening = false;
                this.isListeningUntilPause = true;

                this.recognition.onend = () => {
                    this.isListening = false;
                    let sessionTranscript = '';

                    this.recognition.continuous = false;
                    this.recognition.onresult = (e) => {
                        let text = '';
                        for (let i = e.resultIndex; i < e.results.length; i++) {
                            text += e.results[i][0].transcript;
                        }
                        sessionTranscript = text.trim();
                    };

                    this.recognition.onend = () => {
                        this.isListening = false;
                        this.isListeningUntilPause = false;
                        this.transcript = sessionTranscript;

                        this.setupListeners();
                        if (!this.projectStopped) {
                            this.shouldBeListening = true;
                            this.startListening();
                        }
                        resolve();
                    };

                    try {
                        this.recognition.start();
                        this.isListening = true;
                    } catch (err) {
                        this.isListening = false;
                        this.isListeningUntilPause = false;
                        resolve();
                    }
                };

                try {
                    this.recognition.stop();
                } catch (e) {
                    this.recognition.onend();
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
