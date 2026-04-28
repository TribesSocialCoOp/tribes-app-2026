# Architecture Decisions

## [AD-001] Mobile Compose UX Transition
**Date**: 2026-04-27
**Status**: Decided

### Context
The original mobile design used a Floating Action Button (FAB) that opened a full-screen modal or bottom sheet for post composition. This pattern felt disconnected from the feed-centric nature of the application and introduced unnecessary friction for quick updates.

### Decision
We are moving away from the FAB-based compose pattern on mobile in favor of a persistent, inline `ComposeBox` card at the top of the feed (Your Comms and Tribe feeds). 

### Consequences
- `ComposeFAB` has been removed from the global layout.
- `ComposeBox` is now injected directly into the scrollable feed area.
- Improved focus on content creation as part of the feed consumption flow.
- Reduced modal overhead and improved responsiveness on small viewports.

## [AD-002] Multi-Image Post Support
**Date**: 2026-04-27
**Status**: Decided

### Context
Users requested the ability to share multiple images in a single post, a standard feature in modern social platforms. The existing schema only supported a single `imageUrl` string.

### Decision
- Added `imageUrls` (JSON array of strings) to the `posts` table.
- Maintained legacy `imageUrl` for backward compatibility (points to the first image in the array).
- Updated `ComposeBox` to support multiple file uploads with a preview grid.
- Implemented membership-based upload limits:
  - `Human_Free`: 1 image
  - `Human_Paid` / `Human_Member`: 4 images
  - `Creator` / `Admin`: 10 images
- Refactored post cards (`TribePostCard`, `IntercomFeedItem`) to render responsive image grids.

### Consequences
- Richer media sharing capabilities.
- Clear monetization path via tiered upload limits.
- Database schema now supports structured multi-media payloads.
