import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import AppDatabase from './util/AppDatabase';
import HoylandController from './util/HoylandController';
import ProgramRunner from './util/ProgramRunner';

const appDatabase = new AppDatabase();
const hoylandController = new HoylandController(); // Initialize once here
const programRunner = new ProgramRunner(appDatabase, hoylandController, null);

interface AppContextProps {
    appDatabase: AppDatabase;
    hoylandController: HoylandController;
    programRunner: ProgramRunner;
    events: { type: string; payload: string }[];
    addEvent: (event: { type: string; payload: string }) => void;
}

const AppContext = createContext<AppContextProps>({
    appDatabase,
    hoylandController,
    programRunner,
    events: [],
    addEvent: () => {},
});

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [events, setEvents] = useState<{ type: string; payload: string }[]>([]);

    const addEvent = useCallback((event: { type: string; payload: string }) => {
        setEvents(prevEvents => [...prevEvents, event]);
    }, []);

    // useEffect(() => {
    //     hoylandController.setEventCallback(addEvent); // Set the event callback
    // }, [addEvent]);

    return (
        <AppContext.Provider value={{ appDatabase, hoylandController, programRunner, events, addEvent }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => useContext(AppContext);
