import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { AppProvider } from './AppContext';

const Root = () => {
    const handleShowError = (message: string) => {
        // Handle error display logic here
        console.error(message);
    };

    return (
        <ErrorBoundary onShowError={handleShowError}>
            <AppProvider>
                <App />
            </AppProvider>
        </ErrorBoundary>
    );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>
);
