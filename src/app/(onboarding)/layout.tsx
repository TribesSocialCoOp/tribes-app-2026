import { AppLogo } from "@/components/icons/app-logo";
import { Card } from "@/components/ui/card";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4 sm:p-8">
      <div className="mb-8">
        <AppLogo width={64} height={64} />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        {children}
      </Card>
    </div>
  );
}
