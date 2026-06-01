"use client";

import { useState, useEffect } from "react";
import { Button, Icon } from "@applicator/sdk/components";

interface GuestStatus {
  enabled: boolean;
  hasPassword: boolean;
  shareUrl: string | null;
  contextId: string | null;
}

interface Props {
  lorebookId: string;
  addToast: (message: string, type?: "success" | "error") => void;
}

export default function GuestTab({ lorebookId, addToast }: Props) {
  const [status, setStatus] = useState<GuestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const fetch_ = (path: string, init?: RequestInit) =>
    fetch(`/api/lorekeeper/lorebooks/${lorebookId}/${path}`, init);

  const loadStatus = async () => {
    setLoading(true);
    const res = await fetch_("guest");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  };

  useEffect(() => { loadStatus(); }, [lorebookId]);

  const copyLink = () => {
    if (!status?.shareUrl) return;
    const url = `${window.location.origin}${status.shareUrl}`;
    navigator.clipboard.writeText(url).then(
      () => addToast("Link copied to clipboard"),
      () => addToast("Failed to copy link", "error")
    );
  };

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    const res = await fetch_("guest", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      setStatus(await res.json());
      setShowPasswordForm(false);
      setPasswordInput("");
      addToast(enabled ? "Guest access enabled" : "Guest access disabled");
    } else {
      addToast("Failed to update guest access", "error");
    }
    setSaving(false);
  };

  const handleSetPassword = async (clear?: boolean) => {
    const password = clear ? "" : passwordInput.trim();
    if (!clear && password.length === 0) {
      addToast("Password cannot be empty", "error");
      return;
    }
    setSavingPassword(true);
    const res = await fetch_("guest", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, password: clear ? undefined : password }),
    });
    if (res.ok) {
      setStatus(await res.json());
      setShowPasswordForm(false);
      setPasswordInput("");
      addToast(clear ? "Password removed" : "Password updated");
    } else {
      addToast("Failed to update password", "error");
    }
    setSavingPassword(false);
  };

  const sectionStyle: React.CSSProperties = {
    background: "#1e293b",
    borderRadius: 6,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  if (loading) {
    return <div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Guest Access</div>
      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
        Allow anyone with a share link to view this lorebook without logging in. You can optionally
        protect the link with a password.
      </div>

      {/* Toggle */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Guest Accessible</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {status?.enabled
                ? "Anyone with the link can view this lorebook"
                : "Only members can view this lorebook"}
            </div>
          </div>
          <button
            onClick={() => handleToggle(!status?.enabled)}
            disabled={saving}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: "none",
              background: status?.enabled ? "#3b82f6" : "#334155",
              cursor: saving ? "default" : "pointer",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: status?.enabled ? 21 : 3,
                width: 16,
                height: 16,
                borderRadius: 8,
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      </div>

      {/* Share link — only shown when enabled */}
      {status?.enabled && status.shareUrl && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Share Link</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              flex: 1,
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 4,
              padding: "7px 10px",
              fontSize: 12,
              color: "#94a3b8",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {`${typeof window !== "undefined" ? window.location.origin : ""}${status.shareUrl}`}
            </div>
            <Button variant="secondary" onClick={copyLink}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="copy" size={14} />
                Copy
              </span>
            </Button>
          </div>
          <div style={{ fontSize: 11, color: "#475569" }}>
            Share this link with anyone you want to give read-only access to this lorebook.
          </div>
        </div>
      )}

      {/* Password — only shown when enabled */}
      {status?.enabled && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Password Protection</div>

          {!showPasswordForm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {status.hasPassword ? (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4ade80" }}>
                    <Icon name="lock" size={14} />
                    Password set
                  </span>
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <Button variant="secondary" onClick={() => setShowPasswordForm(true)}>
                      Change
                    </Button>
                    <Button variant="secondary" onClick={() => handleSetPassword(true)} disabled={savingPassword}>
                      {savingPassword ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: "#64748b" }}>No password — anyone with the link can access</span>
                  <Button variant="secondary" onClick={() => setShowPasswordForm(true)} style={{ marginLeft: "auto" }}>
                    Set Password
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter new password…"
                autoFocus
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 4,
                  padding: "8px 10px",
                  color: "#f1f5f9",
                  fontSize: 13,
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => handleSetPassword()}
                  disabled={savingPassword || passwordInput.trim().length === 0}
                >
                  {savingPassword ? "Saving…" : "Save Password"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowPasswordForm(false); setPasswordInput(""); }}
                  disabled={savingPassword}
                >
                  Cancel
                </Button>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Setting a new password generates a new share link. Old links will no longer work.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
