/**
 * ErrorBoundary.jsx
 *
 * Reusable React error boundary. Catches render-time errors in the subtree
 * and renders a fallback UI instead of crashing the whole app.
 *
 * Three usage modes:
 *   - App-level (catch-all): boundary around the entire app. Fallback offers
 *     Reload and Export Save so a player never loses data.
 *   - Tab-level: boundary around each tab. Minimal "this tab failed" UI.
 *   - Component-level: boundary around an individual GuardPanel so a corrupted
 *     guard record doesn't crash the rest of the Guards tab.
 *
 * Must be a class component — React's getDerivedStateFromError / componentDidCatch
 * API is not supported in function components.
 */
import { Component, useState } from 'react';
import * as Sentry from '@sentry/react';

const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

function isChunkLoadError(error) {
  return CHUNK_LOAD_ERROR_PATTERN.test(String(error?.message ?? error ?? ''));
}

function readSaveBlob() {
  try {
    const raw = localStorage.getItem('guards_ledger_v2');
    if (!raw) return null;
    return new Blob([raw], { type: 'application/json' });
  } catch {
    return null;
  }
}

function ReloadButton() {
  return (
    <button
      className="err-boundary-btn err-boundary-btn--primary"
      onClick={() => window.location.reload()}
    >
      Reload
    </button>
  );
}

function ExportSaveButton({ onNoData }) {
  function handleExport() {
    const blob = readSaveBlob();
    if (!blob) {
      onNoData();
      return;
    }
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `guards-ledger-emergency-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      className="err-boundary-btn err-boundary-btn--secondary"
      onClick={handleExport}
    >
      Export save
    </button>
  );
}

function AppLevelFallback({ error }) {
  const [noSaveMsg, setNoSaveMsg] = useState(false);
  return (
    <div className="err-boundary err-boundary--app">
      <div className="err-boundary-card">
        <div className="err-boundary-title">Something went wrong</div>
        <p className="err-boundary-message">
          The app hit an unexpected error and the current view can't be rendered.
          Your saved data is still safe — you can export it below before reloading.
        </p>
        {noSaveMsg && (
          <p className="err-boundary-message" style={{ color: 'var(--c-text2)', marginTop: 8 }}>
            No saved game data was found in localStorage.
          </p>
        )}
        {error && (
          <details className="err-boundary-details">
            <summary>Technical details</summary>
            <pre className="err-boundary-stack">{String(error?.message ?? error)}</pre>
          </details>
        )}
        <div className="err-boundary-actions">
          <ExportSaveButton onNoData={() => setNoSaveMsg(true)} />
          <ReloadButton />
        </div>
      </div>
    </div>
  );
}

function TabLevelFallback({ tabName, error, reset }) {
  const chunkError = isChunkLoadError(error);

  function handleRetry() {
    if (chunkError) {
      // A stale chunk hash means the page's own bundle references files a
      // new deploy has removed — re-running the same import will 404 again.
      // Only a full reload picks up the current index.html and its hashes.
      window.location.reload();
      return;
    }
    reset();
  }

  return (
    <div className="err-boundary err-boundary--tab">
      <div className="err-boundary-card err-boundary-card--small">
        <div className="err-boundary-title">{tabName || 'This tab'} failed to load</div>
        <p className="err-boundary-message">
          {chunkError
            ? 'A new version of the app was deployed while this page was open. Reload to get the latest version.'
            : 'The other tabs are still available. Try reloading this one, or switch tabs to keep playing.'}
        </p>
        {error && (
          <details className="err-boundary-details">
            <summary>Technical details</summary>
            <pre className="err-boundary-stack">{String(error?.message ?? error)}</pre>
          </details>
        )}
        <div className="err-boundary-actions">
          {reset && (
            <button
              className="err-boundary-btn err-boundary-btn--primary"
              onClick={handleRetry}
            >
              {chunkError ? 'Reload' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GuardLevelFallback({ guardName }) {
  return (
    <div className="err-boundary err-boundary--guard">
      <div className="err-boundary-title">
        {guardName ? `${guardName}'s record could not be loaded` : 'Guard record could not be loaded'}
      </div>
      <p className="err-boundary-message">
        The other guards are still available. Switch to a different guard to keep playing.
      </p>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
    if (typeof Sentry.captureException === 'function') {
      Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { level = 'app', tabName, guardName } = this.props;
    if (level === 'tab') {
      return <TabLevelFallback tabName={tabName} error={error} reset={this.reset} />;
    }
    if (level === 'guard') {
      return <GuardLevelFallback guardName={guardName} />;
    }
    return <AppLevelFallback error={error} />;
  }
}
