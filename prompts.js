// Name: Prompts
// ID: prompts
// Description: Ask your users to pick colours, answer a question and more.
// By: Noahscratch493
// License: MIT

(function(Scratch) {
    'lib strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Prompts extension must be run unsandboxed.');
    }

    class PromptExtension {
        constructor() {
            this.theme = 'Light';
            this.accentColor = '#FF69B4';
            this.title = 'Prompt';
            this.icon = '💬';
            this.lastResult = '';
            this.currentModal = null;
            this.currentResolver = null;
            this.currentId = 0;
            this.isOpen = false;

            this.injectStyles();
        }

        injectStyles() {
            if (document.getElementById('turbowarp-prompts-styles')) return;

            const style = document.createElement('style');
            style.id = 'turbowarp-prompts-styles';
            style.textContent = `
                :root {
                    --tw-bg: #f9f9f9;
                    --tw-text: #111111;
                    --tw-border: #cccccc;
                    --tw-overlay: rgba(0, 0, 0, 0.3);
                    --tw-accent: #FF69B4;
                    --tw-accent-hover: #ff52a7;
                    --tw-accent-active: #e64999;
                    --tw-select-bg: #ffffff;
                    --tw-select-text: #111111;
                }

                .tw-prompt-overlay[data-theme="Dark"] {
                    --tw-bg: #1e1e1e;
                    --tw-text: #ffffff;
                    --tw-border: #444444;
                    --tw-overlay: rgba(0, 0, 0, 0.7);
                    --tw-select-bg: #2d2d2d;
                    --tw-select-text: #ffffff;
                }

                .tw-prompt-overlay[data-theme="Light"] {
                    --tw-bg: #f9f9f9;
                    --tw-text: #111111;
                    --tw-border: #cccccc;
                    --tw-overlay: rgba(0, 0, 0, 0.3);
                    --tw-select-bg: #ffffff;
                    --tw-select-text: #111111;
                }

                .tw-prompt-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: var(--tw-overlay);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    opacity: 0;
                    transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                    box-sizing: border-box;
                }

                .tw-prompt-overlay.tw-prompt-visible {
                    opacity: 1;
                }

                .tw-prompt-modal {
                    background: var(--tw-bg);
                    color: var(--tw-text);
                    width: 100%;
                    max-width: 420px;
                    border-radius: 16px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    padding: 24px;
                    box-sizing: border-box;
                    transform: scale(0.9);
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    border: 1px solid var(--tw-border);
                }

                .tw-prompt-overlay.tw-prompt-visible .tw-prompt-modal {
                    transform: scale(1);
                }

                .tw-prompt-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .tw-prompt-icon {
                    font-size: 24px;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.05);
                    border-radius: 10px;
                }

                .tw-prompt-title {
                    font-size: 18px;
                    font-weight: 700;
                    margin: 0;
                }

                .tw-prompt-message {
                    font-size: 14px;
                    line-height: 1.4;
                    margin: 0;
                    word-break: break-word;
                }

                .tw-prompt-input, .tw-prompt-textarea {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid var(--tw-border);
                    background: transparent;
                    color: var(--tw-text);
                    font-size: 14px;
                    box-sizing: border-box;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .tw-prompt-select {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid var(--tw-border);
                    background: var(--tw-select-bg);
                    color: var(--tw-select-text);
                    font-size: 14px;
                    box-sizing: border-box;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .tw-prompt-select option {
                    background: var(--tw-select-bg);
                    color: var(--tw-select-text);
                }

                .tw-prompt-input:focus, .tw-prompt-textarea:focus, .tw-prompt-select:focus {
                    border-color: var(--tw-accent);
                    box-shadow: 0 0 0 3px var(--tw-accent-glow, rgba(255, 105, 180, 0.3));
                }

                .tw-prompt-textarea {
                    resize: vertical;
                    min-height: 80px;
                }

                .tw-prompt-slider-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .tw-prompt-slider {
                    flex: 1;
                    accent-color: var(--tw-accent);
                }

                .tw-prompt-color-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .tw-prompt-color-picker {
                    width: 50px;
                    height: 40px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    background: none;
                }

                .tw-prompt-color-preview {
                    flex: 1;
                    height: 40px;
                    border-radius: 8px;
                    border: 1px solid var(--tw-border);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: monospace;
                    font-weight: bold;
                }

                .tw-prompt-buttons {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 4px;
                }

                .tw-prompt-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    transition: background 0.1s, transform 0.1s;
                }

                .tw-prompt-btn:active {
                    transform: scale(0.96);
                }

                .tw-prompt-btn-cancel {
                    background: transparent;
                    color: var(--tw-text);
                    border: 1px solid var(--tw-border);
                }

                .tw-prompt-btn-cancel:hover {
                    background: rgba(0,0,0,0.05);
                }

                .tw-prompt-btn-ok {
                    background: var(--tw-accent);
                    color: #ffffff;
                }

                .tw-prompt-btn-ok:hover {
                    background: var(--tw-accent-hover);
                }
            `;
            document.head.appendChild(style);
        }

        getHoverColor(hex) {
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

        getInfo() {
            return {
                id: 'prompts',
                name: 'Prompts',
                color1: '#FF69B4',
                color2: '#E0559E',
                color3: '#C74188',
                blocks: [
                    {
                        opcode: 'confirm',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'confirm [MESSAGE]',
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Are you sure?'
                            }
                        }
                    },
                    {
                        opcode: 'textPrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'text prompt [MESSAGE]',
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Enter your name:'
                            }
                        }
                    },
                    {
                        opcode: 'numberPrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'number prompt [MESSAGE]',
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Enter a number:'
                            }
                        }
                    },
                    {
                        opcode: 'colourPicker',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'colour picker',
                        disableMonitor: true
                    },
                    {
                        opcode: 'textareaPrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'textarea prompt [MESSAGE]',
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Enter long text:'
                            }
                        }
                    },
                    {
                        opcode: 'choosePrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'choose [OPTIONS]',
                        disableMonitor: true,
                        arguments: {
                            OPTIONS: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Apple,Banana,Orange'
                            }
                        }
                    },
                    {
                        opcode: 'sliderPrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'slider [MESSAGE] min [MIN] max [MAX] default [DEF]',
                        disableMonitor: true,
                        arguments: {
                            MESSAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Volume'
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
                        opcode: 'datePrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'date prompt',
                        disableMonitor: true
                    },
                    {
                        opcode: 'timePrompt',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'time prompt',
                        disableMonitor: true
                    },
                    '---',
                    {
                        opcode: 'setTheme',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set theme [THEME]',
                        arguments: {
                            THEME: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'themeMenu',
                                defaultValue: 'Light'
                            }
                        }
                    },
                    {
                        opcode: 'setAccentColour',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set accent colour [COLOR]',
                        arguments: {
                            COLOR: {
                                type: Scratch.ArgumentType.COLOR,
                                defaultValue: '#FF69B4'
                            }
                        }
                    },
                    {
                        opcode: 'setTitle',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set title [TITLE]',
                        arguments: {
                            TITLE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Prompt'
                            }
                        }
                    },
                    {
                        opcode: 'setIcon',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set icon [ICON]',
                        arguments: {
                            ICON: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '💬'
                            }
                        }
                    },
                    {
                        opcode: 'closePromptBlock',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'close prompt'
                    },
                    {
                        opcode: 'promptOpen',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'prompt open?',
                        disableMonitor: true
                    },
                    {
                        opcode: 'getLastResult',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'last result',
                        disableMonitor: true
                    }
                ],
                menus: {
                    themeMenu: {
                        acceptReporters: true,
                        items: ['Light', 'Dark']
                    }
                }
            };
        }

        openModal(message, contentElement, buttons) {
            return new Promise((resolve) => {
                if (this.currentModal && this.currentModal.parentNode) {
                    this.currentModal.parentNode.removeChild(this.currentModal);
                }
                if (this.currentResolver) {
                    const oldRes = this.currentResolver;
                    this.currentResolver = null;
                    oldRes(null);
                }

                const promptId = ++this.currentId;
                this.isOpen = true;
                this.currentResolver = resolve;

                const overlay = document.createElement('div');
                overlay.className = 'tw-prompt-overlay';
                overlay.setAttribute('data-theme', this.theme);
                overlay.style.setProperty('--tw-accent', this.accentColor);
                overlay.style.setProperty('--tw-accent-hover', this.getHoverColor(this.accentColor));

                const modal = document.createElement('div');
                modal.className = 'tw-prompt-modal';

                const header = document.createElement('div');
                header.className = 'tw-prompt-header';

                if (this.icon) {
                    const iconEl = document.createElement('div');
                    iconEl.className = 'tw-prompt-icon';
                    iconEl.textContent = this.icon;
                    header.appendChild(iconEl);
                }

                const titleEl = document.createElement('h3');
                titleEl.className = 'tw-prompt-title';
                titleEl.textContent = this.title;
                header.appendChild(titleEl);

                modal.appendChild(header);

                if (message) {
                    const msgEl = document.createElement('p');
                    msgEl.className = 'tw-prompt-message';
                    msgEl.textContent = message;
                    modal.appendChild(msgEl);
                }

                if (contentElement) {
                    modal.appendChild(contentElement);
                }

                const btnContainer = document.createElement('div');
                btnContainer.className = 'tw-prompt-buttons';

                let settled = false;
                const closeWith = (val) => {
                    if (settled || promptId !== this.currentId) return;
                    settled = true;
                    this.isOpen = false;
                    this.currentResolver = null;

                    if (val !== null && val !== undefined) {
                        this.lastResult = val;
                    }

                    if (this.currentModal) {
                        const modalRef = this.currentModal;
                        modalRef.classList.remove('tw-prompt-visible');
                        setTimeout(() => {
                            if (modalRef && modalRef.parentNode) {
                                modalRef.parentNode.removeChild(modalRef);
                            }
                        }, 250);
                        this.currentModal = null;
                    }

                    resolve(val);
                };

                buttons.forEach(btnInfo => {
                    const btn = document.createElement('button');
                    btn.className = `tw-prompt-btn ${btnInfo.primary ? 'tw-prompt-btn-ok' : 'tw-prompt-btn-cancel'}`;
                    btn.textContent = btnInfo.text;
                    btn.onclick = () => {
                        const val = btnInfo.getValue ? btnInfo.getValue() : null;
                        closeWith(val);
                    };
                    btnContainer.appendChild(btn);
                });

                modal.appendChild(btnContainer);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                this.currentModal = overlay;

                requestAnimationFrame(() => {
                    overlay.classList.add('tw-prompt-visible');
                    const firstInput = modal.querySelector('input, textarea, select, button');
                    if (firstInput) firstInput.focus();
                });

                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        closeWith(null);
                    }
                };

                const keyHandler = (e) => {
                    if (!this.isOpen || promptId !== this.currentId) {
                        window.removeEventListener('keydown', keyHandler);
                        return;
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        window.removeEventListener('keydown', keyHandler);
                        closeWith(null);
                    } else if (e.key === 'Enter') {
                        if (e.target.tagName === 'TEXTAREA') return;
                        e.preventDefault();
                        window.removeEventListener('keydown', keyHandler);
                        const primaryBtn = btnContainer.querySelector('.tw-prompt-btn-ok');
                        if (primaryBtn) primaryBtn.click();
                    }
                };
                window.addEventListener('keydown', keyHandler);
            });
        }

        confirm(args) {
            return this.openModal(args.MESSAGE, null, [
                { text: 'Cancel', primary: false, getValue: () => false },
                { text: 'OK', primary: true, getValue: () => true }
            ]).then(res => res === true);
        }

        textPrompt(args) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tw-prompt-input';
            return this.openModal(args.MESSAGE, input, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => input.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        numberPrompt(args) {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'tw-prompt-input';
            return this.openModal(args.MESSAGE, input, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => input.value === '' ? '' : Number(input.value) }
            ]).then(res => (res === null || res === undefined) ? '' : res);
        }

        colourPicker() {
            const container = document.createElement('div');
            container.className = 'tw-prompt-color-container';

            const input = document.createElement('input');
            input.type = 'color';
            input.className = 'tw-prompt-color-picker';
            input.value = this.accentColor;

            const preview = document.createElement('div');
            preview.className = 'tw-prompt-color-preview';
            preview.textContent = input.value;
            preview.style.background = input.value;

            input.oninput = () => {
                preview.textContent = input.value;
                preview.style.background = input.value;
            };

            container.appendChild(input);
            container.appendChild(preview);

            return this.openModal('Choose a colour:', container, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => input.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        textareaPrompt(args) {
            const textarea = document.createElement('textarea');
            textarea.className = 'tw-prompt-textarea';
            return this.openModal(args.MESSAGE, textarea, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => textarea.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        choosePrompt(args) {
            const select = document.createElement('select');
            select.className = 'tw-prompt-select';
            const options = String(args.OPTIONS).split(',');
            options.forEach(opt => {
                const optEl = document.createElement('option');
                optEl.value = opt.trim();
                optEl.textContent = opt.trim();
                select.appendChild(optEl);
            });
            return this.openModal('Choose an option:', select, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => select.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        sliderPrompt(args) {
            const container = document.createElement('div');
            container.className = 'tw-prompt-slider-container';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'tw-prompt-slider';
            slider.min = Number(args.MIN);
            slider.max = Number(args.MAX);
            slider.value = Number(args.DEF);

            const valueDisplay = document.createElement('span');
            valueDisplay.textContent = slider.value;
            valueDisplay.style.fontWeight = 'bold';
            valueDisplay.style.minWidth = '35px';
            valueDisplay.style.textAlign = 'right';

            slider.oninput = () => {
                valueDisplay.textContent = slider.value;
            };

            container.appendChild(slider);
            container.appendChild(valueDisplay);

            return this.openModal(args.MESSAGE, container, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => Number(slider.value) }
            ]).then(res => (res === null || res === undefined) ? '' : Number(res));
        }

        datePrompt() {
            const input = document.createElement('input');
            input.type = 'date';
            input.className = 'tw-prompt-input';
            const today = new Date().toISOString().split('T')[0];
            input.value = today;
            return this.openModal('Select a date:', input, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => input.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        timePrompt() {
            const input = document.createElement('input');
            input.type = 'time';
            input.className = 'tw-prompt-input';
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            input.value = `${hours}:${minutes}`;
            return this.openModal('Select a time:', input, [
                { text: 'Cancel', primary: false, getValue: () => null },
                { text: 'OK', primary: true, getValue: () => input.value }
            ]).then(res => (res === null || res === undefined) ? '' : String(res));
        }

        setTheme(args) {
            this.theme = args.THEME;
        }

        setAccentColour(args) {
            this.accentColor = args.COLOR;
        }

        setTitle(args) {
            this.title = args.TITLE;
        }

        setIcon(args) {
            this.icon = args.ICON;
        }

        closePromptBlock() {
            if (this.currentResolver) {
                const resFn = this.currentResolver;
                this.currentResolver = null;
                this.isOpen = false;
                if (this.currentModal && this.currentModal.parentNode) {
                    this.currentModal.parentNode.removeChild(this.currentModal);
                }
                this.currentModal = null;
                resFn(null);
            }
        }

        promptOpen() {
            return this.isOpen;
        }

        getLastResult() {
            return this.lastResult;
        }
    }

    Scratch.extensions.register(new PromptExtension());
})(Scratch);
