import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import ErrorBar from "./ErrorBar";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor/index";
import AppDatabase from "./util/AppDatabase";
import ClearDatabaseButton from "./ClearDatabase.tsx";

const App: React.FC = () => {
    const [errorMessages, setErrorMessages] = useState<string[]>([]);

    useEffect(() => {
        const initializeDatabase = async () => {
            const db = new AppDatabase();
            await db.preloadDefaults();
        };

        initializeDatabase();
    }, []);

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
                </main>
                <button onClick={simulateError}>Simulate Error</button>
                <ErrorBar messages={errorMessages} />
                <footer>
                    <p>
                        Copyright 2024 <a href="http://altered-states.net">altered-states.net</a>
                    </p>  <ClearDatabaseButton />
                </footer>
            </div>
        </Router>
    );
}

export default App;
