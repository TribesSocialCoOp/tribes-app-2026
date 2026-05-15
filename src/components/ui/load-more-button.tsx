/**
 * @fileoverview Standardized "Load More" button with loading state.
 * Used consistently across all paginated feeds and lists.
 */

import * as React from "react";
import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LoadMoreButtonProps {
  /** Called when the user clicks to load more items. */
  onClick: () => void | Promise<void>;
  /** Whether a load is currently in progress. */
  isLoading?: boolean;
  /** Whether there are more items to load. When false, the button hides. */
  hasMore?: boolean;
  /** Optional total count for display. */
  totalCount?: number;
  /** Number of currently loaded items, for "showing X of Y" display. */
  loadedCount?: number;
  /** Custom label. Default: "Load More" */
  label?: string;
  /** Additional className */
  className?: string;
}

export function LoadMoreButton({
  onClick,
  isLoading = false,
  hasMore = true,
  totalCount,
  loadedCount,
  label = "Load More",
  className,
}: LoadMoreButtonProps) {
  if (!hasMore && !isLoading) {
    // Show a subtle "end of list" indicator instead of nothing
    return (
      <div className={cn("flex justify-center py-4", className)}>
        <p className="text-xs text-muted-foreground/60">
          {totalCount !== undefined && loadedCount !== undefined
            ? `Showing all ${loadedCount} items`
            : "You\u2019re all caught up"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-4", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isLoading}
        className="min-w-[140px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <ChevronDown className="mr-2 h-4 w-4" />
            {label}
          </>
        )}
      </Button>
      {totalCount !== undefined && loadedCount !== undefined && (
        <p className="text-[11px] text-muted-foreground/60">
          Showing {loadedCount} of {totalCount}
        </p>
      )}
    </div>
  );
}
