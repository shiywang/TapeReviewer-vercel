import { FormEvent, useEffect, useState } from "react";

// A trade's video is any external URL you paste (YouTube unlisted, Google Drive
// share, a direct .mp4, etc.). onSelect receives the URL.
export default function VideoLinkModal({
  open,
  onClose,
  onSelect,
  initialValue = "",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  initialValue?: string;
}) {
  const [url, setUrl] = useState(initialValue);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setUrl(initialValue);
      setError("");
    }
  }, [open, initialValue]);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!/^https?:\/\/.+/i.test(value)) {
      setError("Enter a full http(s) URL");
      return;
    }
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Link trade video</h2>
            <p className="text-xs text-muted">Paste a URL to this trade&rsquo;s recording.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        <input
          autoFocus
          type="url"
          placeholder="https://…/session.mp4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-4 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm"
        />
        <p className="mt-2 text-xs text-muted">
          A direct <code className="font-mono">.mp4</code>/<code className="font-mono">.webm</code> URL
          plays inline. Drive/YouTube links are stored and open in a new tab.
        </p>
        {error && <p className="mt-2 text-sm text-loss">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white"
          >
            Link video
          </button>
        </div>
      </form>
    </div>
  );
}
