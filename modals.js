// Name: Modals
// ID: modals
// Description: Create Scratch 3 style popup windows with titles, text, buttons, and embedded web pages.
// By: Noahscratch493
// Context: "Modal" is a type of popup window that appears above the main content and asks for attention.
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

    function escapeHTML(text) {
        return String(text)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
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

        style.textContent = `
        .scratch-modal-overlay {
            position: fixed;
            inset: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0,0,0,.25);
            z-index: 999999;
            font-family: Helvetica, Arial, sans-serif;
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
        }

        .scratch-modal.large {
            width: 85vw;
            height: 85vh;
            max-width: 1200px;
            max-height: 800px;
            display: flex;
            flex-direction: column;
        }

        .scratch-modal-header {
            background: ${accentColor};
            color: white;
            padding: 10px 12px;
            font-size: 14px;
            font-weight: bold;
            flex-shrink: 0;
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
        }

        .scratch-modal.large .scratch-modal-body {
            flex: 1;
            padding: 0;
            margin: 0;
            overflow: hidden;
        }

        .scratch-modal-body iframe {
            display: block;
            width: 100%;
            height: 100%;
            border: 0;
            background: transparent;
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

        .scratch-modal-button {
            padding: 6px 14px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            color: white;
        }
        `;
    }

    function closeModal() {
        if (modal) {
            modal.remove();
            modal = null;
        }
    }

    function openModal(title, content, iframe = false) {
        createStyle();
        closeModal();

        pressedButton = "";

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
                ${escapeHTML(title)}
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
            closeModal();
        };

        modal.appendChild(box);
        document.body.appendChild(modal);
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
            closeModal();
        };

        footer.appendChild(button);
    }

    class Modals {
        getInfo() {
            return {
                id: "modals",
                name: "Modals",

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
                        opcode: "setTheme",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set theme [THEME]",
                        arguments: {
                            THEME: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "themeMenu",
                                defaultValue: "Light"
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
                    }
                ],
                menus: {
                    themeMenu: {
                        acceptReporters: true,
                        items: ["Light", "Dark"]
                    }
                }
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
            let htmlContent = Scratch.Cast.toString(args.HTML);
            const textColor = currentTheme === "Dark" ? "white" : "#333333";

            htmlContent = `<div style="color: ${textColor}; font-family: Helvetica, Arial, sans-serif; height: 100%; box-sizing: border-box;">${htmlContent}</div>`;

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

        setTheme(args) {
            currentTheme = Scratch.Cast.toString(args.THEME);
            createStyle();
        }

        buttonPressed() {
            return pressedButton;
        }

        close() {
            closeModal();
        }
    }

    Scratch.extensions.register(new Modals());

})(Scratch);
