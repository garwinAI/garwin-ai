import { ThemeIcon, UploadedIcon, WidgetIcon, type IconSize } from "@/components/app-icon";

export const fileUrl = (id: string) => `/api/appzone/files/${id}`;

/** An AppZone item's icon, following the icon rules for its kind. */
export function ItemIcon({ kind, name, mainColor, iconFileId, size = "md" }: { kind: string; name: string; mainColor: string; iconFileId: string | null; size?: IconSize }) {
  if (kind === "widget") return <WidgetIcon name={name} size={size} />;
  if (kind === "theme") return <ThemeIcon accent={mainColor} snapshotUrl={iconFileId ? fileUrl(iconFileId) : null} size={size} />;
  if (iconFileId) return <UploadedIcon src={fileUrl(iconFileId)} bg={mainColor} size={size} />;
  return <span aria-hidden="true" className="inline-block h-12 w-12 shrink-0 rounded-xl" style={{ backgroundColor: mainColor }} />;
}
