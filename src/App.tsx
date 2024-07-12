import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.css";
import ErrorList from "./ErrorList";
import AppDatabase from "./AppDatabase";
import ProgramEditor from "./ProgramEditor";
import ComPortConnector from "./PortConnector";
import { Program, ProgramItem } from "./types";
import FrequencyGenerator from "./FrequencyGenerator";

const db = new AppDatabase();

function App() {
  const [name, setName] = useState("");
  const [loadedData, setLoadedData] = useState<ProgramItem[]>([]);
  const [, setRunTimeInMinutes] = useState<number>(60);
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
          .then(({ data, runTimeInMinutes }) => {
            setLoadedData(data);
            setRunTimeInMinutes(runTimeInMinutes);
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
          SENDTOPORT(currentData.frequency, currentData.runTime);
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
  }, [isRunning, isPaused, currentIndex, loadedData]);

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
      await invoke<boolean>("xxx");
      const result = await invoke<boolean>("open_port", {
        args: { port_name: port, baud_rate: 9600 }
      });

      console.log(11111111111);
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
      await invoke("close_port", {args:{ port_name: selectedPort }});
      setIsConnected(false);
      setSelectedPort("");
    } catch (err) {
      console.error("Error", err);
      addError(`Failed to disconnect: ${err}`);
    }
  };

  const handleStartStop = () => {
    if (isRunning) {
      setIsRunning(false);
      setCurrentIndex(0);
      setProgress(0);
      setCurrentFrequency(null);
    } else {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const storeData = async (programName: string, programData: ProgramItem[], programRunTime: number) => {
    if (programName && programData.length > 0) {
      try {
        const existingProgram = await db.programs.where("name").equals(programName).first();
        if (existingProgram) {
          await db.programs.update(existingProgram.id!, { data: programData, runTimeInMinutes: programRunTime, default: false });
        } else {
          await db.programs.add({ name: programName, data: programData, runTimeInMinutes: programRunTime, default: false });
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

  const SENDTOPORT = async (frequency: number, time: number) => {
    try {
      await generator.sendFrequency(frequency, time);
      console.log(`Sent frequency ${frequency} Hz for ${time} ms to port`);
    } catch (error) {
      addError(`Failed to send frequency: ${error}`);
    }
  };

  const loadProgramData = useCallback(async (programName: string): Promise<Program> => {
    try {
      const { data, runTimeInMinutes } = await db.loadData(programName);
      return { name: programName, data, runTimeInMinutes };
    } catch (err) {
      addError(`Failed to load program data: ${err}`);
      return { name: programName, data: [], runTimeInMinutes: 0 };
    }
  }, []);

  const resetUIState = () => {
    setName("");
    setLoadedData([]);
    setRunTimeInMinutes(60);
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
            Your Programs
          </button>
          <button className={activeTab === "create" ? "active" : ""} onClick={() => handleTabChange("create")}>
            Editor
          </button>
          <button className={activeTab === "debug" ? "active" : ""} onClick={() => handleTabChange("debug")}>
            Config
          </button>
        </div>

        {activeTab === "default" && (
            <div id="default-programs" className="tabBody">
              <h2>Standard Programs</h2>
              <div className="progress-bar-wrapper program-toolbar">
                <label htmlFor="default-progress-bar">Running Program: {name}</label>
                <div className="progress-bar">
                  <div id="default-progress-bar" className="progress" style={{ width: `${progress}%` }}></div>
                  {currentFrequency !== null && (
                      <div className="current-frequency">{`Frequency: ${currentFrequency} Hz`}</div>
                  )}
                </div>
              </div>

              <div className="program-toolbar">
                <label htmlFor="default-program-select">Select Program:</label>
                <select
                    id="default-program-select"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                >
                  <option value="">Click here to choose program</option>
                  {defaultProgramNames.map((programName) => (
                      <option key={programName} value={programName}>
                        {programName}
                      </option>
                  ))}
                </select>
                <div>
                  <button type="button" onClick={handleStartStop}>
                    {isRunning ? "Stop" : "Start"}
                  </button>
                  <button type="button" onClick={handlePause}>
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                </div>
              </div>

              <div className="program-toolbar">
                <label htmlFor="intensity-slider">Intensity: <span>{intensity}%</span></label>
                <input
                    id="intensity-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.currentTarget.value))}
                />
              </div>
            </div>
        )}

        {activeTab === "your" && (
            <div id="your-programs" className="tabBody">
              <h2>Custom Programs</h2>
              <div className="progress-bar-wrapper program-toolbar">
                <label htmlFor="your-progress-bar">Running Program: {name}</label>
                <div className="progress-bar">
                  <div id="your-progress-bar" className="progress" style={{ width: `${progress}%` }}></div>
                  {currentFrequency !== null && (
                      <div className="current-frequency">{`Frequency: ${currentFrequency} Hz`}</div>
                  )}
                </div>
              </div>

              <div className="program-toolbar">
                <label htmlFor="your-program-select">Select Program:</label>
                <select
                    id="your-program-select"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                >
                  <option value="">Click here to choose custom program</option>
                  {programNames.map((programName) => (
                      <option key={programName} value={programName}>
                        {programName}
                      </option>
                  ))}
                </select>
                <div>
                  <button type="button" onClick={handleStartStop}>
                    {isRunning ? "Stop" : "Start"}
                  </button>
                  <button type="button" onClick={handlePause}>
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                </div>
              </div>

              <div className="program-toolbar">
                <label htmlFor="intensity-slider2">Intensity: <span>{intensity}%</span></label>
                <input
                    id="intensity-slider2"
                    type="range"
                    min="0"
                    max="100"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.currentTarget.value))}
                />
              </div>
            </div>
        )}

        {activeTab === "create" && (
            <div id="editor" className="tabBody editor">
              <h2>Edit Programs</h2>
              <ProgramEditor
                  onSave={storeData}
                  onCancel={() => handleTabChange("your")}
                  programs={programNames.map(name => ({
                    name,
                    data: [],
                    runTimeInMinutes: 0
                  }))}
                  loadProgramData={loadProgramData}
              />
            </div>
        )}

        {activeTab === "debug" && (
            <div id="debug" className="tabBody">
              <button type="button" onClick={eraseAllData}>
                Reset Data
              </button>

              <ComPortConnector
                  isConnected={isConnected}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
              />
            </div>
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
