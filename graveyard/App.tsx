import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "../src/assets/App.css";
import ErrorList from "./ErrorList.tsx";
import AppDatabase from "../src/util/AppDatabase.ts";
import ProgramEditor from "./tabs/ProgramEditor.tsx";
import DefaultPrograms from "./tabs/DefaultPrograms.tsx";
import YourPrograms from "./tabs/YourPrograms.tsx";
import DebugSettings from "./tabs/DebugSettings.tsx";
import { Program, ProgramItem } from "./types.ts";
import FrequencyGenerator from "../src/util/FrequencyGenerator.ts";

const db = new AppDatabase();
const MAX_AMPLITUDE = 10; // Adjust based on your generator's specifications

function App() {
  const [name, setName] = useState("");
  const [loadedData, setLoadedData] = useState<ProgramItem[]>([]);
  const [, setMaxTimeInMinutes] = useState<number>(60);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [intensity, setIntensity] = useState<number>(50);
  const [programNames, setProgramNames] = useState<string[]>([]);
  const [defaultProgramNames, setDefaultProgramNames] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [errors, setErrors] = useState<{ id: number; message: string }[]>([]);
  const [activeTab, setActiveTab] = useState<string>("default");
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);

  const generator = new FrequencyGenerator(selectedPort);

  const onFrequencyChange = (frequency: number) => {
    console.log(`Frequency changed to: ${frequency}`);
    // Call your custom logic here with the frequency
  };

  useEffect(() => {
    db.preloadDefaults().then(() => {
      loadProgramNames();
      loadDefaultProgramNames();
      listPorts();
    });
  }, []);

  useEffect(() => {
    if (name) {
      db.loadData(name)
          .then(({ data, maxTimeInMinutes }) => {
            setLoadedData(data);
            setMaxTimeInMinutes(maxTimeInMinutes);
          })
          .catch((err) => addError(err.message));
    }
  }, [name]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      if (currentIndex < loadedData.length) {
        const currentData = loadedData[currentIndex];
        setCurrentFrequency(currentData.frequency);
        setProgress(((currentIndex + 1) / loadedData.length) * 100);
        onFrequencyChange(currentData.frequency); // Call the function with the current frequency

        const timeout = setTimeout(() => {
          // Send to both channels
          SENDTOPORT(1, currentData.frequency, intensity, currentData.runTime);
          SENDTOPORT(2, currentData.frequency, intensity, currentData.runTime);
          setProgress(((currentIndex + 1) / loadedData.length) * 100);
          setCurrentIndex((prevIndex) => prevIndex + 1);
        }, currentData.runTime);

        return () => clearTimeout(timeout);
      } else {
        setIsRunning(false);
        setCurrentIndex(0);
        setProgress(0);
        setCurrentFrequency(null);
      }
    }
  }, [isRunning, isPaused, currentIndex, loadedData, intensity]);

  const loadProgramNames = async () => {
    try {
      const allPrograms = await db.programs.filter((program) => !program.default).toArray();
      const names = allPrograms.map((program) => program.name);
      setProgramNames(names);
    } catch (err) {
      addError(`Failed to load program names: ${err}`);
    }
  };

  const loadDefaultProgramNames = async () => {
    try {
      const defaultPrograms = await db.programs.filter((program) => program.default).toArray();
      const names = defaultPrograms.map((program) => program.name);
      setDefaultProgramNames(names);
    } catch (err) {
      addError(`Failed to load default program names: ${err}`);
    }
  };

  const listPorts = async () => {
    try {
      const availablePorts = await invoke<string[]>("list_ports");
      setPorts(availablePorts);
    } catch (err) {
      addError(`Failed to list ports: ${err}`);
    }
  };

  const handleConnect = async (port: string) => {
    try {
      console.log(`Attempting to open port: ${port}`);

      const result = await invoke<boolean>("open_port", {
        args: { port_name: port, baud_rate: 9600 },
      });

      if (result) {
        setSelectedPort(port);
        setIsConnected(true);
        console.log(`Successfully connected to port: ${port}`);
      } else {
        addError("Failed to open port");
        console.log("Failed to open port");
      }
    } catch (err) {
      console.error("Error", err);
      addError(`Failed to connect: ${err}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke("close_port", { args: { port_name: selectedPort } });
      setIsConnected(false);
      setSelectedPort("");
    } catch (err) {
      console.error("Error", err);
      addError(`Failed to disconnect: ${err}`);
    }
  };

  const handleStartStop = async () => {
    if (isRunning) {
      setIsRunning(false);
      setCurrentIndex(0);
      setProgress(0);
      setCurrentFrequency(null);
    } else {
      try {
        await generator.sendInitialCommands();

        console.log(`Initial commands sent to port: ${selectedPort}`);
        setIsRunning(true);
      } catch (err) {
        console.error("Error", err);
        addError(`Failed to send initial commands: ${err}`);
      }
    }
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStopAndReset = async () => {
    try {
      await generator.stopAndReset();
      setIsRunning(false);
      setCurrentIndex(0);
      setProgress(0);
      setCurrentFrequency(null);
    } catch (err) {
      console.error("Error", err);
      addError(`Failed to stop and reset: ${err}`);
    }
  };

  const storeData = async (programName: string, programData: ProgramItem[], programRunTime: number) => {
    if (programName && programData.length > 0) {
      try {
        const existingProgram = await db.programs.where("name").equals(programName).first();
        if (existingProgram) {
          await db.programs.update(existingProgram.id!, {
            data: programData,
            maxTimeInMinutes: programRunTime,
            default: false,
          });
        } else {
          await db.programs.add({
            name: programName,
            range: false,
            data: programData,
            maxTimeInMinutes: programRunTime,
            default: false,
          });
        }
        loadProgramNames();
        setActiveTab("your");
      } catch (err) {
        addError(`Failed to store data: ${err}`);
      }
    } else {
      addError("Please enter a name and add data before storing.");
    }
  };

  const eraseAllData = async () => {
    try {
      await db.resetData();
      setLoadedData([]);
      loadProgramNames();
    } catch (err) {
      addError(`Failed to erase data: ${err}`);
    }
  };

  const addError = (error: string) => {
    const id = new Date().getTime();
    const newError = { id, message: error };
    setErrors((prevErrors) => [...prevErrors, newError]);
  };

  const dismissError = (id: number) => {
    setErrors((prevErrors) => prevErrors.filter((error) => error.id !== id));
  };

  const SENDTOPORT = async (channel: number, frequency: number, intensity: number, time: number) => {
    const amplitude = (intensity / 100) * MAX_AMPLITUDE;
    try {
      await generator.sendFrequency(channel, frequency, amplitude, time);
      console.log(`Sent frequency ${frequency} Hz and amplitude ${amplitude} V for ${time} ms to port on channel ${channel}`);
    } catch (error) {
      addError(`Failed to send frequency and amplitude: ${error}`);
    }
  };

  const loadProgramData = useCallback(async (programName: string): Promise<Program> => {
    try {
      const { data, maxTimeInMinutes } = await db.loadData(programName);
      return { name: programName, data, maxTimeInMinutes };
    } catch (err) {
      addError(`Failed to load program data: ${err}`);
      return { name: programName, data: [], maxTimeInMinutes: 0 };
    }
  }, []);

  const resetUIState = () => {
    setName("");
    setLoadedData([]);
    setMaxTimeInMinutes(60);
    setIsRunning(false);
    setIsPaused(false);
    setIntensity(50);
    setCurrentIndex(0);
    setProgress(0);
    setCurrentFrequency(null);
  };

  const handleTabChange = (newTab: string) => {
    resetUIState();
    setActiveTab(newTab);

    if (newTab === "default" || newTab === "your") {
      loadProgramNames();
      loadDefaultProgramNames();
    }
  };

  return (
      <div className="container">
        <h1>Altered States</h1>

        <ErrorList errors={errors} dismissError={dismissError} />

        <div className="tabs">
          <button className={activeTab === "default" ? "active" : ""} onClick={() => handleTabChange("default")}>
            Default Programs
          </button>
          <button className={activeTab === "your" ? "active" : ""} onClick={() => handleTabChange("your")}>
            Personal
          </button>
          <button className={activeTab === "create" ? "active" : ""} onClick={() => handleTabChange("create")}>
            Editor
          </button>
          <button className={activeTab === "debug" ? "active" : ""} onClick={() => handleTabChange("debug")}>
            Settings
          </button>
        </div>

        {activeTab === "default" && (
            <DefaultPrograms
                name={name}
                setName={setName}
                defaultProgramNames={defaultProgramNames}
                isRunning={isRunning}
                handleStartStop={handleStartStop}
                isPaused={isPaused}
                handlePause={handlePause}
                handleStopAndReset={handleStopAndReset}
                intensity={intensity}
                setIntensity={setIntensity}
                progress={progress}
                currentFrequency={currentFrequency}
                errors={errors}
                dismissError={dismissError}
            />
        )}

        {activeTab === "your" && (
            <YourPrograms
                name={name}
                setName={setName}
                programNames={programNames}
                isRunning={isRunning}
                handleStartStop={handleStartStop}
                isPaused={isPaused}
                handlePause={handlePause}
                handleStopAndReset={handleStopAndReset}
                intensity={intensity}
                setIntensity={setIntensity}
                progress={progress}
                currentFrequency={currentFrequency}
                errors={errors}
                dismissError={dismissError}
            />
        )}

        {activeTab === "create" && (
            <ProgramEditor
                onSave={storeData}
                onCancel={() => handleTabChange("your")}
                programs={programNames.map((name) => ({
                  name,
                  data: [],
                  maxTimeInMinutes: 0,
                  range: false,
                  default: false,
                }))}
                loadProgramData={loadProgramData}
            />
        )}

        {activeTab === "debug" && (
            <DebugSettings
                isConnected={isConnected}
                handleConnect={handleConnect}
                handleDisconnect={handleDisconnect}
                eraseAllData={eraseAllData}
            />
        )}

        <footer>
          <p>
            Copyright 2024 <a href="http://altered-states.net">altered-states.net</a>
          </p>
        </footer>
      </div>
  );
}

export default App;
