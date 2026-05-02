/**
 * GET /api/internal/session-check?sessionId=<id>
 *
 * INTERNAL ONLY — called by the proxy.ts (middleware) to verify that a
 * session has not been revoked in the database.
 *
 * SECURITY:
 *   - Protected by INTERNAL_API_SECRET (shared secret).
 *   - Must NOT be exposed to the public internet.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export async function GET(request: NextRequest) {
    // Fail closed if secret is not configured
    if (!INTERNAL_SECRET) {
        console.error(
            "[internal/session-check] INTERNAL_API_SECRET not set — denying all requests"
        );
        return NextResponse.json({ valid: false, error: "Unauthorized" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${INTERNAL_SECRET}`) {
        return NextResponse.json({ valid: false, error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId || typeof sessionId !== "string" || sessionId.length > 128) {
        return NextResponse.json(
            { valid: false, error: "Missing or invalid sessionId" },
            { status: 400 }
        );
    }

    try {
        const [dbSession] = await db
            .select({ revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
            .from(sessions)
            .where(eq(sessions.id, sessionId))
            .limit(1);

        if (!dbSession) {
            return NextResponse.json({ valid: false, reason: "Session not found" });
        }

        if (dbSession.revokedAt) {
            return NextResponse.json({ valid: false, reason: "Session revoked" });
        }

        if (dbSession.expiresAt && dbSession.expiresAt < new Date()) {
            return NextResponse.json({ valid: false, reason: "Session expired" });
        }

        return NextResponse.json({ valid: true });
    } catch (err) {
        console.error("[internal/session-check] DB error:", err);
        return NextResponse.json({ valid: false, error: "Internal error" }, { status: 500 });
    }
}
