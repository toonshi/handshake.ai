import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-white text-black hover:bg-[#ededed] disabled:opacity-40",
  secondary:
    "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-hover)] hover:text-white disabled:opacity-40",
  ghost:
    "text-[var(--muted)] hover:text-white hover:bg-[var(--surface)] disabled:opacity-40",
  success:
    "bg-[var(--success)] text-black hover:bg-[#22c55e] disabled:opacity-40 shadow-[0_0_24px_rgba(74,222,128,0.25)]",
  danger:
    "bg-[#450a0a] border border-[#7f1d1d] text-[#f87171] hover:border-[#991b1b] disabled:opacity-40",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", fullWidth, className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 font-medium text-sm rounded-xl py-2.5 px-4 transition-all disabled:cursor-not-allowed ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = "Button";
