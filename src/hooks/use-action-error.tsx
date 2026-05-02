"use client";

import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function useActionError() {
  const { toast } = useToast();
  const router = useRouter();

  const handleError = (error: any, defaultTitle = "Error") => {
    // If the error was returned safely via withPublicErrors, it will have a serverError property
    if (error && typeof error === 'object' && 'serverError' in error) {
      error = new Error(error.serverError);
    }
    
    const message = error instanceof Error ? error.message : String(error);
    const digest = error?.digest as string | undefined;
    
    // Detect session/auth errors
    if (
      message.includes("Unauthorized") || 
      message.includes("Not authenticated") || 
      message.includes("Session expired")
    ) {
      toast({
        title: "Session Expired",
        description: "Please log in again to continue.",
        variant: "destructive",
        action: (
          <ToastAction 
            altText="Log In" 
            onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)}
          >
            Log In
          </ToastAction>
        )
      });
      return true;
    }

    // Detect email verification errors (message in dev, digest in prod)
    if (
      message.includes("verify your email") || 
      digest === '2637338380'
    ) {
      toast({
        title: "Email Verification Required",
        description: "Please verify your email address before creating content. Check your inbox or request a new link from Settings.",
        variant: "destructive",
        action: (
          <ToastAction 
            altText="Go to Settings" 
            onClick={() => router.push('/settings')}
          >
            Settings
          </ToastAction>
        )
      });
      return true;
    }

    // Detect Next.js deployment mismatch for Server Actions
    if (
      message.includes("Failed to find Server Action") ||
      message.includes("Deployment mismatch") ||
      message.includes("does not match the current deployment")
    ) {
      toast({
        title: "Platform Updated",
        description: "A new version of Tribes is available. Please copy any unsaved text and refresh the page to continue.",
        duration: 15000,
        action: (
          <ToastAction 
            altText="Refresh Page" 
            onClick={() => window.location.reload()}
          >
            Refresh
          </ToastAction>
        )
      });
      return true;
    }
    
    toast({
      title: defaultTitle,
      description: message,
      variant: "destructive",
    });
    return false;
  };

  return { handleError };
}
