
import type { SVGProps } from 'react';

export function AppLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="currentColor" // Assuming you want the SVG to inherit color, or you'll style it via props/CSS
      aria-hidden="true"
      {...props}
    >
      {/* User-provided SVG structure */}
      <path d="M50,5 L20,25 L20,75 L50,95 L80,75 L80,25 Z" stroke="currentColor" strokeWidth="5" fill="none" />
      <path d="M50,5 L50,50 M20,25 L50,50 M20,75 L50,50 M80,75 L50,50 M80,25 L50,50" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="50" r="10" fill="currentColor" />
    </svg>
  );
}
