// Name: Python
// ID: python
// Description: Run Python code and integrate Python scripts directly into your projects.
// By: Noahscratch493
// License: MIT
// Python Icon from https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg

(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("Python requires unsandboxed mode.");
    }

    // ============================================================
    // CONFIG
    // ============================================================

    const PYODIDE_VERSION = "0.28.2";

    const PYODIDE_URL =
        `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;

    const PYODIDE_INDEX =
        `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

    const CODEMIRROR_VERSION = "5.65.16";

    const CODEMIRROR_JS =
        `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CODEMIRROR_VERSION}/codemirror.min.js`;

    const CODEMIRROR_CSS =
        `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CODEMIRROR_VERSION}/codemirror.min.css`;

    const CODEMIRROR_PYTHON_JS =
        `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CODEMIRROR_VERSION}/mode/python/python.min.js`;

    const PYTHON_ICON =
        "https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg";

    const WHITE_PYTHON_ICON_SVG = `
        
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="162.55255" height="162.55254" viewBox="0,0,162.55255,162.55254"><g transform="translate(-158.72373,-98.72373)"><g fill="#ffffff" stroke="none" stroke-miterlimit="10"><g><path d="M279.66726,120.38163c0,9.35268 0,15.91094 0,35.78964c0,18.78221 -16.26117,21.28847 -22.02735,21.28847c-9.69404,0 -15.69519,0 -39.2062,0c-18.74526,0 -22.76622,15.02133 -22.76622,23.13566c0,4.96524 0,19.39548 0,19.39548c0,0 -10.35755,0 -13.8081,0c-11.62103,0 -23.13566,-11.24273 -23.13566,-40.31451c0,-31.64898 14.76125,-38.79095 26.50789,-38.79095c14.07262,0 55.23092,0 55.23092,0v-5.58737h-39.52983c0,0 0,-13.95883 0,-18.61079c0,-3.06633 0.41229,-17.96353 38.79095,-17.96353c39.14857,0 39.94507,16.99856 39.9436,21.65791zM210.81443,118.35121c0,3.93377 3.17864,7.11241 7.11241,7.11241c3.93377,0 7.11241,-3.18012 7.11241,-7.11241c0,-3.93525 -3.17864,-7.11241 -7.11241,-7.11241c-3.93377,0 -7.11241,3.17716 -7.11241,7.11241z"/><path d="M200.33127,239.61837c0,-8.79853 0,-14.3992 0,-35.78964c0,-18.48666 16.27594,-21.28847 22.02735,-21.28847c10.42701,0 15.69667,0 39.20768,0c18.87826,0 22.76622,-15.02133 22.76622,-23.13566c0,-4.29878 0,-19.39548 0,-19.39548c0,0 10.35608,0 13.8081,0c7.56313,0 23.13566,5.85041 23.13566,40.31451c0,31.47017 -14.67258,38.79095 -26.50789,38.79095c-13.80662,0 -55.23092,0 -55.23092,0v5.58737h39.57711c0,0 0,13.95883 0,18.61079c0,2.78556 -0.47731,17.96353 -38.83824,17.96353c-35.22218,0 -39.94507,-13.92928 -39.94507,-21.65791zM269.18705,241.64879c0,-3.93377 -3.18012,-7.11241 -7.11241,-7.11241c-3.93525,0 -7.11241,3.17864 -7.11241,7.11241c0,3.93377 3.17864,7.11241 7.11241,7.11241c3.93229,0 7.11241,-3.17864 7.11241,-7.11241z"/></g></g></g></svg><!--rotationCenter:81.27627000000001:81.27627000000004-->
    `;

    const WHITE_PYTHON_ICON =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(WHITE_PYTHON_ICON_SVG);

    // ============================================================
    // EXTENSION
    // ============================================================

    class PythonExtension {
        constructor() {
            this.vm = Scratch.vm;
            this.runtime = this.vm.runtime;

            this.pyodide = null;
            this.loading = null;

            this.ready = false;
            this.restoringPackages = false;

            this.lastResponse = "";

            this.scripts = {
                "main.py": 'print("Hello from Python!")\n'
            };

            // Every package installed through the extension
            // is stored here and serialized into the project.
            this.packages = [];

            this.currentFile = null;
            this.openTabs = [];

            this.modal = null;

            this.fileList = null;
            this.tabsElement = null;
            this.editorHost = null;

            this.editor = null;
            this.editorContainer = null;

            this.outputPanel = null;
            this.outputContent = null;

            this.statusText = null;
            this.runButton = null;

            this.cmReady = false;
            this.cmLoading = null;

            this.saveTimer = null;
            this.packageRestorePromise = null;

            this.installProjectStorage();
            this.loadProjectState();
            this.watchProjectStorage();
            this.listenForProjectLoad();

            this.startLoading();
        }

        openDocumentation() {
        window.open(
            "https://cattymod.app/docs/extensions/python/",
            "_blank"
        );
    }


        // ========================================================
        // INFO
        // ========================================================

        getInfo() {
            return {
                id: "python",
                name: "Python",
                docsURI: "https://cattymod.app/docs/extensions/python",

                color1: "#3776AB",
                color2: "#2B5B84",
                color3: "#1F4466",

                menuIconURI: PYTHON_ICON,
                blockIconURI: WHITE_PYTHON_ICON,

                blocks: [
                    {
                        opcode: "runPython",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Run Python [CODE]",
                        arguments: {
                            CODE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue:
                                    "print('Hello, world!')"
                            }
                        }
                    },

                    {
                        opcode: "runPythonScript",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Run Python Script [SCRIPT]",
                        arguments: {
                            SCRIPT: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "scripts"
                            }
                        }
                    },

                    {
                        opcode: "getLastResponse",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "Last Python Response"
                    },

                    {
                        opcode: "isPythonReady",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "Python Ready?"
                    },

                    {
                        opcode: "installPackage",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Add Python Package [PACKAGE]",
                        arguments: {
                            PACKAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "requests"
                            }
                        }
                    },

                    {
                        opcode: "uninstallPackage",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Remove Python Package [PACKAGE]",
                        arguments: {
                            PACKAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "requests"
                            }
                        }
                    },

                    {
                        opcode: "resetPython",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Reset Python"
                    },

                    {
                        opcode: "openEditor",
                        blockType: Scratch.BlockType.BUTTON,
                        text: "Open Python Editor",
                        func: "openEditor"
                    }
                ],

                menus: {
                    scripts: {
                        acceptReporters: true,
                        items: "getScriptMenu"
                    }
                }
            };
        }

        // ========================================================
        // PROJECT STORAGE & LOADING LISTENERS
        // ========================================================

        installProjectStorage() {
            if (!this.runtime) {
                return;
            }

            if (!this.runtime.extensionStorage) {
                this.runtime.extensionStorage = {};
            }

            const storage =
                this.runtime.extensionStorage.python;

            if (!storage || typeof storage !== "object") {
                this.runtime.extensionStorage.python = {
                    version: 3,

                    scripts: {
                        "main.py":
                            'print("Hello from Python!")\n'
                    },

                    packages: []
                };

                return;
            }

            if (!storage.scripts) {
                storage.scripts = {
                    "main.py":
                        'print("Hello from Python!")\n'
                };
            }

            if (!Array.isArray(storage.packages)) {
                storage.packages = [];
            }

            storage.version = 3;
        }

        loadProjectState() {
            try {
                const storage =
                    this.runtime &&
                    this.runtime.extensionStorage &&
                    this.runtime.extensionStorage.python;

                if (!storage) {
                    return;
                }

                // ----------------------------
                // SCRIPTS
                // ----------------------------

                if (
                    storage.scripts &&
                    typeof storage.scripts === "object"
                ) {
                    const loadedScripts = {};

                    for (
                        const [name, source]
                        of Object.entries(storage.scripts)
                    ) {
                        if (
                            typeof name === "string" &&
                            typeof source === "string" &&
                            name.toLowerCase().endsWith(".py")
                        ) {
                            loadedScripts[name] = source;
                        }
                    }

                    if (Object.keys(loadedScripts).length) {
                        this.scripts = loadedScripts;
                    } else {
                        this.scripts = { "main.py": 'print("Hello from Python!")\n' };
                    }
                } else {
                    this.scripts = { "main.py": 'print("Hello from Python!")\n' };
                }

                // ----------------------------
                // PACKAGES
                // ----------------------------

                if (Array.isArray(storage.packages)) {
                    this.packages = this.cleanPackageList(
                        storage.packages
                    );
                } else {
                    this.packages = [];
                }
            } catch (error) {
                console.warn(
                    "Python extension: could not load project state.",
                    error
                );
            }
        }

        listenForProjectLoad() {
            // Listen to VM or Runtime project load events to refresh cleanly without glitches
            const handleProjectLoaded = () => {
                // Close active editor window if open to prevent tracking dead references
                if (this.modal) {
                    this.closeEditor();
                }

                // Re-initialize and load states from the newly loaded project storage
                this.installProjectStorage();
                this.loadProjectState();

                // If Pyodide is already ready, restore any packages specified in the new project
                if (this.pyodide && this.ready) {
                    this.restorePackages();
                }
            };

            try {
                if (this.vm && typeof this.vm.on === "function") {
                    this.vm.on("PROJECT_LOADED", handleProjectLoaded);
                }
            } catch (_) {}

            try {
                if (this.runtime && typeof this.runtime.on === "function") {
                    this.runtime.on("PROJECT_LOADED", handleProjectLoaded);
                }
            } catch (_) {}
        }

        cleanPackageList(packages) {
            return [
                ...new Set(
                    packages
                        .filter(
                            packageName =>
                                typeof packageName === "string"
                        )
                        .map(
                            packageName =>
                                packageName.trim()
                        )
                        .filter(Boolean)
                )
            ];
        }

        saveProjectState() {
            try {
                if (!this.runtime) {
                    return;
                }

                if (!this.runtime.extensionStorage) {
                    this.runtime.extensionStorage = {};
                }

                const packages =
                    this.cleanPackageList(
                        this.packages
                    );

                this.packages = packages;

                this.runtime.extensionStorage.python = {
                    version: 3,

                    scripts:
                        JSON.parse(
                            JSON.stringify(this.scripts)
                        ),

                    packages:
                        JSON.parse(
                            JSON.stringify(packages)
                        )
                };

                // Tell the runtime that the project changed.
                try {
                    if (
                        typeof this.runtime.emit ===
                        "function"
                    ) {
                        this.runtime.emit(
                            "PROJECT_CHANGED"
                        );
                    }
                } catch (_) {}

                try {
                    if (
                        this.vm &&
                        typeof this.vm.emit ===
                        "function"
                    ) {
                        this.vm.emit(
                            "PROJECT_CHANGED"
                        );
                    }
                } catch (_) {}
            } catch (error) {
                console.warn(
                    "Python extension: could not save project state.",
                    error
                );
            }
        }

        watchProjectStorage() {
            let previousPackages = "";

            setInterval(() => {
                try {
                    const storage =
                        this.runtime &&
                        this.runtime.extensionStorage &&
                        this.runtime.extensionStorage.python;

                    if (!storage) {
                        return;
                    }

                    if (Array.isArray(storage.packages)) {
                        const packages =
                            this.cleanPackageList(
                                storage.packages
                            );

                        const serialized =
                            JSON.stringify(packages);

                        if (
                            serialized !==
                            previousPackages
                        ) {
                            previousPackages =
                                serialized;

                            const changed =
                                JSON.stringify(
                                    this.packages
                                ) !== serialized;

                            this.packages =
                                packages;

                            if (
                                changed &&
                                this.pyodide &&
                                this.ready
                            ) {
                                this.restorePackages();
                            }
                        }
                    }
                } catch (_) {}
            }, 500);
        }

        // ========================================================
        // SCRIPT MENU
        // ========================================================

        getScriptMenu() {
            const files =
                Object.keys(this.scripts);

            return files.length
                ? files
                : ["main.py"];
        }

        // ========================================================
        // PYODIDE
        // ========================================================

        async startLoading() {
            try {
                await this.loadPyodide();
            } catch (error) {
                console.error(
                    "Python extension:",
                    error
                );

                this.ready = false;

                this.lastResponse =
                    `Python Error: ${error.message}`;

                this.updatePythonStatus(
                    "Python  •  Failed to load"
                );
            }
        }

        async loadPyodide() {
            if (this.pyodide) {
                if (this.packageRestorePromise) {
                    await this.packageRestorePromise;
                }

                return this.pyodide;
            }

            if (this.loading) {
                return this.loading;
            }

            this.loading = (async () => {
                try {
                    const module =
                        await import(
                            PYODIDE_URL
                        );

                    this.pyodide =
                        await module.loadPyodide({
                            indexURL:
                                PYODIDE_INDEX
                        });

                    // No custom import restrictions.
                    // Normal Python imports and micropip work.

                    this.ready = false;

                    // Restore EVERY saved package before
                    // reporting Python as ready.
                    await this.restorePackages();

                    this.ready = true;

                    this.updatePythonStatus(
                        "Python  •  Ready"
                    );

                    return this.pyodide;
                } finally {
                    this.loading = null;
                }
            })();

            return this.loading;
        }

        // ========================================================
        // PACKAGE RESTORATION
        // ========================================================

        async restorePackages() {
            if (!this.pyodide) {
                return;
            }

            if (this.packageRestorePromise) {
                return this.packageRestorePromise;
            }

            const packages =
                this.cleanPackageList(
                    this.packages
                );

            this.packageRestorePromise =
                (async () => {
                    if (!packages.length) {
                        return;
                    }

                    this.restoringPackages = true;

                    try {
                        this.updatePythonStatus(
                            "Python  •  Loading micropip..."
                        );

                        await this.pyodide.loadPackage(
                            "micropip"
                        );

                        const micropip =
                            this.pyodide.pyimport(
                                "micropip"
                            );

                        try {
                            for (
                                const packageName
                                of packages
                            ) {
                                this.updatePythonStatus(
                                    `Python  •  Restoring ${packageName}...`
                                );

                                try {
                                    await micropip.install(
                                        packageName
                                    );
                                } catch (error) {
                                    console.error(
                                        `Could not restore package ${packageName}:`,
                                        error
                                    );

                                    this.lastResponse =
                                        `Python Error: Could not restore ${packageName}: ${error.message}`;
                                }
                            }
                        } finally {
                            if (
                                micropip &&
                                typeof micropip.destroy ===
                                "function"
                            ) {
                                micropip.destroy();
                            }
                        }
                    } finally {
                        this.restoringPackages = false;
                    }
                })();

            try {
                await this.packageRestorePromise;
            } finally {
                this.packageRestorePromise = null;
            }
        }

        // ========================================================
        // INSTALL PACKAGE
        // ========================================================

        async installPackage(args) {
            const packageName =
                String(
                    args.PACKAGE ?? ""
                ).trim();

            if (!packageName) {
                this.lastResponse =
                    "Python Error: No package specified.";

                this.showOutput(
                    this.lastResponse
                );

                return;
            }

            try {
                const pyodide =
                    await this.loadPyodide();

                await pyodide.loadPackage(
                    "micropip"
                );

                const micropip =
                    pyodide.pyimport(
                        "micropip"
                    );

                try {
                    await micropip.install(
                        packageName
                    );
                } finally {
                    if (
                        micropip &&
                        typeof micropip.destroy ===
                        "function"
                    ) {
                        micropip.destroy();
                    }
                }

                if (
                    !this.packages.includes(
                        packageName
                    )
                ) {
                    this.packages.push(
                        packageName
                    );
                }

                this.saveProjectState();

                this.lastResponse =
                    `Successfully installed ${packageName}. Saved to project.`;

                this.showOutput(
                    this.lastResponse
                );

                this.updatePythonStatus(
                    "Python  •  Package saved"
                );
            } catch (error) {
                this.lastResponse =
                    `Python Error: Could not install ${packageName}: ${error.message}`;

                this.showOutput(
                    this.lastResponse
                );
            }
        }

        // ========================================================
        // UNINSTALL PACKAGE
        // ========================================================

        async uninstallPackage(args) {
            const packageName =
                String(
                    args.PACKAGE ?? ""
                ).trim();

            if (!packageName) {
                this.lastResponse =
                    "Python Error: No package specified.";

                this.showOutput(
                    this.lastResponse
                );

                return;
            }

            try {
                const pyodide =
                    await this.loadPyodide();

                await pyodide.loadPackage(
                    "micropip"
                );

                const micropip =
                    pyodide.pyimport(
                        "micropip"
                    );

                let uninstalled = false;
                try {
                    // Check if micropip supports uninstall or fallback to environment check/pip
                    if (typeof micropip.uninstall === "function") {
                        await micropip.uninstall(packageName);
                        uninstalled = true;
                    } else {
                        // Fallback using standard Python subprocess/pip if needed
                        const output = pyodide.runPython(`
import subprocess
import sys
try:
    result = subprocess.run([sys.executable, "-m", "pip", "uninstall", "${packageName}", "-y"], capture_output=True, text=True, check=True)
    "Successfully uninstalled"
except Exception as e:
    str(e)
                        `);
                        if (output && output.includes("Successfully uninstalled")) {
                            uninstalled = true;
                        }
                    }
                } catch (err) {
                    // If package wasn't found or isn't installed
                    const errStr = err.toString();
                    if (errStr.includes("not installed") || errStr.includes("Skipping") || errStr.includes("does not exist")) {
                        this.lastResponse = `Package '${packageName}' doesn't exist or isn't installed.`;
                        this.showOutput(this.lastResponse);
                        return;
                    } else {
                        throw err;
                    }
                } finally {
                    if (
                        micropip &&
                        typeof micropip.destroy ===
                        "function"
                    ) {
                        micropip.destroy();
                    }
                }

                // Remove from internal packages array
                const index = this.packages.indexOf(packageName);
                if (index !== -1) {
                    this.packages.splice(index, 1);
                    this.saveProjectState();
                }

                this.lastResponse = `Successfully uninstalled ${packageName}.`;
                this.showOutput(this.lastResponse);
                this.updatePythonStatus("Python  •  Package removed");

            } catch (error) {
                const errorMsg = error.message || String(error);
                if (errorMsg.includes("not installed") || errorMsg.includes("does not exist") || errorMsg.includes("Skipping")) {
                    this.lastResponse = `Package '${packageName}' doesn't exist or isn't installed.`;
                } else {
                    this.lastResponse = `Python Error: The package '${packageName}' doesn't exist or isn't installed.`;
                }
                this.showOutput(this.lastResponse);
            }
        }

        // ========================================================
        // BLOCKS
        // ========================================================

        async runPython(args) {
            await this.executePython(
                String(
                    args.CODE ?? ""
                )
            );
        }

        async runPythonScript(args) {
            const name =
                String(
                    args.SCRIPT || ""
                );

            if (
                !Object.prototype.hasOwnProperty.call(
                    this.scripts,
                    name
                )
            ) {
                this.lastResponse =
                    `Python Error: Script "${name}" does not exist.`;

                this.showOutput(
                    this.lastResponse
                );

                return;
            }

            await this.executeScript(
                name
            );
        }

        getLastResponse() {
            return this.lastResponse;
        }

        isPythonReady() {
            return (
                this.ready &&
                this.pyodide !== null &&
                !this.restoringPackages
            );
        }

        async resetPython() {
            this.ready = false;
            this.pyodide = null;
            this.loading = null;
            this.packageRestorePromise = null;
            this.lastResponse = "";

            try {
                await this.loadPyodide();
            } catch (error) {
                this.lastResponse =
                    `Python Error: ${error.message}`;
            }
        }

        // ========================================================
        // EXECUTION
        // ========================================================

        async executeScript(name) {
            try {
                const pyodide =
                    await this.loadPyodide();

                for (
                    const [filename, source]
                    of Object.entries(
                        this.scripts
                    )
                ) {
                    if (
                        !filename
                            .toLowerCase()
                            .endsWith(".py")
                    ) {
                        continue;
                    }

                    const safeName =
                        filename
                            .replace(
                                /\\/g,
                                "/"
                            )
                            .replace(
                                /^\/+/,
                                ""
                            );

                    const fullPath =
                        `/home/pyodide/${safeName}`;

                    const directory =
                        fullPath.substring(
                            0,
                            fullPath.lastIndexOf("/")
                        );

                    try {
                        pyodide.FS.mkdirTree(
                            directory
                        );
                    } catch (_) {}

                    pyodide.FS.writeFile(
                        fullPath,
                        source
                    );
                }

                await pyodide.runPythonAsync(`
import sys
import os

_project_path = "/home/pyodide"

if _project_path not in sys.path:
    sys.path.insert(0, _project_path)

os.chdir(_project_path)
                `);

                await this.executePython(
                    this.scripts[name]
                );
            } catch (error) {
                this.lastResponse =
                    `Python Error: ${error.message}`;

                this.showOutput(
                    this.lastResponse
                );
            }
        }

        async executePython(code) {
            let output = "";
            let errors = "";

            try {
                const pyodide =
                    await this.loadPyodide();

                if (this.restoringPackages) {
                    await this.restorePackages();
                }

                pyodide.setStdout({
                    batched: text => {
                        output += text;

                        this.updateOutputLive(
                            output,
                            errors
                        );
                    }
                });

                pyodide.setStderr({
                    batched: text => {
                        errors += text;

                        this.updateOutputLive(
                            output,
                            errors
                        );
                    }
                });

                const result =
                    await pyodide.runPythonAsync(
                        code
                    );

                if (
                    result !== undefined &&
                    result !== null &&
                    String(result) !== "None"
                ) {
                    if (
                        output &&
                        !output.endsWith("\n")
                    ) {
                        output += "\n";
                    }

                    output += String(result);
                }

                if (errors) {
                    if (
                        output &&
                        !output.endsWith("\n")
                    ) {
                        output += "\n";
                    }

                    output += errors;
                }

                this.lastResponse =
                    output;

                this.showOutput(
                    output ||
                    "(No output)"
                );
            } catch (error) {
                this.lastResponse =
                    `Python Error: ${error.message}`;

                this.showOutput(
                    this.lastResponse
                );
            }
        }

        // ========================================================
        // CODEMIRROR
        // ========================================================

        async loadCodeMirror() {
            if (
                window.CodeMirror &&
                window.CodeMirror.fromTextArea
            ) {
                this.cmReady = true;
                return;
            }

            if (this.cmLoading) {
                return this.cmLoading;
            }

            this.cmLoading =
                new Promise(
                    (resolve, reject) => {
                        if (
                            !document.querySelector(
                                'link[data-python-codemirror="base"]'
                            )
                        ) {
                            const link =
                                document.createElement(
                                    "link"
                                );

                            link.rel =
                                "stylesheet";

                            link.href =
                                CODEMIRROR_CSS;

                            link.dataset
                                .pythonCodemirror =
                                "base";

                            document.head.appendChild(
                                link
                            );
                        }

                        this.loadScript(
                            CODEMIRROR_JS
                        )
                            .then(() =>
                                this.loadScript(
                                    CODEMIRROR_PYTHON_JS
                                )
                            )
                            .then(() => {
                                if (
                                    !window.CodeMirror ||
                                    !window.CodeMirror.fromTextArea
                                ) {
                                    throw new Error(
                                        "CodeMirror loaded but its API was unavailable."
                                    );
                                }

                                this.cmReady =
                                    true;

                                resolve();
                            })
                            .catch(
                                reject
                            );
                    }
                );

            try {
                await this.cmLoading;
            } catch (error) {
                this.cmLoading = null;
                throw error;
            }
        }

        loadScript(src) {
            return new Promise(
                (resolve, reject) => {
                    const existing =
                        document.querySelector(
                            `script[data-python-script="${src}"]`
                        );

                    if (existing) {
                        if (
                            existing.dataset.loaded ===
                            "true"
                        ) {
                            resolve();
                            return;
                        }

                        existing.addEventListener(
                            "load",
                            resolve,
                            { once: true }
                        );

                        existing.addEventListener(
                            "error",
                            () =>
                                reject(
                                    new Error(
                                        `Failed to load ${src}`
                                    )
                                ),
                            { once: true }
                        );

                        return;
                    }

                    const script =
                        document.createElement(
                            "script"
                        );

                    script.src = src;
                    script.async = false;

                    script.dataset
                        .pythonScript =
                        src;

                    script.onload = () => {
                        script.dataset.loaded =
                            "true";

                        resolve();
                    };

                    script.onerror = () => {
                        reject(
                            new Error(
                                `Failed to load ${src}`
                            )
                        );
                    };

                    document.head.appendChild(
                        script
                    );
                }
            );
        }

        // ========================================================
        // EDITOR
        // ========================================================

        async openEditor() {
            if (this.modal) {
                return;
            }

            this.openTabs = [];
            this.currentFile = null;

            this.createEditorUI();

            try {
                await this.loadCodeMirror();

                this.showWelcome();
                this.refreshSidebar();
                this.refreshTabs();
            } catch (error) {
                console.error(
                    "Python CodeMirror error:",
                    error
                );

                this.showEditorError(
                    error.message
                );
            }
        }

        createEditorUI() {
            const overlay =
                document.createElement("div");

            overlay.style.cssText = `
                position:fixed;
                inset:0;
                z-index:999999;

                display:flex;
                align-items:center;
                justify-content:center;

                background:rgba(0,0,0,.72);

                font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    sans-serif;
            `;

            const app =
                document.createElement("div");

            app.style.cssText = `
                width:960px;
                height:650px;

                max-width:95vw;
                max-height:91vh;

                display:flex;
                flex-direction:column;

                overflow:hidden;

                background:#1e1e1e;

                border:1px solid #333;
                border-radius:8px;

                box-shadow:
                    0 24px 80px rgba(0,0,0,.7);
            `;

            const titlebar =
                document.createElement("div");

            titlebar.style.cssText = `
                height:38px;
                flex-shrink:0;

                display:flex;
                align-items:center;

                padding:0 10px;

                background:#181818;
                color:#ccc;

                font-size:13px;

                border-bottom:1px solid #303030;
            `;

            const logo =
                document.createElement("img");

            logo.src =
                WHITE_PYTHON_ICON;

            logo.style.cssText = `
                width:18px;
                height:18px;
                margin-right:8px;
            `;

            const title =
                document.createElement("span");

            title.textContent =
                "Python Editor";

            const close =
                document.createElement("button");

            close.textContent = "×";

            close.style.cssText = `
                margin-left:auto;

                width:32px;
                height:32px;

                border:0;
                border-radius:4px;

                background:transparent;
                color:#ccc;

                font-size:23px;
                cursor:pointer;
            `;

            close.onclick =
                () => this.closeEditor();

            titlebar.appendChild(logo);
            titlebar.appendChild(title);
            titlebar.appendChild(close);

            const body =
                document.createElement("div");

            body.style.cssText = `
                flex:1;
                min-height:0;

                display:flex;
            `;

            const sidebar =
                document.createElement("div");

            sidebar.style.cssText = `
                width:220px;
                flex-shrink:0;

                display:flex;
                flex-direction:column;

                background:#181818;

                border-right:1px solid #303030;
            `;

            const explorerHeader =
                document.createElement("div");

            explorerHeader.textContent =
                "Explorer";

            explorerHeader.style.cssText = `
                height:42px;
                flex-shrink:0;

                display:flex;
                align-items:center;

                padding:0 10px;

                color:#aaa;

                font-size:11px;
                font-weight:700;

                text-transform:uppercase;
            `;

            const newFile =
                document.createElement("button");

            newFile.textContent =
                "+  New Python File";

            newFile.style.cssText = `
                margin:0 8px 8px;

                padding:8px;

                border:0;
                border-radius:4px;

                background:#2d2d2d;
                color:#ccc;

                cursor:pointer;

                text-align:left;

                font-size:12px;
            `;

            newFile.onclick =
                () => this.newFile();

            this.fileList =
                document.createElement("div");

            this.fileList.style.cssText = `
                flex:1;
                min-height:0;

                overflow-y:auto;
            `;

            sidebar.appendChild(
                explorerHeader
            );

            sidebar.appendChild(
                newFile
            );

            sidebar.appendChild(
                this.fileList
            );

            const right =
                document.createElement("div");

            right.style.cssText = `
                flex:1;
                min-width:0;
                min-height:0;

                display:flex;
                flex-direction:column;

                background:#1e1e1e;
            `;

            const toolbar =
                document.createElement("div");

            toolbar.style.cssText = `
                height:40px;
                flex-shrink:0;

                display:flex;
                align-items:center;

                gap:7px;

                padding:0 8px;

                background:#1e1e1e;

                border-bottom:1px solid #303030;
            `;

            this.runButton =
                document.createElement("button");

            this.runButton.textContent =
                "▶  Run";

            this.runButton.disabled = true;

            this.runButton.style.cssText = `
                padding:6px 12px;

                border:0;
                border-radius:4px;

                background:#16825d;
                color:white;

                cursor:pointer;

                font-size:12px;
                font-weight:600;
            `;

            this.runButton.onclick =
                () => this.runCurrentFile();

            const saveStatus =
                document.createElement("span");

            saveStatus.textContent =
                "Auto-save enabled";

            saveStatus.style.cssText = `
                color:#777;
                font-size:11px;
                margin-left:4px;
            `;

            const clear =
                document.createElement("button");

            clear.textContent =
                "Clear Output";

            clear.style.cssText = `
                margin-left:auto;

                padding:6px 10px;

                border:0;
                border-radius:4px;

                background:#2d2d2d;
                color:#bbb;

                cursor:pointer;

                font-size:12px;
            `;

            clear.onclick = () => {
                if (this.outputContent) {
                    this.outputContent.textContent =
                        "";
                }
            };

            toolbar.appendChild(
                this.runButton
            );

            toolbar.appendChild(
                saveStatus
            );

            toolbar.appendChild(
                clear
            );

            this.tabsElement =
                document.createElement("div");

            this.tabsElement.style.cssText = `
                height:36px;
                flex-shrink:0;

                display:flex;

                background:#181818;

                overflow-x:auto;

                border-bottom:1px solid #303030;
            `;

            this.editorHost =
                document.createElement("div");

            this.editorHost.style.cssText = `
                flex:1;
                min-height:0;

                position:relative;

                overflow:hidden;

                background:#1e1e1e;
            `;

            this.outputPanel =
                document.createElement("div");

            this.outputPanel.style.cssText = `
                height:150px;
                flex-shrink:0;

                display:none;
                flex-direction:column;

                background:#111;

                border-top:1px solid #333;
            `;

            const outputHeader =
                document.createElement("div");

            outputHeader.style.cssText = `
                height:30px;
                flex-shrink:0;

                display:flex;
                align-items:center;

                padding:0 9px;

                color:#aaa;

                font-size:11px;
                font-weight:700;

                text-transform:uppercase;
            `;

            outputHeader.textContent =
                "Output";

            const outputClose =
                document.createElement("button");

            outputClose.textContent =
                "×";

            outputClose.style.cssText = `
                margin-left:auto;

                border:0;
                background:transparent;

                color:#aaa;

                cursor:pointer;

                font-size:18px;
            `;

            outputClose.onclick =
                () => this.hideOutput();

            outputHeader.appendChild(
                outputClose
            );

            this.outputContent =
                document.createElement("pre");

            this.outputContent.style.cssText = `
                flex:1;
                min-height:0;

                overflow:auto;

                margin:0;
                padding:10px;

                color:#ddd;

                font-family:
                    Consolas,
                    "Courier New",
                    monospace;

                font-size:12px;

                white-space:pre-wrap;
                word-break:break-word;
            `;

            this.outputPanel.appendChild(
                outputHeader
            );

            this.outputPanel.appendChild(
                this.outputContent
            );

            this.statusText =
                document.createElement("div");

            this.statusText.textContent =
                "Python";

            this.statusText.style.cssText = `
                height:23px;
                flex-shrink:0;

                display:flex;
                align-items:center;

                padding:0 9px;

                background:#007acc;
                color:white;

                font-size:11px;
            `;

            right.appendChild(toolbar);
            right.appendChild(this.tabsElement);
            right.appendChild(this.editorHost);
            right.appendChild(this.outputPanel);
            right.appendChild(this.statusText);

            body.appendChild(sidebar);
            body.appendChild(right);

            app.appendChild(titlebar);
            app.appendChild(body);

            overlay.appendChild(app);

            document.body.appendChild(
                overlay
            );

            this.modal = overlay;
        }

        showEditorError(message) {
            if (!this.editorHost) {
                return;
            }

            this.editorHost.innerHTML = "";

            const box =
                document.createElement("div");

            box.style.cssText = `
                height:100%;

                display:flex;
                flex-direction:column;

                align-items:center;
                justify-content:center;

                background:#1e1e1e;
                color:#ddd;

                text-align:center;

                padding:30px;
                box-sizing:border-box;
            `;

            const heading =
                document.createElement("div");

            heading.textContent =
                "Editor Error";

            heading.style.cssText = `
                font-size:20px;
                margin-bottom:10px;
            `;

            const details =
                document.createElement("div");

            details.textContent =
                message;

            details.style.cssText = `
                color:#999;
                max-width:600px;
                line-height:1.5;

                font-family:monospace;
                font-size:12px;
            `;

            box.appendChild(heading);
            box.appendChild(details);

            this.editorHost.appendChild(box);

            this.updatePythonStatus(
                "Python  •  CodeMirror failed to load"
            );
        }

        showWelcome() {
            this.destroyEditor();

            if (!this.editorHost) {
                return;
            }

            this.editorHost.innerHTML = "";

            const wrapper =
                document.createElement("div");

            wrapper.style.cssText = `
                width:100%;
                height:100%;

                display:flex;
                flex-direction:column;

                align-items:center;
                justify-content:center;

                text-align:center;

                background:#1e1e1e;
                color:#ccc;
            `;

            const icon =
                document.createElement("img");

            icon.src =
                WHITE_PYTHON_ICON;

            icon.style.cssText = `
                width:72px;
                height:72px;

                margin-bottom:18px;

                opacity:.9;
            `;

            const heading =
                document.createElement("div");

            heading.textContent =
                "Welcome to Python";

            heading.style.cssText = `
                font-size:22px;
                font-weight:500;

                margin-bottom:10px;

                color:#eee;
            `;

            const description =
                document.createElement("div");

            description.textContent =
                "Open a Python file from the Explorer.";

            description.style.cssText = `
                font-size:13px;
                color:#888;

                max-width:360px;
                line-height:1.5;
            `;

            wrapper.appendChild(icon);
            wrapper.appendChild(heading);
            wrapper.appendChild(description);

            this.editorHost.appendChild(
                wrapper
            );

            if (this.runButton) {
                this.runButton.disabled = true;
            }

            this.updatePythonStatus(
                "Python  •  No file open"
            );
        }

        createEditor() {
            this.destroyEditor();

            if (
                !this.currentFile ||
                !this.editorHost
            ) {
                return;
            }

            if (
                !window.CodeMirror ||
                !window.CodeMirror.fromTextArea
            ) {
                this.showEditorError(
                    "CodeMirror is not available."
                );

                return;
            }

            this.editorHost.innerHTML = "";

            const textarea =
                document.createElement("textarea");

            textarea.value =
                this.scripts[
                    this.currentFile
                ] || "";

            textarea.spellcheck = false;

            textarea.setAttribute(
                "autocomplete",
                "off"
            );

            textarea.setAttribute(
                "autocorrect",
                "off"
            );

            textarea.setAttribute(
                "autocapitalize",
                "off"
            );

            this.editorHost.appendChild(
                textarea
            );

            this.editorContainer =
                textarea;

            if (
                !document.getElementById(
                    "python-codemirror-dark-theme"
                )
            ) {
                const style =
                    document.createElement("style");

                style.id =
                    "python-codemirror-dark-theme";

                style.textContent = `
                    .cm-s-python-dark.CodeMirror {
                        height:100% !important;

                        background:#1e1e1e !important;
                        color:#d4d4d4 !important;

                        font-family:
                            Consolas,
                            "Courier New",
                            monospace;

                        font-size:14px;
                        line-height:21px;
                    }

                    .cm-s-python-dark
                    .CodeMirror-scroll {
                        background:#1e1e1e;
                    }

                    .cm-s-python-dark
                    .CodeMirror-lines {
                        padding:8px 0;
                    }

                    .cm-s-python-dark
                    .CodeMirror-gutters {
                        background:#1e1e1e !important;

                        border-right:
                            1px solid #303030 !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-linenumber {
                        color:#5a5a5a !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-cursor {
                        border-left:
                            1px solid #ffffff !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-selected {
                        background:#264f78 !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-focused
                    .CodeMirror-selected {
                        background:#264f78 !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-activeline-background {
                        background:#202020 !important;
                    }

                    .cm-s-python-dark
                    .cm-keyword {
                        color:#c586c0 !important;
                    }

                    .cm-s-python-dark
                    .cm-atom {
                        color:#569cd6 !important;
                    }

                    .cm-s-python-dark
                    .cm-builtin {
                        color:#4ec9b0 !important;
                    }

                    .cm-s-python-dark
                    .cm-number {
                        color:#b5cea8 !important;
                    }

                    .cm-s-python-dark
                    .cm-def {
                        color:#dcdcaa !important;
                    }

                    .cm-s-python-dark
                    .cm-variable {
                        color:#9cdcfe !important;
                    }

                    .cm-s-python-dark
                    .cm-variable-2 {
                        color:#9cdcfe !important;
                    }

                    .cm-s-python-dark
                    .cm-variable-3 {
                        color:#4ec9b0 !important;
                    }

                    .cm-s-python-dark
                    .cm-property {
                        color:#9cdcfe !important;
                    }

                    .cm-s-python-dark
                    .cm-string {
                        color:#ce9178 !important;
                    }

                    .cm-s-python-dark
                    .cm-string-2 {
                        color:#ce9178 !important;
                    }

                    .cm-s-python-dark
                    .cm-comment {
                        color:#6a9955 !important;
                    }

                    .cm-s-python-dark
                    .cm-operator {
                        color:#d4d4d4 !important;
                    }

                    .cm-s-python-dark
                    .cm-meta {
                        color:#569cd6 !important;
                    }

                    .cm-s-python-dark
                    .cm-error {
                        color:#f44747 !important;
                        background:transparent !important;
                    }

                    .cm-s-python-dark
                    .CodeMirror-matchingbracket {
                        color:#ffffff !important;

                        border-bottom:
                            1px solid #ffffff;
                    }

                    .cm-s-python-dark
                    .CodeMirror-vscrollbar::-webkit-scrollbar,
                    .cm-s-python-dark
                    .CodeMirror-hscrollbar::-webkit-scrollbar {
                        width:10px;
                        height:10px;
                    }

                    .cm-s-python-dark
                    .CodeMirror-vscrollbar::-webkit-scrollbar-track,
                    .cm-s-python-dark
                    .CodeMirror-hscrollbar::-webkit-scrollbar-track {
                        background:#1e1e1e;
                    }

                    .cm-s-python-dark
                    .CodeMirror-vscrollbar::-webkit-scrollbar-thumb,
                    .cm-s-python-dark
                    .CodeMirror-hscrollbar::-webkit-scrollbar-thumb {
                        background:#424242;
                    }

                    .cm-s-python-dark
                    .CodeMirror-vscrollbar::-webkit-scrollbar-thumb:hover,
                    .cm-s-python-dark
                    .CodeMirror-hscrollbar::-webkit-scrollbar-thumb:hover {
                        background:#555;
                    }

                    .cm-s-python-dark
                    .CodeMirror-searching {
                        background:#613214;
                    }
                `;

                document.head.appendChild(
                    style
                );
            }

            this.editor =
                window.CodeMirror.fromTextArea(
                    textarea,
                    {
                        mode: {
                            name: "python",
                            version: 3
                        },
                        theme: "python-dark",
                        lineNumbers: true,
                        indentUnit: 4,
                        tabSize: 4,
                        indentWithTabs: false,
                        lineWrapping: false,
                        autofocus: true,
                        viewportMargin: Infinity,
                        matchBrackets: true,
                        styleActiveLine: true,
                        extraKeys: {
                            "Ctrl-Enter":
                                () =>
                                    this.runCurrentFile(),

                            "Cmd-Enter":
                                () =>
                                    this.runCurrentFile()
                        }
                    }
                );

            this.editor.on(
                "change",
                () => {
                    if (
                        !this.currentFile ||
                        !this.editor
                    ) {
                        return;
                    }

                    this.scripts[
                        this.currentFile
                    ] =
                        this.editor.getValue();

                    this.saveProjectState();

                    this.updateSaveStatus();
                }
            );

            setTimeout(() => {
                if (this.editor) {
                    this.editor.refresh();
                    this.editor.focus();

                    this.editor.setCursor(
                        this.editor.lastLine()
                    );
                }
            }, 50);
        }

        destroyEditor() {
            if (this.editor) {
                try {
                    this.editor.toTextArea();
                } catch (_) {}
            }

            this.editor = null;
            this.editorContainer = null;
        }

        updateSaveStatus() {
            if (!this.modal) {
                return;
            }

            const spans =
                this.modal.querySelectorAll(
                    "span"
                );

            for (
                const span of spans
            ) {
                if (
                    span.textContent ===
                    "Auto-save enabled"
                ) {
                    span.textContent =
                        "Saved to project";

                    span.style.color =
                        "#6a9955";

                    clearTimeout(
                        this.saveTimer
                    );

                    this.saveTimer =
                        setTimeout(() => {
                            if (
                                span &&
                                span.isConnected
                            ) {
                                span.textContent =
                                    "Auto-save enabled";

                                span.style.color =
                                    "#777";
                            }
                        }, 1200);

                    break;
                }
            }
        }

        updatePythonStatus(text) {
            if (this.statusText) {
                this.statusText.textContent =
                    text;
            }
        }

        newFile() {
            let number = 1;
            let name;

            do {
                name =
                    number === 1
                        ? "script.py"
                        : `script${number}.py`;

                number++;
            } while (
                Object.prototype.hasOwnProperty.call(
                    this.scripts,
                    name
                )
            );

            this.scripts[name] =
                `# ${name}\n\n`;

            this.saveProjectState();

            this.switchFile(name);
        }

        switchFile(name) {
            if (
                !Object.prototype.hasOwnProperty.call(
                    this.scripts,
                    name
                )
            ) {
                return;
            }

            this.saveCurrentEditor();

            this.currentFile = name;

            if (
                !this.openTabs.includes(
                    name
                )
            ) {
                this.openTabs.push(name);
            }

            this.createEditor();

            this.updatePythonStatus(
                `Python  •  ${name}`
            );

            if (this.runButton) {
                this.runButton.disabled = false;
            }

            this.refreshSidebar();
            this.refreshTabs();
        }

        saveCurrentEditor() {
            if (
                this.currentFile &&
                this.editor
            ) {
                this.scripts[
                    this.currentFile
                ] =
                    this.editor.getValue();

                this.saveProjectState();
            }
        }

        runCurrentFile() {
            if (!this.currentFile) {
                return;
            }

            this.saveCurrentEditor();

            this.executeScript(
                this.currentFile
            );
        }

        renameFile(oldName) {
            const entered =
                prompt(
                    "Rename Python file:",
                    oldName
                );

            if (entered === null) {
                return;
            }

            let newName =
                entered.trim();

            if (!newName) {
                return;
            }

            if (
                !newName
                    .toLowerCase()
                    .endsWith(".py")
            ) {
                newName += ".py";
            }

            if (newName === oldName) {
                return;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    this.scripts,
                    newName
                )
            ) {
                alert(
                    `A Python file named "${newName}" already exists.`
                );

                return;
            }

            this.saveCurrentEditor();

            this.scripts[newName] =
                this.scripts[oldName];

            delete this.scripts[oldName];

            const tabIndex =
                this.openTabs.indexOf(
                    oldName
                );

            if (tabIndex !== -1) {
                this.openTabs[
                    tabIndex
                ] = newName;
            }

            if (
                this.currentFile ===
                oldName
            ) {
                this.currentFile =
                    newName;
            }

            this.saveProjectState();

            this.refreshSidebar();
            this.refreshTabs();

            if (
                this.currentFile ===
                newName
            ) {
                this.createEditor();
            }
        }

        deleteFile(name) {
            const files =
                Object.keys(
                    this.scripts
                );

            if (files.length <= 1) {
                alert(
                    "You cannot delete the last Python file."
                );

                return;
            }

            if (
                !confirm(
                    `Delete "${name}"?`
                )
            ) {
                return;
            }

            delete this.scripts[name];

            const tabIndex =
                this.openTabs.indexOf(
                    name
                );

            if (tabIndex !== -1) {
                this.openTabs.splice(
                    tabIndex,
                    1
                );
            }

            if (
                this.currentFile ===
                name
            ) {
                this.currentFile = null;

                if (
                    this.openTabs.length
                ) {
                    const nextIndex =
                        Math.min(
                            Math.max(
                                tabIndex,
                                0
                            ),
                            this.openTabs.length - 1
                        );

                    this.switchFile(
                        this.openTabs[
                            nextIndex
                        ]
                    );
                } else {
                    this.showWelcome();
                }
            }

            this.saveProjectState();

            this.refreshSidebar();
            this.refreshTabs();
        }

        refreshSidebar() {
            if (!this.fileList) {
                return;
            }

            this.fileList.innerHTML = "";

            for (
                const name of Object.keys(
                    this.scripts
                )
            ) {
                const row =
                    document.createElement("div");

                row.style.cssText = `
                    min-height:30px;

                    display:flex;
                    align-items:center;

                    padding:0 7px;

                    box-sizing:border-box;

                    background:${
                        name === this.currentFile
                            ? "#37373d"
                            : "transparent"
                    };

                    color:#ccc;

                    cursor:pointer;

                    font-size:13px;
                `;

                const icon =
                    document.createElement("img");

                icon.src =
                    WHITE_PYTHON_ICON;

                icon.style.cssText = `
                    width:16px;
                    height:16px;

                    margin-right:7px;

                    flex-shrink:0;
                `;

                const label =
                    document.createElement("span");

                label.textContent =
                    name;

                label.style.cssText = `
                    flex:1;

                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                `;

                const deleteButton =
                    document.createElement("button");

                deleteButton.textContent =
                    "×";

                deleteButton.style.cssText = `
                    width:22px;
                    height:22px;

                    padding:0;

                    border:0;

                    background:transparent;

                    color:#888;

                    cursor:pointer;

                    font-size:16px;

                    opacity:0;
                `;

                row.onmouseenter =
                    () => {
                        deleteButton.style.opacity =
                            "1";
                    };

                row.onmouseleave =
                    () => {
                        deleteButton.style.opacity =
                            "0";
                    };

                row.onclick =
                    () =>
                        this.switchFile(
                            name
                        );

                label.ondblclick =
                    event => {
                        event.stopPropagation();

                        this.renameFile(
                            name
                        );
                    };

                deleteButton.onclick =
                    event => {
                        event.stopPropagation();

                        this.deleteFile(
                            name
                        );
                    };

                row.appendChild(icon);
                row.appendChild(label);
                row.appendChild(
                    deleteButton
                );

                this.fileList.appendChild(
                    row
                );
            }
        }

        refreshTabs() {
            if (!this.tabsElement) {
                return;
            }

            this.tabsElement.innerHTML =
                "";

            for (
                const name of this.openTabs
            ) {
                if (
                    !Object.prototype.hasOwnProperty.call(
                        this.scripts,
                        name
                    )
                ) {
                    continue;
                }

                const tab =
                    document.createElement("div");

                const active =
                    name ===
                    this.currentFile;

                tab.style.cssText = `
                    min-width:135px;
                    max-width:210px;

                    height:36px;

                    display:flex;
                    align-items:center;

                    padding:0 7px;

                    box-sizing:border-box;

                    background:${
                        active
                            ? "#1e1e1e"
                            : "#181818"
                    };

                    color:#ccc;

                    border-right:
                        1px solid #303030;

                    cursor:pointer;

                    font-size:12px;
                `;

                const icon =
                    document.createElement("img");

                icon.src =
                    WHITE_PYTHON_ICON;

                icon.style.cssText = `
                    width:15px;
                    height:15px;

                    margin-right:6px;

                    flex-shrink:0;
                `;

                const label =
                    document.createElement("span");

                label.textContent =
                    name;

                label.style.cssText = `
                    flex:1;

                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                `;

                const close =
                    document.createElement("button");

                close.textContent =
                    "×";

                close.style.cssText = `
                    width:22px;
                    height:22px;

                    padding:0;

                    border:0;

                    background:transparent;

                    color:#888;

                    cursor:pointer;

                    font-size:16px;
                `;

                tab.onclick =
                    () =>
                        this.switchFile(
                            name
                        );

                label.ondblclick =
                    event => {
                        event.stopPropagation();

                        this.renameFile(
                            name
                        );
                    };

                close.onclick =
                    event => {
                        event.stopPropagation();

                        this.closeTab(
                            name,
                            event
                        );
                    };

                tab.appendChild(icon);
                tab.appendChild(label);
                tab.appendChild(close);

                this.tabsElement.appendChild(
                    tab
                );
            }
        }

        closeTab(name, event) {
            if (event) {
                event.stopPropagation();
            }

            this.saveCurrentEditor();

            const index =
                this.openTabs.indexOf(
                    name
                );

            if (index === -1) {
                return;
            }

            this.openTabs.splice(
                index,
                1
            );

            if (
                this.currentFile ===
                name
            ) {
                this.currentFile = null;

                if (
                    this.openTabs.length >
                    0
                ) {
                    const next =
                        this.openTabs[
                            Math.min(
                                index,
                                this.openTabs.length - 1
                            )
                        ];

                    this.switchFile(
                        next
                    );
                } else {
                    this.showWelcome();
                }
            }

            this.refreshTabs();
        }

        showOutput(text) {
            if (
                !this.outputPanel ||
                !this.outputContent
            ) {
                return;
            }

            this.outputPanel.style.display =
                "flex";

            this.outputContent.textContent =
                String(text);
        }

        hideOutput() {
            if (!this.outputPanel) {
                return;
            }

            this.outputPanel.style.display =
                "none";
        }

        updateOutputLive(
            output,
            errors
        ) {
            let text =
                output || "";

            if (errors) {
                if (
                    text &&
                    !text.endsWith("\n")
                ) {
                    text += "\n";
                }

                text += errors;
            }

            this.showOutput(
                text ||
                "(Running...)"
            );
        }

        closeEditor() {
            this.saveCurrentEditor();

            this.saveProjectState();

            this.destroyEditor();

            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }

            this.fileList = null;
            this.tabsElement = null;
            this.editorHost = null;

            this.outputPanel = null;
            this.outputContent = null;

            this.statusText = null;
            this.runButton = null;

            this.openTabs = [];
            this.currentFile = null;
        }
    }

    // ============================================================
    // REGISTER
    // ============================================================

    Scratch.extensions.register(
        new PythonExtension()
    );

})(Scratch);
