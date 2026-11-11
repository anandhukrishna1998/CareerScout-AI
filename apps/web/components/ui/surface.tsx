import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export type SurfaceVariant = "elevated" | "subtle" | "hero";
export type SurfaceRadius = "lg" | "xl" | "2xl" | "3xl";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  elevated: "bg-surface border border-hairline shadow-botanical",
  subtle: "bg-subtle border border-hairline",
  hero: "relative bg-surface border border-hairline shadow-botanical",
};

const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
};

export function Surface({
  variant = "elevated",
  radius = "2xl",
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <div className={clsx(VARIANT_CLASSES[variant], RADIUS_CLASSES[radius], className)} {...props}>
      {children}
    </div>
  );
}
