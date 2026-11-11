import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink enabled:hover:bg-accent-hover",
  secondary: "bg-subtle border border-hairline text-ink enabled:hover:bg-hover",
  quiet: "bg-transparent text-ink-secondary enabled:hover:bg-subtle enabled:hover:text-ink",
  danger:
    "bg-status-danger-bg border border-status-danger-border text-status-danger-fg enabled:hover:border-status-danger-fg/50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[44px] sm:min-h-[36px] px-4 py-2 text-xs",
  md: "min-h-[44px] sm:min-h-[40px] px-5 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    type = "button",
    className,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition duration-150 enabled:hover:-translate-y-[1px] enabled:active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 motion-safe:animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            className="opacity-90"
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
});
