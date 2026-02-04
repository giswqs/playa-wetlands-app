import "./style.css";

import "maplibre-gl/dist/maplibre-gl.css";
import "@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css";
import "maplibre-gl-geo-editor/style.css";
import "maplibre-gl-layer-control/style.css";
import "maplibre-gl-streetview/style.css";
import "mapillary-js/dist/mapillary.css";
import "maplibre-gl-lidar/style.css";
import "maplibre-gl-usgs-lidar/style.css";

import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import {
  LayerControl,
  type CustomLayerAdapter,
  type LayerState,
} from "maplibre-gl-layer-control";
import { Colorbar, Legend, SearchControl, TerrainControl } from "maplibre-gl-components";
import { StreetViewControl } from "maplibre-gl-streetview";
// import { LidarControl, LidarLayerAdapter } from 'maplibre-gl-lidar';
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  UsgsLidarControl,
  UsgsLidarLayerAdapter,
} from "maplibre-gl-usgs-lidar";

// Get API keys from environment variables (Vite exposes them via import.meta.env)
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN || "";

// Log configuration status
console.log(
  "Google Street View:",
  GOOGLE_API_KEY ? "Configured" : "Not configured"
);
console.log("Mapillary:", MAPILLARY_TOKEN ? "Configured" : "Not configured");

// Register PMTiles protocol
const pmtilesProtocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

const BASE_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const map = new maplibregl.Map({
  container: "map",
  style: BASE_MAP_STYLE,
  center: [0, 0],
  zoom: 2,
  maxPitch: 85,
});

// Add navigation controls to top-right
map.addControl(new maplibregl.NavigationControl(), "top-right");

// Add fullscreen control to top-right (after navigation)
map.addControl(new maplibregl.FullscreenControl(), "top-right");

// Add globe control to top-right (after navigation)
map.addControl(new maplibregl.GlobeControl(), "top-right");

// Add terrain control - toggle 3D terrain using free AWS Terrarium tiles
const terrainControl = new TerrainControl({
  exaggeration: 1.0,
  hillshade: true,
});
map.addControl(terrainControl, "top-right");

