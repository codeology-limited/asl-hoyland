import React, { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor";
import StatusIndicator from "./StatusIndicator";
import { AppProvider, useAppContext } from "./AppContext";
import { ProgramItem } from "./types";

const App: React.FC = () => {
    const { hoylandController, appDatabase } = useAppContext();

    const [portLabel, setPortLabel] = useState<string>("Not Connected");
    const [isRunning, setIsRunning] = useState(false);
    const [isPortConnected, setIsPortConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [autoConnectReady, setAutoConnectReady] = useState(false);
    const handleConnectButtonRef = useCallback((node: HTMLButtonElement | null) => {
        if (node) {
            setAutoConnectReady(true);
        }
    }, []);

    // one-time DB preload (no wiping custom programs)
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        (async () => {
            try { await appDatabase.ensurePreloaded(); } catch (err) {
                console.error('Database preload failed:', err);
            }
        })();
    }, [appDatabase]);

    const updateConnectionState = useCallback(
        async (isCancelled?: () => boolean) => {
            if (!hoylandController) return null;
            setIsConnecting(true);
            try {
                const result = await hoylandController.reconnectDevice();
                if (isCancelled?.()) return result;

                if (result === "TEST") {
                    setPortLabel("No device found");
                    setIsPortConnected(true);
                } else if (result) {
                    setPortLabel(`Connected to ${result} port`);
                    setIsPortConnected(true);
                } else {
                    setPortLabel("Not Connected");
                    setIsPortConnected(false);
                }
                return result;
            } finally {
                if (!isCancelled?.()) {
                    setIsConnecting(false);
                }
            }
        },
        [hoylandController]
    );

    useEffect(() => {
        if (!hoylandController) return;
        if (!autoConnectReady) return;
        let cancelled = false;
        const checkCancelled = () => cancelled;

        // Defer auto-connect so the initial UI paint can complete first.
        const handle = window.setTimeout(() => {
            if (!cancelled) {
                void updateConnectionState(checkCancelled);
            }
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [hoylandController, updateConnectionState, autoConnectReady]);

    // editor callbacks (ProgramEditor already saves to DB; we just ack)
    const handleSave = async (
        programName: string,
        _programData: ProgramItem[],
        _programMaxTime: number,
        _range: boolean
    ) => {
        console.log("[Editor] Saved:", programName);
        alert("Program saved successfully!");
    };

    const isDeviceReady = isPortConnected && !isConnecting;

    return (
        <Router>
            <div
                className="container"
                /* bezel resizing now handled purely through CSS; the ResizeObserver code is preserved below for reference:
                ref={(el) => {
                    if (!el) return;
                    type ResizableContainer = HTMLElement & { _observerAttached?: boolean; _cleanup?: () => void };
                    const container = el as ResizableContainer;
                    if (container._observerAttached) return;
                    container._observerAttached = true;
                    try {
                        const setup = async () => {
                            let mod: typeof import('@tauri-apps/api/window') | null = null;
                            try { mod = await import('@tauri-apps/api/window'); } catch {}
                            const updateSize = () => {
                                const rect = el.getBoundingClientRect();
                                const w = Math.ceil(rect.width) + 20;
                                const h = Math.ceil(rect.height) + 20;
                                if (mod?.appWindow && mod?.LogicalSize) {
                                    try { mod.appWindow.setSize(new mod.LogicalSize(w, h)); } catch {}
                                }
                            };
                            updateSize();
                            const ro = new ResizeObserver(() => updateSize());
                            ro.observe(el);
                            const onWin = () => updateSize();
                            window.addEventListener('resize', onWin);
                            container._cleanup = () => {
                                try { ro.disconnect(); } catch {}
                                window.removeEventListener('resize', onWin);
                            };
                        };
                        setup();
                    } catch {}
                }}
                */
            >
                <header>
                    <h1>
                        <a href="http://altered-states.net">Altered States</a>
                    </h1>
                    <nav className="tabs">
                        <ul className="nav-links">
                            <li>
                                <NavLink
                                    to="/"
                                    end
                                    className={isRunning ? "disabled" : ""}
                                    tabIndex={isRunning ? -1 : 0}
                                >
                                    Default
                                </NavLink>
                            </li>
                            <li>
                                <NavLink
                                    to="/custom"
                                    className={isRunning ? "disabled" : ""}
                                    tabIndex={isRunning ? -1 : 0}
                                >
                                    Custom
                                </NavLink>
                            </li>
                            <li>
                                <NavLink
                                    to="/editor"
                                    className={isRunning ? "disabled" : ""}
                                    tabIndex={isRunning ? -1 : 0}
                                >
                                    Editor
                                </NavLink>
                            </li>
                        </ul>
                    </nav>
                </header>

                <main>
                    <div className="xxx">
                        <Routes>
                            <Route
                                path="/"
                                element={
                                    <DefaultPrograms
                                        setIsRunning={setIsRunning}
                                        isRunning={isRunning}
                                        isDeviceReady={isDeviceReady}
                                    />
                                }
                            />
                            <Route
                                path="/custom"
                                element={
                                    <CustomPrograms
                                        setIsRunning={setIsRunning}
                                        isRunning={isRunning}
                                        isDeviceReady={isDeviceReady}
                                    />
                                }
                            />
                            <Route
                                path="/editor"
                                element={<ProgramEditor onSave={handleSave} onCancel={() => {}} />}
                            />
                        </Routes>
                    </div>

                    <div id="console">
                        <button
                            ref={handleConnectButtonRef}
                            className={portLabel === "Not Connected" ? "sparkly-border" : ""}
                            onClick={() => {
                                void updateConnectionState();
                            }}
                            disabled={isRunning || isConnecting}
                        >
                            {isConnecting ? "Connecting..." : isPortConnected ? "Reconnect" : "Connect"}
                        </button>
                        {isConnecting ? (
                            <div className="connect-progress">
                                <div className="connect-progress__bar">
                                    <div className="connect-progress__fill" />
                                </div>
                            </div>
                        ) : (
                            !!portLabel && <p>{portLabel}</p>
                        )}
                    </div>

                    {/* StatusIndicator expects a prop; pass null for now */}
                    <StatusIndicator status={null} />
                </main>

                <footer>
                    <span>Copyright &copy; 2024 Altered States Limited</span>
                    <span className="footer__version">v1.5.7.3</span>
                </footer>
            </div>
        </Router>
    );
};

// IMPORTANT: choose ONE provider location in your app.
// If you keep this default export, DO NOT wrap App again in main.tsx.
const AppWithProviders: React.FC = () => (
    <AppProvider>
        <App />
    </AppProvider>
);

export default AppWithProviders;
