import React, { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor";
import StatusIndicator from "./StatusIndicator";
import { AppProvider, useAppContext } from "./AppContext";
import { ProgramItem } from "./types";
import MatrixRain from './components/MatrixRain';

const App: React.FC = () => {
    const { hoylandController, appDatabase } = useAppContext();

    const [portLabel, setPortLabel] = useState<string>("Connect to device");
    const [isRunning, setIsRunning] = useState(false);
    const [isPortConnected, setIsPortConnected] = useState(false);

    // one-time DB init (survives re-renders & StrictMode double-effect)
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        (async () => {
            await appDatabase.resetData();
            // defaults will load inside resetData -> preloadDefaults
            // appDatabase.preloadDone reflects completion
            // console.log("Database initialized and defaults preloaded.");
        })();
    }, [appDatabase]);

    const reconnectDevice = useCallback(async () => {
        if (!hoylandController) return;
        const result = await hoylandController.reconnectDevice();
        if (result === "TEST") {
            setPortLabel("Not Connected");
            setIsPortConnected(false);
        } else if (result) {
            setPortLabel(`Connected to ${result} port`);
            setIsPortConnected(true);
        } else {
            setPortLabel("Not Connected");
            setIsPortConnected(false);
        }
    }, [hoylandController]);

    // try to connect once controller is ready
    useEffect(() => {
        reconnectDevice();
    }, [reconnectDevice]);

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
            {/* Background rain */}
            <MatrixRain />
            <div className="container">
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
                        {!appDatabase.preloadDone && <p>LOADING...</p>}
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
                            onClick={reconnectDevice}
                            disabled={isRunning}
                        >
                            Connect
                        </button>
                        <p>{portLabel}</p>
                    </div>

                    {/* StatusIndicator expects a prop; pass null for now */}
                    <StatusIndicator status={null} />
                </main>

                <footer>Copyright &copy; 2024 Altered States Limited</footer>
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
