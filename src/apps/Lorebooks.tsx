"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ButtonIcon, Icon, Spinner, ToastStack } from "@applicator/sdk/components";
import type { ToastItem } from "@applicator/sdk/components";
import EntryRecordView from "../components/EntryRecordView";
import CreateEntryModal from "../components/CreateEntryModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LorebookEntry {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  ownerId: string;
  ownerName: string;
  role: string;
}

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

interface EntryTypeAlias {
  id: string;
  entryTypeId: string;
  singularName: string;
  pluralName: string;
  bgColor?: string;
  fgColor?: string;
  visible?: boolean;
}

interface EntryRecord {
  id: string;
  name: string;
  blurb: string;
  hasIcon: boolean;
  entryTypeId: string;
}

interface LorebookCtx {
  entryTypes: EntryType[];
  aliasesByTypeId: Record<string, EntryTypeAlias[]>;
  canEdit: boolean;
  loading: boolean;
}

// ─── View state ──────────────────────────────────────────────────────────────

type View =
  | { screen: "lorebooks" }
  | { screen: "entry-types"; lorebook: LorebookEntry }
  | { screen: "records"; lorebook: LorebookEntry; entryType: EntryType }
  | { screen: "record"; lorebook: LorebookEntry; entryType: EntryType; recordId: string };

// ─── Tree helpers ─────────────────────────────────────────────────────────────

interface TreeNode {
  type: EntryType;
  children: TreeNode[];
}

