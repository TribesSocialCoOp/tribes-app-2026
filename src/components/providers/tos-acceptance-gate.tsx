"use client";

/**
 * @fileoverview TOS Acceptance Gate
 *
 * Renders a non-dismissible dialog for authenticated users who have not
 * accepted the latest Terms of Service version. If the user declines,
 * their session is destroyed (logout).
 */

import React, { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ScrollText, LogOut } from "lucide-react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { acceptTermsOfService, getLatestTosVersion } from "@/lib/actions/legal-actions";
import { useToast } from "@/hooks/use-toast";

export function TosAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isUserLoading, refresh } = useUser();
  const { toast } = useToast();

  const [tosData, setTosData] = useState<{
    version: string;
    effectiveDate: string;
    content: string;
  } | null>(null);
  const [isLoadingTos, setIsLoadingTos] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);

  // Check if the user needs to accept TOS
  useEffect(() => {
    if (isUserLoading || !user) return;

    let cancelled = false;

    async function checkTos() {
      setIsLoadingTos(true);
      try {
        const latest = await getLatestTosVersion();
        if (cancelled) return;

        if (user!.tosAcceptedVersion !== latest.version) {
          setTosData(latest);
          setNeedsAcceptance(true);
        } else {
          setNeedsAcceptance(false);
        }
      } catch (err) {
        console.error("[tos-gate] Failed to check TOS version:", err);
      } finally {
        if (!cancelled) setIsLoadingTos(false);
      }
    }

    checkTos();
    return () => { cancelled = true; };
  }, [user, isUserLoading]);

  async function handleAccept() {
    if (!tosData) return;
    setIsAccepting(true);
    try {
      const result = await acceptTermsOfService(tosData.version);
      if (result.success) {
        setNeedsAcceptance(false);
        refresh(); // Update user context with new tosAcceptedVersion
        toast({
          title: "Terms Accepted",
          description: `You have agreed to Terms of Service v${tosData.version}.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to record acceptance.",
        });
      }
    } catch (err) {
      console.error("[tos-gate] Accept failed:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleDecline() {
    setIsLoggingOut(true);
    try {
      // Destroy session by calling the logout action
      const { logoutAction } = await import("@/lib/auth-actions");
      await logoutAction();
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  }

  // Don't gate if loading, not logged in, or already accepted
  if (isUserLoading || !user || isLoadingTos || !needsAcceptance) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Render children behind the modal so layout doesn't jump */}
      {children}

      <Dialog open={needsAcceptance} onOpenChange={() => { /* non-dismissible */ }}>
        <DialogContent
          className="max-w-2xl !max-h-[90vh] flex flex-col gap-4 overflow-hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          hideCloseButton
        >
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ScrollText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Updated Terms of Service
                </DialogTitle>
                <DialogDescription>
                  Version {tosData?.version} — Effective{" "}
                  {tosData?.effectiveDate &&
                    new Date(tosData.effectiveDate + "T00:00:00").toLocaleDateString(
                      "en-US",
                      { year: "numeric", month: "long", day: "numeric" }
                    )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable content area with proper markdown rendering */}
          <div className="min-h-0 flex-1 border rounded-md bg-muted/20 overflow-hidden">
            <div className="h-[55vh] overflow-y-auto px-5 py-4 overscroll-contain">
              <MarkdownContent content={tosData?.content ?? ""} />
            </div>
          </div>

          <div className="flex items-start gap-3 shrink-0">
            <Checkbox
              id="tos-agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="tos-agree"
              className="text-sm leading-relaxed cursor-pointer"
            >
              I have read and agree to the{" "}
              <a href="/terms" target="_blank" className="text-primary underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" className="text-primary underline">
                Privacy Policy
              </a>
              .
            </label>
          </div>

          <DialogFooter className="shrink-0 flex-row gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={handleDecline}
              disabled={isAccepting || isLoggingOut}
              className="text-muted-foreground"
            >
              {isLoggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Decline & Sign Out
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!agreed || isAccepting || isLoggingOut}
              className="bg-primary hover:bg-primary/90"
            >
              {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Accept Terms
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
