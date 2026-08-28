import React, { forwardRef } from "react";

export const DropIndicator = forwardRef<HTMLDivElement>(function DropIndicator(_props, ref) {
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        borderRadius: 14,
        border: "2.5px solid #0a59f7",
        backgroundColor: "rgba(10, 89, 247, 0.08)",
        boxShadow: "0 0 0 3px rgba(10, 89, 247, 0.15)",
        pointerEvents: "none",
        userSelect: "none",
        display: "none",
        zIndex: 5,
        boxSizing: "border-box",
        transition: "border-color 100ms ease, background-color 100ms ease",
      }}
    />
  );
});
