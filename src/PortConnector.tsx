import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/tauri";

interface Props {
  isConnected: boolean;
  onConnect: (port: string) => void;
  onDisconnect: () => void;
}

const ComPortConnector: React.FC<Props> = ({ isConnected, onConnect, onDisconnect }) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');

  useEffect(() => {
    listPorts();
  }, []);

  const listPorts = async () => {
    try {
      const availablePorts = await invoke<string[]>("list_ports");
      console.log(`Available ports: ${availablePorts}`);
      setPorts(availablePorts);
    } catch (err) {
      console.error("Failed to list ports:", err);
    }
  };

  const handleConnect = () => {
    console.log(`Selected port: ${selectedPort}`);
    if (selectedPort) {
      onConnect(selectedPort);
    }
  };

  return (
      <div className="com-port-connector">
        <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isConnected}
        >
          <option value="">Select COM Port</option>
          {ports.map((port) => (
              <option key={port} value={port}>{port}</option>
          ))}
        </select>
        {isConnected ? (
            <button onClick={onDisconnect}>Disconnect</button>
        ) : (
            <button onClick={handleConnect} disabled={!selectedPort}>Connect</button>
        )}
        <button onClick={listPorts} disabled={isConnected}>Refresh Ports</button>
      </div>
  );
};

export default ComPortConnector;
