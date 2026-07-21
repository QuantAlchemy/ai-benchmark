export type SyncPresentationInput = {
  configured: boolean;
  pendingOperations: number;
  failedOperations: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type SyncPresentation = {
  label: string;
  variant: "outline" | "warning" | "secondary" | "success";
};

export function getSyncPresentation(status: SyncPresentationInput): SyncPresentation {
  if (!status.configured) return { label: "offline only", variant: "outline" };
  if (status.lastError) return { label: "sync error", variant: "warning" };
  if (status.failedOperations > 0) return { label: `${status.failedOperations} failed`, variant: "warning" };
  if (status.pendingOperations > 0) return { label: `${status.pendingOperations} queued`, variant: "secondary" };
  if (status.lastSyncAt === null) return { label: "not yet synchronized", variant: "secondary" };
  return { label: "synced", variant: "success" };
}
