import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";

const Root = () => {
    const handleShowError = (message: string) => {
        // Handle error display logic here
        console.error(message);
    };

    return (
        <ErrorBoundary onShowError={handleShowError}>
            <App />
        </ErrorBoundary>
    );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>
);
