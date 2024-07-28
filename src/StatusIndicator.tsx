import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';

interface StatusIndicatorProps {
    status: 'success' | 'fail' | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    const { events } = useAppContext();
    const [message, setMessage] = useState<string>('');
    const [currentStatus, setCurrentStatus] = useState<'success' | 'fail' | null>(status);
    const [flashing, setFlashing] = useState<boolean>(false);
    const [lastEventTime, setLastEventTime] = useState<number>(Date.now());

    useEffect(() => {
        if (events.length > 0) {
            const latestEvent = events[events.length - 1];
            switch (latestEvent.type) {
                case 'message_success':
                    setMessage(`Success: ${latestEvent.payload}`);
                    setCurrentStatus('success');
                    break;
                case 'message_fail':
                    setMessage(`Fail: ${latestEvent.payload}`);
                    setCurrentStatus('fail');
                    break;
                case 'reconnected':
                    setMessage(`Reconnected: ${latestEvent.payload}`);
                    setCurrentStatus('success');
                    break;
                default:
                    break;
            }
            console.log(message)
            setLastEventTime(Date.now());
        }
    }, [events]);

    useEffect(() => {
        const flashInterval = setInterval(() => {
            setFlashing(prev => !prev);
        }, 500);

        const resetStatusTimeout = setInterval(() => {
            if (Date.now() - lastEventTime > 15000) {
                setCurrentStatus(null);
            }
        }, 3000);

        return () => {
            clearInterval(flashInterval);
            clearInterval(resetStatusTimeout);
        };
    }, [lastEventTime]);

    return (
        <div className={`status-indicator ${flashing ? currentStatus : ''}`}>

        </div>
    );
};

export default StatusIndicator;
