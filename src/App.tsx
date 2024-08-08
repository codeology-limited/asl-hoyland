import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import ErrorBar from "./ErrorBar";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor/index.tsx";
import StatusIndicator from "./StatusIndicator";
import ClearDatabaseButton from "./ClearDatabase";
import { AppProvider, useAppContext } from './AppContext';

import { Program, ProgramItem } from './types';

const App: React.FC = () => {
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [port, setPort] = useState<string>("Connect to device");
    const [status,  ] = useState<'success' | 'fail' | null>(null);
    const { hoylandController, appDatabase } = useAppContext();

    useEffect(() => {
        const initializeDatabase = async () => {
        //    const db = new AppDatabase();
          //  await db.preloadDefaults();
        };

        initializeDatabase();

        reconnectDevice();
    }, []);

    async function reconnectDevice() {
        if (hoylandController) {
            const port = await hoylandController.reconnectDevice();
            setPort(`Connected to ${port} port`);
        }
    }

    const handleShowError = (newMessage: string) => {
        setErrorMessages(prevMessages => {
            if (newMessage && prevMessages.includes(newMessage)) {
                return prevMessages;
            }
            return newMessage ? [...prevMessages, newMessage] : prevMessages.filter(message => message !== newMessage);
        });

        if (newMessage) {
            setTimeout(() => {
                setErrorMessages(prevMessages => prevMessages.filter(message => message !== newMessage));
            }, 5000);
        }
    };

    const simulateError = () => {
        handleShowError("Simulated Error Message");
    };

    const handleSave = async (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => {
        const program: Program = {
            name: programName,
            data: programData,
            maxTimeInMinutes: programMaxTime,
            range: range ? true : false,
            default: false,
            startFrequency: 3.1
        };
        await appDatabase.saveData(program);
        alert("Program saved successfully!");
    };

    const handleCancel = () => {
        alert("Edit cancelled");
    };

    return (
        <Router>
            <div className="container">
                <header>
                    <h1>Altered States</h1>
                    <nav className="tabs">
                        <ul className="nav-links">
                            <li><NavLink to="/" end>Default</NavLink></li>
                            <li><NavLink to="/custom">Custom</NavLink></li>
                            <li><NavLink to="/editor">Editor</NavLink></li>
                        </ul>
                    </nav>
                </header>

                <main>
                    <Routes>
                        <Route path="/" element={<DefaultPrograms />} />
                        <Route path="/custom" element={<CustomPrograms />} />
                        <Route path="/editor" element={<ProgramEditor onSave={handleSave} onCancel={handleCancel} />} />
                    </Routes>
                    <div id="console">
                        <button onClick={simulateError}>Simulate Error</button>
                        <ClearDatabaseButton />
                        <button onClick={reconnectDevice}>{port}</button>
                    </div>
                    <StatusIndicator status={status} />
                </main>

                <ErrorBar messages={errorMessages} />
                <footer>
                    <p>
                        Copyright 2024 <a href="http://altered-states.net">altered-states.net</a>
                    </p>
                </footer>
            </div>
        </Router>
    );
}

const AppWithProviders: React.FC = () => (
    <AppProvider>
        <App />
    </AppProvider>
);

export default AppWithProviders;