function buildTree(types: EntryType[]): TreeNode[] {
  const byId: Record<string, TreeNode> = {};
  types.forEach((t) => { byId[t.id] = { type: t, children: [] }; });

  const roots: TreeNode[] = [];
  types.forEach((t) => {
    if (t.parentTypeId && byId[t.parentTypeId]) {
      byId[t.parentTypeId].children.push(byId[t.id]);
    } else {
      roots.push(byId[t.id]);
    }
  });

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type.sortOrder !== b.type.sortOrder) return a.type.sortOrder - b.type.sortOrder;
      return a.type.pluralName.localeCompare(b.type.pluralName);
    });
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  } as React.CSSProperties,
  sectionLabel: {
    padding: "0 0 4px",
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  } as React.CSSProperties,
  row: (hover: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    cursor: "pointer",
    background: hover ? "#1e293b" : "transparent",
    transition: "background 0.1s",
  }),
  icon28: {
    width: 28,
    height: 28,
    borderRadius: 4,
    background: "#1e293b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  } as React.CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 500,
    color: "#e2e8f0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  sub: {
    fontSize: 11,
    color: "#64748b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "40px 16px",
    gap: 10,
    color: "#475569",
    fontSize: 13,
  } as React.CSSProperties,
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function HoverRow({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={S.row(hover)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ padding: "6px 10px", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", borderRadius: 4, padding: "4px 8px" }}>
        <span style={{ color: "#475569", flexShrink: 0 }}><Icon name="search" size={12} /></span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search…"}
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#e2e8f0", fontSize: 12 }}
        />
        {value && (
          <span style={{ cursor: "pointer", color: "#475569" }} onClick={() => onChange("")}>
            <Icon name="close" size={12} />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Lorebook list screen ─────────────────────────────────────────────────────

function LorebookListScreen({ onSelect }: { onSelect: (b: LorebookEntry) => void }) {
  const [owned, setOwned] = useState<LorebookEntry[]>([]);
  const [shared, setShared] = useState<LorebookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/lorekeeper/lorebooks")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setOwned(data.owned || []);
          setShared(data.shared || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filterBooks = (books: LorebookEntry[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.blurb && b.blurb.toLowerCase().includes(q)),
    );
  };

  const filteredOwned = filterBooks(owned);
  const filteredShared = filterBooks(shared);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {(owned.length > 0 || shared.length > 0) && (
        <SearchInput value={search} onChange={setSearch} placeholder="Filter lorebooks…" />
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredOwned.length === 0 && filteredShared.length === 0 ? (
          <div style={S.empty}>
            <span style={{ color: "#334155" }}><Icon name="library" size={32} /></span>
            {owned.length === 0 && shared.length === 0 ? "No lorebooks yet" : "No matches"}
          </div>
        ) : (
          <>
            {filteredOwned.length > 0 && (
              <div style={{ padding: "10px 12px 4px" }}>
                <div style={S.sectionLabel}>My Lorebooks</div>
              </div>
            )}
            {filteredOwned.map((b) => (
              <BookRow key={b.id} book={b} onSelect={onSelect} />
            ))}
            {filteredShared.length > 0 && (
              <div style={{ padding: "10px 12px 4px" }}>
                <div style={S.sectionLabel}>Shared With Me</div>
              </div>
            )}
            {filteredShared.map((b) => (
              <BookRow key={b.id} book={b} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function BookRow({ book, onSelect }: { book: LorebookEntry; onSelect: (b: LorebookEntry) => void }) {
  return (
    <HoverRow onClick={() => onSelect(book)}>
      <div style={S.icon28}>
        {book.hasIcon
          ? <img src={`/api/lorekeeper/lorebooks/${book.id}/icon`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
          : <span style={{ color: "#64748b" }}><Icon name="library" size={16} /></span>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.name}>{book.name}</div>
        {book.blurb && <div style={S.sub}>{book.blurb}</div>}
      </div>
      <span style={{ color: "#334155", flexShrink: 0 }}>
        <Icon name="chevron-right" size={14} />
      </span>
    </HoverRow>
  );
}

// ─── Entry types screen ───────────────────────────────────────────────────────

function EntryTypesScreen({
  lorebook,
  ctx,
  onSelect,
}: {
  lorebook: LorebookEntry;
  ctx: LorebookCtx;
  onSelect: (t: EntryType) => void;
}) {
  const [search, setSearch] = useState("");

  const selectable = ctx.entryTypes.filter((t) => !t.isGroup);

  const filtered = useMemo(() => {
    if (!search.trim()) return null; // null = show tree
    const q = search.toLowerCase();
    return selectable.filter(
      (t) =>
        t.pluralName.toLowerCase().includes(q) ||
        t.singularName.toLowerCase().includes(q),
    );
  }, [search, selectable]);

  if (ctx.loading) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  const tree = buildTree(ctx.entryTypes);

  return (
    <>
      {ctx.entryTypes.length > 0 && (
        <SearchInput value={search} onChange={setSearch} placeholder="Filter entry types…" />
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {ctx.entryTypes.length === 0 ? (
          <div style={S.empty}>
            <span style={{ color: "#334155" }}><Icon name="file" size={28} /></span>
            No entry types yet
          </div>
        ) : filtered !== null ? (
          filtered.length === 0 ? (
            <div style={S.empty}>No matches</div>
          ) : (
            filtered.map((t) => (
              <TypeFlatRow key={t.id} type={t} lorebookId={lorebook.id} onSelect={onSelect} />
            ))
          )
        ) : (
          tree.map((node) => (
            <TypeTreeNode
              key={node.type.id}
              node={node}
              depth={0}
              lorebookId={lorebook.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </>
  );
}

function TypeFlatRow({
  type,
  lorebookId,
  onSelect,
}: {
  type: EntryType;
  lorebookId: string;
  onSelect: (t: EntryType) => void;
}) {
  return (
    <HoverRow onClick={() => onSelect(type)}>
      <TypeIcon type={type} lorebookId={lorebookId} size={16} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...S.name, fontSize: 12 }}>{type.pluralName}</div>
      </div>
      <span style={{ color: "#334155", flexShrink: 0 }}>
        <Icon name="chevron-right" size={14} />
      </span>
    </HoverRow>
  );
}

function TypeTreeNode({
  node,
  depth,
  lorebookId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  lorebookId: string;
  onSelect: (t: EntryType) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <HoverRow onClick={() => node.type.isGroup ? setExpanded((e) => !e) : onSelect(node.type)}>
        <div style={{ width: depth * 14, flexShrink: 0 }} />
        {hasChildren ? (
          <span
            style={{ color: "#475569", flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} />
          </span>
        ) : (
          <div style={{ width: 12, flexShrink: 0 }} />
        )}
        <TypeIcon type={node.type} lorebookId={lorebookId} size={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...S.name, fontSize: 12 }}>{node.type.pluralName}</div>
        </div>
        {!node.type.isGroup && (
          <span style={{ color: "#334155", flexShrink: 0 }}>
            <Icon name="chevron-right" size={14} />
          </span>
        )}
      </HoverRow>
      {expanded && node.children.map((child) => (
        <TypeTreeNode
          key={child.type.id}
          node={child}
          depth={depth + 1}
          lorebookId={lorebookId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function TypeIcon({ type, lorebookId, size }: { type: EntryType; lorebookId: string; size: number }) {
  if (type.hasIcon) {
    return (
      <img
        src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${type.id}/icon`}
        style={{ width: size, height: size, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
        alt=""
      />
    );
  }
  return (
    <span style={{ color: "#64748b", flexShrink: 0 }}>
      <Icon name={(type.icon as any) || "file"} size={size} />
    </span>
  );
}

// ─── Main applet ──────────────────────────────────────────────────────────────

export default function Lorebooks() {
  const [view, setView] = useState<View>({ screen: "lorebooks" });
  const [lorebookCtx, setLorebookCtx] = useState<LorebookCtx | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const addToastStr = useCallback(
    (message: string, type?: "success" | "error") => addToast({ message, type }),
    [addToast],
  );

  const removeToast = useCallback((i: number) => {
    setToasts((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  // Load lorebook context (entry types, aliases, access level) when entering a lorebook
  useEffect(() => {
    if (view.screen === "lorebooks") {
      setLorebookCtx(null);
      return;
    }
    const lorebookId =
      view.screen === "entry-types" ? view.lorebook.id :
      view.screen === "records" ? view.lorebook.id :
      view.screen === "record" ? view.lorebook.id : null;

    if (!lorebookId) return;

    // Already loaded for this lorebook
    if (lorebookCtx && !lorebookCtx.loading) return;

    setLorebookCtx({ entryTypes: [], aliasesByTypeId: {}, canEdit: false, loading: true });

    Promise.all([
      fetch(`/api/lorekeeper/lorebooks/${lorebookId}`),
      fetch(`/api/lorekeeper/lorebooks/${lorebookId}/entry-types`),
    ])
      .then(async ([bookRes, typesRes]) => {
        let canEdit = false;
        if (bookRes.ok) {
          const book = await bookRes.json();
          canEdit =
            book.accessLevel === "owner" ||
            book.accessLevel === "manager" ||
            book.accessLevel === "edit";
        }
        let entryTypes: EntryType[] = [];
        let aliasesByTypeId: Record<string, EntryTypeAlias[]> = {};
        if (typesRes.ok) {
          const d = await typesRes.json();
          entryTypes = d.entryTypes || [];
          aliasesByTypeId = d.aliasesByTypeId || {};
        }
        setLorebookCtx({ entryTypes, aliasesByTypeId, canEdit, loading: false });
      })
      .catch(() => {
        setLorebookCtx({ entryTypes: [], aliasesByTypeId: {}, canEdit: false, loading: false });
        addToast({ message: "Failed to load lorebook data", type: "error" });
      });
  }, [view.screen === "lorebooks" ? "" : (view as any).lorebook?.id]);

  // Handle alias creation (updates aliasesByTypeId in ctx)
  const handleAliasCreated = useCallback((typeId: string, alias: EntryTypeAlias) => {
    setLorebookCtx((prev) => {
      if (!prev) return prev;
      const existing = prev.aliasesByTypeId[typeId] || [];
      if (existing.find((a) => a.id === alias.id)) return prev;
      const updated = [...existing, alias].sort((a, b) =>
        a.pluralName.localeCompare(b.pluralName),
      );
      return { ...prev, aliasesByTypeId: { ...prev.aliasesByTypeId, [typeId]: updated } };
    });
  }, []);

  // Navigate to a record (used by EntryRecordView's onNavigateRecord for linked entries)
  const handleNavigateRecord = useCallback(
    (typeId: string, recordId: string) => {
      if (view.screen !== "record") return;
      const lorebook = view.lorebook;
      const entryType = lorebookCtx?.entryTypes.find((t) => t.id === typeId);
      if (!entryType) return;
      setView({ screen: "record", lorebook, entryType, recordId });
    },
    [view, lorebookCtx],
  );

  const ctx: LorebookCtx = lorebookCtx ?? {
    entryTypes: [],
    aliasesByTypeId: {},
    canEdit: false,
    loading: true,
  };

  // ── Header ────────────────────────────────────────────────────────────────
  // Record screen: EntryRecordView renders its own header — skip ours entirely.
  const isRecordScreen = view.screen === "record";

  let openUrl: string | null = null;
  let backView: View | null = null;
  let headerTitle = "";
  let headerSubtitle: string | null = null;
  let headerIconEl: React.ReactNode = null;
  let showCreateButton = false;

  if (!isRecordScreen) {
    if (view.screen === "lorebooks") {
      headerIconEl = <Icon name="library" size={14} />;
      headerTitle = "Lorebooks";
    } else if (view.screen === "entry-types") {
      headerIconEl = <Icon name="library" size={14} />;
      headerTitle = view.lorebook.name;
      backView = { screen: "lorebooks" };
      openUrl = `/app/lorekeeper:main/lorebook/${view.lorebook.id}`;
    } else if (view.screen === "records") {
      headerIconEl = view.entryType.hasIcon
        ? <img src={`/api/lorekeeper/lorebooks/${view.lorebook.id}/entry-types/${view.entryType.id}/icon`} style={{ width: 14, height: 14, objectFit: "cover", borderRadius: 2 }} alt="" />
        : <Icon name={(view.entryType.icon as any) || "list-view"} size={14} />;
      headerTitle = view.entryType.pluralName;
      headerSubtitle = view.lorebook.name;
      backView = { screen: "entry-types", lorebook: view.lorebook };
      openUrl = `/app/lorekeeper:main/lorebook/${view.lorebook.id}?entryType=${view.entryType.id}`;
      showCreateButton = ctx.canEdit && !ctx.loading;
    }
  }

  // Relay "create" trigger down to RecordsScreen via a counter signal
  const [createSignal, setCreateSignal] = useState(0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f172a", color: "#e2e8f0", fontFamily: "inherit" }}>

      {/* Outer header — hidden on record screen */}
      {!isRecordScreen && (
        <div style={S.header}>
          {backView && (
            <ButtonIcon name="chevron-left" label="Back" size="sm" onClick={() => setView(backView!)} />
          )}
          <span style={{ color: "#818cf8" }}>{headerIconEl}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {headerTitle}
            </div>
            {headerSubtitle && (
              <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {headerSubtitle}
              </div>
            )}
          </div>
          {showCreateButton && (
            <ButtonIcon
              name="plus"
              label={`New ${view.screen === "records" ? (view as any).entryType?.singularName || "entry" : "entry"}`}
              size="sm"
              onClick={() => setCreateSignal((n) => n + 1)}
            />
          )}
          {openUrl && (
            <ButtonIcon
              name="external-link"
              label="Open in Lorekeeper"
              size="sm"
              onClick={() => { window.location.href = openUrl!; }}
            />
          )}
        </div>
      )}

      {/* Screen content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {view.screen === "lorebooks" && (
          <LorebookListScreen
            onSelect={(b) => setView({ screen: "entry-types", lorebook: b })}
          />
        )}

        {view.screen === "entry-types" && (
          <EntryTypesScreen
            lorebook={view.lorebook}
            ctx={ctx}
            onSelect={(t) => setView({ screen: "records", lorebook: view.lorebook, entryType: t })}
          />
        )}

        {view.screen === "records" && (
          <RecordsScreen
            lorebook={view.lorebook}
            entryType={view.entryType}
            ctx={ctx}
            createSignal={createSignal}
            onView={(recordId) =>
              setView({ screen: "record", lorebook: view.lorebook, entryType: view.entryType, recordId })
            }
            onCreated={(record) => {
              const et = ctx.entryTypes.find((t) => t.id === record.entryTypeId) || view.entryType;
              setView({ screen: "record", lorebook: view.lorebook, entryType: et, recordId: record.id });
            }}
            addToast={addToast}
          />
        )}

        {view.screen === "record" && (
          <EntryRecordView
            lorebookId={view.lorebook.id}
            entryTypeId={view.entryType.id}
            recordId={view.recordId}
            entryTypes={ctx.entryTypes}
            aliases={ctx.aliasesByTypeId[view.entryType.id] || []}
            aliasesByTypeId={ctx.aliasesByTypeId}
            canEdit={ctx.canEdit}
            onBack={() => setView({ screen: "records", lorebook: view.lorebook, entryType: view.entryType })}
            onNavigateRecord={handleNavigateRecord}
            onAliasCreated={handleAliasCreated}
            addToast={addToastStr}
          />
        )}
      </div>

      <ToastStack toasts={toasts} onClose={removeToast} />
    </div>
  );
}

// ─── Records screen ───────────────────────────────────────────────────────────

function RecordsScreen({
  lorebook,
  entryType,
  ctx,
  createSignal,
  onView,
  onCreated,
  addToast,
}: {
  lorebook: LorebookEntry;
  entryType: EntryType;
  ctx: LorebookCtx;
  createSignal: number;
  onView: (recordId: string) => void;
  onCreated: (record: { id: string; name: string; hasIcon: boolean; entryTypeId: string }) => void;
  addToast: (t: ToastItem) => void;
}) {
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const prevSignal = React.useRef(createSignal);

  // Open create modal when signal fires
  useEffect(() => {
    if (createSignal !== prevSignal.current) {
      prevSignal.current = createSignal;
      if (ctx.canEdit) setShowCreate(true);
    }
  }, [createSignal, ctx.canEdit]);

  const loadRecords = useCallback(() => {
    setLoading(true);
    fetch(`/api/lorekeeper/lorebooks/${lorebook.id}/entry-types/${entryType.id}/records`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setRecords(data?.records || data || []);
        setLoading(false);
      })
      .catch(() => {
        addToast({ message: "Failed to load records", type: "error" });
        setLoading(false);
      });
  }, [lorebook.id, entryType.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.blurb && r.blurb.toLowerCase().includes(q)),
    );
  }, [search, records]);

  const addToastStr = useCallback(
    (message: string, type?: "success" | "error") => addToast({ message, type }),
    [addToast],
  );

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {records.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${entryType.pluralName.toLowerCase()}…`}
        />
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {records.length === 0 ? (
          <div style={S.empty}>
            <span style={{ color: "#334155" }}><Icon name="file" size={28} /></span>
            No {entryType.pluralName.toLowerCase()} yet
            {ctx.canEdit && (
              <button
                onClick={() => setShowCreate(true)}
                style={{ marginTop: 4, background: "none", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", fontSize: 12, padding: "4px 12px", cursor: "pointer" }}
              >
                Create one
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>No matches</div>
        ) : (
          filtered.map((rec) => (
            <HoverRow key={rec.id} onClick={() => onView(rec.id)}>
              <div style={S.icon28}>
                {rec.hasIcon
                  ? <img src={`/api/lorekeeper/lorebooks/${lorebook.id}/entry-types/${entryType.id}/records/${rec.id}/icon`} style={{ width: 28, height: 28, objectFit: "cover" }} alt="" />
                  : <TypeIcon type={entryType} lorebookId={lorebook.id} size={14} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.name}>{rec.name}</div>
                {rec.blurb && <div style={S.sub}>{rec.blurb}</div>}
              </div>
              <span style={{ color: "#334155", flexShrink: 0 }}>
                <Icon name="chevron-right" size={14} />
              </span>
            </HoverRow>
          ))
        )}
      </div>

      {showCreate && (
        <CreateEntryModal
          lorebookId={lorebook.id}
          entryTypeId={entryType.id}
          entryTypes={ctx.entryTypes}
          addToast={addToastStr}
          onCreated={(record) => {
            setShowCreate(false);
            loadRecords();
            onCreated(record);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
