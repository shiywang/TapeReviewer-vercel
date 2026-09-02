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
      <div className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line bg-paper px-3 py-2 text-xs text-muted">
        <span className="font-semibold">Video</span>
        <span className="truncate">{disabledReason || "Select a trade to link a recording."}</span>
      </div>
    );
  }

  if (!relativePath) {
    return (
      <button
        type="button"
        onClick={onLink}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-signal/40 bg-signal/5 px-3 py-2 text-left text-xs transition hover:bg-signal/10"
        title={label ? `Link a video URL for ${label}` : "Link a video URL for this trade"}
      >
        <span className="font-semibold text-signal">＋ Link video URL</span>
        <span className="truncate text-muted">.mp4 plays inline; YouTube/Drive open in a tab</span>
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
