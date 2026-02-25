"use client";

import type UIContext from "@sdk/types/ui-context";

interface Props {
  context: UIContext;
}

export default function App({ context }: Props) {
  return (
    <div>
      <h1>My App</h1>
    </div>
  );
}
