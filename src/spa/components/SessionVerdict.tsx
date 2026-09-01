import type { Verdict } from "../types";

const OPTIONS: { value: Verdict; label: string; className: string }[] = [
  { value: "followed_plan", label: "Followed plan", className: "bg-signal/15 text-signal border-signal/30" },
  { value: "broke_rules", label: "Broke rules", className: "bg-loss/10 text-loss border-loss/30" },
  { value: "no_edge", label: "No edge", className: "bg-warn/10 text-warn border-warn/30" },
];

export default function SessionVerdict({
  value,
  onChange,
}: {
  value: Verdict | null;
  onChange: (v: Verdict) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              active ? opt.className : "border-line bg-paper text-muted hover:border-signal/40"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
