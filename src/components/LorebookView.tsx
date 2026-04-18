"use client";

import { useState, useEffect, useCallback } from "react";
import { AccessDenied, DrawerLayout, ButtonIcon, Icon, Spinner, ToastStack } from "@applicator/sdk/components";
import type { AppView } from "../apps/Lorekeeper";
import EntryTypeNav from "./EntryTypeNav";
import EntryTypeRecords from "./EntryTypeRecords";
import EntryRecordView from "./EntryRecordView";
import PrintModal from "./PrintModal";

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
  isGroup?: boolean;
  allowAliasCreation?: boolean;
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
  bgColor?: string;
  fgColor?: string;
  visible?: boolean;
  blurb?: string;
}

interface Props {
  lorebookId: string;
  entryTypeId?: string;
  entryId?: string;
  aliasId?: string;
  query?: string;
  navigate: (v: AppView) => void;
}

export default function LorebookView({ lorebookId, entryTypeId, entryId, aliasId, query, navigate }: Props) {
  const [lorebook, setLorebook] = useState<Lorebook | null>(null);
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [aliasesByTypeId, setAliasesByTypeId] = useState<Record<string, EntryTypeAlias[]>>({});
  const [navOpen, setNavOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);
  const [showPrint, setShowPrint] = useState(false);
  const [resolvedTypeId, setResolvedTypeId] = useState<string | undefined>(entryTypeId);

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
      else if (bookRes.status === 403 || bookRes.status === 404) { setDenied(true); setLoading(false); return; }
      if (typesRes.ok) {
        const d = await typesRes.json();
        setEntryTypes(d.entryTypes || []);
        setAliasesByTypeId(d.aliasesByTypeId || {});
      }
    } catch {}
    setLoading(false);
  }, [lorebookId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-collapse nav on mobile screens
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) {
      setNavOpen(false);
      setIsMobile(true);
    }
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keep resolvedTypeId in sync with the prop when it's provided directly
  useEffect(() => { setResolvedTypeId(entryTypeId); }, [entryTypeId]);

  // When arriving via a deep-link without typeId, scan all types to find which one owns the entry
  useEffect(() => {
    if (!entryId || entryTypeId || entryTypes.length === 0) return;
    const typeIds = entryTypes.filter(t => !t.isGroup).map(t => t.id).join(",");
    if (!typeIds) return;
    fetch(`/api/lorekeeper/lorebooks/${lorebookId}/records?typeIds=${typeIds}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        for (const [typeId, records] of Object.entries(data.recordsByTypeId as Record<string, { id: string }[]>)) {
          if (records.find(r => r.id === entryId)) {
            setResolvedTypeId(typeId);
            return;
          }
        }
      })
      .catch(() => {});
  }, [entryId, entryTypeId, entryTypes, lorebookId]);

  const handleSelectType = (typeId: string) => {
    if (isMobile) setNavOpen(false);
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId });
  };

  const handleSelectAlias = (typeId: string, aId: string) => {
    if (isMobile) setNavOpen(false);
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, aliasId: aId });
  };

  const handleSelectRecord = (typeId: string, rId: string) => {
    if (isMobile) setNavOpen(false);
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, entryId: rId });
  };

  const handleBackToList = (typeId: string) => {
    navigate({ type: "lorebook", lorebookId, entryTypeId: typeId, aliasId });
  };

  const handleAliasCreated = (typeId: string, alias: EntryTypeAlias) => {
    setAliasesByTypeId((prev) => {
      const existing = prev[typeId] || [];
      if (existing.find((a) => a.id === alias.id)) return prev;
      const updated = [...existing, alias].sort((a, b) =>
        a.pluralName.localeCompare(b.pluralName),
      );
      return { ...prev, [typeId]: updated };
    });
  };

  const canEdit = lorebook?.accessLevel === "owner" || lorebook?.accessLevel === "manager" || lorebook?.accessLevel === "edit";

  const currentAlias = aliasId && resolvedTypeId
    ? (aliasesByTypeId[resolvedTypeId] || []).find((a) => a.id === aliasId)
    : undefined;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", background: "#0f172a" }}>
        <Spinner />
      </div>
    );
  }

  if (denied) {
    return <AccessDenied message="You don't have access to this lorebook." />;
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
            name="print"
            label="Print lorebook"
            onClick={() => setShowPrint(true)}
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
            title: "Entry Types",
            onClose: () => setNavOpen(false),
            onOpen: () => setNavOpen(true),
            children: (
              <EntryTypeNav
                lorebookId={lorebookId}
                entryTypes={entryTypes}
                selectedTypeId={resolvedTypeId}
                selectedAliasId={aliasId}
                aliasesByTypeId={aliasesByTypeId}
                onSelectType={handleSelectType}
                onSelectAlias={handleSelectAlias}
              />
            ),
          }}
        >
          <div style={{ height: "100%", overflow: "auto" }}>
            {entryId && !resolvedTypeId && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <Spinner />
              </div>
            )}
            {!entryId && !resolvedTypeId && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#64748b" }}>
                <Icon name="library" size={48} />
                <div style={{ fontSize: 15 }}>Select an entry type from the navigation</div>
              </div>
            )}
            {resolvedTypeId && !entryId && (
              <EntryTypeRecords
                lorebookId={lorebookId}
                entryTypeId={resolvedTypeId}
                entryTypes={entryTypes}
                aliasesByTypeId={aliasesByTypeId}
                canEdit={canEdit}
                aliasId={aliasId}
                aliasName={currentAlias?.pluralName}
                aliasBlurb={currentAlias?.blurb}
                initialSearch={query}
                onSelectRecord={(rId) => handleSelectRecord(resolvedTypeId, rId)}
                onAliasCreated={handleAliasCreated}
                addToast={addToast}
              />
            )}
            {resolvedTypeId && entryId && (
              <EntryRecordView
                lorebookId={lorebookId}
                entryTypeId={resolvedTypeId}
                recordId={entryId}
                entryTypes={entryTypes}
                aliases={aliasesByTypeId[resolvedTypeId] || []}
                aliasesByTypeId={aliasesByTypeId}
                canEdit={canEdit}
                onBack={() => handleBackToList(resolvedTypeId!)}
                onNavigateRecord={(typeId, rId) => handleSelectRecord(typeId, rId)}
                onAliasCreated={handleAliasCreated}
                addToast={addToast}
              />
            )}
          </div>
        </DrawerLayout>
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />

      {showPrint && (
        <PrintModal
          lorebookId={lorebookId}
          lorebookName={lorebook?.name}
          scope="lorebook"
          entryTypes={entryTypes}
          aliasesByTypeId={aliasesByTypeId}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}
