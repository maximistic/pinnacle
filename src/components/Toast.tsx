"use client";
import { useEffect, useState } from "react";

type Props = {
  message: string;
  type?: "success" | "error" | "warn";
  duration?: number; // ms, default 3000
  onDismiss: () => void;
};

export default function Toast({ message, type = "success", duration = 3000, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
    };
  }, [duration, onDismiss]);

  const borderColor =
    type === "error" ? "border-loss/50 text-loss" :
    type === "warn"  ? "border-amber/50 text-amber" :
    "border-gain/50 text-gain";

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] px-4 py-3 text-xs font-mono border bg-surface shadow-lg transition-all duration-300 ${borderColor} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
          className="ml-1 text-muted hover:text-foreground transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
