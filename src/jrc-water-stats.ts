import maplibregl from "maplibre-gl";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
);

interface JrcWaterStatsResponse {
  monthly_history: {
    frequency: string;
    unit: string;
    data: { Month: string; Area: number }[];
  };
  water_occurrence: {
    stats: { mean: number; min: number; max: number; stdDev: number };
    histogram: { bin_edges: number[]; counts: number[] };
  };
  parameters: Record<string, unknown>;
}

interface JrcWaterStatsOptions {
  collapsed?: boolean;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const API_ENDPOINT =
  "https://giswqs-ee-tile-request.hf.space/jrc-water-stats";
const BBOX_SOURCE_ID = "jrc-bbox-source";
const BBOX_FILL_LAYER = "jrc-bbox-fill";
const BBOX_LINE_LAYER = "jrc-bbox-line";

/**
 * Creates a Chart.js bar chart configuration.
 */
function createBarChartConfig(
  labels: string[],
  data: number[],
  color: string,
  yAxisLabel: string,
) {
  return {
    type: "bar" as const,
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: color.replace(")", ", 0.7)").replace("rgb", "rgba"),
          borderColor: color,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        x: {
          ticks: { maxRotation: 90, autoSkip: true, maxTicksLimit: 20, font: { size: 9 } },
        },
        y: {
          title: { display: true, text: yAxisLabel, font: { size: 10 } },
          ticks: { font: { size: 9 } },
        },
      },
    },
  };
}

export class JrcWaterStatsControl implements maplibregl.IControl {
  private map: maplibregl.Map | null = null;
  private container: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private collapsed: boolean;
  private bbox: [number, number, number, number] | null = null;
  private bboxStatusEl: HTMLElement | null = null;
  private fetchBtn: HTMLButtonElement | null = null;
  private drawBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private monthlyChart: Chart | null = null;
  private histogramChart: Chart | null = null;
  private monthlyCanvas: HTMLCanvasElement | null = null;
  private histogramCanvas: HTMLCanvasElement | null = null;
  private statsEl: HTMLElement | null = null;
  private drawing = false;
  private drawStart: maplibregl.LngLat | null = null;
  private startMonth = 5;
  private endMonth = 10;
  private rangeMinThumb: HTMLElement | null = null;
  private rangeMaxThumb: HTMLElement | null = null;
  private rangeTrackFill: HTMLElement | null = null;
  private rangeLabel: HTMLElement | null = null;

  // Store last fetched data for popup re-rendering
  private lastMonthlyData: { Month: string; Area: number }[] | null = null;
  private lastHistogramData: { bin_edges: number[]; counts: number[] } | null = null;

  // Bound handlers for cleanup
  private onMouseDown: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  private onMouseMove: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  private onMouseUp: ((e: maplibregl.MapMouseEvent) => void) | null = null;

  constructor(options: JrcWaterStatsOptions = {}) {
    this.collapsed = options.collapsed ?? true;
  }

  getDefaultPosition(): maplibregl.ControlPosition {
    return "top-right";
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;

    // Outer wrapper — matches maplibregl-ctrl-group for consistent sizing
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    // Icon button (same size as other map controls)
    const iconBtn = document.createElement("button");
    iconBtn.className = "jrc-water-stats-icon-btn";
    iconBtn.type = "button";
    iconBtn.title = "JRC Water Stats";
    // Water drop SVG icon
    iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    iconBtn.addEventListener("click", () => this.togglePanel());
    this.container.appendChild(iconBtn);

    // Floating panel (hidden initially)
    this.panel = document.createElement("div");
    this.panel.className = "jrc-water-stats-panel";
    this.panel.style.display = this.collapsed ? "none" : "block";

    // Header
    const header = document.createElement("div");
    header.className = "jrc-water-stats-header";
    const title = document.createElement("span");
    title.textContent = "JRC Water Stats";
    const closeBtn = document.createElement("button");
    closeBtn.className = "jrc-water-stats-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", () => this.togglePanel());
    header.appendChild(title);
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "jrc-water-stats-body";

    // Month range slider
    body.appendChild(this.createMonthRangeSlider());

    // Scale input
    const scaleField = this.createNumberInput("Scale (m)", "jrc-scale", 10, 1000, 100);
    scaleField.style.marginBottom = "8px";
    body.appendChild(scaleField);

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "jrc-water-stats-buttons";

