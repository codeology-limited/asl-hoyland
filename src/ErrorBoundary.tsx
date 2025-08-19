import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional UI to show when an error occurs */
    fallback?: ReactNode;
    /** Called with a concise error message */
    onShowError?: (message: string) => void;
    /**
     * Change any value in this array to reset the boundary
     * (e.g., current route, a reload counter, etc.)
     */
    resetKeys?: unknown[];
}

interface ErrorBoundaryState {
    hasError: boolean;
}

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
        return JSON.stringify(err);
    } catch {
        return "Unknown error";
    }
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    static displayName = "ErrorBoundary";

    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(_: unknown): ErrorBoundaryState {
        // Update state so the next render shows the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        // Notify host app
        this.props.onShowError?.(`Error: ${getErrorMessage(error)}`);
        // Optional: Log details (keep for debugging; remove if too noisy)
        // eslint-disable-next-line no-console
        console.error("Uncaught error:", error, errorInfo);
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps) {
        // Reset the boundary if any resetKey changes
        const { resetKeys } = this.props;
        if (!resetKeys || !prevProps.resetKeys) return;

        const changed =
            resetKeys.length !== prevProps.resetKeys.length ||
            resetKeys.some((k, i) => k !== prevProps.resetKeys![i]);

        if (changed && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? <h1>Something went wrong.</h1>;
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
