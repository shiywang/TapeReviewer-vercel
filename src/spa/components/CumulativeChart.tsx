import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../lib/format";

export default function CumulativeChart({ data }: { data: { date: string; cumulative: number }[] }) {
  return (
    <div className="h-full min-h-72 rounded-xl border border-line bg-surface p-4 shadow-panel">
      <h2 className="font-display text-lg font-bold">Cumulative P&L</h2>
      <p className="mt-1 text-sm text-muted">Running net since filter start</p>
      <div className="mt-4 h-56">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No trades in range</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F8A7A" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0F8A7A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#D7DEE6" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={8} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={56} />
              <Tooltip
                formatter={(value: number) => [formatMoney(value), "Cumulative"]}
                contentStyle={{ borderRadius: 10, borderColor: "#D7DEE6" }}
              />
              <Area type="monotone" dataKey="cumulative" stroke="#0F8A7A" fill="url(#cumFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
