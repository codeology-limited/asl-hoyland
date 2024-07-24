import React, { useEffect, useRef, useState } from "react";

interface ErrorListProps {
  errors: { id: number; message: string }[];
  dismissError: (id: number) => void;
}

const ErrorList: React.FC<ErrorListProps> = ({ errors, dismissError }) => {
  const [displayedErrors, setDisplayedErrors] = useState<{ id: number; message: string }[]>([]);
  const displayedMessages = useRef(new Set<string>());

  useEffect(() => {
    const newErrors = errors.filter(error => !displayedMessages.current.has(error.message));

    if (newErrors.length > 0) {
      newErrors.forEach(error => displayedMessages.current.add(error.message));
      setDisplayedErrors(prevErrors => [...prevErrors, ...newErrors]);
    }

    const timer = setTimeout(() => {
      if (displayedErrors.length > 0) {
        const [firstError, ...remainingErrors] = displayedErrors;
        displayedMessages.current.delete(firstError.message);
        setDisplayedErrors(remainingErrors);
        dismissError(firstError.id);
      }
    }, 10000); // Dismiss the first error after 10 seconds

    return () => clearTimeout(timer);
  }, [errors, displayedErrors, dismissError]);

  if (displayedErrors.length === 0) {
    return null;
  }

  return (
      <div className="error-list">
        <ul>
          {displayedErrors.map((error) => (
              <li key={error.id} className="error-item">
                {error.message}
                <button onClick={() => {
                  displayedMessages.current.delete(error.message);
                  setDisplayedErrors(prevErrors => prevErrors.filter(e => e.id !== error.id));
                  dismissError(error.id);
                }} className="dismiss-button">
                  X
                </button>
              </li>
          ))}
        </ul>
      </div>
  );
};

export default ErrorList;
