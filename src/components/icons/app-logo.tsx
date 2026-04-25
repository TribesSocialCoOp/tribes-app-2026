
import { Tent } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string; // For additional styling like margins
  width?: number;
  height?: number;
  alt?: string;
}

export function AppLogo({
  className,
  width = 32,
  height = 32,
}: AppLogoProps) {
  return (
    <Tent
      width={width}
      height={height}
      className={cn("text-primary shrink-0", className)}
      strokeWidth={2}
    />
  );
}
