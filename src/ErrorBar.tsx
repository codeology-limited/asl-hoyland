import React from 'react';
import '../../h/hoyland/src/assets/ErrorBar.css';

interface ErrorBarProps {
    messages: string[];
}

const ErrorBar: React.FC<ErrorBarProps> = ({ messages }) => {
    return (
        <div className="error-container">
            {messages.length > 0 && (
                <div className="error-bar">
                    {messages.map((message, index) => (
                        <div key={index}>{message}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ErrorBar;
