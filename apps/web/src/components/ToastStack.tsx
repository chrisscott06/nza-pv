import { useToasts } from '../store/toasts.js';

export function ToastStack(): JSX.Element {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => dismiss(t.id)}
          title="Click to dismiss"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
