"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

/**
 * Inline SVG defining a rounded-corner hexagon clip path.
 * Rendered once (hidden), referenced by all Avatar instances via clip-path: url(#hex-clip).
 *
 * Flat-topped hexagon with quadratic bezier rounded corners.
 * Uses objectBoundingBox units (0–1) so it scales to any avatar size.
 *
 * Regular flat-topped hex vertices:
 *   V0 (top-center):     (0.50,  0.00)
 *   V1 (top-right):      (0.933, 0.25)
 *   V2 (bottom-right):   (0.933, 0.75)
 *   V3 (bottom-center):  (0.50,  1.00)
 *   V4 (bottom-left):    (0.067, 0.75)
 *   V5 (top-left):       (0.067, 0.25)
 */
function HexClipDef() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <clipPath id="hex-clip" clipPathUnits="objectBoundingBox">
          <path d={
            // Each edge: L to ~90% of the way to the next vertex,
            // then Q curve through the vertex to ~10% of the following edge.
            // This creates soft rounded corners at each of the 6 vertices.
            [
              'M 0.465 0.025',           // top edge, approaching V0 from V5 side
              'Q 0.50 0.00, 0.535 0.025', // round V0 (top center)
              'L 0.895 0.225',            // right-upper edge toward V1
              'Q 0.933 0.25, 0.933 0.29', // round V1 (top right)
              'L 0.933 0.71',             // right edge toward V2
              'Q 0.933 0.75, 0.895 0.775',// round V2 (bottom right)
              'L 0.535 0.975',            // bottom-right edge toward V3
              'Q 0.50 1.00, 0.465 0.975', // round V3 (bottom center)
              'L 0.105 0.775',            // bottom-left edge toward V4
              'Q 0.067 0.75, 0.067 0.71', // round V4 (bottom left)
              'L 0.067 0.29',             // left edge toward V5
              'Q 0.067 0.25, 0.105 0.225',// round V5 (top left)
              'Z'
            ].join(' ')
          } />
        </clipPath>
      </defs>
    </svg>
  )
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <>
    <HexClipDef />
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden [clip-path:url(#hex-clip)]",
        className
      )}
      {...props}
    />
  </>
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
      "flex h-full w-full items-center justify-center bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
