import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    "border-[rgb(var(--border-hairline))] bg-[rgb(var(--bg-subtle))] text-[rgb(var(--text-secondary))]",
  accent:
    "border-[rgb(var(--accent)/0.25)] bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent-soft-ink))]",
  success:
    "border-[rgb(var(--status-success-border))] bg-[rgb(var(--status-success-bg))] text-[rgb(var(--status-success-fg))]",
  warning:
    "border-[rgb(var(--status-warning-border))] bg-[rgb(var(--status-warning-bg))] text-[rgb(var(--status-warning-fg))]",
  danger:
    "border-[rgb(var(--status-danger-border))] bg-[rgb(var(--status-danger-bg))] text-[rgb(var(--status-danger-fg))]",
};

export function Badge({ tone = "neutral", children, className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
