import type { Permission } from "@/db/schema/accounts";

/** Human labels for the permission editor, grouped by app. */
export const PERMISSION_GROUPS: { app: string; items: { id: Permission; label: string }[] }[] = [
  {
    app: "Storage",
    items: [
      { id: "storage.view", label: "View files and folders" },
      { id: "storage.upload", label: "Upload and create folders" },
      { id: "storage.mark_for_deletion", label: "Mark items for deletion" },
    ],
  },
  { app: "Calendar", items: [{ id: "calendar.view", label: "View calendar" }, { id: "calendar.edit", label: "Create and edit events" }] },
  { app: "Contacts", items: [{ id: "contacts.view", label: "View contacts" }, { id: "contacts.edit", label: "Add and edit contacts" }] },
  { app: "Messages", items: [{ id: "messages.use", label: "Message the host and team" }] },
  { app: "Apps", items: [{ id: "apps.use", label: "Use the workspace's apps" }, { id: "appzone.install", label: "Add items from AppZone" }] },
  { app: "Billing", items: [{ id: "billing.view", label: "View the plan (never change it)" }] },
];
