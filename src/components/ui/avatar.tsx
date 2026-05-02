"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

/**
 * Inline SVG defining a rounded-corner hexagon mask.
 * Rendered as a CSS mask-image so it scales to any avatar size without DOM injection.
 */
const hexMaskUrl = "data:image/svg+xml,%3Csvg viewBox='0 0 1 1' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 0.465 0.025 Q 0.50 0.00, 0.535 0.025 L 0.895 0.225 Q 0.933 0.25, 0.933 0.29 L 0.933 0.71 Q 0.933 0.75, 0.895 0.775 L 0.535 0.975 Q 0.50 1.00, 0.465 0.975 L 0.105 0.775 Q 0.067 0.75, 0.067 0.71 L 0.067 0.29 Q 0.067 0.25, 0.105 0.225 Z' fill='black'/%3E%3C/svg%3E";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden",
      className
    )}
    style={{
      ...style,
      WebkitMaskImage: `url("${hexMaskUrl}")`,
      maskImage: `url("${hexMaskUrl}")`,
      WebkitMaskSize: "contain",
      maskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
    }}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center bg-muted leading-none",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