    this.drawBtn = document.createElement("button");
    this.drawBtn.textContent = "Draw BBox";
    this.drawBtn.addEventListener("click", () => this.startBBoxDraw());

    this.fetchBtn = document.createElement("button");
    this.fetchBtn.textContent = "Fetch Data";
    this.fetchBtn.addEventListener("click", () => this.fetchData());

    btnRow.appendChild(this.drawBtn);
    btnRow.appendChild(this.fetchBtn);
    body.appendChild(btnRow);

    // BBox status
    this.bboxStatusEl = document.createElement("div");
    this.bboxStatusEl.className = "jrc-water-stats-bbox-status";
    this.bboxStatusEl.textContent = "No bounding box drawn";
    body.appendChild(this.bboxStatusEl);

    // Status / loading
    this.statusEl = document.createElement("div");
    this.statusEl.className = "jrc-water-stats-status";
    body.appendChild(this.statusEl);

    // Monthly chart (clickable)
    const monthlyLabel = document.createElement("div");
    monthlyLabel.className = "jrc-water-stats-chart-label";
    monthlyLabel.textContent = "Monthly Water Area (click to expand)";
    body.appendChild(monthlyLabel);

    const monthlyContainer = document.createElement("div");
    monthlyContainer.className = "jrc-water-stats-chart";
    monthlyContainer.title = "Click to expand";
    this.monthlyCanvas = document.createElement("canvas");
    monthlyContainer.appendChild(this.monthlyCanvas);
    monthlyContainer.addEventListener("click", () =>
      this.openChartPopup("Monthly Water Area (hectares)", "monthly"),
    );
    body.appendChild(monthlyContainer);

    // Histogram chart (clickable)
    const histLabel = document.createElement("div");
    histLabel.className = "jrc-water-stats-chart-label";
    histLabel.textContent = "Water Occurrence Distribution (click to expand)";
    body.appendChild(histLabel);

    const histContainer = document.createElement("div");
    histContainer.className = "jrc-water-stats-chart";
    histContainer.title = "Click to expand";
    this.histogramCanvas = document.createElement("canvas");
    histContainer.appendChild(this.histogramCanvas);
    histContainer.addEventListener("click", () =>
      this.openChartPopup("Water Occurrence Distribution", "histogram"),
    );
    body.appendChild(histContainer);

    // Stats
    this.statsEl = document.createElement("div");
    this.statsEl.className = "jrc-water-stats-stats";
    body.appendChild(this.statsEl);

    this.panel.appendChild(body);
    this.container.appendChild(this.panel);

    // Stop clicks inside the panel from propagating to the map
    this.panel.addEventListener("mousedown", (e) => e.stopPropagation());
    this.panel.addEventListener("wheel", (e) => e.stopPropagation());

    // Add bbox source/layers to map
    this.addBBoxLayers();

