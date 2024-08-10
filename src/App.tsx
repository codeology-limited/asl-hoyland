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
import AppDatabase from "./util/AppDatabase.ts";

const App: React.FC = () => {
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [port, setPort] = useState<string>("Connect to device");
    const [status,  ] = useState<'success' | 'fail' | null>(null);
    const { hoylandController, appDatabase } = useAppContext();
    const [isRunning, setIsRunning] = useState(false);



    useEffect(() => {

        const handleClearDatabase = async () => {
            const database = new AppDatabase();
            await database.resetData();
        };


        const initializeDatabase = async () => {
            // Initialize database if needed
        };

        initializeDatabase();
        handleClearDatabase()

    });

    useEffect(() => {

        reconnectDevice();
    },[])

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
                    <h1><a href="http://altered-states.net">Altered States</a></h1>
                    <nav className="tabs">
                        <ul className="nav-links">
                            <li><NavLink to="/" end className={isRunning ? 'disabled' : ''} tabIndex={isRunning ? -1 : 0}>Default</NavLink></li>
                            <li><NavLink to="/custom" className={isRunning ? 'disabled' : ''} tabIndex={isRunning ? -1 : 0}>Custom</NavLink></li>
                            <li><NavLink to="/editor" className={isRunning ? 'disabled' : ''} tabIndex={isRunning ? -1 : 0}>Editor</NavLink></li>
                        </ul>
                    </nav>
                </header>

                <main>
                    <Routes>
                        <Route path="/" element={<DefaultPrograms setIsRunning={setIsRunning} isRunning={isRunning} />} />
                        <Route path="/custom" element={<CustomPrograms setIsRunning={setIsRunning} isRunning={isRunning} />} />
                        <Route path="/editor" element={<ProgramEditor onSave={handleSave} onCancel={handleCancel} />} />
                    </Routes>
                    <div id="console">
                        <button onClick={simulateError} disabled={isRunning}>Simulate Error</button>
                        <ClearDatabaseButton />
                        <button onClick={reconnectDevice} disabled={isRunning}>{port}</button>
                    </div>
                    <StatusIndicator status={status} />
                </main>

                <ErrorBar messages={errorMessages} />

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
