import React from 'react';

interface StatusIndicatorProps {
    status: 'success' | 'fail' | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    return (
        <div className={`status-indicator ${status}`}>

        </div>
    );
}

export default StatusIndicator;
