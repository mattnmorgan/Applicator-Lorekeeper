"use client";

import React, { useState, useRef } from "react";
import { ButtonIcon } from "@applicator/sdk/components";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Option {
  value: string;
  label: string;
}

// ─── Value resolver ───────────────────────────────────────────────────────────
// Mirrors the logic in PicklistOptionsEditor: slugifies the label and
// deduplicates against the existing set of option values.

export function resolvePicklistValue(label: string, existingValues: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "option";
  let value = base;
  let n = 2;
  while (existingValues.has(value)) value = `${base}_${n++}`;
  return value;
}

// ─── Single-select with custom entry support ──────────────────────────────────

interface SinglePicklistInputProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  /** Converts a typed label into the stored value. Defaults to using the raw label. */
  resolveCustomValue?: (label: string) => string;
  /** Called only when a custom (non-predefined) value is committed, with its computed value and original label. */
  onCustomAdded?: (computedValue: string, label: string) => void;
}

export function SinglePicklistInput({
  options,
  value,
  onChange,
  resolveCustomValue,
  onCustomAdded,
}: SinglePicklistInputProps) {
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLabel = options.find((o) => o.value === value)?.label ?? value ?? "";

  const filtered = options.filter(
    (o) => inputText === "" || o.label.toLowerCase().includes(inputText.toLowerCase()),
  );

  const showCustom =
    inputText.trim() !== "" &&
    !options.some((o) => o.label.toLowerCase() === inputText.trim().toLowerCase());

  const commitCustom = (label: string) => {
    const computed = resolveCustomValue ? resolveCustomValue(label) : label;
    onChange(computed);
    onCustomAdded?.(computed, label);
    setInputText("");
    setOpen(false);
  };

  const commitOption = (v: string) => {
    onChange(v);
    setInputText("");
    setOpen(false);
  };

  const handleFocus = () => {
    setInputText("");
    setOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setInputText("");
    }, 150);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      <input
        value={open ? inputText : currentLabel}
        onChange={(e) => { setInputText(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Select or type custom…"
        style={{
          flex: 1,
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 6,
          padding: "5px 8px",
          color: "#f1f5f9",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
          width: "100%",
        }}
      />
      {value && !open && (
        <ButtonIcon name="close" label="Clear" size="sm" onClick={() => onChange("")} />
      )}
      {open && (filtered.length > 0 || showCustom) && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 200,
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 6,
          maxHeight: 200,
          overflowY: "auto",
          marginTop: 2,
        }}>
          {filtered.map((opt) => (
            <div
              key={opt.value}
              onMouseDown={() => commitOption(opt.value)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 13,
                color: opt.value === value ? "#93c5fd" : "#e2e8f0",
                background: opt.value === value ? "#1e3a5f" : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0f172a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = opt.value === value ? "#1e3a5f" : "transparent")}
            >
              {opt.label}
            </div>
          ))}
          {showCustom && (
            <div
              onMouseDown={() => commitCustom(inputText.trim())}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 13,
                color: "#94a3b8",
                borderTop: filtered.length > 0 ? "1px solid #334155" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#0f172a";
                e.currentTarget.style.color = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              Use "{inputText.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select with custom entry support ───────────────────────────────────

interface MultiPicklistInputProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Converts a typed label into the stored value. Defaults to using the raw label. */
  resolveCustomValue?: (label: string) => string;
  /** Called only when a custom (non-predefined) value is committed, with its computed value and original label. */
  onCustomAdded?: (computedValue: string, label: string) => void;
}

export function MultiPicklistInput({
  options,
  value,
  onChange,
  resolveCustomValue,
  onCustomAdded,
}: MultiPicklistInputProps) {
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);

  const selectedSet = new Set(value);

  const filtered = options.filter(
    (o) =>
      !selectedSet.has(o.value) &&
      (inputText === "" || o.label.toLowerCase().includes(inputText.toLowerCase())),
  );

  const showCustom =
    inputText.trim() !== "" &&
    !options.some((o) => o.label.toLowerCase() === inputText.trim().toLowerCase()) &&
    !selectedSet.has(inputText.trim());

  const addCustom = (label: string) => {
    const computed = resolveCustomValue ? resolveCustomValue(label) : label;
    if (!selectedSet.has(computed)) {
      onChange([...value, computed]);
      onCustomAdded?.(computed, label);
    }
    setInputText("");
    setOpen(false);
  };

  const addOption = (v: string) => {
    onChange([...value, v]);
    setInputText("");
    setOpen(false);
  };

  const remove = (v: string) => {
    onChange(value.filter((s) => s !== v));
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setInputText("");
    }, 150);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <div
                key={v}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#1e3a5f",
                  borderRadius: 4,
                  padding: "2px 4px 2px 8px",
                  fontSize: 12,
                  color: "#93c5fd",
                }}
              >
                <span>{opt?.label ?? v}</span>
                <ButtonIcon name="close" label="Remove" size="sm" onClick={() => remove(v)} />
              </div>
            );
          })}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="Add option…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "5px 8px",
            color: "#f1f5f9",
            fontSize: 13,
            outline: "none",
          }}
        />
        {open && (filtered.length > 0 || showCustom) && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 200,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            maxHeight: 200,
            overflowY: "auto",
            marginTop: 2,
          }}>
            {filtered.map((opt) => (
              <div
                key={opt.value}
                onMouseDown={() => addOption(opt.value)}
                style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, color: "#e2e8f0" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#0f172a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {opt.label}
              </div>
            ))}
            {showCustom && (
              <div
                onMouseDown={() => addCustom(inputText.trim())}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#94a3b8",
                  borderTop: filtered.length > 0 ? "1px solid #334155" : "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#0f172a";
                  e.currentTarget.style.color = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                Add "{inputText.trim()}"
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