map.on("load", () => {
  // Get all layers from the style
  const style = map.getStyle();
  if (!style || !style.layers) {
    return;
  }

  const minzoom = 8;
  // Add Google Satellite basemap
  map.addSource("google-satellite", {
    type: "raster",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    tileSize: 256,
    attribution: "&copy; Google",
  });

  map.addLayer({
    id: "Google Satellite",
    type: "raster",
    source: "google-satellite",
    paint: {
      "raster-opacity": 1,
    },
    minzoom: minzoom,
    layout: {
      visibility: "visible",
    },
  });

  // Add NAIP False Color Composite (WMS)
  map.addSource("naip-false-color", {
    type: "raster",
    tiles: [
      "https://imagery.nationalmap.gov/arcgis/services/USGSNAIPImagery/ImageServer/WMSServer?service=WMS&request=GetMap&layers=USGSNAIPImagery:FalseColorComposite&styles=&format=image/png&transparent=true&version=1.3.0&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}",
    ],
    tileSize: 256,
    attribution: "&copy; USGS NAIP",
  });

  map.addLayer({
    id: "NAIP False Color",
    type: "raster",
    source: "naip-false-color",
    paint: {
      "raster-opacity": 1,
    },
    layout: {
      visibility: "none",
    },
  });

  // Add 3DEP Hillshade Multidirectional (WMS)
  map.addSource("3dep-hillshade", {
    type: "raster",
    tiles: [
      "https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer?service=WMS&request=GetMap&layers=3DEPElevation:Hillshade Multidirectional&styles=&format=image/png&transparent=true&version=1.3.0&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}",
    ],
    tileSize: 256,
    attribution: "&copy; USGS 3DEP",
  });

  map.addLayer({
    id: "3DEP Hillshade",
    type: "raster",
    source: "3dep-hillshade",
    paint: {
      "raster-opacity": 1.0,
    },
    minzoom: 11,
    layout: {
      visibility: "visible",
    },
  });

  // Add Global Surface Water Occurrence (WMTS)
  map.addSource("gsw-occurrence", {
    type: "raster",
    tiles: [
      "https://storage.googleapis.com/global-surface-water/tiles2021/occurrence/{z}/{x}/{y}.png",
    ],
    tileSize: 256,
    attribution: "&copy; EC JRC/Google",
  });

  map.addLayer({
    id: "JRC Water Occurrence",
    type: "raster",
    source: "gsw-occurrence",
    paint: {
      "raster-opacity": 1,
    },
    layout: {
      visibility: "none",
    },
  });

  // // Add a raster layer (using MapLibre demo tiles as example)
  // map.addSource('raster-source', {
  //   type: 'raster',
  //   tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  //   tileSize: 256,
  //   attribution: '&copy; OpenStreetMap contributors'
  // });

  // map.addLayer({
  //   id: 'OpenStreetMap',
  //   type: 'raster',
  //   source: 'raster-source',
  //   paint: {
  //     'raster-opacity': 1.0
  //   },
  //   layout: {
  //     visibility: 'none'
  //   },
  // }); // Insert below countries layer

  // Add PLJV boundaries
  const pljvBoundary: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-106.38806, 43.287453],
              [-105.816892, 36.943581],
              [-103.97158, 31.271802],
              [-101.511165, 30.214278],
              [-99.006814, 29.833794],
              [-97.864478, 30.555461],
              [-97.029695, 32.503102],
              [-96.634271, 35.20327],
              [-96.414591, 37.224041],
              [-96.107039, 40.072029],
              [-96.107039, 41.634177],
              [-96.722143, 42.966724],
              [-98.479582, 43.606499],
              [-101.115741, 44.271017],
              [-104.059452, 44.018743],
              [-106.38806, 43.287453],
            ],
          ],
        },
      },
    ],
  };

  map.addSource("pljv-boundaries", {
    type: "geojson",
    data: pljvBoundary,
  });

  map.addLayer({
    id: "Playa Boundary",
    type: "fill",
    source: "pljv-boundaries",
    paint: {
      "fill-color": "transparent",
      "fill-outline-color": "#000000",
    },
    layout: {
      visibility: "none",
    },
  });

  // Add WBDHU8 (Watershed Boundary Dataset HUC8) from PMTiles
  map.addSource("wbdhu8", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/WBDHU8.pmtiles",
  });

  map.addLayer({
    id: "WBDHU8 Boundary",
    type: "fill",
    source: "wbdhu8",
    "source-layer": "wbdhu8_5070__wbdhu8__wbd_national_gpkg__wbdhu8",
    paint: {
      "fill-color": "transparent",
      "fill-outline-color": "#3388ff",
    },
  });

  // Add Depressions 10m from PMTiles
  map.addSource("depressions-10m", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/depressions_10m.pmtiles",
  });

  map.addLayer({
    id: "Depressions 10m",
    type: "fill",
    source: "depressions-10m",
    "source-layer": "merged_layer",
    paint: {
      "fill-color": "#ff7043",
      "fill-opacity": 0.5,
    },
    minzoom: minzoom,
    layout: {
      visibility: "visible",
    },
  });

  // Add NWI (National Wetlands Inventory) from PMTiles
  map.addSource("nwi", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/nwi.pmtiles",
  });

  map.addLayer({
    id: "NWI Wetlands",
    type: "fill",
    source: "nwi",
    "source-layer": "playa_nwi__conus_wetlands__conus_wet_poly",
    paint: {
      "fill-color": [
        "match",
        ["get", "WETLAND_TYPE"],
        "Freshwater Forested/Shrub Wetland",
        "rgb(0, 136, 55)",
        "Freshwater Emergent Wetland",
        "rgb(127, 195, 28)",
        "Freshwater Pond",
        "rgb(104, 140, 192)",
        "Estuarine and Marine Wetland",
        "rgb(102, 194, 165)",
        "Riverine",
        "rgb(1, 144, 191)",
        "Lake",
        "rgb(19, 0, 124)",
        "Estuarine and Marine Deepwater",
        "rgb(0, 124, 136)",
        "rgb(178, 134, 86)", // Other
      ],
      "fill-opacity": 0.5,
    },
    minzoom: minzoom,
    layout: {
      visibility: "visible",
    },
  });

  // Pickable layers with priority: Depressions/NWI first, WBDHU8 as fallback
  const pickableLayers = ["Depressions 10m", "NWI Wetlands", "WBDHU8 Boundary"];

  function buildPopupHtml(layerId: string, props: Record<string, any>): string {
    switch (layerId) {
      case "Depressions 10m":
        return `
          <strong>Depression</strong><br/>
          Area: ${
            props.area ? Number(props.area).toFixed(1) + " m²" : "N/A"
          }<br/>
          Volume: ${
            props.volume ? Number(props.volume).toFixed(1) + " m³" : "N/A"
          }<br/>
          Avg Depth: ${
            props["avg-depth"]
              ? Number(props["avg-depth"]).toFixed(2) + " m"
              : "N/A"
          }<br/>
          Max Depth: ${
            props["max-depth"]
              ? Number(props["max-depth"]).toFixed(2) + " m"
              : "N/A"
          }<br/>
          Perimeter: ${
            props.perimeter ? Number(props.perimeter).toFixed(1) + " m" : "N/A"
          }`;
      case "NWI Wetlands":
        return `
          <strong>NWI Wetland</strong><br/>
          Type: ${props.WETLAND_TYPE || "N/A"}<br/>
          Attribute: ${props.ATTRIBUTE || "N/A"}<br/>
          Acres: ${props.ACRES ? Number(props.ACRES).toFixed(2) : "N/A"}`;
      case "WBDHU8 Boundary":
        return `
          <strong>${props.name || "N/A"}</strong><br/>
          HUC8: ${props.huc8 || "N/A"}<br/>
          States: ${props.states || "N/A"}<br/>
          Area: ${
            props.areasqkm ? Number(props.areasqkm).toFixed(1) + " km²" : "N/A"
          }`;
      default:
        return "";
    }
  }

  map.on("click", (e) => {
    const depFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["Depressions 10m"],
    });
    const nwiFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["NWI Wetlands"],
    });

    const htmlParts: string[] = [];
    if (depFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml("Depressions 10m", depFeatures[0].properties)
      );
    }
    if (nwiFeatures.length > 0) {
      htmlParts.push(buildPopupHtml("NWI Wetlands", nwiFeatures[0].properties));
    }

    // Fall back to WBDHU8 only when neither Depressions nor NWI are present
    if (htmlParts.length === 0) {
      const wbdFeatures = map.queryRenderedFeatures(e.point, {
        layers: ["WBDHU8 Boundary"],
      });
      if (wbdFeatures.length === 0) return;
      htmlParts.push(
        buildPopupHtml("WBDHU8 Boundary", wbdFeatures[0].properties)
      );
    }

    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(htmlParts.join('<hr style="margin:6px 0"/>'))
      .addTo(map);
  });

  map.on("mousemove", (e) => {
    for (const id of pickableLayers) {
      const features = map.queryRenderedFeatures(e.point, { layers: [id] });
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        return;
      }
    }
    map.getCanvas().style.cursor = "";
  });

  // Fit map to PLJV boundaries
  const bounds = new maplibregl.LngLatBounds();
  const geom = pljvBoundary.features[0].geometry;
  if (geom.type === "Polygon") {
    for (const coord of geom.coordinates[0]) {
      bounds.extend(coord as [number, number]);
    }
  }
  map.fitBounds(bounds, { padding: 20 });

  const deckLayers = new Map<string, any>();
  // deckLayers.set('Points', pointsLayer);

  const deckOverlay = new MapboxOverlay({
    interleaved: true,
    layers: Array.from(deckLayers.values()),
    getTooltip: ({ object }: any) => {
      if (!object) return null;
      const p = object.properties;
      return {
        html: `<strong>Point</strong><br/>
          Unit: ${p.unit ?? ""}<br/>
          Floor: ${p.floor ?? ""}<br/>
          Height: ${p.height?.toFixed(2)} m`,
        style: {
          backgroundColor: "#fff",
          padding: "6px 10px",
          borderRadius: "4px",
          fontSize: "13px",
        },
      };
    },
  });

  map.addControl(deckOverlay);

  // Adapter to register deck.gl layers with the layer control
  const deckAdapter: CustomLayerAdapter = {
    type: "deck",
    getLayerIds: () => Array.from(deckLayers.keys()),
    getLayerState: (layerId: string): LayerState | null => {
      const layer = deckLayers.get(layerId);
      if (!layer?.props) return null;
      return {
        visible: layer.props.visible !== false,
        opacity: layer.props.opacity ?? 1,
        name: layerId,
      };
    },
    setVisibility: (layerId: string, visible: boolean) => {
      const layer = deckLayers.get(layerId);
      if (!layer?.clone) return;
      deckLayers.set(layerId, layer.clone({ visible }));
      deckOverlay.setProps({ layers: Array.from(deckLayers.values()) });
    },
    setOpacity: (layerId: string, opacity: number) => {
      const layer = deckLayers.get(layerId);
      if (!layer?.clone) return;
      deckLayers.set(layerId, layer.clone({ opacity }));
      deckOverlay.setProps({ layers: Array.from(deckLayers.values()) });
    },
    getName: (layerId: string) => layerId,
    getSymbolType: () => "circle",
  };

  // // Add the LiDAR control (before layer control so adapter can be passed at construction)
  // const lidarControl = new LidarControl({
  //   title: "LiDAR Viewer",
  //   collapsed: true,
  //   pointSize: 2,
  //   colorScheme: "elevation",
  //   pickable: false,
  // });

  // lidarControl.on("load", (event) => {
  //   console.log("Point cloud loaded:", event.pointCloud);
  //   lidarControl.flyToPointCloud();
  // });

  // lidarControl.loadPointCloud(
  //   "https://apps.opengeos.org/USGS_LPC_TX_CoastalRegion_2018_A18_stratmap18-50cm-2995201a1.copc.laz"
  // );

  // lidarControl.setZOffsetEnabled(true);
  // lidarControl.setZOffset(0);

  // const lidarLayerAdapter = new LidarLayerAdapter(lidarControl);
  // Create the USGS LiDAR control (created first for adapter, added to map after layer control)
  const usgsLidarControl = new UsgsLidarControl({
    title: "USGS 3DEP LiDAR",
    collapsed: true,
    maxResults: 2500,
    showFootprints: true,
    autoZoomToResults: true,
    lidarControlOptions: {
      pointSize: 2,
      colorScheme: "elevation",
      copcLoadingMode: "dynamic",
    },
  });

  // Create the USGS LiDAR layer adapter for layer control integration
  const usgsLidarAdapter = new UsgsLidarLayerAdapter(usgsLidarControl);

  // Create the layer control with all adapters passed at construction
  const layerControl = new LayerControl({
    collapsed: true,
    panelWidth: 350,
    panelMinWidth: 240,
    panelMaxWidth: 450,
    basemapStyleUrl: BASE_MAP_STYLE,
    customLayerAdapters: [deckAdapter, usgsLidarAdapter],
  });

  map.addControl(layerControl, "top-right");

  map.addControl(usgsLidarControl, "top-right");
  // map.addControl(lidarControl, "top-right");
  // Add search control
  const searchControl = new SearchControl({
    placeholder: "Search for a place...",
    flyToZoom: 14,
    showMarker: true,
    markerColor: "#e74c3c",
    collapsed: true,
  });
  map.addControl(searchControl, "top-left");

  let defaultProvider: "google" | "mapillary" = "google";
  if (!GOOGLE_API_KEY && MAPILLARY_TOKEN) {
    defaultProvider = "mapillary";
  }

  const streetViewControl = new StreetViewControl({
    title: "Street View",
    collapsed: true,
    panelWidth: 450,
    panelHeight: 350,
    defaultProvider: defaultProvider,
    googleApiKey: GOOGLE_API_KEY,
    mapillaryAccessToken: MAPILLARY_TOKEN,
    showMarker: true,
    clickToView: true,
    maxSearchRadius: 200,
    markerOptions: {
      color: "#ff5722",
      showDirection: false,
      directionColor: "#1976d2",
    },
  });

  map.addControl(streetViewControl, "top-left");

  searchControl.on("resultselect", (event) => {
    console.log(
      "Selected place:",
      event.result?.name,
      "at",
      event.result?.lng,
      event.result?.lat
    );
  });

  const nwiLegend = new Legend({
    title: "NWI Wetland Types",
    items: [
      {
        label: "Freshwater Forested/Shrub",
        color: "rgb(0, 136, 55)",
        shape: "square",
      },
      {
        label: "Freshwater Emergent",
        color: "rgb(127, 195, 28)",
        shape: "square",
      },
      {
        label: "Freshwater Pond",
        color: "rgb(104, 140, 192)",
        shape: "square",
      },
      {
        label: "Estuarine & Marine Wetland",
        color: "rgb(102, 194, 165)",
        shape: "square",
      },
      { label: "Riverine", color: "rgb(1, 144, 191)", shape: "square" },
      { label: "Lake", color: "rgb(19, 0, 124)", shape: "square" },
      {
        label: "Estuarine & Marine Deep",
        color: "rgb(0, 124, 136)",
        shape: "square",
      },
      { label: "Other", color: "rgb(178, 134, 86)", shape: "square" },
    ],
    collapsible: true,
    collapsed: false,
    width: 220,
    minzoom: minzoom,
    position: "bottom-left",
  });
  map.addControl(nwiLegend, "bottom-left");

  const depLegend = new Legend({
    title: "Surface Depressions",
    items: [{ label: "Depression (10-m)", color: "#ff7043", shape: "square" }],
    collapsible: true,
    collapsed: false,
    width: 220,
    minzoom: minzoom,
    position: "bottom-left",
  });
  map.addControl(depLegend, "bottom-left");

  const waterOccurrenceColorbar = new Colorbar({
    label: "Water Occurrence (1984 – 2021)",
    vmin: 0,
    vmax: 100,
    colorStops: [
      { position: 0, color: "#ffffff" },
      { position: 0.25, color: "#e0a0e0" },
      { position: 0.5, color: "#c040c0" },
      { position: 0.75, color: "#8000bf" },
      { position: 1, color: "#0000ff" },
    ],
    orientation: "horizontal",
    barLength: 250,
    barThickness: 18,
    ticks: {
      values: [0, 100],
      format: (v: number) => v === 0 ? "> 0 %\nsometimes water" : "100 %\nalways water",
    },
    backgroundColor: "#555555",
    fontColor: "#ffffff",
    fontSize: 12,
    padding: 12,
    borderRadius: 4,
    position: "bottom-right",
    visible: false,
  });
  map.addControl(waterOccurrenceColorbar, "bottom-right");

  // Show/hide colorbar based on JRC Water Occurrence layer visibility
  map.on("data", () => {
    const layer = map.getLayer("JRC Water Occurrence");
    if (layer) {
      const visible = map.getLayoutProperty("JRC Water Occurrence", "visibility") !== "none";
      if (visible) {
        waterOccurrenceColorbar.show();
      } else {
        waterOccurrenceColorbar.hide();
      }
    }
  });
});
