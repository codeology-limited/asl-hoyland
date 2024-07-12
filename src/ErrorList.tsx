//ErrorList.tsx
import React, { useEffect } from "react";

interface ErrorListProps {
  errors: { id: number; message: string }[];
  dismissError: (id: number) => void;
}

const ErrorList: React.FC<ErrorListProps> = ({ errors, dismissError }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (errors.length > 0) {
        dismissError(errors[0].id);
      }
    }, 10000); // Dismiss the first error after 2 minutes

    return () => clearTimeout(timer);
  }, [errors, dismissError]);

  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="error-list">
      <ul>
        {errors.map((error) => (
          <li key={error.id} className="error-item">
            {error.message}
            <button onClick={() => dismissError(error.id)} className="dismiss-button">
              X
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ErrorList;
