// Name: DangoAI
// ID: dangoai
// Description: Add AI Chatbots to your CattyMod Projects!
// By: Noahscratch493
// License: MIT

(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error(
            "DangoAI must be run as an unsandboxed extension."
        );
    }

    class DangoAI {
        constructor() {
            this.webllm = null;
            this.engine = null;

            this.currentModel = "";
            this.modelReady = false;

            this.loading = false;
            this.generating = false;

            this.status = "Not loaded";
            this.error = "";
            this.progress = "";

            this.groups = {};

            this.models = [
                {
                    name: "Llama 3.2 1B",
                    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC"
                },

                {
                    name: "Qwen 3 0.6B",
                    id: "Qwen3-0.6B-q4f16_1-MLC"
                },

                {
                    name: "Qwen 3 1.7B",
                    id: "Qwen3-1.7B-q4f16_1-MLC"
                },

                {
                    name: "SmolLM2 360M",
                    id: "SmolLM2-360M-Instruct-q4f16_1-MLC"
                },

                {
                    name: "SmolLM2 1.7B",
                    id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC"
                }
            ];
        }

        getInfo() {
            return {
                id: "dangoai",
                name: "DangoAI",
                docsURI: "https://cattymod.app/docs/extensions/dangoai",

                color1: "#ff9f43",
                color2: "#f39c12",
                color3: "#d68910",

                blocks: [
                    {
                        opcode: "setLLM",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Set LLM to [MODEL]",
                        arguments: {
                            MODEL: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "models"
                            }
                        }
                    },

                    {
                        opcode: "chat",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "Chat in Group [GROUP] with message [MESSAGE]",
                        arguments: {
                            GROUP: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },

                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Hello!"
                            }
                        }
                    },

                    {
                        opcode: "setPersonality",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Set Personality for Group [GROUP] to [PERSONALITY]",
                        arguments: {
                            GROUP: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },

                            PERSONALITY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue:
                                    "You are a helpful and friendly AI assistant."
                            }
                        }
                    },

                    {
                        opcode: "clearGroup",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Clear Group [GROUP]",
                        arguments: {
                            GROUP: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },

                    {
                        opcode: "clearAllGroups",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Clear all groups"
                    },

                    "---",

                    {
                        opcode: "currentLLM",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "current LLM"
                    },

                    {
                        opcode: "aiStatus",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "AI status"
                    },

                    {
                        opcode: "loadingProgress",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "loading progress"
                    },

                    {
                        opcode: "lastError",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "AI error"
                    }
                ],

                menus: {
                    models: {
                        acceptReporters: true,

                        items: this.models.map(model => ({
                            text: model.name,
                            value: model.id
                        }))
                    }
                }
            };
        }

        // =========================================================
        // WebGPU
        // =========================================================

        async checkWebGPU() {
            if (!navigator.gpu) {
                this.status = "WebGPU unavailable";
                this.error =
                    "WebGPU is not available in this browser.";

                return false;
            }

            try {
                const adapter =
                    await navigator.gpu.requestAdapter();

                if (!adapter) {
                    this.status = "WebGPU unavailable";
                    this.error =
                        "No WebGPU adapter was found.";

                    return false;
                }

                return true;
            } catch (error) {
                this.status = "WebGPU error";
                this.error =
                    error?.message || String(error);

                return false;
            }
        }

        // =========================================================
        // Load WebLLM
        // =========================================================

        async loadWebLLM() {
            if (this.webllm) {
                return this.webllm;
            }

            this.status = "Loading WebLLM...";
            this.error = "";

            try {
                this.webllm = await import(
                    "https://esm.run/@mlc-ai/web-llm"
                );

                this.status = "WebLLM loaded";

                return this.webllm;
            } catch (error) {
                this.status = "WebLLM failed";

                this.error =
                    error?.message || String(error);

                throw error;
            }
        }

        // =========================================================
        // Groups
        // =========================================================

        getGroup(number) {
            let id = Math.floor(Number(number));

            if (!Number.isFinite(id)) {
                id = 1;
            }

            if (id < 1) {
                id = 1;
            }

            id = String(id);

            if (!this.groups[id]) {
                this.groups[id] = {
                    personality:
                        "You are a helpful and friendly AI assistant.",

                    messages: []
                };
            }

            return this.groups[id];
        }

        setPersonality(args) {
            const group =
                this.getGroup(args.GROUP);

            group.personality =
                String(args.PERSONALITY || "");
        }

        clearGroup(args) {
            const group =
                this.getGroup(args.GROUP);

            group.messages = [];
        }

        clearAllGroups() {
            this.groups = {};
        }

        // =========================================================
        // Safely unload engine
        // =========================================================

        async unloadEngine() {
            this.modelReady = false;

            if (!this.engine) {
                return;
            }

            try {
                if (
                    typeof this.engine.unload ===
                    "function"
                ) {
                    await this.engine.unload();
                }
            } catch (error) {
                console.warn(
                    "[DangoAI] Engine unload warning:",
                    error
                );
            }

            this.engine = null;
        }

        // =========================================================
        // Load model
        // =========================================================

        async setLLM(args) {
            const modelID =
                String(args.MODEL || "");

            const model =
                this.models.find(
                    m => m.id === modelID
                );

            if (!model) {
                this.error =
                    "Unknown model: " + modelID;

                return;
            }

            if (this.loading) {
                this.error =
                    "A model is already loading.";

                return;
            }

            // If the exact model is already loaded,
            // don't recreate it.
            if (
                this.modelReady &&
                this.engine &&
                this.currentModel === modelID
            ) {
                this.status = "Ready";
                return;
            }

            this.loading = true;
            this.modelReady = false;
            this.error = "";
            this.progress = "";

            try {
                this.status =
                    "Checking WebGPU...";

                const gpuOK =
                    await this.checkWebGPU();

                if (!gpuOK) {
                    return;
                }

                const webllm =
                    await this.loadWebLLM();

                // Completely remove old engine.
                await this.unloadEngine();

                this.currentModel =
                    modelID;

                this.status =
                    "Loading " + model.name + "...";

                this.progress =
                    "Starting model...";

                this.engine =
                    await webllm.CreateMLCEngine(
                        modelID,
                        {
                            initProgressCallback:
                                report => {
                                    this.progress =
                                        report?.text || "";

                                    this.status =
                                        this.progress;

                                    console.log(
                                        "[DangoAI]",
                                        this.progress
                                    );
                                },

                            logLevel: "ERROR"
                        }
                    );

                /*
                 * IMPORTANT:
                 *
                 * Do not mark the model ready until
                 * CreateMLCEngine has completely resolved.
                 */
                this.modelReady = true;

                this.status = "Ready";
                this.progress = "Model ready";

                console.log(
                    "[DangoAI] Model ready:",
                    modelID
                );

            } catch (error) {
                console.error(
                    "[DangoAI] Model loading error:",
                    error
                );

                this.modelReady = false;
                this.engine = null;

                this.status =
                    "Model loading failed";

                this.error =
                    error?.message ||
                    String(error);

            } finally {
                this.loading = false;
            }
        }

        // =========================================================
        // Make sure model is actually usable
        // =========================================================

        async ensureModelReady() {
            if (
                this.engine &&
                this.modelReady
            ) {
                return true;
            }

            this.error =
                "The selected model is not loaded. Use Set LLM to load it.";

            this.status =
                "Model not loaded";

            return false;
        }

        // =========================================================
        // Chat
        // =========================================================

        async chat(args) {
            const group =
                this.getGroup(args.GROUP);

            const text =
                String(args.MESSAGE || "");

            if (!text.trim()) {
                return "";
            }

            const ready =
                await this.ensureModelReady();

            if (!ready) {
                return "";
            }

            if (this.generating) {
                this.error =
                    "The AI is already generating a response.";

                return "";
            }

            this.generating = true;
            this.status = "Generating...";
            this.error = "";

            group.messages.push({
                role: "user",
                content: text
            });

            try {
                const messages = [
                    {
                        role: "system",
                        content:
                            group.personality ||
                            "You are a helpful AI assistant."
                    },

                    ...group.messages
                ];

                let result;

                try {
                    result =
                        await this.engine.chat.completions.create({
                            messages,
                            temperature: 0.7,
                            max_tokens: 512
                        });
                } catch (error) {
                    /*
                     * WebLLM sometimes reports that its
                     * engine isn't loaded even though our
                     * JavaScript still has an engine object.
                     *
                     * Mark it as unusable instead of letting
                     * future requests repeatedly fail.
                     */
                    if (
                        String(error?.message || "")
                            .toLowerCase()
                            .includes(
                                "model not loaded"
                            )
                    ) {
                        this.modelReady = false;
                        this.status =
                            "Model needs reloading";
                    }

                    throw error;
                }

                const answer =
                    String(
                        result
                            ?.choices?.[0]
                            ?.message?.content || ""
                    ).trim();

                group.messages.push({
                    role: "assistant",
                    content: answer
                });

                this.status = "Ready";

                return answer;

            } catch (error) {
                console.error(
                    "[DangoAI] Chat error:",
                    error
                );

                // Remove failed user message.
                group.messages.pop();

                this.error =
                    error?.message ||
                    String(error);

                return "";

            } finally {
                this.generating = false;

                if (this.modelReady) {
                    this.status = "Ready";
                }
            }
        }

        // =========================================================
        // Reporters
        // =========================================================

        currentLLM() {
            const model =
                this.models.find(
                    m => m.id === this.currentModel
                );

            return model
                ? model.name
                : "None";
        }

        aiStatus() {
            return this.status;
        }

        loadingProgress() {
            return this.progress;
        }

        lastError() {
            return this.error;
        }
    }

    Scratch.extensions.register(
        new DangoAI()
    );

})(Scratch);
