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
            this.stopPromise = null;

            // Silence detection
            this.audioContext = null;
            this.analyser = null;
            this.silenceTimer = null;
            this.silenceThreshold = 0.015;
            this.silenceDuration = 1000;
            this.monitoring = false;
            this.monitorFrame = null;

            // Playback
            this.playContext = null;
            this.playSource = null;
            this.playOscillators = [];
            this.playing = false;

            // Audio effects
            this.effects = {
                PITCH: 0,
                ECHO: 0,
                REVERB: 0,
                BASS: 0,
                TREBLE: 0,
                ROBOT: 0,
                DISTORTION: 0,
                LOWPASS: 20000,
                HIGHPASS: 20,
                TELEPHONE: 0
            };

            this.volume = 100;
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
                        opcode: "setEffect",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Set [EFFECT] to [VALUE]",
                        arguments: {
                            EFFECT: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "effects",
                                defaultValue: "PITCH"
                            },
                            VALUE: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0
                            }
                        }
                    },
                    {
                        opcode: "clearEffects",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Clear Audio Effects"
                    },
                    {
                        opcode: "setVolume",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Set Audio Volume to [VOLUME] %",
                        arguments: {
                            VOLUME: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 100
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
                    },
                    effects: {
                        acceptReporters: false,
                        items: [
                            { text: "Pitch", value: "PITCH" },
                            { text: "Echo", value: "ECHO" },
                            { text: "Reverb", value: "REVERB" },
                            { text: "Bass", value: "BASS" },
                            { text: "Treble", value: "TREBLE" },
                            { text: "Robot", value: "ROBOT" },
                            { text: "Distortion", value: "DISTORTION" },
                            { text: "Low-pass", value: "LOWPASS" },
                            { text: "High-pass", value: "HIGHPASS" },
                            { text: "Telephone", value: "TELEPHONE" }
                        ]
                    }
                }
            };
        }

        // ==============================
        // RECORDING
        // ==============================

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
                    this.stopSilenceDetection();

                    if (this.stream) {
                        this.stream.getTracks().forEach(track => track.stop());
                        this.stream = null;
                    }

                    resolve();
                };
            });

            this.recorder.start(250);
            this.recording = true;

            if (args.MODE === "UNTIL_PAUSE") {
                try {
                    await this.startSilenceDetection();
                } catch (error) {
                    await this.endRecording();
                    throw error;
                }

                await this.stopPromise;
            }
        }

        async startSilenceDetection() {
            if (!this.stream || this.monitoring) return;

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error("Audio analysis is not supported.");
            }

            this.audioContext = new AudioContextClass();
            await this.audioContext.resume();

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;

            const source = this.audioContext.createMediaStreamSource(
                this.stream
            );

            source.connect(this.analyser);

            this.monitoring = true;

            const data = new Uint8Array(this.analyser.fftSize);

            const checkAudio = () => {
                if (!this.monitoring || !this.recorder) return;

                if (this.recorder.state !== "recording") {
                    this.monitorFrame = requestAnimationFrame(checkAudio);
                    return;
                }

                this.analyser.getByteTimeDomainData(data);

                let sum = 0;

                for (let i = 0; i < data.length; i++) {
                    const sample = (data[i] - 128) / 128;
                    sum += sample * sample;
                }

                const volume = Math.sqrt(sum / data.length);

                if (volume > this.silenceThreshold) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                } else if (!this.silenceTimer) {
                    this.silenceTimer = setTimeout(() => {
                        if (
                            this.recorder &&
                            this.recorder.state === "recording"
                        ) {
                            this.endRecording();
                        }
                    }, this.silenceDuration);
                }

                if (this.monitoring) {
                    this.monitorFrame = requestAnimationFrame(checkAudio);
                }
            };

            checkAudio();
        }

        stopSilenceDetection() {
            this.monitoring = false;

            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;

            if (this.monitorFrame !== null) {
                cancelAnimationFrame(this.monitorFrame);
                this.monitorFrame = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }

            this.analyser = null;
        }

        async endRecording() {
            if (!this.recorder) return;

            this.stopSilenceDetection();

            if (this.recorder.state !== "inactive") {
                this.recorder.stop();
            }

            if (this.stopPromise) {
                await this.stopPromise;
            }
        }

        isRecording() {
            return this.recording;
        }

        // ==============================
        // EFFECT SETTINGS
        // ==============================

        setEffect(args) {
            const effect = args.EFFECT;
            let value = Number(args.VALUE);

            if (!Number.isFinite(value)) value = 0;

            switch (effect) {
                case "PITCH":
                    value = Math.max(-12, Math.min(12, value));
                    break;

                case "BASS":
                case "TREBLE":
                    value = Math.max(-100, Math.min(100, value));
                    break;

                case "LOWPASS":
                    value = Math.max(20, Math.min(20000, value));
                    break;

                case "HIGHPASS":
                    value = Math.max(20, Math.min(20000, value));
                    break;

                default:
                    value = Math.max(0, Math.min(100, value));
                    break;
            }

            if (Object.prototype.hasOwnProperty.call(
                this.effects, effect
            )) {
                this.effects[effect] = value;
            }
        }

        clearEffects() {
            this.effects = {
                PITCH: 0,
                ECHO: 0,
                REVERB: 0,
                BASS: 0,
                TREBLE: 0,
                ROBOT: 0,
                DISTORTION: 0,
                LOWPASS: 20000,
                HIGHPASS: 20,
                TELEPHONE: 0
            };
        }

        setVolume(args) {
            this.volume = Math.max(
                0,
                Math.min(200, Number(args.VOLUME) || 0)
            );
        }

        // ==============================
        // AUDIO EFFECT ENGINE
        // ==============================

        makeDistortionCurve(amount) {
            const samples = 44100;
            const curve = new Float32Array(samples);
            const k = amount * 5;

            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;

                curve[i] = k === 0
                    ? x
                    : ((3 + k) * x * 20 * Math.PI / 180) /
                      (Math.PI + k * Math.abs(x));
            }

            return curve;
        }

        makeImpulse(context, seconds) {
            const length = Math.floor(
                context.sampleRate * seconds
            );

            const impulse = context.createBuffer(
                2,
                length,
                context.sampleRate
            );

            for (let channel = 0; channel < 2; channel++) {
                const data = impulse.getChannelData(channel);

                for (let i = 0; i < length; i++) {
                    const decay = Math.pow(1 - i / length, 3);
                    data[i] = (Math.random() * 2 - 1) * decay;
                }
            }

            return impulse;
        }

        connectEffects(context, source, destination, buffer) {
            const effects = this.effects;
            const nodes = [];
            const oscillators = [];

            let input = source;

            const keep = node => {
                nodes.push(node);
                return node;
            };

            const addSerial = node => {
                keep(node);
                input.connect(node);
                input = node;
            };

            // Volume
            const volume = keep(context.createGain());
            volume.gain.value = this.volume / 100;

            input.connect(volume);
            input = volume;

            // Bass
            if (effects.BASS !== 0) {
                const bass = keep(context.createBiquadFilter());
                bass.type = "lowshelf";
                bass.frequency.value = 250;
                bass.gain.value = effects.BASS * 0.24;
                addSerial(bass);
            }

            // Treble
            if (effects.TREBLE !== 0) {
                const treble = keep(context.createBiquadFilter());
                treble.type = "highshelf";
                treble.frequency.value = 3000;
                treble.gain.value = effects.TREBLE * 0.24;
                addSerial(treble);
            }

            // Low-pass
            if (effects.LOWPASS < 20000) {
                const lowpass = keep(context.createBiquadFilter());
                lowpass.type = "lowpass";
                lowpass.frequency.value = effects.LOWPASS;
                addSerial(lowpass);
            }

            // High-pass
            if (effects.HIGHPASS > 20) {
                const highpass = keep(context.createBiquadFilter());
                highpass.type = "highpass";
                highpass.frequency.value = effects.HIGHPASS;
                addSerial(highpass);
            }

            // Telephone
            if (effects.TELEPHONE > 0) {
                const amount = effects.TELEPHONE / 100;

                const highpass = keep(context.createBiquadFilter());
                highpass.type = "highpass";
                highpass.frequency.value = 300 + amount * 300;

                addSerial(highpass);

                const lowpass = keep(context.createBiquadFilter());
                lowpass.type = "lowpass";
                lowpass.frequency.value = 3500 - amount * 1200;

                addSerial(lowpass);

                const distortion = keep(context.createWaveShaper());
                distortion.curve = this.makeDistortionCurve(amount * 5);
                distortion.oversample = "4x";

                addSerial(distortion);
            }

            // Distortion
            if (effects.DISTORTION > 0) {
                const distortion = keep(context.createWaveShaper());

                distortion.curve = this.makeDistortionCurve(
                    effects.DISTORTION
                );

                distortion.oversample = "4x";
                addSerial(distortion);
            }

            // Echo
            if (effects.ECHO > 0) {
                const amount = effects.ECHO / 100;

                const delay = keep(context.createDelay(2));
                const feedback = keep(context.createGain());
                const dry = keep(context.createGain());
                const wet = keep(context.createGain());
                const output = keep(context.createGain());

                delay.delayTime.value = 0.05 + amount * 0.65;
                feedback.gain.value = amount * 0.55;
                dry.gain.value = 1;
                wet.gain.value = amount;
                output.gain.value = 1;

                input.connect(dry);
                dry.connect(output);

                input.connect(delay);
                delay.connect(feedback);
                feedback.connect(delay);
                delay.connect(wet);
                wet.connect(output);

                input = output;
            }

            // Reverb
            if (effects.REVERB > 0) {
                const amount = effects.REVERB / 100;

                const convolver = keep(context.createConvolver());
                convolver.buffer = this.makeImpulse(
                    context,
                    1 + amount * 3
                );

                const dry = keep(context.createGain());
                const wet = keep(context.createGain());
                const output = keep(context.createGain());

                dry.gain.value = 1 - amount * 0.5;
                wet.gain.value = amount * 0.65;

                input.connect(dry);
                dry.connect(output);

                input.connect(convolver);
                convolver.connect(wet);
                wet.connect(output);

                input = output;
            }

            // Robot / ring modulation
            if (effects.ROBOT > 0) {
                const amount = effects.ROBOT / 100;

                const modulator = keep(context.createOscillator());
                const modGain = keep(context.createGain());
                const ringGain = keep(context.createGain());

                modulator.type = "sine";
                modulator.frequency.value = 35;

                ringGain.gain.value = 0.5;
                modGain.gain.value = 0.5 * amount;

                modulator.connect(modGain);
                modGain.connect(ringGain.gain);

                const dry = keep(context.createGain());
                const wet = keep(context.createGain());
                const output = keep(context.createGain());

                dry.gain.value = 1 - amount;
                wet.gain.value = amount;

                input.connect(dry);
                dry.connect(output);

                input.connect(ringGain);
                ringGain.connect(wet);
                wet.connect(output);

                input = output;

                modulator.start();
                oscillators.push(modulator);
            }

            input.connect(destination);

            return { nodes, oscillators };
        }

        // ==============================
        // PLAYBACK
        // ==============================

        async playRecording(args) {
            if (!this.blob) return;

            this.stopPlayback();

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            this.playContext = new AudioContextClass();
            await this.playContext.resume();

            const buffer = await this.playContext.decodeAudioData(
                await this.blob.arrayBuffer()
            );

            this.playSource = this.playContext.createBufferSource();
            this.playSource.buffer = buffer;

            this.playSource.playbackRate.value = Math.pow(
                2,
                this.effects.PITCH / 12
            );

            const result = this.connectEffects(
                this.playContext,
                this.playSource,
                this.playContext.destination,
                buffer
            );

            this.playOscillators = result.oscillators;
            this.playing = true;

            const finished = new Promise(resolve => {
                this.playSource.onended = () => {
                    this.playing = false;
                    resolve();
                };
            });

            this.playSource.start();

            if (args.MODE === "UNTIL_DONE") {
                await finished;
                await this.cleanupPlayback();
            }
        }

        async cleanupPlayback() {
            for (const oscillator of this.playOscillators) {
                try {
                    oscillator.stop();
                } catch (error) {}
            }

            this.playOscillators = [];
            this.playSource = null;
            this.playing = false;

            if (this.playContext) {
                const context = this.playContext;
                this.playContext = null;

                try {
                    await context.close();
                } catch (error) {}
            }
        }

        stopPlayback() {
            if (this.playSource) {
                try {
                    this.playSource.stop();
                } catch (error) {}
            }

            this.cleanupPlayback();
        }

        // ==============================
        // AUDIO EXPORT
        // ==============================

        async renderEffects(blob) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            const decodeContext = new AudioContextClass();

            let buffer;

            try {
                buffer = await decodeContext.decodeAudioData(
                    await blob.arrayBuffer()
                );
            } finally {
                await decodeContext.close();
            }

            const pitchRate = Math.pow(
                2,
                this.effects.PITCH / 12
            );

            const duration = buffer.duration / pitchRate;
            const reverbTail = this.effects.REVERB > 0
                ? 4
                : 0;

            const channels = Math.min(buffer.numberOfChannels, 2);

            const frames = Math.ceil(
                (duration + reverbTail + 0.5) * buffer.sampleRate
            );

            const OfflineContext =
                window.OfflineAudioContext ||
                window.webkitOfflineAudioContext;

            if (!OfflineContext) {
                throw new Error("Offline audio rendering is unsupported.");
            }

            const offline = new OfflineContext(
                channels,
                frames,
                buffer.sampleRate
            );

            const source = offline.createBufferSource();
            source.buffer = buffer;

            source.playbackRate.value = pitchRate;

            this.connectEffects(
                offline,
                source,
                offline.destination,
                buffer
            );

            source.start(0);

            return await offline.startRendering();
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

        async encodeMP3(buffer) {
            await this.loadLameJS();

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
        }

        encodeWAV(buffer) {
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
        }

        async downloadRecording(args) {
            if (!this.blob) return;

            const rendered = await this.renderEffects(this.blob);

            const format = args.FORMAT;

            const file = format === "MP3"
                ? await this.encodeMP3(rendered)
                : this.encodeWAV(rendered);

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
