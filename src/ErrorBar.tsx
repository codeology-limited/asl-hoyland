import React from "react";
import "./assets/ErrorBar.css";

interface ErrorBarProps {
    messages: string[];
}

const ErrorBar: React.FC<ErrorBarProps> = ({ messages }) => {
    if (!messages.length) return null;

    return (
        <div className="error-bar" role="alert" aria-live="assertive">
            <ul>
                {messages.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                ))}
            </ul>
        </div>
    );
};

export default ErrorBar;
