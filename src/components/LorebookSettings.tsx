"use client";

import { useState, useEffect } from "react";
import { DrawerLayout, ButtonIcon, Icon, Spinner, ToastStack } from "@applicator/sdk/components";
import type { AppView, SettingsTab } from "../apps/Lorekeeper";
import DetailsTab from "./settings/DetailsTab";
import MetadataTab from "./settings/MetadataTab";
import MembershipTab from "./settings/MembershipTab";
import DeleteTab from "./settings/DeleteTab";
import ExportImportTab from "./settings/ExportImportTab";

interface Lorebook {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  accessLevel: string;
}

interface Props {
  lorebookId: string;
  tab: SettingsTab;
  navigate: (v: AppView) => void;
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "details", label: "Details", icon: "edit" },
  { id: "metadata", label: "Lore Metadata", icon: "library" },
  { id: "membership", label: "Membership", icon: "users" },
  { id: "export-import", label: "Export / Import", icon: "download" },
  { id: "delete", label: "Delete", icon: "trash" },
];

export default function LorebookSettings({ lorebookId, tab, navigate }: Props) {
  const [lorebook, setLorebook] = useState<Lorebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<any[]>([]);
  const [navOpen, setNavOpen] = useState(true);

  const addToast = (message: string, type: "success" | "error" = "success") => {
    setToasts((t) => [...t, { message, type }]);
  };
  const removeToast = (index: number) => setToasts((t) => t.filter((_, i) => i !== index));

  useEffect(() => {
    fetch(`/api/lorekeeper/lorebooks/${lorebookId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setLorebook(d); setLoading(false); });
  }, [lorebookId]);

  const onLorebookUpdated = (updated: Lorebook) => {
    setLorebook(updated);
    addToast("Saved");
  };

  const canManage = lorebook?.accessLevel === "owner" || lorebook?.accessLevel === "manager";
  const isOwner = lorebook?.accessLevel === "owner";

  const navContent = (
    <div style={{ padding: "8px 0" }}>
      {TABS.map((t) => {
        const active = t.id === tab;
        const isDanger = t.id === "delete";
        if (t.id === "membership" && !canManage) return null;
        if (t.id === "export-import" && !canManage) return null;
        if (t.id === "delete" && !isOwner) return null;
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              cursor: "pointer",
              background: active ? "#1e3a5f" : "transparent",
              color: active ? "#93c5fd" : isDanger ? "#ef4444" : "#94a3b8",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#1a2e47"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            onClick={() => navigate({ type: "settings", lorebookId, tab: t.id })}
          >
            <Icon name={(t.icon as any)} size={14} />
            <span style={{ fontSize: 13 }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", background: "#0f172a" }}><Spinner /></div>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f172a" }}>
      {/* Top header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      }}>
        <ButtonIcon name="chevron-left" label="Back to lorebook" onClick={() => navigate({ type: "lorebook", lorebookId })} />
        <div style={{
          width: 24, height: 24, borderRadius: 4, overflow: "hidden",
          background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {lorebook?.hasIcon ? (
            <img src={`/api/lorekeeper/lorebooks/${lorebookId}/icon`} style={{ width: 24, height: 24, objectFit: "cover" }} alt="" />
          ) : (
            <span style={{ color: "#64748b" }}><Icon name="library" size={12} /></span>
          )}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{lorebook?.name}</span>
        <span style={{ fontSize: 13, color: "#64748b" }}>— Settings</span>
      </div>

      {/* Drawer layout with settings nav */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <DrawerLayout
          style={{ height: "100%" }}
          rounded={false}
          leftPanel={{
            open: navOpen,
            type: "inline",
            pixelWidth: 200,
            closeable: true,
            openable: true,
            iconName: "hamburger",
            scrollable: true,
            background: "#0c1a2e",
            onClose: () => setNavOpen(false),
            onOpen: () => setNavOpen(true),
            children: navContent,
          }}
        >
          <div style={{ height: "100%", overflowY: tab === "metadata" ? "hidden" : "auto", padding: tab === "metadata" ? 0 : "24px" }}>
            {tab === "details" && lorebook && (
              <DetailsTab lorebook={lorebook} lorebookId={lorebookId} onUpdated={onLorebookUpdated} addToast={addToast} />
            )}
            {tab === "metadata" && (
              <MetadataTab lorebookId={lorebookId} canEdit={lorebook?.accessLevel === "owner" || lorebook?.accessLevel === "manager" || lorebook?.accessLevel === "edit"} addToast={addToast} />
            )}
            {tab === "membership" && canManage && (
              <MembershipTab lorebookId={lorebookId} isOwner={isOwner} addToast={addToast} navigate={navigate} />
            )}
            {tab === "export-import" && canManage && (
              <ExportImportTab lorebookId={lorebookId} lorebookName={lorebook?.name || ""} addToast={addToast} onImported={() => navigate({ type: "lorebook", lorebookId })} />
            )}
            {tab === "delete" && isOwner && (
              <DeleteTab lorebookId={lorebookId} lorebookName={lorebook?.name || ""} onDeleted={() => navigate({ type: "lorebooks" })} addToast={addToast} />
            )}
          </div>
        </DrawerLayout>
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}
