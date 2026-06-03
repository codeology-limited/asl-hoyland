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
    message: string;
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

    override state: ErrorBoundaryState = { hasError: false, message: "" };

    static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
        // Update state so the next render shows the fallback UI.
        return { hasError: true, message: getErrorMessage(err) };
    }

    override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        // Notify host app
        this.props.onShowError?.(`Error: ${getErrorMessage(error)}`);
        // Optional: Log details (keep for debugging; remove if too noisy)
        // eslint-disable-next-line no-console
        console.error("Uncaught error:", error, errorInfo);
    }

    override componentDidUpdate(prevProps: ErrorBoundaryProps) {
        // Reset the boundary if any resetKey changes
        const { resetKeys } = this.props;
        if (!resetKeys || !prevProps.resetKeys) return;

        const changed =
            resetKeys.length !== prevProps.resetKeys.length ||
            resetKeys.some((k, i) => k !== prevProps.resetKeys![i]);

        if (changed && this.state.hasError) {
            this.setState({ hasError: false, message: "" });
        }
    }

    override render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            // Default fallback: surface the message and offer a reload affordance.
            // The boundary replaces the whole subtree, so a reload is the safest
            // recovery path on a hard crash of this safety-critical device app.
            return (
                <div role="alert" className="error-boundary-fallback">
                    <h1>Something went wrong.</h1>
                    {this.state.message && (
                        <p className="error-boundary-message">{this.state.message}</p>
                    )}
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
