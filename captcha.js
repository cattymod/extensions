
(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("I'm not a robot requires unsandboxed mode!");
    }

    const SITE_KEY = "a7b5473d-cad0-4665-9f75-70dea0642d5c";
    const accentColor = "#4285F4";

    let hcaptchaLoader = null;
    let activeChallenge = false;
    let currentModal = null;

    function loadHCaptcha() {
        if (window.hcaptcha) return Promise.resolve();

        if (hcaptchaLoader) return hcaptchaLoader;

        hcaptchaLoader = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";
            script.async = true;
            script.defer = true;

            script.onload = () => {
                if (window.hcaptcha) resolve();
                else reject(new Error("hCaptcha unavailable"));
            };

            script.onerror = () => {
                hcaptchaLoader = null;
                reject(new Error("Failed to load hCaptcha"));
            };

            document.head.appendChild(script);
        });

        return hcaptchaLoader;
    }

    function createStyle() {
        let style = document.getElementById("im-not-a-robot-style");

        if (!style) {
            style = document.createElement("style");
            style.id = "im-not-a-robot-style";
            document.head.appendChild(style);
        }

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
                background: #ffffff;
                color: #333333;
                border-radius: 12px;
                border: 2px solid rgb(217,217,217);
                box-shadow: rgba(0,0,0,.15) 0px 6px 0px;
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
                color: #333333;
            }

            .robot-captcha {
                display: flex;
                justify-content: center;
                width: 100%;
                min-height: 78px;
            }

            .robot-status {
                font-size: 12px;
                color: #575e75;
                margin: 0;
            }

            .robot-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px;
                background: rgb(242,242,242);
                border-top: 1px solid rgb(221,221,221);
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
                background: #e5e5e5;
                color: #575e75;
                border: 1px solid rgba(0,0,0,.15);
            }
        `;
    }

    function amIRobot() {
        // Prevent multiple simultaneous challenges.
        if (activeChallenge) return Promise.resolve(false);

        activeChallenge = true;

        return new Promise(resolve => {
            let settled = false;
            let widgetId = null;

            createStyle();

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

                if (
                    widgetId !== null &&
                    window.hcaptcha
                ) {
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

                    status.textContent = "Complete the challenge below.";

                    widgetId = window.hcaptcha.render(captcha, {
                        sitekey: SITE_KEY,
                        theme: "light",

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
                        opcode: "amIRobot",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "am I not a robot?",
                        disableMonitor: true
                    }
                ]
            };
        }

        amIRobot() {
            return amIRobot();
        }
    }

    Scratch.extensions.register(new ImNotARobot());

})(Scratch);
