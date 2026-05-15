"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

// ── Context ──────────────────────────────────────────────────────────────
const ResponsivePopoverContext = React.createContext(false)

function useIsDrawerMode() {
  return React.useContext(ResponsivePopoverContext)
}

// ── Components ───────────────────────────────────────────────────────────

interface ResponsivePopoverProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const ResponsivePopover = ({ children, open, onOpenChange }: ResponsivePopoverProps) => {
  const isMobile = useIsMobile()

  return (
    <ResponsivePopoverContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} modal={true}>
          {children}
        </Drawer>
      ) : (
        <Popover open={open} onOpenChange={onOpenChange}>
          {children}
        </Popover>
      )}
    </ResponsivePopoverContext.Provider>
  )
}

const ResponsivePopoverTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    return <DrawerTrigger asChild={asChild}>{children}</DrawerTrigger>
  }

  return <PopoverTrigger asChild={asChild}>{children}</PopoverTrigger>
}

const ResponsivePopoverContent = ({ 
  children, 
  align = "center", 
  className,
  side = "top",
  sideOffset = 4
}: { 
  children: React.ReactNode, 
  align?: "start" | "center" | "end", 
  className?: string,
  side?: "top" | "bottom" | "left" | "right",
  sideOffset?: number
}) => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    return (
      <DrawerContent className={cn("px-2 pt-1 pb-safe", className)}>
        <DrawerTitle className="sr-only">Options</DrawerTitle>
        <div className="flex flex-col py-2">
          {children}
        </div>
      </DrawerContent>
    )
  }

  return (
    <PopoverContent align={align} side={side} sideOffset={sideOffset} className={className}>
      {children}
    </PopoverContent>
  )
}

export {
  ResponsivePopover,
  ResponsivePopoverTrigger,
  ResponsivePopoverContent,
}
