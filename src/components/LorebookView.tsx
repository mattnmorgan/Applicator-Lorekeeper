"use client";

import { useState, useEffect, useCallback } from "react";
import { DrawerLayout, ButtonIcon, Icon, Spinner, ToastStack } from "@applicator/sdk/components";
import type { AppView } from "../apps/Lorekeeper";
import EntryTypeNav from "./EntryTypeNav";
import EntryTypeRecords from "./EntryTypeRecords";
import EntryRecordView from "./EntryRecordView";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  blurb: string;
  parentTypeId: string;
  bgColor: string;
  fgColor: string;
  sortOrder: number;
}

interface Lorebook {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  ownerId: string;
  accessLevel: string;
}

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
}

interface Props {
  lorebookId: string;
  entryTypeId?: string;
  recordId?: string;
  aliasId?: string;
  navigate: (v: AppView) => void;
}

export default function LorebookView({ lorebookId, entryTypeId, recordId, aliasId, navigate }: Props) {
  const [lorebook, setLorebook] = useState<Lorebook | null>(null);
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [aliasesByTypeId, setAliasesByTypeId] = useState<Record<string, EntryTypeAlias[]>>({});
  const [navOpen, setNavOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<any[]>([]);

  const addToast = (message: string, type: "success" | "error" = "success") => {
    setToasts((t) => [...t, { message, type }]);
  };
  const removeToast = (index: number) => setToasts((t) => t.filter((_, i) => i !== index));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookRes, typesRes] = await Promise.all([
        fetch(`/api/lorekeeper/lorebooks/${lorebookId}`),
        fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types`),
      ]);
      if (bookRes.ok) setLorebook(await bookRes.json());
      if (typesRes.ok) {
        const d = await typesRes.json();
        const types: EntryType[] = d.entryTypes || [];
        setEntryTypes(types);
        // Fetch aliases for all entry types in parallel
        const aliasResults = await Promise.all(
          types.map(async (t) => {
            const r = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${t.id}/aliases`);
            const aliases: EntryTypeAlias[] = r.ok ? (await r.json()).aliases || [] : [];
            return [t.id, aliases] as [string, EntryTypeAlias[]];
          })
        );
        setAliasesByTypeId(Object.fromEntries(aliasResults));
      }
    } catch {}
    setLoading(false);
  }, [lorebookId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelectType = (typeId: string) => {
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId });
  };

  const handleSelectAlias = (typeId: string, aId: string) => {
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, aliasId: aId });
  };

  const handleSelectRecord = (typeId: string, rId: string) => {
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, recordId: rId });
  };

  const handleBackToList = (typeId: string) => {
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, aliasId });
  };

  const canEdit = lorebook?.accessLevel === "owner" || lorebook?.accessLevel === "manager" || lorebook?.accessLevel === "edit";

  const currentAlias = aliasId && entryTypeId
    ? (aliasesByTypeId[entryTypeId] || []).find((a) => a.id === aliasId)
    : undefined;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", background: "#0f172a" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f172a" }}>
      {/* Sticky header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid #1e293b",
        background: "#0f172a",
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <ButtonIcon name="chevron-left" label="Back to lorebooks" onClick={() => navigate({ type: "lorebooks" })} />
          <div style={{
            width: 28, height: 28, borderRadius: 6, overflow: "hidden", flexShrink: 0,
            background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {lorebook?.hasIcon ? (
              <img src={`/api/lorekeeper/lorebooks/${lorebookId}/icon`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
            ) : (
              <span style={{ color: "#64748b" }}><Icon name="library" size={14} /></span>
            )}
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lorebook?.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <ButtonIcon
            name="download"
            label="Export metadata"
            onClick={async () => {
              const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/metadata/export`);
              if (res.ok) {
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${lorebook?.name || "lorebook"}-metadata.json`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
          />
          <ButtonIcon
            name="upload"
            label="Import metadata"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/metadata/import`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  if (res.ok) {
                    addToast("Metadata imported successfully");
                    fetchData();
                  } else {
                    addToast("Import failed", "error");
                  }
                } catch {
                  addToast("Invalid JSON file", "error");
                }
              };
              input.click();
            }}
          />
          <ButtonIcon
            name="settings"
            label="Lorebook settings"
            onClick={() => navigate({ type: "settings", lorebookId, tab: "details" })}
          />
        </div>
      </div>

      {/* DrawerLayout with left nav */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <DrawerLayout
          style={{ height: "100%" }}
          rounded={false}
          leftPanel={{
            open: navOpen,
            type: "inline",
            width: 22,
            pixelWidth: 260,
            closeable: true,
            openable: true,
            iconName: "hamburger",
            scrollable: true,
            background: "#0c1a2e",
            onClose: () => setNavOpen(false),
            onOpen: () => setNavOpen(true),
            children: (
              <EntryTypeNav
                lorebookId={lorebookId}
                entryTypes={entryTypes}
                selectedTypeId={entryTypeId}
                selectedAliasId={aliasId}
                aliasesByTypeId={aliasesByTypeId}
                onSelectType={handleSelectType}
                onSelectAlias={handleSelectAlias}
              />
            ),
          }}
        >
          <div style={{ height: "100%", overflow: "auto" }}>
            {!entryTypeId && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#64748b" }}>
                <Icon name="library" size={48} />
                <div style={{ fontSize: 15 }}>Select an entry type from the navigation</div>
              </div>
            )}
            {entryTypeId && !recordId && (
              <EntryTypeRecords
                lorebookId={lorebookId}
                entryTypeId={entryTypeId}
                entryTypes={entryTypes}
                canEdit={canEdit}
                aliasId={aliasId}
                aliasName={currentAlias?.pluralName}
                onSelectRecord={(rId) => handleSelectRecord(entryTypeId, rId)}
                addToast={addToast}
              />
            )}
            {entryTypeId && recordId && (
              <EntryRecordView
                lorebookId={lorebookId}
                entryTypeId={entryTypeId}
                recordId={recordId}
                entryTypes={entryTypes}
                canEdit={canEdit}
                onBack={() => handleBackToList(entryTypeId)}
                onNavigateRecord={(typeId, rId) => handleSelectRecord(typeId, rId)}
                addToast={addToast}
              />
            )}
          </div>
        </DrawerLayout>
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}
