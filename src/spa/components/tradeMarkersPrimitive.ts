// A Lightweight Charts v5 series primitive that draws right-pointing arrows whose
// tip lands exactly at a (time, price) coordinate — used to pin a trade's entry and
// exit precisely at their fill price levels (series markers can only sit above/below
// a bar, not at an arbitrary price).
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface TradePoint {
  time: UTCTimestamp;
  price: number;
  color: string;
}

interface BitmapScope {
  context: CanvasRenderingContext2D;
  bitmapSize: { width: number; height: number };
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}
interface BitmapTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

class Renderer implements IPrimitivePaneRenderer {
  constructor(private readonly source: TradeMarkers) {}

  draw(target: unknown): void {
    const chart = this.source.chart;
    const series = this.source.series;
    if (!chart || !series) return;
    const ts = chart.timeScale();

    (target as BitmapTarget).useBitmapCoordinateSpace((scope) => {
      const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
      for (const p of this.source.points) {
        const x = ts.timeToCoordinate(p.time as unknown as Time);
        const y = series.priceToCoordinate(p.price);
        if (x == null || y == null) continue;
        const px = x * hpr;
        const py = y * vpr;
        const w = 11 * hpr; // arrow length
        const h = 5.5 * vpr; // half-height

        // Filled right-pointing triangle with its tip exactly on (time, price),
        // plus a thin leader tick so the exact level reads clearly.
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - w, py - h);
        ctx.lineTo(px - w, py + h);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = Math.max(1, hpr);
        ctx.stroke();
      }
    });
  }
}

class PaneView implements IPrimitivePaneView {
  constructor(private readonly source: TradeMarkers) {}
  zOrder(): PrimitivePaneViewZOrder {
    return "top"; // on top of the candles
  }
  renderer(): IPrimitivePaneRenderer {
    return new Renderer(this.source);
  }
}

export class TradeMarkers implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  private readonly view: PaneView;

  constructor(public readonly points: TradePoint[]) {
    this.view = new PaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series;
  }
  detached(): void {
    this.chart = null;
    this.series = null;
  }
  updateAllViews(): void {}
  paneViews(): IPrimitivePaneView[] {
    return [this.view];
  }
}
