"use client";

import { useState, useEffect } from "react";
import { Button, ButtonIcon, Icon, ConfirmModal, SearchableCombobox } from "@applicator/sdk/components";

interface Member {
  id?: string;
  userId: string;
  role: string;
  displayName: string;
  username: string;
  email: string;
}

interface User {
  id: string;
  displayName: string;
  username: string;
  email: string;
}

interface Props {
  lorebookId: string;
  isOwner: boolean;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function MembershipTab({ lorebookId, isOwner, addToast }: Props) {
  const [owner, setOwner] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User[]>([]);
  const [newRole, setNewRole] = useState<string>("view");
  const [revokeTarget, setRevokeTarget] = useState<Member | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/members`);
    if (res.ok) {
      const d = await res.json();
      setOwner(d.owner);
      setMembers(d.members || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [lorebookId]);

  const searchUsers = async (q: string) => {
    const res = await fetch(`/api/lorekeeper/users?q=${encodeURIComponent(q)}`);
    if (res.ok) setUsers((await res.json()).users || []);
  };

  const handleAdd = async () => {
    if (selectedUser.length === 0) return;
    setAdding(true);
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUser[0].id, role: newRole }),
    });
    if (res.ok) {
      addToast("Member added");
      setSelectedUser([]);
      fetchMembers();
    } else {
      const err = await res.json();
      addToast(err.error || "Failed to add member", "error");
    }
    setAdding(false);
  };

  const handleUpdateRole = async (member: Member, role: string) => {
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/members/${member.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) { addToast("Role updated"); fetchMembers(); }
    else addToast("Failed to update role", "error");
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/members/${revokeTarget.userId}`, { method: "DELETE" });
    if (res.ok) { addToast("Access revoked"); setRevokeTarget(null); fetchMembers(); }
    else addToast("Failed to revoke", "error");
  };

  const handlePromote = async () => {
    if (!promoteTarget) return;
    const res = await fetch(`/api/lorekeeper/lorebooks/${lorebookId}/members/${promoteTarget.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoteToOwner: true }),
    });
    if (res.ok) { addToast("Ownership transferred"); setPromoteTarget(null); fetchMembers(); }
    else addToast("Failed to transfer ownership", "error");
  };

  const roleColor = (role: string) => ({ view: "#64748b", edit: "#3b82f6", manager: "#8b5cf6", owner: "#f59e0b" }[role] || "#64748b");

  const MemberRow = ({ m, isOwnerRow }: { m: Member; isOwnerRow?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#1e293b", marginBottom: 2 }}>
      <span style={{ color: "#64748b" }}><Icon name="user" size={16} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>{m.displayName}</div>
      </div>
      {isOwnerRow ? (
        <span style={{ fontSize: 11, padding: "2px 8px", background: "#78350f", color: "#fcd34d" }}>Owner</span>
      ) : (
        <>
          <select
            value={m.role}
            onChange={(e) => handleUpdateRole(m, e.target.value)}
            disabled={!isOwner && m.role === "manager"}
            style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4, padding: "3px 6px", color: roleColor(m.role), fontSize: 12, outline: "none" }}
          >
            <option value="view">View</option>
            <option value="edit">Edit</option>
            <option value="manager">Manager</option>
          </select>
          {isOwner && (
            <ButtonIcon name="crown" label="Promote to owner" onClick={() => setPromoteTarget(m)} />
          )}
          <ButtonIcon name="trash" label="Revoke access" subvariant="danger" onClick={() => setRevokeTarget(m)} />
        </>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Membership</div>

      {/* Add member — single-line form */}
      <div style={{ background: "#1e293b", padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SearchableCombobox
            items={users}
            selectedItems={selectedUser}
            onSelectionChange={setSelectedUser}
            getItemKey={(u) => u.id}
            renderItem={(u) => <span style={{ fontSize: 13, color: "#f1f5f9" }}>{u.displayName}</span>}
            filterItem={(u, q) => u.displayName.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase())}
            placeholder="Search users…"
            onSearchChange={searchUsers}
            debounceMs={300}
          />
        </div>
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#f1f5f9", fontSize: 13, outline: "none", flexShrink: 0 }}
        >
          <option value="view">View</option>
          <option value="edit">Edit</option>
          <option value="manager">Manager</option>
        </select>
        <Button variant="primary" onClick={handleAdd} disabled={selectedUser.length === 0 || adding}>
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>

      {/* Owner row */}
      {owner && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Owner</div>
          <MemberRow m={owner} isOwnerRow />
        </div>
      )}

      {/* Members */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Members</div>
        {members.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>No shared members</div>
        ) : (
          <div>
            {members.map((m) => <MemberRow key={m.userId} m={m} />)}
          </div>
        )}
      </div>

      {revokeTarget && (
        <ConfirmModal
          title="Revoke Access"
          message={`Remove ${revokeTarget.displayName}'s access to this lorebook?`}
          confirmText="Revoke"
          danger
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
      {promoteTarget && (
        <ConfirmModal
          title="Transfer Ownership"
          message={`Transfer ownership to ${promoteTarget.displayName}? You will become a manager.`}
          confirmText="Transfer"
          danger
          onConfirm={handlePromote}
          onCancel={() => setPromoteTarget(null)}
        />
      )}
    </div>
  );
}