    return this.container;
  }

  onRemove(): void {
    this.stopBBoxDraw();
    this.monthlyChart?.destroy();
    this.histogramChart?.destroy();
    if (this.map) {
      if (this.map.getLayer(BBOX_LINE_LAYER)) this.map.removeLayer(BBOX_LINE_LAYER);
      if (this.map.getLayer(BBOX_FILL_LAYER)) this.map.removeLayer(BBOX_FILL_LAYER);
      if (this.map.getSource(BBOX_SOURCE_ID)) this.map.removeSource(BBOX_SOURCE_ID);
    }
    this.container?.remove();
    this.map = null;
  }

  private togglePanel(): void {
    this.collapsed = !this.collapsed;
    if (this.panel) {
      this.panel.style.display = this.collapsed ? "none" : "block";
    }
    if (!this.collapsed) {
      this.monthlyChart?.resize();
      this.histogramChart?.resize();
    }
  }

  private createMonthRangeSlider(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "jrc-water-stats-range-wrapper";

    const label = document.createElement("label");
    label.className = "jrc-water-stats-range-title";
    label.textContent = "Month Range";
    wrapper.appendChild(label);

    this.rangeLabel = document.createElement("div");
    this.rangeLabel.className = "jrc-water-stats-range-label";
    this.updateRangeLabel();
    wrapper.appendChild(this.rangeLabel);

    const track = document.createElement("div");
    track.className = "jrc-water-stats-range-track";

    this.rangeTrackFill = document.createElement("div");
    this.rangeTrackFill.className = "jrc-water-stats-range-fill";
    track.appendChild(this.rangeTrackFill);

    this.rangeMinThumb = document.createElement("div");
    this.rangeMinThumb.className = "jrc-water-stats-range-thumb";
    track.appendChild(this.rangeMinThumb);

    this.rangeMaxThumb = document.createElement("div");
    this.rangeMaxThumb.className = "jrc-water-stats-range-thumb";
    track.appendChild(this.rangeMaxThumb);

    this.updateRangePositions();

    // Drag logic for min thumb
    this.addThumbDrag(this.rangeMinThumb, track, "min");
    this.addThumbDrag(this.rangeMaxThumb, track, "max");

    wrapper.appendChild(track);

    // Month tick labels
    const ticks = document.createElement("div");
    ticks.className = "jrc-water-stats-range-ticks";
    for (let m = 1; m <= 12; m++) {
      const tick = document.createElement("span");
      tick.textContent = String(m);
      ticks.appendChild(tick);
    }
    wrapper.appendChild(ticks);

    return wrapper;
  }

  private addThumbDrag(
    thumb: HTMLElement,
    track: HTMLElement,
    which: "min" | "max",
  ): void {
    let dragging = false;

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const month = Math.round(pct * 11) + 1; // 1-12

      if (which === "min") {
        this.startMonth = Math.min(month, this.endMonth);
      } else {
        this.endMonth = Math.max(month, this.startMonth);
      }
      this.updateRangePositions();
      this.updateRangeLabel();
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    thumb.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private updateRangePositions(): void {
    const pctMin = ((this.startMonth - 1) / 11) * 100;
    const pctMax = ((this.endMonth - 1) / 11) * 100;
    if (this.rangeMinThumb) this.rangeMinThumb.style.left = `${pctMin}%`;
    if (this.rangeMaxThumb) this.rangeMaxThumb.style.left = `${pctMax}%`;
    if (this.rangeTrackFill) {
      this.rangeTrackFill.style.left = `${pctMin}%`;
      this.rangeTrackFill.style.width = `${pctMax - pctMin}%`;
    }
  }

  private updateRangeLabel(): void {
    if (this.rangeLabel) {
      this.rangeLabel.textContent = `${MONTH_NAMES[this.startMonth - 1]} (${this.startMonth}) \u2013 ${MONTH_NAMES[this.endMonth - 1]} (${this.endMonth})`;
    }
  }

  private createNumberInput(
    label: string,
    id: string,
    min: number,
    max: number,
    defaultVal: number,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "jrc-water-stats-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.htmlFor = id;
    const input = document.createElement("input");
    input.type = "number";
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.value = String(defaultVal);
    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
  }

  private addBBoxLayers(): void {
    if (!this.map) return;

    this.map.addSource(BBOX_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    this.map.addLayer({
      id: BBOX_FILL_LAYER,
      type: "fill",
      source: BBOX_SOURCE_ID,
      paint: { "fill-color": "#4264fb", "fill-opacity": 0.1 },
    });

    this.map.addLayer({
      id: BBOX_LINE_LAYER,
      type: "line",
      source: BBOX_SOURCE_ID,
      paint: {
        "line-color": "#4264fb",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    });
  }

  private updateBBoxRectangle(
    sw: [number, number],
    ne: [number, number],
  ): void {
    if (!this.map) return;
    const source = this.map.getSource(BBOX_SOURCE_ID) as maplibregl.GeoJSONSource;
    if (!source) return;

    const polygon: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [sw[0], sw[1]],
            [ne[0], sw[1]],
            [ne[0], ne[1]],
            [sw[0], ne[1]],
            [sw[0], sw[1]],
          ],
        ],
      },
    };
    source.setData({ type: "FeatureCollection", features: [polygon] });
  }

  private clearCharts(): void {
    if (this.monthlyChart) {
      this.monthlyChart.destroy();
      this.monthlyChart = null;
    }
    if (this.histogramChart) {
      this.histogramChart.destroy();
      this.histogramChart = null;
    }
    this.lastMonthlyData = null;
    this.lastHistogramData = null;
    if (this.statsEl) this.statsEl.innerHTML = "";
    if (this.statusEl) this.statusEl.textContent = "";
  }

  private startBBoxDraw(): void {
    if (!this.map || this.drawing) return;
    this.drawing = true;
    this.clearCharts();
    this.drawBtn!.textContent = "Drawing...";
    this.bboxStatusEl!.textContent = "Click and drag to draw a bounding box";
    this.map.getCanvas().style.cursor = "crosshair";
    this.map.dragPan.disable();

    this.onMouseDown = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      this.drawStart = e.lngLat;
    };

    this.onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!this.drawStart) return;
      const sw: [number, number] = [
        Math.min(this.drawStart.lng, e.lngLat.lng),
        Math.min(this.drawStart.lat, e.lngLat.lat),
      ];
      const ne: [number, number] = [
        Math.max(this.drawStart.lng, e.lngLat.lng),
        Math.max(this.drawStart.lat, e.lngLat.lat),
      ];
      this.updateBBoxRectangle(sw, ne);
    };

    this.onMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!this.drawStart) return;
      const west = Math.min(this.drawStart.lng, e.lngLat.lng);
      const south = Math.min(this.drawStart.lat, e.lngLat.lat);
      const east = Math.max(this.drawStart.lng, e.lngLat.lng);
      const north = Math.max(this.drawStart.lat, e.lngLat.lat);
      this.bbox = [west, south, east, north];
      this.bboxStatusEl!.textContent = `BBox: [${west.toFixed(3)}, ${south.toFixed(3)}, ${east.toFixed(3)}, ${north.toFixed(3)}]`;
      this.updateBBoxRectangle([west, south], [east, north]);
      this.stopBBoxDraw();
    };

    this.map.on("mousedown", this.onMouseDown);
    this.map.on("mousemove", this.onMouseMove);
    this.map.on("mouseup", this.onMouseUp);
  }

  private stopBBoxDraw(): void {
    if (!this.map) return;
    this.drawing = false;
    this.drawStart = null;
    this.drawBtn!.textContent = "Draw BBox";
    this.map.getCanvas().style.cursor = "";
    this.map.dragPan.enable();

    if (this.onMouseDown) {
      this.map.off("mousedown", this.onMouseDown);
      this.onMouseDown = null;
    }
    if (this.onMouseMove) {
      this.map.off("mousemove", this.onMouseMove);
      this.onMouseMove = null;
    }
    if (this.onMouseUp) {
      this.map.off("mouseup", this.onMouseUp);
      this.onMouseUp = null;
    }
  }

  private async fetchData(): Promise<void> {
    if (!this.bbox) {
      this.statusEl!.textContent = "Please draw a bounding box first.";
      return;
    }

    const [west, south, east, north] = this.bbox;
    if (Math.abs(east - west) < 0.001 || Math.abs(north - south) < 0.001) {
      this.statusEl!.textContent = "Bounding box is too small. Please draw a larger area.";
      return;
    }

    const scale = parseInt(
      (document.getElementById("jrc-scale") as HTMLInputElement).value,
    );

    this.statusEl!.textContent = "Fetching data... (this may take a while)";
    this.fetchBtn!.disabled = true;

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: this.bbox,
          scale,
          start_month: this.startMonth,
          end_month: this.endMonth,
          frequency: "month",
        }),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody.detail) detail = errBody.detail;
          else if (errBody.message) detail = errBody.message;
          else if (typeof errBody === "string") detail = errBody;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(detail);
      }

      const data: JrcWaterStatsResponse = await response.json();
      this.statusEl!.textContent = "";
      this.lastMonthlyData = data.monthly_history.data;
      this.lastHistogramData = data.water_occurrence.histogram;
      this.renderMonthlyChart(data.monthly_history.data);
      this.renderHistogram(data.water_occurrence.histogram);
      this.renderStats(data.water_occurrence.stats);
    } catch (error) {
      this.statusEl!.textContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    } finally {
      this.fetchBtn!.disabled = false;
    }
  }

  private renderMonthlyChart(data: { Month: string; Area: number }[]): void {
    if (!this.monthlyCanvas) return;
    if (this.monthlyChart) this.monthlyChart.destroy();

    const config = createBarChartConfig(
      data.map((d) => d.Month),
      data.map((d) => d.Area),
      "rgb(66, 100, 251)",
      "Area (hectares)",
    );
    this.monthlyChart = new Chart(this.monthlyCanvas, config);
  }

  private renderHistogram(histogram: { bin_edges: number[]; counts: number[] }): void {
    if (!this.histogramCanvas) return;
    if (this.histogramChart) this.histogramChart.destroy();

    const labels = histogram.bin_edges
      .slice(0, -1)
      .map((edge, i) => `${edge}-${histogram.bin_edges[i + 1]}%`);

    const config = createBarChartConfig(
      labels,
      histogram.counts,
      "rgb(40, 167, 69)",
      "Count (hectares)",
    );
    this.histogramChart = new Chart(this.histogramCanvas, config);
  }

  private renderStats(stats: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
  }): void {
    if (!this.statsEl) return;
    this.statsEl.innerHTML = `
      <strong>Occurrence Stats</strong><br/>
      Mean: ${stats.mean.toFixed(2)}% | Min: ${stats.min}% | Max: ${stats.max}% | Std Dev: ${stats.stdDev.toFixed(2)}%
    `;
  }

  private openChartPopup(title: string, chartType: "monthly" | "histogram"): void {
    const data =
      chartType === "monthly" ? this.lastMonthlyData : this.lastHistogramData;
    if (!data) return;

    // Overlay backdrop
    const overlay = document.createElement("div");
    overlay.className = "jrc-chart-overlay";

    // Popup container
    const popup = document.createElement("div");
    popup.className = "jrc-chart-popup";

    // Header
    const header = document.createElement("div");
    header.className = "jrc-chart-popup-header";
    const titleEl = document.createElement("span");
    titleEl.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.className = "jrc-chart-popup-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => {
      popupChart.destroy();
      overlay.remove();
    });
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Canvas
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "jrc-chart-popup-canvas";
    const canvas = document.createElement("canvas");
    canvasWrap.appendChild(canvas);
    popup.appendChild(canvasWrap);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "jrc-chart-popup-actions";

    const downloadChartBtn = document.createElement("button");
    downloadChartBtn.textContent = "Download Chart";
    downloadChartBtn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `jrc-${chartType}-chart.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    const downloadCsvBtn = document.createElement("button");
    downloadCsvBtn.textContent = "Download CSV";
    downloadCsvBtn.addEventListener("click", () => {
      const csv = this.generateCsv(chartType, data);
      const blob = new Blob([csv], { type: "text/csv" });
      const link = document.createElement("a");
      link.download = `jrc-${chartType}-data.csv`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });

    actions.appendChild(downloadChartBtn);
    actions.appendChild(downloadCsvBtn);
    popup.appendChild(actions);

    overlay.appendChild(popup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        popupChart.destroy();
        overlay.remove();
      }
    });
    document.body.appendChild(overlay);

    // Render chart
    let config: ReturnType<typeof createBarChartConfig>;
    if (chartType === "monthly") {
      const d = data as { Month: string; Area: number }[];
      config = createBarChartConfig(
        d.map((e) => e.Month),
        d.map((e) => e.Area),
        "rgb(66, 100, 251)",
        "Area (hectares)",
      );
    } else {
      const h = data as { bin_edges: number[]; counts: number[] };
      const labels = h.bin_edges
        .slice(0, -1)
        .map((edge, i) => `${edge}-${h.bin_edges[i + 1]}%`);
      config = createBarChartConfig(labels, h.counts, "rgb(40, 167, 69)", "Count (hectares)");
    }
    const popupChart = new Chart(canvas, config);
  }

  private generateCsv(
    chartType: "monthly" | "histogram",
    data: { Month: string; Area: number }[] | { bin_edges: number[]; counts: number[] },
  ): string {
    if (chartType === "monthly") {
      const d = data as { Month: string; Area: number }[];
      const rows = ["Month,Area (hectares)"];
      for (const entry of d) {
        rows.push(`${entry.Month},${entry.Area}`);
      }
      return rows.join("\n");
    } else {
      const h = data as { bin_edges: number[]; counts: number[] };
      const rows = ["Bin Start (%),Bin End (%),Count (hectares)"];
      for (let i = 0; i < h.counts.length; i++) {
        rows.push(`${h.bin_edges[i]},${h.bin_edges[i + 1]},${h.counts[i]}`);
      }
      return rows.join("\n");
    }
  }
}
