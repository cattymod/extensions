
(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("Audio Recorder requires an unsandboxed extension.");
    }

    class AudioRecorder {
        constructor() {
            this.stream = null;
            this.recorder = null;
            this.chunks = [];
            this.blob = null;
            this.recording = false;
            this.audio = null;
            this.waitForPause = null;
            this.stopPromise = null;
            this.objectURL = null;
        }

        getInfo() {
            return {
                id: "dangoaudio",
                name: "Audio Recorder",
                color1: "#e066ff",
                color2: "#b950d3",
                color3: "#b950d3",

                blocks: [
                    {
                        opcode: "startRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Start Recording Audio [MODE]",
                        arguments: {
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "recordModes",
                                defaultValue: "UNTIL_PAUSE"
                            }
                        }
                    },
                    {
                        opcode: "pauseRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Pause Recording Audio"
                    },
                    {
                        opcode: "resumeRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Resume Recording Audio"
                    },
                    {
                        opcode: "endRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "End Recording Audio"
                    },
                    {
                        opcode: "playRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Play recorded audio [MODE]",
                        arguments: {
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "playModes",
                                defaultValue: "UNTIL_DONE"
                            }
                        }
                    },
                    {
                        opcode: "stopPlayback",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Stop recorded audio playback"
                    },
                    {
                        opcode: "downloadRecording",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Download recorded audio as [FORMAT]",
                        arguments: {
                            FORMAT: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "formats",
                                defaultValue: "WAV"
                            }
                        }
                    },
                    {
                        opcode: "isRecording",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "Is recording audio?"
                    }
                ],

                menus: {
                    recordModes: {
                        acceptReporters: false,
                        items: [
                            { text: "Until Pause", value: "UNTIL_PAUSE" },
                            { text: "In the Background", value: "BACKGROUND" }
                        ]
                    },
                    playModes: {
                        acceptReporters: false,
                        items: [
                            { text: "Until Done", value: "UNTIL_DONE" },
                            { text: "In Background", value: "BACKGROUND" }
                        ]
                    },
                    formats: {
                        acceptReporters: false,
                        items: [
                            { text: "MP3", value: "MP3" },
                            { text: "WAV", value: "WAV" }
                        ]
                    }
                }
            };
        }

        async startRecording(args) {
            if (this.recording) return;

            if (!navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia) {
                throw new Error("Microphone recording is not supported.");
            }

            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            const mimeTypes = [
                "audio/webm;codecs=opus",
                "audio/ogg;codecs=opus",
                "audio/webm",
                "audio/ogg"
            ];

            let options = {};

            for (const mime of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mime)) {
                    options.mimeType = mime;
                    break;
                }
            }

            this.chunks = [];
            this.blob = null;

            this.recorder = new MediaRecorder(this.stream, options);

            this.recorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    this.chunks.push(event.data);
                }
            };

            this.stopPromise = new Promise(resolve => {
                this.recorder.onstop = () => {
                    this.blob = new Blob(this.chunks, {
                        type: this.recorder.mimeType
                    });

                    this.recording = false;

                    if (this.stream) {
                        this.stream.getTracks().forEach(track => track.stop());
                        this.stream = null;
                    }

                    if (this.waitForPause) {
                        this.waitForPause();
                        this.waitForPause = null;
                    }

                    resolve();
                };
            });

            this.recorder.onpause = () => {
                if (this.waitForPause) {
                    this.waitForPause();
                    this.waitForPause = null;
                }
            };

            this.recorder.start(250);
            this.recording = true;

            if (args.MODE === "UNTIL_PAUSE") {
                await new Promise(resolve => {
                    this.waitForPause = resolve;
                });
            }
        }

        pauseRecording() {
            if (this.recorder &&
                this.recorder.state === "recording") {
                this.recorder.pause();
            }
        }

        resumeRecording() {
            if (this.recorder &&
                this.recorder.state === "paused") {
                this.recorder.resume();
            }
        }

        async endRecording() {
            if (!this.recorder) return;

            if (this.recorder.state !== "inactive") {
                this.recorder.stop();
            }

            if (this.stopPromise) {
                await this.stopPromise;
            }
        }

        async playRecording(args) {
            if (!this.blob) return;

            this.stopPlayback();

            this.objectURL = URL.createObjectURL(this.blob);
            this.audio = new Audio(this.objectURL);

            const playback = this.audio;

            const finished = new Promise(resolve => {
                playback.onended = resolve;
                playback.onerror = resolve;
            });

            await playback.play();

            if (args.MODE === "UNTIL_DONE") {
                await finished;
            }
        }

        stopPlayback() {
            if (this.audio) {
                this.audio.pause();
                this.audio.currentTime = 0;
                this.audio = null;
            }

            if (this.objectURL) {
                URL.revokeObjectURL(this.objectURL);
                this.objectURL = null;
            }
        }

        isRecording() {
            return this.recording;
        }

        async loadLameJS() {
            if (window.lamejs) return;

            await new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src =
                    "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";

                script.onload = resolve;
                script.onerror = () =>
                    reject(new Error("Could not load the MP3 encoder."));

                document.head.appendChild(script);
            });
        }

        async encodeMP3(blob) {
            await this.loadLameJS();

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            const context = new AudioContextClass();

            try {
                const buffer = await context.decodeAudioData(
                    await blob.arrayBuffer()
                );

                const channels = Math.min(buffer.numberOfChannels, 2);
                const sampleRate = buffer.sampleRate;

                const encoder = new lamejs.Mp3Encoder(
                    channels,
                    sampleRate,
                    128
                );

                const left = buffer.getChannelData(0);
                const right = channels > 1
                    ? buffer.getChannelData(1)
                    : null;

                const mp3Data = [];
                const blockSize = 1152;

                for (let i = 0; i < left.length; i += blockSize) {
                    const end = Math.min(i + blockSize, left.length);

                    const leftSamples = new Int16Array(end - i);
                    const rightSamples = channels > 1
                        ? new Int16Array(end - i)
                        : null;

                    for (let j = i; j < end; j++) {
                        const l = Math.max(-1, Math.min(1, left[j]));
                        leftSamples[j - i] = l < 0
                            ? l * 32768
                            : l * 32767;

                        if (rightSamples) {
                            const r = Math.max(
                                -1,
                                Math.min(1, right[j])
                            );

                            rightSamples[j - i] = r < 0
                                ? r * 32768
                                : r * 32767;
                        }
                    }

                    const encoded = channels > 1
                        ? encoder.encodeBuffer(leftSamples, rightSamples)
                        : encoder.encodeBuffer(leftSamples);

                    if (encoded.length > 0) {
                        mp3Data.push(encoded);
                    }
                }

                const finalData = encoder.flush();

                if (finalData.length > 0) {
                    mp3Data.push(finalData);
                }

                return new Blob(mp3Data, {
                    type: "audio/mpeg"
                });
            } finally {
                await context.close();
            }
        }

        async encodeWAV(blob) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            const context = new AudioContextClass();

            try {
                const buffer = await context.decodeAudioData(
                    await blob.arrayBuffer()
                );

                const channels = Math.min(buffer.numberOfChannels, 2);
                const sampleRate = buffer.sampleRate;
                const length = buffer.length;

                const dataSize = length * channels * 2;
                const wavBuffer = new ArrayBuffer(44 + dataSize);
                const view = new DataView(wavBuffer);

                const writeString = (offset, str) => {
                    for (let i = 0; i < str.length; i++) {
                        view.setUint8(offset + i, str.charCodeAt(i));
                    }
                };

                writeString(0, "RIFF");
                view.setUint32(4, 36 + dataSize, true);
                writeString(8, "WAVE");
                writeString(12, "fmt ");
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, channels, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * channels * 2, true);
                view.setUint16(32, channels * 2, true);
                view.setUint16(34, 16, true);
                writeString(36, "data");
                view.setUint32(40, dataSize, true);

                let offset = 44;

                for (let i = 0; i < length; i++) {
                    for (let c = 0; c < channels; c++) {
                        const sample = Math.max(
                            -1,
                            Math.min(1, buffer.getChannelData(c)[i])
                        );

                        view.setInt16(
                            offset,
                            sample < 0
                                ? sample * 32768
                                : sample * 32767,
                            true
                        );

                        offset += 2;
                    }
                }

                return new Blob([wavBuffer], {
                    type: "audio/wav"
                });
            } finally {
                await context.close();
            }
        }

        async downloadRecording(args) {
            if (!this.blob) return;

            const format = args.FORMAT;
            const file = format === "MP3"
                ? await this.encodeMP3(this.blob)
                : await this.encodeWAV(this.blob);

            const url = URL.createObjectURL(file);
            const link = document.createElement("a");

            link.href = url;
            link.download = "recording." +
                (format === "MP3" ? "mp3" : "wav");

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    Scratch.extensions.register(new AudioRecorder());

})(Scratch);
