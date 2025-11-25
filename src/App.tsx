import React, { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import "./assets/App.css";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor";
import StatusIndicator from "./StatusIndicator";
import { AppProvider, useAppContext } from "./AppContext";
import { ProgramItem } from "./types";

const App: React.FC = () => {
    const { hoylandController, appDatabase, testMode, setTestMode } = useAppContext();

    const [portLabel, setPortLabel] = useState<string>("Not Connected");
    const [isRunning, setIsRunning] = useState(false);
    const [isPortConnected, setIsPortConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [currentScanningPort, setCurrentScanningPort] = useState<string>("");
    const [autoConnectReady, setAutoConnectReady] = useState(false);
    const [isUltrasoundConnected, setIsUltrasoundConnected] = useState(false);
    const [channel1Active, setChannel1Active] = useState(false);
    const [channel2Active, setChannel2Active] = useState(false);
    const cancelScanRef = useRef<(() => void) | null>(null);
    const handleConnectButtonRef = useCallback((node: HTMLButtonElement | null) => {
        if (node) {
            setAutoConnectReady(true);
        }
    }, []);

    // Use refs to get latest testMode values without triggering useCallback recreation
    const testModeRef = useRef(testMode);
    const setTestModeRef = useRef(setTestMode);
    useEffect(() => {
        testModeRef.current = testMode;
        setTestModeRef.current = setTestMode;
    }, [testMode, setTestMode]);

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

    // Listen for scanning_port events from Rust
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        (async () => {
            try {
                unlisten = await listen<string>('scanning_port', (event) => {
                    console.log('Received scanning_port event:', event.payload);
                    setCurrentScanningPort(event.payload);
                });
                console.log('scanning_port listener set up successfully');
            } catch (err) {
                console.error('Failed to setup scanning_port listener:', err);
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // Debug: log when isConnecting or currentScanningPort changes
    useEffect(() => {
        console.log('State changed - isConnecting:', isConnecting, 'currentScanningPort:', currentScanningPort);
    }, [isConnecting, currentScanningPort]);

    const updateConnectionState = useCallback(
        async (isCancelled?: () => boolean) => {
            if (!hoylandController) return null;
            console.log('Setting isConnecting to TRUE');
            setIsConnecting(true);
            setCurrentScanningPort(""); // Clear any previous scanning state

            // Allow React to render the "Connecting..." state before starting the scan
            await new Promise(resolve => setTimeout(resolve, 50));
            console.log('Starting reconnectDevice()');

            try {
                const result = await hoylandController.reconnectDevice();
                console.log('reconnectDevice() result:', result);
                if (isCancelled?.()) {
                    // Scanning was cancelled, set to "No device found" state
                    setPortLabel("No device found");
                    setIsPortConnected(false);
                    setIsConnecting(false);
                    setCurrentScanningPort("");
                    cancelScanRef.current = null;
                    return result;
                }

                if (result === "TEST") {
                    setPortLabel("No device found");
                    setIsPortConnected(false); // TEST port means no real device
                } else if (result) {
                    setPortLabel(`Connected to ${result} port`);
                    setIsPortConnected(true);
                    // Disable test mode when a real device is connected
                    if (testModeRef.current) {
                        setTestModeRef.current(false);
                    }
                } else {
                    setPortLabel("Not Connected");
                    setIsPortConnected(false);
                }
                return result;
            } finally {
                if (!isCancelled?.()) {
                    setIsConnecting(false);
                    setCurrentScanningPort(""); // Clear scanning display when done
                }
                cancelScanRef.current = null;
            }
        },
        [hoylandController]
    );

    // Auto-connect when button becomes visible
    useEffect(() => {
        if (!hoylandController) return;
        if (!autoConnectReady) return;
        let cancelled = false;
        const checkCancelled = () => cancelled;

        // Store the cancel function in the ref
        cancelScanRef.current = () => {
            cancelled = true;
        };

        // Wait 100ms to ensure the UI is fully painted and visible before auto-connecting
        const handle = window.setTimeout(() => {
            if (!cancelled) {
                void updateConnectionState(checkCancelled);
            }
        }, 100);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
            cancelScanRef.current = null;
        };
    }, [hoylandController, updateConnectionState, autoConnectReady]);

    // Handle manual connect button click
    const handleConnectClick = useCallback(() => {
        let cancelled = false;
        const checkCancelled = () => cancelled;

        // Store the cancel function in the ref
        cancelScanRef.current = () => {
            cancelled = true;
        };

        void updateConnectionState(checkCancelled);
    }, [updateConnectionState]);

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

    // ESC key handler to cancel scanning
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isConnecting && cancelScanRef.current) {
                console.log('ESC pressed - cancelling device scan');
                cancelScanRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isConnecting]);

    const isDeviceReady = isPortConnected && !isConnecting;
    const showTestModeToggle = !isPortConnected && !isConnecting;

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
                                        testMode={testMode}
                                        isUltrasoundOnly={isUltrasoundConnected}
                                        setChannel1Active={setChannel1Active}
                                        setChannel2Active={setChannel2Active}
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
                                        testMode={testMode}
                                        isUltrasoundOnly={isUltrasoundConnected}
                                        setChannel1Active={setChannel1Active}
                                        setChannel2Active={setChannel2Active}
                                    />
                                }
                            />
                            <Route
                                path="/editor"
                                element={<ProgramEditor onSave={handleSave} onCancel={() => {
                                }}/>}
                            />
                        </Routes>
                    </div>

                    <div id="console">
                        <button
                            ref={handleConnectButtonRef}
                            className={portLabel === "Not Connected" ? "sparkly-border" : ""}
                            onClick={handleConnectClick}
                            disabled={isRunning || isConnecting}
                        >
                            {isConnecting ? "Connecting..." : isPortConnected ? "Reconnect" : "Connect"}
                        </button>
                        {isConnecting && currentScanningPort ? (
                            <p>Scanning: {currentScanningPort}</p>
                        ) : isConnecting ? (
                            <p>Connecting...</p>
                        ) : (
                            !!portLabel && <p>{portLabel}</p>
                        )}
                        <div className="channel-indicators">
                            <div className="channel-indicator">
                                <span className="channel-label">CH1</span>
                                <div className={`led ${channel1Active ? 'active' : ''}`}></div>
                            </div>
                            <div className="channel-indicator">
                                <span className="channel-label">CH2</span>
                                <div className={`led ${channel2Active ? 'active' : ''}`}></div>
                            </div>
                        </div>
                    </div>

                    {/* StatusIndicator expects a prop; pass null for now */}
                    <StatusIndicator status={null}/>

                    <div className="ultrasound-connection-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={isUltrasoundConnected}
                                onChange={(e) => setIsUltrasoundConnected(e.target.checked)}
                            />
                            <span className={isUltrasoundConnected ? "connected" : ""}>
                            Ultrasound device connected
                        </span>
                        </label>
                    </div>

                </main>

                {showTestModeToggle && (
                    <div className="test-mode-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={testMode}
                                onChange={(e) => setTestMode(e.target.checked)}
                            />
                            <span>Enable Test Mode</span>
                        </label>
                    </div>
                )}


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
