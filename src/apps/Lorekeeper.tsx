"use client";

import React, { useState, useCallback, useEffect } from "react";
import { AccessDenied, Spinner } from "@applicator/sdk/components";
import LorebookList from "../components/LorebookList";
import LorebookView from "../components/LorebookView";
import LorebookSettings from "../components/LorebookSettings";

export type SettingsTab = "details" | "metadata" | "membership" | "delete" | "export-import";

export type AppView =
  | { type: "lorebooks" }
  | { type: "lorebook"; lorebookId: string; entryTypeId?: string; entryId?: string; aliasId?: string; query?: string }
  | { type: "settings-loading"; lorebookId: string; tab?: string }
  | { type: "settings"; lorebookId: string; tab?: string }
  | { type: "settings-denied"; lorebookId: string };

interface Props {
  path?: string[];
  appId?: string;
  navigate?: (url: string) => void;
}

function initialView(path: string[], search: string): AppView {
  const params = new URLSearchParams(search);
  if (path[0] === "lorebook" && path[1]) {
    const lorebookId = path[1];
    if (path[2] === "settings") {
      return { type: "settings-loading", lorebookId, tab: params.get("tab") || undefined };
    }
    if (path[2] === "entries" && path[3]) {
      return { type: "lorebook", lorebookId, entryId: path[3] };
    }
    return {
      type: "lorebook",
      lorebookId,
      entryTypeId: params.get("entryType") || undefined,
      aliasId: params.get("alias") || undefined,
      query: params.get("query") || undefined,
    };
  }
  return { type: "lorebooks" };
}

function viewToUrl(view: AppView): string {
  const base = "/app/lorekeeper:main";
  switch (view.type) {
    case "lorebooks":
      return base;
    case "lorebook": {
      if (view.entryId) {
        return `${base}/lorebook/${view.lorebookId}/entries/${view.entryId}`;
      }
      const p = new URLSearchParams();
      if (view.entryTypeId) p.set("entryType", view.entryTypeId);
      if (view.aliasId) p.set("alias", view.aliasId);
      if (view.query) p.set("query", view.query);
      const qs = p.toString() ? `?${p}` : "";
      return `${base}/lorebook/${view.lorebookId}${qs}`;
    }
    case "settings-loading":
    case "settings":
    case "settings-denied": {
      const p = new URLSearchParams();
      if ((view as any).tab) p.set("tab", (view as any).tab);
      const qs = p.toString() ? `?${p}` : "";
      return `${base}/lorebook/${view.lorebookId}/settings${qs}`;
    }
  }
}

export default function Lorekeeper({ path = [], navigate: platformNavigate }: Props) {
  const [view, setView] = useState<AppView>(() =>
    initialView(path, typeof window !== "undefined" ? window.location.search : "")
  );

  const navigate = useCallback((next: AppView) => {
    setView(next);
    const url = viewToUrl(next);
    if (platformNavigate) platformNavigate(url);
    else if (typeof window !== "undefined") window.history.pushState(null, "", url);
  }, [platformNavigate]);

  useEffect(() => {
    if (view.type !== "settings-loading") return;
    const { lorebookId, tab } = view;
    fetch(`/api/lorekeeper/lorebooks/${lorebookId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) { setView({ type: "lorebooks" }); return; }
        const canManage = data.accessLevel === "owner" || data.accessLevel === "manager";
        setView(canManage
          ? { type: "settings", lorebookId, tab }
          : { type: "settings-denied", lorebookId }
        );
      })
      .catch(() => setView({ type: "lorebooks" }));
  }, [view]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {view.type === "lorebooks" && (
        <LorebookList navigate={navigate} />
      )}
      {view.type === "lorebook" && (
        <LorebookView
          lorebookId={view.lorebookId}
          entryTypeId={view.entryTypeId}
          entryId={view.entryId}
          aliasId={view.aliasId}
          query={view.query}
          navigate={navigate}
        />
      )}
      {view.type === "settings-loading" && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", background: "#0f172a" }}>
          <Spinner />
        </div>
      )}
      {view.type === "settings" && (
        <LorebookSettings
          lorebookId={view.lorebookId}
          tab={view.tab}
          navigate={navigate}
        />
      )}
      {view.type === "settings-denied" && (
        <AccessDenied message="You need manager or owner access to view lorebook settings." />
      )}
    </div>
  );
}
