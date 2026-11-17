import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";

const ToastContext = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const toast = useCallback((message, options = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, message, error: options.error }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, options.duration ?? 3200);
    timers.current.set(id, timer);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div className={`toast ${item.error ? "toast--error" : ""}`} key={item.id}>
            {item.error ? <AlertCircle /> : <Check />}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
