// Remote view (Admin support access) settings shared by services, pages and tests.

/** How long an accepted remote view lasts. The database caps it at 24 hours. */
export const REMOTE_VIEW_MINUTES = 60;

/** What an accepted remote view lets the Admin SEE. Nothing can be changed. */
export const REMOTE_VIEW_SCOPES = ["account.view", "storage.view", "apps.view", "messages.view", "notifications.view"] as const;

export const REMOTE_VIEW_SECTIONS = ["overview", "storage", "apps", "messages", "notifications"] as const;
export type RemoteViewSection = (typeof REMOTE_VIEW_SECTIONS)[number];

export const SECTION_LABELS: Record<RemoteViewSection, string> = {
  overview: "Account",
  storage: "Storage",
  apps: "Apps",
  messages: "Messages",
  notifications: "Notifications",
};
