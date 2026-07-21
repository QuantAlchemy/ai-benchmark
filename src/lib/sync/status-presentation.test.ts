import { describe, expect, it } from "vitest";
import { getSyncPresentation } from "./status-presentation";

describe("synchronization status presentation", () => {
  it("distinguishes an unconfigured, never-synced, failed, queued, and healthy installation", () => {
    expect(getSyncPresentation({ configured: false, lastSyncAt: null, lastError: null, failedOperations: 0, pendingOperations: 0 })).toEqual({ label: "offline only", variant: "outline" });
    expect(getSyncPresentation({ configured: true, lastSyncAt: null, lastError: null, failedOperations: 0, pendingOperations: 0 })).toEqual({ label: "not yet synchronized", variant: "secondary" });
    expect(getSyncPresentation({ configured: true, lastSyncAt: null, lastError: "offline", failedOperations: 0, pendingOperations: 0 })).toEqual({ label: "sync error", variant: "warning" });
    expect(getSyncPresentation({ configured: true, lastSyncAt: null, lastError: null, failedOperations: 2, pendingOperations: 2 })).toEqual({ label: "2 failed", variant: "warning" });
    expect(getSyncPresentation({ configured: true, lastSyncAt: "2026-07-20T00:00:00.000Z", lastError: null, failedOperations: 0, pendingOperations: 3 })).toEqual({ label: "3 queued", variant: "secondary" });
    expect(getSyncPresentation({ configured: true, lastSyncAt: "2026-07-20T00:00:00.000Z", lastError: null, failedOperations: 0, pendingOperations: 0 })).toEqual({ label: "synced", variant: "success" });
  });
});
