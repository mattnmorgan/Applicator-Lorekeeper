"use client";

import { useState, useMemo } from "react";
import { Icon } from "@applicator/sdk/components";
import type { UiContext } from "@applicator/sdk/context";
import type { AppView } from "./Lorekeeper";
import LorebookView from "../components/LorebookView";
import { GuestContext } from "../context/GuestContext";

interface GuestContextData {
  lorebookId: string;
  hasPassword: boolean;
}

interface Props {
  context?: UiContext<GuestContextData>;
}

export default function GuestLorebook({ context }: Props) {
  const contextId = context?.guest?.id;
  const contextData = context?.guest?.data;
  const guestPassword = context?.guest?.password;
  const lorebookId = contextData?.lorebookId;

  const [entryTypeId, setEntryTypeId] = useState<string | undefined>();
  const [entryId, setEntryId] = useState<string | undefined>();
  const [aliasId, setAliasId] = useState<string | undefined>();
  const [query, setQuery] = useState<string | undefined>();

  const guestHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (contextId) h["X-Guest-Context"] = contextId;
    if (guestPassword) h["X-Guest-Password"] = guestPassword;
    return h;
  }, [contextId, guestPassword]);

  const guestContextValue = useMemo(
    () => ({ isGuest: true, guestHeaders }),
    [guestHeaders],
  );

  const navigate = (next: AppView) => {
    if (next.type === "lorebook") {
      setEntryTypeId(next.entryTypeId);
      setEntryId(next.entryId);
      setAliasId(next.aliasId);
      setQuery(next.query);
    }
  };

  if (!lorebookId || !contextId) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
          <span style={{ color: "#64748b", display: "block", marginBottom: 16 }}>
            <Icon name="warning" size={40} />
          </span>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
            Invalid Share Link
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>
            This link may be invalid or expired. Please contact the lorebook owner.
          </div>
        </div>
      </div>
    );
  }

  return (
    <GuestContext.Provider value={guestContextValue}>
      <LorebookView
        lorebookId={lorebookId}
        entryTypeId={entryTypeId}
        entryId={entryId}
        aliasId={aliasId}
        query={query}
        navigate={navigate}
      />
    </GuestContext.Provider>
  );
}
