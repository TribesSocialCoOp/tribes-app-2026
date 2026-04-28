/**
 * GET /api/internal/bond-partners?userId=<id>
 *
 * INTERNAL ONLY — called by the ws-relay to verify that a sender has an
 * active bond with a target user before routing messages.
 *
 * SECURITY:
 *   - Protected by INTERNAL_API_SECRET (shared secret between app + ws-relay).
 *   - Must NOT be exposed to the public internet. Caddy/nginx should block
 *     external access to /api/internal/* at the reverse-proxy layer.
 *   - Returns only the set of active bond partner IDs for the given userId.
 *
 * Schema note:
 *   The `bonds` table is directional — each accepted bond creates TWO rows,
 *   one for each side (userId → targetId). A bond record existing with
 *   targetType='user' means the relationship is active (no separate status col).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { bonds } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export async function GET(request: NextRequest) {
    // Fail closed if secret is not configured
    if (!INTERNAL_SECRET) {
        console.error(
            "[internal/bond-partners] INTERNAL_API_SECRET not set — denying all requests"
        );
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${INTERNAL_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId || typeof userId !== "string" || userId.length > 128) {
        return NextResponse.json(
            { error: "Missing or invalid userId" },
            { status: 400 }
        );
    }

    try {
        // Fetch all user-type bonds for this userId.
        // Each accepted bond creates a row: userId → targetId (targetType='user').
        // The existence of the row means the bond is active.
        const userBonds = await db
            .select({ targetId: bonds.targetId })
            .from(bonds)
            .where(
                and(
                    eq(bonds.userId, userId),
                    eq(bonds.targetType, "user")
                )
            );

        const partnerIds = userBonds.map((b) => b.targetId);

        return NextResponse.json({ partnerIds });
    } catch (err) {
        console.error("[internal/bond-partners] DB error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
