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

                if (result) {
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
        let cancelled = false;
        const checkCancelled = () => cancelled;
        void updateConnectionState(checkCancelled);
        return () => {
            cancelled = true;
        };
    }, [hoylandController, updateConnectionState]);

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

    return (
        <Router>
            <div
                className="container"
                ref={(el) => {
                    // Attach a ResizeObserver to keep Tauri window 20px larger than UI
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
                            // Initial size once mounted
                            updateSize();
                            // Observe container size changes
                            const ro = new ResizeObserver(() => updateSize());
                            ro.observe(el);
                            // Also adjust on window resize
                            const onWin = () => updateSize();
                            window.addEventListener('resize', onWin);
                            // Cleanup handler stored on element
                            container._cleanup = () => {
                                try { ro.disconnect(); } catch {}
                                window.removeEventListener('resize', onWin);
                            };
                        };
                        setup();
                    } catch {}
                }}
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
                                        isPortConnected={isPortConnected}
                                    />
                                }
                            />
                            <Route
                                path="/custom"
                                element={
                                    <CustomPrograms
                                        setIsRunning={setIsRunning}
                                        isRunning={isRunning}
                                        isPortConnected={isPortConnected}
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
                    <span className="footer__version">v1.5.7.2</span>
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
