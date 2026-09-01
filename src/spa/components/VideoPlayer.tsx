import { useEffect, useRef } from "react";
import { mediaUrl } from "../lib/api";

export default function VideoPlayer({
  relativePath,
  seekSec,
  label,
  disabled,
  disabledReason,
  onLink,
  onClear,
}: {
  relativePath: string | null;
  seekSec?: number | null;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  onLink: () => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && seekSec != null && !Number.isNaN(seekSec)) {
      try {
        ref.current.currentTime = Math.max(0, seekSec);
      } catch {
        /* ignore seek errors before metadata */
      }
    }
  }, [seekSec, relativePath]);

  if (disabled) {
    return (
      <div className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper px-4 py-8 text-center">
        <div className="font-display text-lg font-bold text-muted">Select a trade</div>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {disabledReason || "Each trade has its own recording — pick a trade, then link a video URL."}
        </p>
      </div>
    );
  }

  if (!relativePath) {
    return (
      <button
        type="button"
        onClick={onLink}
        className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-signal/40 bg-signal/5 px-4 py-8 text-center transition hover:bg-signal/10"
      >
        <div className="font-display text-lg font-bold text-signal">Link video URL</div>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {label
            ? `Paste a video URL for ${label}. Each trade has its own video.`
            : "Paste a video URL for this trade. Each trade has its own video."}{" "}
          A direct .mp4 link plays inline; some hosts (e.g. YouTube) only open in a new tab.
        </p>
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink shadow-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white/80">
        <div className="min-w-0">
          {label && <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{label}</div>}
          <span className="block truncate font-mono text-xs">{relativePath}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onLink} className="text-xs text-white/70 hover:text-white">
            Change
          </button>
          <button type="button" onClick={onClear} className="text-xs text-white/70 hover:text-white">
            Unlink
          </button>
        </div>
      </div>
      <video ref={ref} key={relativePath} controls preload="metadata" className="aspect-video w-full bg-black">
        <source src={mediaUrl(relativePath)} />
        Your browser does not support embedded video.
      </video>
    </div>
  );
}
