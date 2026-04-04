"use client";

import { useState, useCallback } from "react";
import { UiContext } from "@applicator/sdk/context";
import LorebookList from "../components/LorebookList";
import LorebookView from "../components/LorebookView";
import LorebookSettings from "../components/LorebookSettings";

export type SettingsTab = "details" | "metadata" | "membership" | "delete";

export type AppView =
  | { type: "lorebooks" }
  | { type: "lorebook"; lorebookId: string; entryTypeId?: string; recordId?: string; aliasId?: string }
  | { type: "settings"; lorebookId: string; tab: SettingsTab };

export default function Lorekeeper({ context }: { context?: UiContext }) {
  const [view, setView] = useState<AppView>({ type: "lorebooks" });

  const navigate = useCallback((next: AppView) => setView(next), []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {view.type === "lorebooks" && (
        <LorebookList navigate={navigate} />
      )}
      {view.type === "lorebook" && (
        <LorebookView
          lorebookId={view.lorebookId}
          entryTypeId={view.entryTypeId}
          recordId={view.recordId}
          aliasId={view.aliasId}
          navigate={navigate}
        />
      )}
      {view.type === "settings" && (
        <LorebookSettings
          lorebookId={view.lorebookId}
          tab={view.tab}
          navigate={navigate}
        />
      )}
    </div>
  );
}
