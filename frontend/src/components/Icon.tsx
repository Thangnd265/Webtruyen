import type { LucideIcon } from "lucide-react";

export function Icon({ icon: Glyph, size = 20, label, className }: { icon: LucideIcon; size?: number; label?: string; className?: string }) {
  return <Glyph size={size} strokeWidth={1.8} className={className} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} focusable="false" />;
}
