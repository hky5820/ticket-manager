# Transferred Tickets Implementation Plan

> Execute sequentially in the current checkout. The user specified and approved the visual treatment in the conversation.

**Goal:** Keep upcoming transferred bookings visible in the held view, with a diagonal status ribbon and dimmed content.

**Architecture:** Change presentation filtering and card styling in `management-view.js` and `management.css`. Preserve `ticketAcct`, stored transfer records, and calendar synchronization.

**Tech Stack:** Existing JavaScript modules, CSS, Playwright, GitHub Pages.

## Global Constraints

- Preserve unrelated working-tree changes and existing accounting semantics.
- Full transfer supports both `transfer.done` and per-seat `t` flags.
- Transferred cards remain clickable and selectable.

## Task 1: Presentation and release

- [x] Change the held predicate to `(a.kept>0||a.xfer>0)&&!isPast(t)` and require `ticketAcct(t).kept>0` when choosing the nearest performance.
- [x] Keep noncancelled seat labels, annotate transferred seats, and render `mg-transferred` / `mg-transfer-ribbon` for `a.xfer>0&&a.kept===0`. Render `mg-transfer-partial` for partial transfers.
- [x] Add grayscale poster, dimmed content and diagonal ribbon styles while preserving click handling.
- [x] Bump app, stylesheet and service-worker versions to v51 in `app.js`, `index.html`, and `sw.js`.
- [x] Update `tools/check-management.mjs` for visible transferred cards, stable held counts, detail opening, calendar rendering and nearest-performance exclusion.
- [x] Run `node tools/check-management.mjs` and `node tools/check-secondary.mjs`; both passed. Inspect the 390px screenshot: the ribbon remains distinct from dimmed text.
- [ ] Commit only these changes, push, and verify the deployed page shows the two transferred central second-row bookings alongside the central fourth-row booking.
