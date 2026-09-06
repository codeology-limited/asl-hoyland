import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';

interface StatusIndicatorProps {
    status: 'success' | 'fail' | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    const { events } = useAppContext();

    const [currentStatus, setCurrentStatus] = useState<'success' | 'fail' | null>(status);
    const [flashing, setFlashing] = useState(false);
    const lastEventTimeRef = React.useRef<number>(Date.now());

    // Keep in sync if parent-provided status changes
    useEffect(() => {
        setCurrentStatus(status);
    }, [status]);

    // Update status from the latest event
    useEffect(() => {
        const latest = events[events.length - 1];
        if (!latest) return;

        // HoylandController emits the Tauri command name on success and `<cmd>:error`
        // on failure; the message_* names are kept for any future Rust window events.
        if (latest.type.endsWith(':error') || latest.type === 'message_fail') {
            setCurrentStatus('fail');
        } else {
            setCurrentStatus('success');
        }
        lastEventTimeRef.current = Date.now();
    }, [events]);

    // Flash and auto-clear after 15s of inactivity — single stable interval
    useEffect(() => {
        const id = setInterval(() => {
            setFlashing((f) => !f);
            if (Date.now() - lastEventTimeRef.current > 15000) setCurrentStatus(null);
        }, 500);
        return () => clearInterval(id);
    }, []);

    return <div className={`status-indicator ${flashing ? currentStatus : ''}`} />;
};

export default StatusIndicator;
