"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

// ── Context ──────────────────────────────────────────────────────────────
// The parent ResponsiveMenu determines the mode ONCE via useIsMobile().
// All children read from context instead of calling the hook independently.
// This prevents a desync where a child renders <DrawerTrigger> while the
// parent still wraps <DropdownMenu> (or vice-versa) during hydration,
// which crashes with "DialogTrigger must be used within Dialog".

const ResponsiveMenuContext = React.createContext(false)

function useIsDrawerMode() {
  return React.useContext(ResponsiveMenuContext)
}

// ── Components ───────────────────────────────────────────────────────────

interface ResponsiveMenuProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const ResponsiveMenu = ({ children, open, onOpenChange }: ResponsiveMenuProps) => {
  const isMobile = useIsMobile()

  return (
    <ResponsiveMenuContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} modal={false}>
          {children}
        </Drawer>
      ) : (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
          {children}
        </DropdownMenu>
      )}
    </ResponsiveMenuContext.Provider>
  )
}

const ResponsiveMenuTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    return <DrawerTrigger asChild={asChild}>{children}</DrawerTrigger>
  }

  return <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
}

const ResponsiveMenuContent = ({ children, align = "end", className }: { children: React.ReactNode, align?: "start" | "center" | "end", className?: string }) => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    return (
      <DrawerContent className={cn("px-2 pt-1 pb-safe", className)}>
        <DrawerTitle className="sr-only">Actions</DrawerTitle>
        <div className="flex flex-col py-1">
          {children}
        </div>
      </DrawerContent>
    )
  }

  return <DropdownMenuContent align={align} className={className}>{children}</DropdownMenuContent>
}

interface ResponsiveMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const ResponsiveMenuItem = ({ children, className, onClick, disabled, ...props }: ResponsiveMenuItemProps) => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    const button = (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex w-full items-center rounded-lg px-3 py-3 text-sm font-medium transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none",
          className
        )}
        onClick={(e) => {
          onClick?.()
        }}
        {...props}
      >
        {children}
      </button>
    )

    // Don't wrap disabled items in DrawerClose — tapping a disabled
    // item should NOT dismiss the drawer.
    if (disabled) {
      return button
    }

    return (
      <DrawerClose asChild>
        {button}
      </DrawerClose>
    )
  }

  return (
    <DropdownMenuItem className={className} onClick={onClick} disabled={disabled}>
      {children}
    </DropdownMenuItem>
  )
}

const ResponsiveMenuSeparator = () => {
  const isDrawer = useIsDrawerMode()

  if (isDrawer) {
    return <div className="my-1 mx-3 h-px bg-border/50" />
  }

  return <DropdownMenuSeparator />
}

export {
  ResponsiveMenu,
  ResponsiveMenuTrigger,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
}
