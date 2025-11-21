import React, {
    createContext,
    useContext,
    ReactNode,
    useState,
    useCallback,
    useMemo,
} from "react";
import AppDatabase from "./util/AppDatabase";
import HoylandController from "./util/HoylandController";
import ProgramRunner from "./util/ProgramRunner";

export type AppEvent = { type: string; payload: string };

interface AppContextValue {
    appDatabase: AppDatabase;
    hoylandController: HoylandController;
    programRunner: ProgramRunner;
    events: AppEvent[];
    addEvent: (event: AppEvent) => void;
    testMode: boolean;
    setTestMode: (enabled: boolean) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [events, setEvents] = useState<AppEvent[]>([]);
    const [testMode, setTestMode] = useState<boolean>(false);

    const addEvent = useCallback((event: AppEvent) => {
        setEvents((prev) => [...prev, event]);
    }, []);

    // Create long-lived singletons once, in Provider scope
    const appDatabase = useMemo(() => new AppDatabase(), []);
    const hoylandController = useMemo(() => new HoylandController(addEvent), [addEvent]);
    const programRunner = useMemo(
        () => new ProgramRunner(appDatabase, hoylandController, null),
        [appDatabase, hoylandController]
    );

    const value = useMemo<AppContextValue>(
        () => ({
            appDatabase,
            hoylandController,
            programRunner,
            events,
            addEvent,
            testMode,
            setTestMode,
        }),
        [appDatabase, hoylandController, programRunner, events, addEvent, testMode]
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
    const ctx = useContext(AppContext);
    if (!ctx) {
        throw new Error("useAppContext must be used within an AppProvider");
    }
    return ctx;
};
