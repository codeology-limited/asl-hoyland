import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import ErrorBar from "./ErrorBar.tsx";
import DefaultPrograms from "./DefaultPrograms/Index.tsx";
import CustomPrograms from "./CustomPrograms/Index.tsx";
import ProgramEditor from "./ProgramEditor/index.tsx";
import StatusIndicator from "./StatusIndicator.tsx";
import AppDatabase from "./util/AppDatabase.ts";
import ClearDatabaseButton from "./ClearDatabase.tsx";
import HoylandController from './util/HoylandController.ts';

const App: React.FC = () => {
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [port, setPort] = useState<string>("Connect to device");
    const [status, setStatus] = useState<'success' | 'fail' | null>(null);

    useEffect(() => {
        const initializeDatabase = async () => {
            const db = new AppDatabase();
            await db.preloadDefaults();
        };

        initializeDatabase();
    }, []);

    async function reconnectDevice() {
        const hoyland = new HoylandController(setStatus);
        setPort(`Connected to ${await hoyland.reconnectDevice()} port`);
    }

    reconnectDevice()

    // Callback function to handle showing error messages
    const handleShowError = (newMessage: string) => {
        setErrorMessages(prevMessages => {
            if (newMessage && prevMessages.includes(newMessage)) {
                return prevMessages; // Return the existing array if the message is already present
            }
            return newMessage ? [...prevMessages, newMessage] : prevMessages.filter(message => message !== newMessage); // Add the new message to the array or remove it
        });

        if (newMessage) {
            setTimeout(() => {
                setErrorMessages(prevMessages => prevMessages.filter(message => message !== newMessage));
            }, 5000); // Remove the error after 5 seconds
        }
    };

    const simulateError = () => {
        handleShowError("Simulated Error Message");
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
                        <Route path="/custom" element={<CustomPrograms names={[]} />} />
                        <Route path="/editor" element={<ProgramEditor />} />
                    </Routes>
                    <div id="console">
                        <button onClick={simulateError}>Simulate Error</button>
                        <ClearDatabaseButton/>
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

export default App;
