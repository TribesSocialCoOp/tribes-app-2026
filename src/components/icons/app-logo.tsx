import Image from 'next/image';

interface AppLogoProps {
  className?: string; // For additional styling like margins
  width?: number;
  height?: number;
  alt?: string;
}

export function AppLogo({
  className,
  width = 32, // Default width if not specified
  height = 32, // Default height if not specified
  alt = "App Logo"
}: AppLogoProps) {
  return (
    <Image
      src="/app-logo.png" // IMPORTANT: Place your PNG at /public/app-logo.png
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority // Often good for LCP elements like logos
    />
  );
}
