"use client";

import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function useActionError() {
  const { toast } = useToast();
  const router = useRouter();

  const handleError = (error: any, defaultTitle = "Error") => {
    const message = error instanceof Error ? error.message : String(error);
    
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
    
    toast({
      title: defaultTitle,
      description: message,
      variant: "destructive",
    });
    return false;
  };

  return { handleError };
}
