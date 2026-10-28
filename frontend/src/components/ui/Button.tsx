import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const variants = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  gold: "bg-accent text-accent-fg hover:brightness-105 shadow-sm",
  secondary: "border border-line bg-surface text-foreground hover:bg-surface-2",
  ghost: "text-foreground hover:bg-foreground/5",
  danger: "bg-danger text-white hover:opacity-90",
} as const;
const sizes = { sm: "min-h-9 px-3 text-sm", md: "min-h-11 px-5 text-sm", lg: "min-h-12 px-6 text-base" } as const;

type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string };
const classes = ({ variant = "primary", size = "md", className = "" }: Style) => `${base} ${variants[variant]} ${sizes[size]} ${className}`;

export function Button({ variant, size, className, type = "button", ...props }: Style & ComponentProps<"button">) {
  return <button type={type} className={classes({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: Style & ComponentProps<typeof Link>) {
  return <Link className={classes({ variant, size, className })} {...props} />;
}
