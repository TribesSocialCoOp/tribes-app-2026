import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NsfwBadgeProps {
  /** Show the ShieldAlert icon before the label. */
  icon?: boolean;
  /** Badge text. Defaults to "18+"; tribe cards pass "NSFW". */
  label?: string;
  /** Extra classes for sizing/spacing (call sites set text size, padding). */
  className?: string;
}

/**
 * Adult-content badge (issue #32) — the one destructive badge used wherever an NSFW
 * tribe is surfaced (search results, tribe cards, discovery). Label defaults to "18+".
 */
export function NsfwBadge({ icon = false, label = "18+", className }: NsfwBadgeProps) {
  return (
    <Badge variant="destructive" className={cn(className)}>
      {icon ? <><ShieldAlert className="h-3 w-3 mr-1" /> {label}</> : label}
    </Badge>
  );
}
