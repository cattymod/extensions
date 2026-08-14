// Name: Modals
// ID: modals
// Description: Create Scratch 3 style popup windows, embeds, and interactive prompts.
// By: Noahscratch493
// License: MIT

(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("This extension requires unsandboxed mode");
    }

    let modal = null;
    let pressedButton = "";
    let accentColor = "rgb(0,156,204)";
    let currentTheme = "Light";
    
    // Prompt state
    let promptTitle = "Prompt";
    let lastResult = "";
    let currentResolver = null;
    let currentPromptId = 0;
    let isPromptOpen = false;

    function escapeHTML(text) {
        return String(text)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function getHoverColor(hex) {
        let color = hex.replace('#', '');
        if (color.length === 3) {
            color = color.split('').map(c => c + c).join('');
        }
        const num = parseInt(color, 16);
        let r = (num >> 16) + 20;
        let g = ((num >> 8) & 0x00ff) + 20;
        let b = (num & 0x0000ff) + 20;
        r = r > 255 ? 255 : r;
        g = g > 255 ? 255 : g;
        b = b > 255 ? 255 : b;
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    function createStyle() {
        let style = document.getElementById("modals-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "modals-style";
            document.head.appendChild(style);
        }

        const isDark = currentTheme === "Dark";
        const bg = isDark ? "#1e1e1e" : "#ffffff";
        const text = isDark ? "#ffffff" : "#333333";
        const border = isDark ? "#444444" : "rgb(217,217,217)";
        const footerBg = isDark ? "#2d2d2d" : "rgb(242,242,242)";
        const footerBorder = isDark ? "#444444" : "rgb(221,221,221)";
        const selectBg = isDark ? "#2d2d2d" : "#ffffff";
        const selectText = isDark ? "#ffffff" : "#333333";

        style.textContent = `
        .scratch-modal-overlay {
            position: fixed;
            inset: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background: ${isDark ? "rgba(0,0,0,.7)" : "rgba(0,0,0,.25)"};
            z-index: 999999;
            font-family: Helvetica, Arial, sans-serif;
            opacity: 0;
            transition: opacity 0.2s ease;
            box-sizing: border-box;
        }

        .scratch-modal-overlay.scratch-modal-visible {
            opacity: 1;
        }

        .scratch-modal {
            width: 320px;
            background: ${bg};
            color: ${text};
            border-radius: 12px;
            border: 2px solid ${border};
            box-shadow: rgba(0,0,0,.15) 0px 6px 0px;
            overflow: hidden;
            position: relative;
            box-sizing: border-box;
            transform: scale(0.95);
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
        }

        .scratch-modal-overlay.scratch-modal-visible .scratch-modal {
            transform: scale(1);
        }

        .scratch-modal.large {
            width: 85vw;
            height: 85vh;
            max-width: 1200px;
            max-height: 800px;
        }

        .scratch-modal-header {
            background: ${accentColor};
            color: white;
            padding: 10px 12px;
            font-size: 14px;
            font-weight: bold;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
        }

        .scratch-modal-title-text {
            font-size: 14px;
            font-weight: bold;
            margin: 0;
        }

        .scratch-modal-close {
            position: absolute;
            top: 6px;
            right: 10px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            color: white;
            user-select: none;
            z-index: 2;
        }

        .scratch-modal-body {
            padding: 16px;
            font-size: 14px;
            color: ${text};
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .scratch-modal.large .scratch-modal-body {
            flex: 1;
            padding: 0;
            margin: 0;
            overflow: hidden;
            text-align: center;
        }

        .scratch-modal-body iframe {
            display: block;
            width: 100%;
            height: 100%;
            border: 0;
            background: ${isDark ? "#ffffff" : "transparent"};
        }

        .scratch-modal-footer {
            display: none;
            justify-content: flex-end;
            gap: 10px;
            padding: 12px;
            background: ${footerBg};
            border-top: 1px solid ${footerBorder};
            flex-shrink: 0;
        }

        .scratch-modal-footer.has-buttons {
            display: flex;
        }

        .scratch-modal-button, .scratch-prompt-btn {
            padding: 6px 14px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            color: white;
        }

        .scratch-prompt-btn-cancel {
            background: #e5e5e5;
            color: #575e75;
            border: 1px solid rgba(0, 0, 0, 0.15);
        }

        .scratch-prompt-btn-ok {
            background: ${accentColor};
            color: white;
        }

        .scratch-modal-input, .scratch-modal-textarea {
            width: 100%;
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid ${border};
            background: ${bg};
            color: ${text};
            font-size: 14px;
            box-sizing: border-box;
            outline: none;
            transition: border-color 0.2s;
        }

        .scratch-modal-select {
            width: 100%;
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid ${border};
            background: ${selectBg};
            color: ${selectText};
            font-size: 14px;
            box-sizing: border-box;
            outline: none;
        }

        .scratch-modal-select option {
            background: ${selectBg};
            color: ${selectText};
        }

        .scratch-modal-input:focus, .scratch-modal-textarea:focus, .scratch-modal-select:focus {
            border-color: ${accentColor};
        }

        .scratch-modal-textarea {
            resize: vertical;
            min-height: 80px;
        }

        .scratch-modal-color-container {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .scratch-modal-color-picker {
            width: 44px;
            height: 36px;
            border: 1px solid ${border};
            border-radius: 6px;
            cursor: pointer;
            background: none;
            padding: 0;
        }

        .scratch-modal-color-preview {
            flex: 1;
            height: 36px;
            border-radius: 6px;
            border: 1px solid ${border};
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            font-weight: bold;
            font-size: 13px;
        }

        .scratch-modal-message {
            font-size: 14px;
            line-height: 1.4;
            margin: 0;
            word-break: break-word;
            color: ${text};
            text-align: center;
        }
        `;
    }

    function closeModal() {
        if (modal) {
            const modalRef = modal;
            modalRef.classList.remove("scratch-modal-visible");
            setTimeout(() => {
                if (modalRef && modalRef.parentNode) {
                    modalRef.remove();
                }
            }, 200);
            modal = null;
        }
        if (currentResolver) {
            const res = currentResolver;
            currentResolver = null;
            isPromptOpen = false;
            res(null);
        }
    }

    function openModal(title, content, iframe = false) {
        createStyle();
        closeModal();

        pressedButton = "";
        isPromptOpen = true;

        modal = document.createElement("div");
        modal.className = "scratch-modal-overlay";

        const box = document.createElement("div");
        box.className = "scratch-modal";

        if (iframe) {
            box.classList.add("large");
        }

        box.innerHTML = `
            <div class="scratch-modal-close">✕</div>

            <div class="scratch-modal-header">
                <div class="scratch-modal-title-text">${escapeHTML(title)}</div>
            </div>

            <div class="scratch-modal-body"></div>

            <div class="scratch-modal-footer"></div>
        `;

        const body = box.querySelector(".scratch-modal-body");

        if (iframe) {
            const frame = document.createElement("iframe");
            frame.src = content;
            body.appendChild(frame);
        } else {
            body.innerHTML = escapeHTML(content);
        }

        box.querySelector(".scratch-modal-close").onclick = function () {
            pressedButton = "close";
            isPromptOpen = false;
            closeModal();
        };

        modal.appendChild(box);
        document.body.appendChild(modal);
        
        requestAnimationFrame(() => {
            modal.classList.add("scratch-modal-visible");
        });
    }

    function addButton(name) {
        if (!modal) return;

        const footer = modal.querySelector(".scratch-modal-footer");
        footer.classList.add("has-buttons");

        const button = document.createElement("button");
        button.className = "scratch-modal-button";
        button.textContent = name;

        const colors = [
            accentColor,
            "rgb(255,102,128)",
            "rgb(89,192,89)",
            "rgb(255,171,25)"
        ];

        button.style.background = colors[footer.children.length % colors.length];

        button.onclick = function () {
            pressedButton = name;
            isPromptOpen = false;
            closeModal();
        };

        footer.appendChild(button);
    }

    function openCustomPrompt(message, contentElement, buttons) {
        return new Promise((resolve) => {
            createStyle();
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            if (currentResolver) {
                const oldRes = currentResolver;
                currentResolver = null;
                oldRes(null);
            }

            const promptId = ++currentPromptId;
            isPromptOpen = true;
            currentResolver = resolve;

            modal = document.createElement("div");
            modal.className = "scratch-modal-overlay";

            const box = document.createElement("div");
            box.className = "scratch-modal";

            const header = document.createElement("div");
            header.className = "scratch-modal-header";

            const titleEl = document.createElement("div");
            titleEl.className = "scratch-modal-title-text";
            titleEl.textContent = promptTitle;
            header.appendChild(titleEl);

            box.appendChild(header);

            const body = document.createElement("div");
            body.className = "scratch-modal-body";

            if (message) {
                const msgEl = document.createElement("p");
                msgEl.className = "scratch-modal-message";
                msgEl.textContent = message;
                body.appendChild(msgEl);
            }

            if (contentElement) {
                body.appendChild(contentElement);
            }

            box.appendChild(body);

            const btnContainer = document.createElement("div");
            btnContainer.className = "scratch-modal-footer has-buttons";

            let settled = false;
            const closeWith = (val) => {
                if (settled || promptId !== currentPromptId) return;
                settled = true;
                isPromptOpen = false;
                currentResolver = null;

                if (val !== null && val !== undefined) {
                    lastResult = val;
                }

                if (modal) {
                    const modalRef = modal;
                    modalRef.classList.remove("scratch-modal-visible");
                    setTimeout(() => {
                        if (modalRef && modalRef.parentNode) {
                            modalRef.parentNode.removeChild(modalRef);
                        }
                    }, 200);
                    modal = null;
                }

                resolve(val);
            };

            buttons.forEach(btnInfo => {
                const btn = document.createElement("button");
                btn.className = `scratch-prompt-btn ${btnInfo.primary ? 'scratch-prompt-btn-ok' : 'scratch-prompt-btn-cancel'}`;
                btn.textContent = btnInfo.text;
                btn.onclick = () => {
                    let val = btnInfo.getValue ? btnInfo.getValue() : btnInfo.value;
                    closeWith(val);
                };
                btnContainer.appendChild(btn);
            });

            box.appendChild(btnContainer);
            modal.appendChild(box);
            document.body.appendChild(modal);

            requestAnimationFrame(() => {
                modal.classList.add("scratch-modal-visible");
            });

            const input = box.querySelector('input, textarea, select');
            if (input) {
                setTimeout(() => {
                    input.focus();
                    if (input.select) input.select();
                }, 50);
            }
        });
    }

    class Modals {
        getInfo() {
            return {
                id: "modals",
                name: "Modals",
                docsURI: "https://cattymod.app/docs/extensions/modals",

                color1: "#009ccc",
                color2: "#0085b3",
                color3: "#006b8f",

                blocks: [
                    {
                        opcode: "showText",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "show modal title [TITLE] text [TEXT]",
                        arguments: {
                            TITLE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Hello!"
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "This is an interesting modal."
                            }
                        }
                    },
                    {
                        opcode: "showIframe",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "show web page modal title [TITLE] page [URL]",
                        arguments: {
                            TITLE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "CattyMod Editor"
                            },
                            URL: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "https://studio.cattymod.app/editor"
                            }
                        }
                    },
                    {
                        opcode: "showHtml",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "show html modal title [TITLE] html [HTML]",
                        arguments: {
                            TITLE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Custom HTML"
                            },
                            HTML: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "<h1>Hello World!</h1>"
                            }
                        }
                    },
                    {
                        opcode: "addButton",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "add button called [NAME] to current modal",
                        arguments: {
                            NAME: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "OK"
                            }
                        }
                    },
                    {
                        opcode: "buttonPressed",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "button pressed"
                    },
                    {
                        opcode: "close",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "close modal"
                    },
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: "Prompts"
                    },
                    {
                        opcode: "confirm",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "confirm [MESSAGE]",
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Are you sure?"
                            }
                        }
                    },
                    {
                        opcode: "textPrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "text prompt [MESSAGE]",
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Enter your name:"
                            }
                        }
                    },
                    {
                        opcode: "numberPrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "number prompt [MESSAGE]",
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Enter a number:"
                            }
                        }
                    },
                    {
                        opcode: "colorPicker",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "color picker",
                        disableMonitor: true
                    },
                    {
                        opcode: "textareaPrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "textarea prompt [MESSAGE]",
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Enter long text:"
                            }
                        }
                    },
                    {
                        opcode: "choosePrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "choose [OPTIONS]",
                        disableMonitor: true,
                        arguments: {
                            OPTIONS: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Apple,Banana,Orange"
                            }
                        }
                    },
                    {
                        opcode: "sliderPrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "slider [MESSAGE] min [MIN] max [MAX] default [DEF]",
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Volume"
                            },
                            MIN: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0
                            },
                            MAX: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 100
                            },
                            DEF: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 50
                            }
                        }
                    },
                    {
                        opcode: "datePrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "date prompt",
                        disableMonitor: true
                    },
                    {
                        opcode: "timePrompt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "time prompt",
                        disableMonitor: true
                    },
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: "Settings & Status"
                    },
                    {
                        opcode: "setAccent",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set accent color [COLOR]",
                        arguments: {
                            COLOR: {
                                type: Scratch.ArgumentType.COLOR,
                                defaultValue: "#009ccc"
                            }
                        }
                    },
                    {
                        opcode: "setTitle",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set prompt title [TITLE]",
                        arguments: {
                            TITLE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Prompt"
                            }
                        }
                    },
                    {
                        opcode: "promptOpen",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "modal/prompt open?",
                        disableMonitor: true
                    },
                    {
                        opcode: "getLastResult",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last prompt result",
                        disableMonitor: true
                    }
                ]
            };
        }

        showText(args) {
            openModal(args.TITLE, args.TEXT, false);
        }

        async showIframe(args) {
            const url = Scratch.Cast.toString(args.URL);

            if (await Scratch.canEmbed(url)) {
                openModal(args.TITLE, url, true);
            }
        }

        async showHtml(args) {
            const htmlContent = Scratch.Cast.toString(args.HTML);
            const base64 = btoa(unescape(encodeURIComponent(htmlContent)));
            const dataUrl = `data:text/html;base64,${base64}`;

            if (await Scratch.canEmbed(dataUrl)) {
                openModal(args.TITLE, dataUrl, true);
            }
        }

        addButton(args) {
            addButton(args.NAME);
        }

        setAccent(args) {
            accentColor = Scratch.Cast.toString(args.COLOR);
            createStyle();
        }

        setTitle(args) {
            promptTitle = Scratch.Cast.toString(args.TITLE);
        }

        buttonPressed() {
            return pressedButton;
        }

        close() {
            isPromptOpen = false;
            closeModal();
        }

        async confirm(args) {
            const res = await openCustomPrompt(Scratch.Cast.toString(args.MESSAGE), null, [
                { text: 'Cancel', value: false, primary: false },
                { text: 'OK', value: true, primary: true }
            ]);
            return !!res;
        }

        async textPrompt(args) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'scratch-modal-input';

            const res = await openCustomPrompt(Scratch.Cast.toString(args.MESSAGE), input, [
                { text: 'Cancel', value: '', primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : '';
        }

        async numberPrompt(args) {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'scratch-modal-input';

            const res = await openCustomPrompt(Scratch.Cast.toString(args.MESSAGE), input, [
                { text: 'Cancel', value: 0, primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : 0;
        }

        async colorPicker() {
            const container = document.createElement('div');
            container.className = 'scratch-modal-color-container';

            const input = document.createElement('input');
            input.type = 'color';
            input.className = 'scratch-modal-color-picker';
            input.value = '#ff0000';

            const preview = document.createElement('div');
            preview.className = 'scratch-modal-color-preview';
            preview.textContent = input.value;
            preview.style.background = input.value;
            preview.style.color = '#fff';

            input.oninput = () => {
                preview.textContent = input.value;
                preview.style.background = input.value;
            };

            container.appendChild(input);
            container.appendChild(preview);

            const res = await openCustomPrompt('Pick a color:', container, [
                { text: 'Cancel', value: '#ff0000', primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : '#ff0000';
        }

        async textareaPrompt(args) {
            const textarea = document.createElement('textarea');
            textarea.className = 'scratch-modal-textarea';

            const res = await openCustomPrompt(Scratch.Cast.toString(args.MESSAGE), textarea, [
                { text: 'Cancel', value: '', primary: false },
                { text: 'OK', getValue: () => textarea.value, primary: true }
            ]);
            return res !== null ? res : '';
        }

        async choosePrompt(args) {
            const optionsStr = Scratch.Cast.toString(args.OPTIONS);
            const options = optionsStr.split(',').map(s => s.trim()).filter(Boolean);

            const select = document.createElement('select');
            select.className = 'scratch-modal-select';

            options.forEach(opt => {
                const optEl = document.createElement('option');
                optEl.value = opt;
                optEl.textContent = opt;
                select.appendChild(optEl);
            });

            const res = await openCustomPrompt('Choose an option:', select, [
                { text: 'Cancel', value: options[0] || '', primary: false },
                { text: 'OK', getValue: () => select.value, primary: true }
            ]);
            return res !== null ? res : (options[0] || '');
        }

        async sliderPrompt(args) {
            const message = Scratch.Cast.toString(args.MESSAGE);
            const min = Scratch.Cast.toNumber(args.MIN);
            const max = Scratch.Cast.toNumber(args.MAX);
            const def = Scratch.Cast.toNumber(args.DEF);

            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '8px';
            container.style.width = '100%';

            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'scratch-modal-color-container';
            sliderContainer.style.width = '100%';

            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'scratch-modal-input';
            input.min = min;
            input.max = max;
            input.value = def;
            input.style.accentColor = accentColor;
            input.style.flex = '1';
            input.style.padding = '0';

            const valDisplay = document.createElement('span');
            valDisplay.textContent = def;
            valDisplay.style.fontWeight = 'bold';
            valDisplay.style.minWidth = '32px';
            valDisplay.style.textAlign = 'right';

            input.oninput = () => {
                valDisplay.textContent = input.value;
            };

            sliderContainer.appendChild(input);
            sliderContainer.appendChild(valDisplay);
            container.appendChild(sliderContainer);

            const res = await openCustomPrompt(message, container, [
                { text: 'Cancel', value: def, primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : def;
        }

        async datePrompt() {
            const input = document.createElement('input');
            input.type = 'date';
            input.className = 'scratch-modal-input';

            const res = await openCustomPrompt('Select a date:', input, [
                { text: 'Cancel', value: '', primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : '';
        }

        async timePrompt() {
            const input = document.createElement('input');
            input.type = 'time';
            input.className = 'scratch-modal-input';

            const res = await openCustomPrompt('Select a time:', input, [
                { text: 'Cancel', value: '', primary: false },
                { text: 'OK', getValue: () => input.value, primary: true }
            ]);
            return res !== null ? res : '';
        }

        promptOpen() {
            return isPromptOpen;
        }

        getLastResult() {
            return lastResult;
        }
    }

    Scratch.extensions.register(new Modals());

})(Scratch);
