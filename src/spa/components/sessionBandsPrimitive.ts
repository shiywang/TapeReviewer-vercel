// A Lightweight Charts v5 series primitive that shades vertical time bands behind
// the candles — used to tint the pre-market and post-market regions. Lightweight
// Charts has no session concept, so we draw the rectangles ourselves on the pane
// canvas, converting band times → x pixels via the time scale each frame (so the
// bands track panning/zooming).
import type {
  IChartApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface SessionBand {
  from: UTCTimestamp;
  to: UTCTimestamp;
  color: string;
}

export interface SessionLine {
  time: UTCTimestamp;
  color: string;
}

interface BitmapScope {
  context: CanvasRenderingContext2D;
  bitmapSize: { width: number; height: number };
  horizontalPixelRatio: number;
}
interface BitmapTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

class BandsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly source: SessionBands) {}

  draw(target: unknown): void {
    const chart = this.source.chart;
    if (!chart) return;
    const ts = chart.timeScale();
    const visible = ts.getVisibleRange();
    if (!visible) return;
    const vFrom = visible.from as unknown as number;
    const vTo = visible.to as unknown as number;

    (target as BitmapTarget).useBitmapCoordinateSpace((scope) => {
      const { context: ctx, horizontalPixelRatio: hpr, bitmapSize } = scope;
      for (const band of this.source.bands) {
        // Clamp to the visible range so edges outside the view still fill correctly.
        const from = Math.max(band.from, vFrom);
        const to = Math.min(band.to, vTo);
        if (from >= to) continue;
        const x1 = ts.timeToCoordinate(from as unknown as Time);
        const x2 = ts.timeToCoordinate(to as unknown as Time);
        if (x1 == null || x2 == null) continue;
        const px1 = Math.round(x1 * hpr);
        const px2 = Math.round(x2 * hpr);
        ctx.fillStyle = band.color;
        ctx.fillRect(px1, 0, Math.max(1, px2 - px1), bitmapSize.height);
      }

      // Vertical session-boundary lines (e.g. 09:30 open, 16:00 close).
      for (const line of this.source.lines) {
        if (line.time < vFrom || line.time > vTo) continue;
        const x = ts.timeToCoordinate(line.time as unknown as Time);
        if (x == null) continue;
        const px = Math.round(x * hpr);
        ctx.fillStyle = line.color;
        ctx.fillRect(px, 0, Math.max(1, Math.round(hpr)), bitmapSize.height);
      }
    });
  }
}

class BandsPaneView implements IPrimitivePaneView {
  constructor(private readonly source: SessionBands) {}
  zOrder(): PrimitivePaneViewZOrder {
    return "bottom"; // behind the candles
  }
  renderer(): IPrimitivePaneRenderer {
    return new BandsRenderer(this.source);
  }
}

export class SessionBands implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  private readonly view: BandsPaneView;

  constructor(
    public readonly bands: SessionBand[],
    public readonly lines: SessionLine[] = [],
  ) {
    this.view = new BandsPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
  }
  detached(): void {
    this.chart = null;
  }
  updateAllViews(): void {}
  paneViews(): IPrimitivePaneView[] {
    return [this.view];
  }
}
