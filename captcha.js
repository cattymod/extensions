
(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("I'm not a robot requires unsandboxed mode!");
    }

    const SITE_KEYS = {
        AUTO: "a7b5473d-cad0-4665-9f75-70dea0642d5c",
        EASY: "75be5932-0fa0-4106-9bc6-7fe87d58dd06",
        MODERATE: "857eb5e4-c7d8-4e7a-bdc0-814c6d34f1e6",
        DIFFICULT: "8ba4f212-312a-4238-a456-ac5cf61a4850"
    };

    const accentColor = "#4285F4";

    let selectedDifficulty = "AUTO";
    let selectedTheme = "LIGHT";

    let hcaptchaLoader = null;
    let activeChallenge = false;
    let currentModal = null;

    function loadHCaptcha() {
        if (window.hcaptcha) return Promise.resolve();

        if (hcaptchaLoader) return hcaptchaLoader;

        hcaptchaLoader = new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src =
                "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";

            script.async = true;
            script.defer = true;

            script.onload = () => {
                if (window.hcaptcha) {
                    resolve();
                } else {
                    reject(new Error("hCaptcha unavailable"));
                }
            };

            script.onerror = () => {
                hcaptchaLoader = null;
                reject(new Error("Failed to load hCaptcha"));
            };

            document.head.appendChild(script);
        });

        return hcaptchaLoader;
    }

    // Get the currently selected theme.
    function getEffectiveTheme() {
        return selectedTheme === "DARK" ? "dark" : "light";
    }

    // Apply modal appearance.
    function createStyle(theme) {
        let style = document.getElementById("im-not-a-robot-style");

        if (!style) {
            style = document.createElement("style");
            style.id = "im-not-a-robot-style";
            document.head.appendChild(style);
        }

        const dark = theme === "dark";

        const colors = dark
            ? {
                background: "#202124",
                text: "#E8EAED",
                border: "#3C4043",
                shadow: "rgba(0,0,0,.4)",
                status: "#BDC1C6",
                footer: "#292A2D",
                footerBorder: "#3C4043",
                cancelBackground: "#3C4043",
                cancelText: "#E8EAED",
                cancelBorder: "rgba(255,255,255,.12)",
                description: "#E8EAED"
            }
            : {
                background: "#ffffff",
                text: "#333333",
                border: "rgb(217,217,217)",
                shadow: "rgba(0,0,0,.15)",
                status: "#575e75",
                footer: "rgb(242,242,242)",
                footerBorder: "rgb(221,221,221)",
                cancelBackground: "#e5e5e5",
                cancelText: "#575e75",
                cancelBorder: "rgba(0,0,0,.15)",
                description: "#333333"
            };

        style.textContent = `
            .robot-overlay {
                position: fixed;
                inset: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                background: rgba(0,0,0,.25);
                z-index: 999999;
                font-family: Helvetica, Arial, sans-serif;
                opacity: 0;
                transition: opacity .2s ease;
                box-sizing: border-box;
            }

            .robot-overlay.robot-visible {
                opacity: 1;
            }

            .robot-modal {
                width: 360px;
                max-width: 90vw;
                background: ${colors.background};
                color: ${colors.text};
                border-radius: 12px;
                border: 2px solid ${colors.border};
                box-shadow: ${colors.shadow} 0px 6px 0px;
                overflow: hidden;
                position: relative;
                box-sizing: border-box;
                transform: scale(.95);
                transition: transform .2s cubic-bezier(.16,1,.3,1);
                display: flex;
                flex-direction: column;
            }

            .robot-overlay.robot-visible .robot-modal {
                transform: scale(1);
            }

            .robot-header {
                background: ${accentColor};
                color: white;
                padding: 10px 12px;
                font-size: 14px;
                font-weight: bold;
                display: flex;
                align-items: center;
                min-height: 18px;
            }

            .robot-title {
                font-size: 14px;
                font-weight: bold;
                margin: 0;
            }

            .robot-close {
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

            .robot-body {
                padding: 18px 12px;
                font-size: 14px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                text-align: center;
            }

            .robot-description {
                margin: 0;
                font-size: 14px;
                line-height: 1.4;
                color: ${colors.description};
            }

            .robot-captcha {
                display: flex;
                justify-content: center;
                width: 100%;
                min-height: 78px;
            }

            .robot-status {
                font-size: 12px;
                color: ${colors.status};
                margin: 0;
            }

            .robot-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px;
                background: ${colors.footer};
                border-top: 1px solid ${colors.footerBorder};
            }

            .robot-button {
                padding: 6px 14px;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                font-size: 13px;
                font-weight: bold;
                background: ${accentColor};
                color: white;
            }

            .robot-button:hover {
                filter: brightness(.92);
            }

            .robot-cancel {
                background: ${colors.cancelBackground};
                color: ${colors.cancelText};
                border: 1px solid ${colors.cancelBorder};
            }
        `;
    }

    function amIRobot() {
        if (activeChallenge) {
            return Promise.resolve(false);
        }

        activeChallenge = true;

        const currentSiteKey = SITE_KEYS[selectedDifficulty];
        const currentTheme = getEffectiveTheme();

        return new Promise(resolve => {
            let settled = false;
            let widgetId = null;

            createStyle(currentTheme);

            const overlay = document.createElement("div");
            overlay.className = "robot-overlay";

            const modal = document.createElement("div");
            modal.className = "robot-modal";

            const header = document.createElement("div");
            header.className = "robot-header";

            const title = document.createElement("div");
            title.className = "robot-title";
            title.textContent = "I'm not a robot";

            const close = document.createElement("div");
            close.className = "robot-close";
            close.textContent = "✕";

            header.append(title, close);

            const body = document.createElement("div");
            body.className = "robot-body";

            const description = document.createElement("p");
            description.className = "robot-description";
            description.textContent =
                "Please verify that you're human to continue.";

            const captcha = document.createElement("div");
            captcha.className = "robot-captcha";

            const status = document.createElement("p");
            status.className = "robot-status";
            status.textContent = "Loading verification...";

            body.append(description, captcha, status);

            const footer = document.createElement("div");
            footer.className = "robot-footer";

            const cancel = document.createElement("button");
            cancel.className = "robot-button robot-cancel";
            cancel.textContent = "Cancel";

            footer.appendChild(cancel);

            modal.append(header, body, footer);
            overlay.appendChild(modal);

            document.body.appendChild(overlay);

            currentModal = overlay;

            requestAnimationFrame(() => {
                overlay.classList.add("robot-visible");
            });

            function finish(success) {
                if (settled) return;

                settled = true;
                activeChallenge = false;
                currentModal = null;

                if (widgetId !== null && window.hcaptcha) {
                    try {
                        window.hcaptcha.remove(widgetId);
                    } catch (e) {}
                }

                overlay.classList.remove("robot-visible");

                setTimeout(() => {
                    overlay.remove();
                }, 200);

                resolve(!!success);
            }

            close.addEventListener("click", () => finish(false));
            cancel.addEventListener("click", () => finish(false));

            loadHCaptcha()
                .then(() => {
                    if (settled) return;

                    status.textContent =
                        "Complete the challenge above.";

                    widgetId = window.hcaptcha.render(captcha, {
                        sitekey: currentSiteKey,
                        theme: currentTheme,

                        callback: function(token) {
                            finish(!!token);
                        },

                        "error-callback": function() {
                            status.textContent = "Verification failed.";
                            finish(false);
                        },

                        "expired-callback": function() {
                            status.textContent = "Verification expired.";
                            finish(false);
                        }
                    });
                })
                .catch(() => {
                    if (settled) return;

                    status.textContent = "Could not load hCaptcha.";
                    finish(false);
                });
        });
    }

    class ImNotARobot {
        getInfo() {
            return {
                id: "imnotarobot",
                name: "I'm not a robot",

                color1: "#4285F4",
                color2: "#AECBFA",
                color3: "#1A73E8",

                blocks: [
                    {
                        opcode: "setDifficulty",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set challenge difficulty to [DIFFICULTY]",
                        arguments: {
                            DIFFICULTY: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "difficultyMenu"
                            }
                        }
                    },
                    {
                        opcode: "setTheme",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set theme to [THEME]",
                        arguments: {
                            THEME: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "themeMenu"
                            }
                        }
                    },
                    {
                        opcode: "amIRobot",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "am I not a robot?",
                        disableMonitor: true
                    }
                ],

                menus: {
                    difficultyMenu: {
                        acceptReporters: false,
                        items: [
                            { text: "Auto", value: "AUTO" },
                            { text: "Easy", value: "EASY" },
                            { text: "Moderate", value: "MODERATE" },
                            { text: "Difficult", value: "DIFFICULT" }
                        ]
                    },

                    themeMenu: {
                        acceptReporters: false,
                        items: [
                            { text: "Light", value: "LIGHT" },
                            { text: "Dark", value: "DARK" }
                        ]
                    }
                }
            };
        }

        setDifficulty(args) {
            const difficulty = args.DIFFICULTY;

            if (
                Object.prototype.hasOwnProperty.call(
                    SITE_KEYS,
                    difficulty
                )
            ) {
                selectedDifficulty = difficulty;
            }
        }

        setTheme(args) {
            const theme = args.THEME;

            if (["LIGHT", "DARK"].includes(theme)) {
                selectedTheme = theme;
            }
        }

        amIRobot() {
            return amIRobot();
        }
    }

    Scratch.extensions.register(new ImNotARobot());

})(Scratch);
