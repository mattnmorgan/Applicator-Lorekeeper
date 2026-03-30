"use client";

import { Icon } from "@applicator/sdk/components";

interface EntryType {
  id: string;
  singularName: string;
  pluralName: string;
  icon: string;
  parentTypeId: string;
  sortOrder: number;
}

interface Props {
  lorebookId: string;
  entryTypes: EntryType[];
  selectedTypeId?: string;
  onSelectType: (typeId: string) => void;
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

  return roots;
}

function NavNode({
  node,
  depth,
  selectedTypeId,
  onSelectType,
  expandedIds,
  toggleExpanded,
}: {
  node: TreeNode;
  depth: number;
  selectedTypeId?: string;
  onSelectType: (id: string) => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  const { type, children } = node;
  const isSelected = selectedTypeId === type.id;
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
          cursor: "pointer",
          background: isSelected ? "#1e3a5f" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#1e293b"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
        onClick={() => onSelectType(type.id)}
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
        <span style={{ color: isSelected ? "#93c5fd" : "#94a3b8", flexShrink: 0 }}>
          <Icon name={(type.icon?.startsWith("data:") ? "file" : type.icon as any) || "file"} size={14} />
        </span>
        <span style={{ fontSize: 13, color: isSelected ? "#e2e8f0" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {type.pluralName}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <NavNode
              key={child.type.id}
              node={child}
              depth={depth + 1}
              selectedTypeId={selectedTypeId}
              onSelectType={onSelectType}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EntryTypeNav({ lorebookId, entryTypes, selectedTypeId, onSelectType }: Props) {
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
    <div style={{ padding: "8px 0" }}>
      {tree.map((node) => (
        <NavNode
          key={node.type.id}
          node={node}
          depth={0}
          selectedTypeId={selectedTypeId}
          onSelectType={onSelectType}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}

// Need useState import
import { useState } from "react";
