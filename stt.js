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

            this.triggeredWakewords = new Set();
            this.registeredWakewords = new Set();

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

        createRecognition() {
            const SpeechRecognition =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;

            if (!SpeechRecognition) return null;

            const rec = new SpeechRecognition();
            rec.lang = 'en-US';
            rec.continuous = true;
            rec.interimResults = true;

            rec.onresult = (event) => {
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }

                let spokenText = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    spokenText += event.results[i][0].transcript;
                }

                const normalizedSpeech = this.normalize(spokenText);
                if (!normalizedSpeech) return;

                for (const word of this.registeredWakewords) {
                    const regex = new RegExp(`(^|\\s)${word}(\\s|$)`, 'i');
                    if (regex.test(normalizedSpeech)) {
                        this.triggeredWakewords.add(word);
                    }
                }
            };

            rec.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.warn('Speech recognition error:', event.error);
                }
            };

            rec.onend = () => {
                this.isListening = false;
                if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening) {
                    return;
                }
                // Recreate and restart fresh instance to bypass browser freezing bug
                setTimeout(() => {
                    this.startListening();
                }, 100);
            };

            return rec;
        }

        startListening() {
            if (this.projectStopped || this.isListeningUntilPause || !this.shouldBeListening || this.isListening) {
                return;
            }

            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (e) {}
            }

            this.recognition = this.createRecognition();
            if (!this.recognition) return;

            try {
                this.recognition.start();
                this.isListening = true;
            } catch (e) {
                this.isListening = false;
                setTimeout(() => this.startListening(), 300);
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

                if (this.recognition) {
                    try {
                        this.recognition.abort();
                    } catch (e) {}
                }

                const SpeechRecognition =
                    window.SpeechRecognition ||
                    window.webkitSpeechRecognition;

                const sessionRec = new SpeechRecognition();
                sessionRec.lang = 'en-US';
                sessionRec.continuous = false;
                sessionRec.interimResults = true;

                let sessionTranscript = '';

                sessionRec.onresult = (e) => {
                    let text = '';
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        text += e.results[i][0].transcript;
                    }
                    sessionTranscript = text.trim();
                };

                sessionRec.onend = () => {
                    this.isListening = false;
                    this.isListeningUntilPause = false;
                    this.transcript = sessionTranscript;

                    if (!this.projectStopped) {
                        this.shouldBeListening = true;
                        this.startListening();
                    }
                    resolve();
                };

                try {
                    sessionRec.start();
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
