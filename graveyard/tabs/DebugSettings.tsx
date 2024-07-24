import React from "react";
import ComPortConnector from "../PortConnector.tsx";

interface DebugSettingsProps {
    isConnected: boolean;
    handleConnect: (port: string) => void;
    handleDisconnect: () => void;
    eraseAllData: () => void;
}

const DebugSettings: React.FC<DebugSettingsProps> = ({
                                                         isConnected,
                                                         handleConnect,
                                                         handleDisconnect,
                                                         eraseAllData,
                                                     }) => {
    return (
        <div id="debug" className="tabBody">
            <h2>Settings</h2>
            <button type="button" onClick={eraseAllData}>
                Reset Data
            </button>

            <ComPortConnector
                isConnected={isConnected}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
            />
        </div>
    );
};

export default DebugSettings;
