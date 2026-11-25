"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";

type Theme = "dark" | "light";
type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
};

type ToastContextValue = {
  pushToast: (message: string, kind?: ToastKind) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

const ToastContext = createContext<ToastContextValue>({ pushToast: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function useToast() {
  return useContext(ToastContext);
}

function syncDocumentTheme(next: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.colorScheme = next;
}

function applyThemeToDocument(next: Theme) {
  syncDocumentTheme(next);
  try {
    localStorage.setItem("careerscout-theme", next);
  } catch {
    // ignore storage errors
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: 1,
          },
        },
      }),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    void useAuthStore.persist?.rehydrate?.();
    try {
      const saved = localStorage.getItem("careerscout-theme");
      const resolved: Theme =
        saved === "light" || saved === "dark"
          ? saved
          : document.documentElement.classList.contains("dark")
            ? "dark"
            : "light";
      setThemeState(resolved);
      syncDocumentTheme(resolved);
    } catch {
      // ignore storage access issues
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeToDocument(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyThemeToDocument(next);
      return next;
    });
  }, []);

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
        <ToastContext.Provider value={{ pushToast }}>
          {children}
          <div
            aria-live="polite"
            className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                className={`rounded-2xl border px-4 py-3 text-sm shadow-botanical transition ${
                  t.kind === "success"
                    ? "border-[rgb(var(--status-success-border))] bg-[rgb(var(--status-success-bg))] text-[rgb(var(--status-success-fg))]"
                    : t.kind === "error"
                      ? "border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] text-[rgb(var(--status-danger-fg))]"
                      : "border-[rgb(var(--border-hairline))] bg-[rgb(var(--bg-surface))] text-[rgb(var(--text-primary))]"
                }`}
              >
                {t.message}
              </div>
            ))}
          </div>
        </ToastContext.Provider>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}
