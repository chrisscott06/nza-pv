// Catches render-time exceptions so a single bad component (e.g. a roof face
// with garbage geometry) doesn't unmount the whole React tree and leave the
// user with a blank screen they can only recover from via reload. Errors are
// logged to the console with the component stack so they're easy to diagnose.

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  /** Label shown in the fallback UI so you know which boundary tripped. */
  label?: string;
  children: ReactNode;
};

type State = { error: Error | null; info: ErrorInfo | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info);
  }

  reset = (): void => {
    this.setState({ error: null, info: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 12,
          background: 'rgba(14, 20, 22, 0.95)',
          color: 'var(--c-text)',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--c-danger)' }}>
          {this.props.label ?? 'View'} hit a render error
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--c-text-dim)', maxWidth: 520, textAlign: 'center' }}>
          {String(this.state.error.message ?? this.state.error)}
        </div>
        <button
          type="button"
          onClick={this.reset}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            background: 'var(--c-accent-deep)',
            color: '#fff',
            border: '1px solid var(--c-accent-deep)',
          }}
        >
          Retry
        </button>
        <div className="muted" style={{ fontSize: 11 }}>
          Your project is autosaved — refreshing the page also recovers it.
        </div>
      </div>
    );
  }
}
