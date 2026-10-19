import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

// Primary is an inverted pill: the accent is for data, never for buttons.
const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-white disabled:bg-raised disabled:text-ink-3",
  secondary: "bg-raised text-ink hover:bg-hover disabled:text-ink-3",
  outline: "border border-line-strong text-ink hover:bg-raised disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink disabled:text-ink-3 disabled:hover:bg-transparent",
  danger: "bg-danger-soft text-danger hover:bg-danger/20 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

const iconSize: Record<Size, number> = { sm: 15, md: 16, lg: 18 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium",
        "transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.97] disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={iconSize[size]} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={iconSize[size]} strokeWidth={2} aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconClassName?: string;
}

const iconButtonSizes: Record<Size, string> = { sm: "size-8", md: "size-9", lg: "size-11" };

export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  loading,
  className,
  iconClassName,
  type = "button",
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.92] disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        iconButtonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
      ) : (
        <Icon size={size === "lg" ? 19 : size === "md" ? 17 : 16} strokeWidth={2} className={iconClassName} aria-hidden />
      )}
    </button>
  );
}
