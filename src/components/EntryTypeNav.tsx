"use client";

import { useState } from "react";
import { Icon } from "@applicator/sdk/components";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  hasIcon: boolean;
  parentTypeId: string;
  sortOrder: number;
  isGroup?: boolean;
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

interface Props {
  lorebookId: string;
  entryTypes: EntryType[];
  selectedTypeId?: string;
  selectedAliasId?: string;
  aliasesByTypeId: Record<string, EntryTypeAlias[]>;
  onSelectType: (typeId: string) => void;
  onSelectAlias: (typeId: string, aliasId: string) => void;
}

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

  const byName = (a: TreeNode, b: TreeNode) => a.type.pluralName.localeCompare(b.type.pluralName);
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort(byName);
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);

  return roots;
}

function NavNode({
  node,
  depth,
  lorebookId,
  selectedTypeId,
  selectedAliasId,
  aliasesByTypeId,
  onSelectType,
  onSelectAlias,
  expandedIds,
  toggleExpanded,
}: {
  node: TreeNode;
  depth: number;
  lorebookId: string;
  selectedTypeId?: string;
  selectedAliasId?: string;
  aliasesByTypeId: Record<string, EntryTypeAlias[]>;
  onSelectType: (id: string) => void;
  onSelectAlias: (typeId: string, aliasId: string) => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  const { type, children } = node;
  const isGroup = !!type.isGroup;
  const typeAliases = (aliasesByTypeId[type.id] || []).filter((a) => a.visible !== false);
  const isSelected = !isGroup && selectedTypeId === type.id && !selectedAliasId;
  const isExpanded = expandedIds.has(type.id);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `6px 12px 6px ${12 + depth * 16}px`,
          cursor: isGroup ? "default" : "pointer",
          background: isSelected ? "#1e3a5f" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { if (!isSelected && !isGroup) e.currentTarget.style.background = "#1a2e47"; }}
        onMouseLeave={(e) => { if (!isSelected && !isGroup) e.currentTarget.style.background = "transparent"; }}
        onClick={() => { if (!isGroup) onSelectType(type.id); }}
      >
        {hasChildren ? (
          <span
            style={{ color: "#64748b", flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); toggleExpanded(type.id); }}
          >
            <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={12} />
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ flexShrink: 0 }}>
          {type.hasIcon ? (
            <img
              src={`/api/lorekeeper/lorebooks/${lorebookId}/entry-types/${type.id}/icon`}
              style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover", display: "block" }}
              alt=""
            />
          ) : (
            <span style={{ color: isSelected ? "#93c5fd" : isGroup ? "#475569" : "#94a3b8" }}>
              <Icon name={(type.icon as any) || "file"} size={14} />
            </span>
          )}
        </span>
        <span style={{ fontSize: 13, color: isSelected ? "#e2e8f0" : isGroup ? "#64748b" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: isGroup ? "italic" : undefined }}>
          {type.pluralName}
        </span>
      </div>
      {/* Alias sub-items */}
      {typeAliases.map((alias) => {
        const isAliasSelected = selectedTypeId === type.id && selectedAliasId === alias.id;
        return (
          <div
            key={alias.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: `5px 12px 5px ${12 + (depth + 1) * 16}px`,
              cursor: "pointer",
              background: isAliasSelected ? "#1e3a5f" : "transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!isAliasSelected) e.currentTarget.style.background = "#1a2e47"; }}
            onMouseLeave={(e) => { if (!isAliasSelected) e.currentTarget.style.background = "transparent"; }}
            onClick={() => onSelectAlias(type.id, alias.id)}
          >
            <span style={{ width: 12, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 4,
                background: alias.bgColor || "#1e293b",
                color: alias.fgColor || "#94a3b8",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {alias.pluralName}
            </span>
          </div>
        );
      })}

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <NavNode
              key={child.type.id}
              node={child}
              depth={depth + 1}
              lorebookId={lorebookId}
              selectedTypeId={selectedTypeId}
              selectedAliasId={selectedAliasId}
              aliasesByTypeId={aliasesByTypeId}
              onSelectType={onSelectType}
              onSelectAlias={onSelectAlias}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EntryTypeNav({ lorebookId, entryTypes, selectedTypeId, selectedAliasId, aliasesByTypeId, onSelectType, onSelectAlias }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(entryTypes.map((t) => t.id)));

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = buildTree(entryTypes);

  if (entryTypes.length === 0) {
    return (
      <div style={{ padding: 16, color: "#64748b", fontSize: 13 }}>
        No entry types yet. Add them in Settings → Lore Metadata.
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      {tree.map((node) => (
        <NavNode
          key={node.type.id}
          node={node}
          depth={0}
          lorebookId={lorebookId}
          selectedTypeId={selectedTypeId}
          selectedAliasId={selectedAliasId}
          aliasesByTypeId={aliasesByTypeId}
          onSelectType={onSelectType}
          onSelectAlias={onSelectAlias}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}
