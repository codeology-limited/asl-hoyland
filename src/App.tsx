import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Route, NavLink, Routes } from "react-router-dom";
import "./assets/App.css";
import DefaultPrograms from "./DefaultPrograms/Index";
import CustomPrograms from "./CustomPrograms/Index";
import ProgramEditor from "./ProgramEditor/index.tsx";
import StatusIndicator from "./StatusIndicator";
import { AppProvider, useAppContext } from './AppContext';

import { Program, ProgramItem } from './types';

const App: React.FC = () => {
    const [port, setPort] = useState<string>("Connect to device");
    const [status,  ] = useState<'success' | 'fail' | null>(null);
    const { hoylandController, appDatabase } = useAppContext();
    const [isRunning, setIsRunning] = useState(false);

    // useRef to ensure the initialization runs only once
    const initializationRef = useRef(false);
    useEffect(() => {
        if (!initializationRef.current) {
            initializationRef.current = true;  // Set the ref to true after initialization
            const handleClearDatabase = async () => {
                await appDatabase.resetData();
                console.log("Database initialized and cleared.");
            };

           handleClearDatabase();


        }
    }, []);

    async function reconnectDevice() {
        if (hoylandController) {
            const port = await hoylandController.reconnectDevice();
            if ( port === "TEST") {
                setPort(`Not Connected`);
            } else {
                setPort(`Connected to ${port} port`);
            }

        }
    }
    useEffect(() => {
        reconnectDevice();
    }, [hoylandController]); // Only run when hoylandController is available



    // const handleShowError = (newMessage: string) => {
    //     setErrorMessages(prevMessages => {
    //         if (newMessage && prevMessages.includes(newMessage)) {
    //             return prevMessages;
    //         }
    //         return newMessage ? [...prevMessages, newMessage] : prevMessages.filter(message => message !== newMessage);
    //     });
    //
    //     if (newMessage) {
    //         setTimeout(() => {
    //             setErrorMessages(prevMessages => prevMessages.filter(message => message !== newMessage));
    //         }, 5000);
    //     }
    // };

    // const simulateError = () => {
    //     handleShowError("Simulated Error Message");
    // };

    const handleSave = async (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => {
        const program: Program = {
            name: programName,
            data: programData,
            maxTimeInMinutes: programMaxTime,
            range: range ? true : false,
            default: false,
            startFrequency: 3.1
        };
        // await appDatabase.saveData(program);
        console.log(program)
        alert("Program saved successfully!" );
    };

    const handleCancel = () => {
        //alert("Edit cancelled");
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
                    <div className='xxx'>


                    <Routes>
                        <Route path="/" element={<DefaultPrograms setIsRunning={setIsRunning} isRunning={isRunning} />} />
                        <Route path="/custom" element={<CustomPrograms setIsRunning={setIsRunning} isRunning={isRunning} />} />
                        <Route path="/editor" element={<ProgramEditor onSave={handleSave} onCancel={handleCancel} />} />
                    </Routes>
                </div>
                    <div id="console">
                        <button onClick={reconnectDevice} disabled={isRunning}>Connect</button> <p>{port}</p>
                    </div>
                    <StatusIndicator status={status} />
                </main>
<footer>Copyright &copy; 2024 Altered States Limited</footer>
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
