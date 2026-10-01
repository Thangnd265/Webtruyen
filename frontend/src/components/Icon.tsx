import type { LucideIcon } from "lucide-react";

export function Icon({ icon: Glyph, size = 20, label }: { icon: LucideIcon; size?: number; label?: string }) {
  return <Glyph size={size} strokeWidth={1.8} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} focusable="false" />;
}
