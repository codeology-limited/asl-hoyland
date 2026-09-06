/**
 * Surface a failure to the operator. The app has no in-page error channel yet, so this
 * uses the native alert when one exists (Tauri WebView, browsers) and stays silent under
 * test runners that don't implement it. Always logs.
 */
export function notifyUser(message: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    const text = detail ? `${message}\n\n${detail}` : message;
    console.error(text);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        try { window.alert(text); } catch { /* headless environments */ }
    }
}
