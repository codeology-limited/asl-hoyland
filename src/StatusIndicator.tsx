import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';

interface StatusIndicatorProps {
    status: 'success' | 'fail' | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    const { events } = useAppContext();

    const [currentStatus, setCurrentStatus] = useState<'success' | 'fail' | null>(status);
    const [flashing, setFlashing] = useState(false);
    const [lastEventTime, setLastEventTime] = useState<number>(Date.now());

    // Keep in sync if parent-provided status changes
    useEffect(() => {
        setCurrentStatus(status);
    }, [status]);

    // Update status from the latest event
    useEffect(() => {
        const latest = events[events.length - 1];
        if (!latest) return;

        if (latest.type === 'message_success' || latest.type === 'reconnected') {
            setCurrentStatus('success');
        } else if (latest.type === 'message_fail') {
            setCurrentStatus('fail');
        }
        setLastEventTime(Date.now());
    }, [events]);

    // Flash and auto-clear after 15s of inactivity
    useEffect(() => {
        const flashInterval = setInterval(() => setFlashing((f) => !f), 500);
        const clearIntervalId = setInterval(() => {
            if (Date.now() - lastEventTime > 15000) setCurrentStatus(null);
        }, 500);

        return () => {
            clearInterval(flashInterval);
            clearInterval(clearIntervalId);
        };
    }, [lastEventTime]);

    return <div className={`status-indicator ${flashing ? currentStatus : ''}`} />;
};

export default StatusIndicator;
