"use client";

import React from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader,
  DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription,
  DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader,
  SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription,
  SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from '@/lib/utils';

/**
 * ResponsiveDialog — renders as a Dialog on desktop and a bottom Sheet on mobile.
 * Eliminates the duplicated Sheet/Dialog aliasing boilerplate across all 10 dialog components.
 */

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Desktop max-width class. Default: "sm:max-w-lg" */
  className?: string;
}

export function ResponsiveDialog({ open, onOpenChange, children, className }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <ShadSheetContent side="bottom" className="h-auto max-h-[90vh] flex flex-col p-0">
          <ScrollArea className="flex-1">
            <div className="p-4 sm:p-6">
              {children}
            </div>
          </ScrollArea>
        </ShadSheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ShadDialogContent className={cn("p-6", className || "sm:max-w-lg")}>
        {children}
      </ShadDialogContent>
    </Dialog>
  );
}

// Re-export responsive sub-components so dialogs don't need conditional aliases
export function ResponsiveDialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  const Component = isMobile ? ShadSheetHeader : ShadDialogHeader;
  return <Component className={className}>{children}</Component>;
}

export function ResponsiveDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  const Component = isMobile ? ShadSheetTitle : ShadDialogTitle;
  return <Component className={className}>{children}</Component>;
}

export function ResponsiveDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  const Component = isMobile ? ShadSheetDescription : ShadDialogDescription;
  return <Component className={className}>{children}</Component>;
}

export function ResponsiveDialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  const Component = isMobile ? ShadSheetFooter : ShadDialogFooter;
  return <Component className={className}>{children}</Component>;
}
