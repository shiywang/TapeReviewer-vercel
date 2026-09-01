// Port of app/analytics.py — PnL math, summaries, cumulative series, calendar.

export function roundTo(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * f) / f;
}
export const round2 = (v: number) => roundTo(v, 2);
export const round4 = (v: number) => roundTo(v, 4);

/** Date portion of an ISO-ish timestamp, without timezone math (naive, like Python). */
export function tradeDate(closedAt: string): string {
  return closedAt.replace(" ", "T").split("T")[0];
}

export type TradeLike = { net_pnl: number | string; closed_at: string; opened_at?: string };

export function computePnl(
  side: string,
  qty: number,
  avgEntry: number,
  avgExit: number,
  fees: number,
): [number, number, number] {
  const gross = side === "LONG" ? (avgExit - avgEntry) * qty : (avgEntry - avgExit) * qty;
  const net = gross - fees;
  const notional = Math.abs(avgEntry * qty) || 1.0;
  const roi = (net / notional) * 100;
  return [gross, net, roi];
}

export interface Summary {
  net_pnl: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  trade_win_pct: number;
  profit_factor: number;
  day_win_pct: number;
  avg_win: number;
  avg_loss: number;
  gross_wins: number;
  gross_losses: number;
}

export function summarizeTrades(trades: TradeLike[]): Summary {
  if (!trades.length) {
    return {
      net_pnl: 0,
      trade_count: 0,
      win_count: 0,
      loss_count: 0,
      trade_win_pct: 0,
      profit_factor: 0,
      day_win_pct: 0,
      avg_win: 0,
      avg_loss: 0,
      gross_wins: 0,
      gross_losses: 0,
    };
  }

  const nets = trades.map((t) => Number(t.net_pnl));
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor =
    grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? grossWins : 0;

  const byDay = new Map<string, number>();
  for (const t of trades) {
    const d = tradeDate(t.closed_at);
    byDay.set(d, (byDay.get(d) || 0) + Number(t.net_pnl));
  }
  const dayWins = [...byDay.values()].filter((v) => v > 0).length;
  const dayTotal = byDay.size;

  return {
    net_pnl: nets.reduce((a, b) => a + b, 0),
    trade_count: trades.length,
    win_count: wins.length,
    loss_count: losses.length,
    trade_win_pct: (wins.length / trades.length) * 100,
    profit_factor: round2(profitFactor),
    day_win_pct: dayTotal ? (dayWins / dayTotal) * 100 : 0,
    avg_win: wins.length ? grossWins / wins.length : 0,
    avg_loss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
    gross_wins: grossWins,
    gross_losses: grossLosses,
  };
}

export function cumulativeSeries(trades: TradeLike[]): { date: string; cumulative: number }[] {
  const ordered = [...trades].sort((a, b) => (a.closed_at < b.closed_at ? -1 : a.closed_at > b.closed_at ? 1 : 0));
  const daily = new Map<string, number>();
  let running = 0;
  for (const t of ordered) {
    running += Number(t.net_pnl);
    daily.set(tradeDate(t.closed_at), running);
  }
  return [...daily.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, cumulative]) => ({ date, cumulative }));
}

function utcDay(isoDate: string): number {
  // isoDate = "YYYY-MM-DD"; Sunday=0 … Saturday=6
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function calendarMonth(trades: TradeLike[], year: number, month: number) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDay = new Map<string, TradeLike[]>();
  for (const t of trades) {
    const d = tradeDate(t.closed_at);
    const [ty, tm] = d.split("-").map(Number);
    if (ty === year && tm === month) {
      const arr = byDay.get(d) || [];
      arr.push(t);
      byDay.set(d, arr);
    }
  }

  const cells: {
    date: string;
    day: number;
    net_pnl: number;
    trade_count: number;
    win_pct: number;
    intensity: number;
  }[] = [];
  let maxAbs = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    const dayTrades = byDay.get(d) || [];
    const net = dayTrades.reduce((a, t) => a + Number(t.net_pnl), 0);
    const wins = dayTrades.filter((t) => Number(t.net_pnl) > 0).length;
    const winPct = dayTrades.length ? (wins / dayTrades.length) * 100 : 0;
    maxAbs = Math.max(maxAbs, Math.abs(net));
    cells.push({ date: d, day, net_pnl: net, trade_count: dayTrades.length, win_pct: winPct, intensity: 0 });
  }
  for (const cell of cells) {
    cell.intensity = maxAbs ? Math.abs(cell.net_pnl) / maxAbs : 0;
  }

  const startWeekday = utcDay(
    `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`,
  );

  const weeks: { week: number; net_pnl: number }[] = [];
  let weekNum = 1;
  let weekPnl = 0;
  cells.forEach((cell, i) => {
    weekPnl += cell.net_pnl;
    const isSaturday = utcDay(cell.date) === 6;
    const isLast = i === cells.length - 1;
    if (isSaturday || isLast) {
      weeks.push({ week: weekNum, net_pnl: weekPnl });
      weekNum += 1;
      weekPnl = 0;
    }
  });

  return {
    year,
    month,
    cells,
    weeks,
    month_net_pnl: cells.reduce((a, c) => a + c.net_pnl, 0),
    start_weekday: startWeekday,
  };
}
