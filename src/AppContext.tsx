import React, { createContext, useContext, ReactNode } from 'react';
import AppDatabase from './util/AppDatabase';
import HoylandController from './util/HoylandController';
import ProgramRunner from './util/ProgramRunner'; // Ensure this is the correct path to ProgramRunner

const appDatabase = new AppDatabase();
const hoylandController = new HoylandController();
const programRunner = new ProgramRunner(appDatabase, hoylandController, null);

interface AppContextProps {
    appDatabase: AppDatabase;
    hoylandController: HoylandController;
    programRunner: ProgramRunner;
}

const AppContext = createContext<AppContextProps>({
    appDatabase,
    hoylandController,
    programRunner,
});

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    return (
        <AppContext.Provider value={{ appDatabase, hoylandController, programRunner }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => useContext(AppContext);
