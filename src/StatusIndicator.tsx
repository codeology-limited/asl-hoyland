import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';

interface StatusIndicatorProps {
    /**
     * Optional initial status. Kept optional for backwards compatibility;
     * the indicator now derives its status purely from context events
     * (message_success / message_fail / reconnected).
     */
    status?: 'success' | 'fail' | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status = null }) => {
    const { events } = useAppContext();

    const [currentStatus, setCurrentStatus] = useState<'success' | 'fail' | null>(status);
    const [flashing, setFlashing] = useState(false);
    const lastEventTimeRef = React.useRef<number>(Date.now());

    // Update status from the latest event
    useEffect(() => {
        const latest = events[events.length - 1];
        if (!latest) return;

        if (latest.type === 'message_success' || latest.type === 'reconnected') {
            setCurrentStatus('success');
        } else if (latest.type === 'message_fail') {
            setCurrentStatus('fail');
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

    // Non-color cue for accessibility: color alone must not convey the state.
    const label =
        currentStatus === 'fail'
            ? 'device error'
            : currentStatus === 'success'
            ? 'ok'
            : '';

    return (
        <div
            className={`status-indicator ${flashing ? currentStatus : ''}`}
            role="status"
            aria-live="polite"
            data-status={currentStatus ?? 'none'}
        >
            <span className="status-indicator__label">{label}</span>
        </div>
    );
};

export default StatusIndicator;
