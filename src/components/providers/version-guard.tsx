"use client";

/**
 * @fileoverview Proactive version guard.
 *
 * Detects when the client bundle is stale after a server deployment,
 * and displays a persistent banner prompting the user to refresh.
 *
 * How it works:
 *   1. At build time, NEXT_PUBLIC_BUILD_ID is baked into the client bundle.
 *   2. The /api/health endpoint returns the server's buildId.
 *   3. This provider polls /api/health every 60s.
 *   4. If the IDs differ, a non-dismissable banner appears.
 *
 * This replaces the reactive "Failed to find Server Action" toast approach.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const POLL_INTERVAL_MS = 60_000; // 60 seconds
const INITIAL_DELAY_MS = 5_000;  // Wait 5s before first check

export function VersionGuard({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkVersion = useCallback(async () => {
    // Don't check in dev mode (build IDs will always be "dev-xxx")
    if (CLIENT_BUILD_ID.startsWith("dev")) return;

    try {
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;

      const data = await res.json();
      const serverBuildId = data.buildId;

      if (
        serverBuildId &&
        serverBuildId !== "unknown" &&
        serverBuildId !== CLIENT_BUILD_ID
      ) {
        setUpdateAvailable(true);
        // Stop polling once we've detected a mismatch
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch {
      // Network error, offline, etc. — silently ignore
    }
  }, []);

  useEffect(() => {
    // Initial delayed check
    const initialTimer = setTimeout(() => {
      checkVersion();
      // Start periodic polling
      timerRef.current = setInterval(checkVersion, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkVersion]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Hard refresh — bypass the service worker and browser cache
    window.location.reload();
  };

  return (
    <>
      {updateAvailable && (
        <div
          role="alert"
          className="version-guard-banner"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "linear-gradient(135deg, hsl(260, 70%, 50%), hsl(200, 80%, 45%))",
            color: "white",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            fontSize: "14px",
            fontWeight: 500,
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            animation: "vg-slideDown 0.4s ease-out",
          }}
        >
          <RefreshCw
            className={`h-4 w-4 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
          />
          <span>
            A new version of Tribes is available.
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: "6px",
              color: "white",
              padding: "4px 14px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isRefreshing ? "wait" : "pointer",
              transition: "background 0.2s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.35)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
            }
          >
            {isRefreshing ? "Refreshing…" : "Refresh Now"}
          </button>

          {/* Inline animation keyframes */}
          <style>{`
            @keyframes vg-slideDown {
              from { transform: translateY(-100%); opacity: 0; }
              to   { transform: translateY(0);     opacity: 1; }
            }
            .version-guard-banner + * {
              padding-top: 44px;
            }
          `}</style>
        </div>
      )}
      {/* Push content down when banner is visible */}
      {updateAvailable && <div style={{ height: "44px", flexShrink: 0 }} />}
      {children}
    </>
  );
}
