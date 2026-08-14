import type * as React from "react"

export function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined | null>
): React.RefCallback<T> {
  return (node: T) => {
    refs.forEach((ref) => {
      if (!ref) return
      if (typeof ref === "function") {
        ref(node)
      } else {
        ;(ref as React.MutableRefObject<T | null>).current = node
      }
    })
  }
}

export function focusContentOnOpen(ref: React.RefObject<HTMLElement | null>) {
  return (event: Event) => {
    event.preventDefault()
    ref.current?.focus({ preventScroll: true })
  }
}
