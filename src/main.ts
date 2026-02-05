import "./style.css";

import "maplibre-gl/dist/maplibre-gl.css";
import "@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css";
import "maplibre-gl-geo-editor/style.css";
import "maplibre-gl-layer-control/style.css";
import "maplibre-gl-streetview/style.css";
import "mapillary-js/dist/mapillary.css";
import "maplibre-gl-lidar/style.css";
import "maplibre-gl-usgs-lidar/style.css";
import "maplibre-gl-components/style.css";
import "maplibre-gl-time-slider/style.css";

import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import {
  LayerControl,
  type CustomLayerAdapter,
  type LayerState,
} from "maplibre-gl-layer-control";
import {
  Colorbar,
  HtmlControl,
  Legend,
  SearchControl,
  TerrainControl,
  ViewStateControl,
} from "maplibre-gl-components";
import { StreetViewControl } from "maplibre-gl-streetview";
// import { LidarControl, LidarLayerAdapter } from 'maplibre-gl-lidar';
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  UsgsLidarControl,
  UsgsLidarLayerAdapter,
} from "maplibre-gl-usgs-lidar";
import { TimeSliderControl } from "maplibre-gl-time-slider";

// Get API keys from environment variables (Vite exposes them via import.meta.env)
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN || "";

// Log configuration status
console.log(
  "Google Street View:",
  GOOGLE_API_KEY ? "Configured" : "Not configured",
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
  center: [-100, 40],
  zoom: 4,
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

  // Add NAIP Layer placeholder (will be populated by time slider)
  map.addSource("NAIP-raster", {
    type: "raster",
    tiles: [], // Empty initially, will be set by time slider
    tileSize: 256,
  });

  map.addLayer({
    id: "NAIP Layer",
    type: "raster",
    source: "NAIP-raster",
    paint: {
      "raster-opacity": 0.85,
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
    // minzoom: 11,
    layout: {
      visibility: "none",
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

  // Add WBDHU8 (Watershed Boundary Dataset HUC8) from PMTiles
  map.addSource("wbdhu8", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/WBDHU8.pmtiles",
  });

  map.addLayer({
    id: "WBDHU8 Boundary",
    type: "fill",
    source: "wbdhu8",
    "source-layer": "WBDHU8",
    paint: {
      "fill-color": "transparent",
      "fill-outline-color": "#3388ff",
    },
  });

  // Add H3 CONUS NWI Count (hexagon grid) from PMTiles
  map.addSource("h3-conus-nwi-count", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_conus_nwi_count.pmtiles",
  });

  map.addLayer({
    id: "H3 CONUS NWI Count",
    type: "fill-extrusion",
    source: "h3-conus-nwi-count",
    "source-layer": "h3_res5_conus_nwi_count",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "wetland_count"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        4,
        "#4a0c6b",
        6,
        "#781c6d",
        7,
        "#a52c60",
        8,
        "#cf4446",
        9,
        "#ed6925",
        10,
        "#fb9b06",
        10.6,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "wetland_count"],
        1,
        100,
        40000,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    maxzoom: 8,
    layout: {
      visibility: "none",
    },
  });

  // Add H3 CONUS NWI Acres (hexagon grid) from PMTiles
  map.addSource("h3-conus-nwi-acres", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_conus_nwi_acres.pmtiles",
  });

  map.addLayer({
    id: "H3 CONUS NWI Acres",
    type: "fill-extrusion",
    source: "h3-conus-nwi-acres",
    "source-layer": "h3_res5_conus_nwi_acres",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "wetland_acres"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        4,
        "#4a0c6b",
        5,
        "#781c6d",
        6,
        "#a52c60",
        7,
        "#cf4446",
        8,
        "#ed6925",
        9,
        "#fb9b06",
        10.3,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "wetland_acres"],
        0,
        100,
        30000,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    maxzoom: 8,
    layout: {
      visibility: "none",
    },
  });

  // Add H3 NWI Count (hexagon grid) from PMTiles
  map.addSource("h3-nwi-count", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_nwi_count.pmtiles",
  });

  // Inferno colormap with logarithmic scale for better contrast
  map.addLayer({
    id: "H3 NWI Count",
    type: "fill-extrusion",
    source: "h3-nwi-count",
    "source-layer": "h3_res5_nwi_count",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "wetland_count"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        4,
        "#4a0c6b",
        6,
        "#781c6d",
        7,
        "#a52c60",
        8,
        "#cf4446",
        9,
        "#ed6925",
        10,
        "#fb9b06",
        10.6,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "wetland_count"],
        1,
        100,
        40000,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    minzoom: 4.5,
    maxzoom: 8,
    layout: {
      visibility: "visible",
    },
  });

  // Add H3 NWI Acres (hexagon grid) from PMTiles
  map.addSource("h3-nwi-acres", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_nwi_acres.pmtiles",
  });

  // Inferno colormap with logarithmic scale for better contrast
  map.addLayer({
    id: "H3 NWI Acres",
    type: "fill-extrusion",
    source: "h3-nwi-acres",
    "source-layer": "h3_res5_nwi_acres",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "wetland_acres"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        4,
        "#4a0c6b",
        5,
        "#781c6d",
        6,
        "#a52c60",
        7,
        "#cf4446",
        8,
        "#ed6925",
        9,
        "#fb9b06",
        10.3,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "wetland_acres"],
        0,
        100,
        30000,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    maxzoom: 8,
    layout: {
      visibility: "none",
    },
  });

  // Add H3 Depressions Count (hexagon grid) from PMTiles
  map.addSource("h3-depressions-count", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_depressions_count.pmtiles",
  });

  map.addLayer({
    id: "H3 Depressions Count",
    type: "fill-extrusion",
    source: "h3-depressions-count",
    "source-layer": "h3_res5_depressions_count",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "depression_count"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        3,
        "#4a0c6b",
        4,
        "#781c6d",
        5,
        "#a52c60",
        6,
        "#cf4446",
        7,
        "#ed6925",
        8,
        "#fb9b06",
        8.5,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "depression_count"],
        1,
        100,
        5050,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    minzoom: 4.5,
    maxzoom: 8,
    layout: {
      visibility: "none",
    },
  });

  // Add H3 Depressions Acres (hexagon grid) from PMTiles
  map.addSource("h3-depressions-acres", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/h3_res5_depressions_acres.pmtiles",
  });

  map.addLayer({
    id: "H3 Depressions Acres",
    type: "fill-extrusion",
    source: "h3-depressions-acres",
    "source-layer": "h3_res5_depressions_acres",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["ln", ["+", ["get", "depression_acres"], 1]],
        0,
        "#000004",
        2,
        "#1b0c41",
        4,
        "#4a0c6b",
        5,
        "#781c6d",
        6,
        "#a52c60",
        7,
        "#cf4446",
        8,
        "#ed6925",
        9,
        "#fb9b06",
        10.4,
        "#fcffa4",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["get", "depression_acres"],
        0,
        100,
        32000,
        50000,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.85,
    },
    minzoom: 4.5,
    maxzoom: 8,
    layout: {
      visibility: "none",
    },
  });

  // Add Easements from PMTiles
  map.addSource("easements", {
    type: "vector",
    url: "pmtiles://https://data.source.coop/giswqs/playa/easements_12_11_2024.pmtiles",
  });

  map.addLayer({
    id: "Easements",
    type: "fill",
    source: "easements",
    "source-layer": "easements_12_11_2024",
    paint: {
      "fill-color": "#8bc34a",
      "fill-opacity": 0.5,
    },
    layout: {
      visibility: "none",
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
  const pickableLayers = [
    "Depressions 10m",
    "NWI Wetlands",
    "Easements",
    "H3 NWI Count",
    "H3 NWI Acres",
    "H3 CONUS NWI Count",
    "H3 CONUS NWI Acres",
    "H3 Depressions Count",
    "H3 Depressions Acres",
    "WBDHU8 Boundary",
  ];

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
      case "Easements":
        return `
          <strong>Easement</strong><br/>
          Program: ${props.Program || "N/A"}<br/>
          State: ${props.State || "N/A"}<br/>
          County: ${props.County || "N/A"}<br/>
          Acres: ${props.CalcAcres ? Number(props.CalcAcres).toFixed(2) : "N/A"}<br/>
          Closing Date: ${props.ClosingDat || "N/A"}`;
      case "H3 NWI Count":
        return `
          <strong>H3 Cell (Res 5)</strong><br/>
          NWI Wetland Count: ${props.wetland_count ? Number(props.wetland_count).toLocaleString() : "N/A"}`;
      case "H3 NWI Acres":
        return `
          <strong>H3 Cell (Res 5)</strong><br/>
          NWI Wetland Acres: ${props.wetland_acres ? Number(props.wetland_acres).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A"}`;
      case "H3 CONUS NWI Count":
        return `
          <strong>H3 CONUS Cell (Res 5)</strong><br/>
          NWI Wetland Count: ${props.wetland_count ? Number(props.wetland_count).toLocaleString() : "N/A"}`;
      case "H3 CONUS NWI Acres":
        return `
          <strong>H3 CONUS Cell (Res 5)</strong><br/>
          NWI Wetland Acres: ${props.wetland_acres ? Number(props.wetland_acres).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A"}`;
      case "H3 Depressions Count":
        return `
          <strong>H3 Cell (Res 5)</strong><br/>
          Depression Count: ${props.depression_count ? Number(props.depression_count).toLocaleString() : "N/A"}`;
      case "H3 Depressions Acres":
        return `
          <strong>H3 Cell (Res 5)</strong><br/>
          Depression Acres: ${props.depression_acres ? Number(props.depression_acres).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A"}`;
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
    const easeFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["Easements"],
    });
    const h3Features = map.queryRenderedFeatures(e.point, {
      layers: ["H3 NWI Count"],
    });

    const htmlParts: string[] = [];
    if (depFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml("Depressions 10m", depFeatures[0].properties),
      );
    }
    if (nwiFeatures.length > 0) {
      htmlParts.push(buildPopupHtml("NWI Wetlands", nwiFeatures[0].properties));
    }
    if (easeFeatures.length > 0) {
      htmlParts.push(buildPopupHtml("Easements", easeFeatures[0].properties));
    }
    if (h3Features.length > 0) {
      htmlParts.push(buildPopupHtml("H3 NWI Count", h3Features[0].properties));
    }
    const h3AcresFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["H3 NWI Acres"],
    });
    if (h3AcresFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml("H3 NWI Acres", h3AcresFeatures[0].properties),
      );
    }
    const h3ConusCountFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["H3 CONUS NWI Count"],
    });
    if (h3ConusCountFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml(
          "H3 CONUS NWI Count",
          h3ConusCountFeatures[0].properties,
        ),
      );
    }
    const h3ConusAcresFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["H3 CONUS NWI Acres"],
    });
    if (h3ConusAcresFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml(
          "H3 CONUS NWI Acres",
          h3ConusAcresFeatures[0].properties,
        ),
      );
    }
    const h3DepCountFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["H3 Depressions Count"],
    });
    if (h3DepCountFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml(
          "H3 Depressions Count",
          h3DepCountFeatures[0].properties,
        ),
      );
    }
    const h3DepAcresFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["H3 Depressions Acres"],
    });
    if (h3DepAcresFeatures.length > 0) {
      htmlParts.push(
        buildPopupHtml(
          "H3 Depressions Acres",
          h3DepAcresFeatures[0].properties,
        ),
      );
    }

    // Fall back to WBDHU8 only when no higher-priority features are present
    if (htmlParts.length === 0) {
      const wbdFeatures = map.queryRenderedFeatures(e.point, {
        layers: ["WBDHU8 Boundary"],
      });
      if (wbdFeatures.length === 0) return;
      htmlParts.push(
        buildPopupHtml("WBDHU8 Boundary", wbdFeatures[0].properties),
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
    excludeLayers: ["Usgs*"],
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

  // Add view state control - displays live map center, bounds, zoom, pitch, bearing
  const viewStateControl = new ViewStateControl({
    collapsed: true,
    enableBBox: true,
    precision: 4,
  });
  map.addControl(viewStateControl, "top-left");

  // Listen for bounding box draw events
  viewStateControl.on("bboxdraw", (event) => {
    if (event.bbox) {
      console.log("Drawn bounding box:", event.bbox);
    }
  });

  searchControl.on("resultselect", (event) => {
    console.log(
      "Selected place:",
      event.result?.name,
      "at",
      event.result?.lng,
      event.result?.lat,
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
      format: (v: number) =>
        v === 0 ? "> 0 %\nsometimes water" : "100 %\nalways water",
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
      const visible =
        map.getLayoutProperty("JRC Water Occurrence", "visibility") !== "none";
      if (visible) {
        waterOccurrenceColorbar.show();
      } else {
        waterOccurrenceColorbar.hide();
      }
    }
  });

  const infoControl = new HtmlControl({
    html: `
      <div style="font-size:13px;line-height:1.5">
        <strong>Playa Wetlands App</strong><br/>
        An interactive map for exploring Playa wetlands,
        surface depressions, and watershed boundaries
        in the Playa region.<br/>
        <a href="https://github.com/giswqs/playa-wetlands-app"
           target="_blank" rel="noopener noreferrer"
           style="color:#1976d2;text-decoration:none">
           GitHub Repository
        </a>
      </div>
    `,
    collapsible: true,
    collapsed: true,
    title: "About",
    maxWidth: 260,
    position: "bottom-right",
  });
  map.addControl(infoControl, "bottom-right");

  // Add NAIP Time Slider
  setupNAIPTimeSlider(map);
});

// NAIP Time Slider Setup
function setupNAIPTimeSlider(map: maplibregl.Map) {
  // Earth Engine tile request endpoint
  const EE_TILE_ENDPOINT = "https://giswqs-ee-tile-request.hf.space/tile";

  // Generate years from 2009 to 2023
  const START_YEAR = 2009;
  const END_YEAR = 2023;
  const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  const labels = years.map((year) => String(year));

  // Cache for storing tile URLs
  const tileUrlCache: Record<string, string> = {};

  // Track persistent layers
  let persistentLayerCounter = 0;

  // Source and layer IDs
  const RASTER_SOURCE_ID = "NAIP-raster";
  const RASTER_LAYER_ID = "NAIP Layer";

  /**
   * Fetches tile URL from Earth Engine API for a given year
   */
  async function fetchTileUrl(year: number): Promise<string> {
    const cacheKey = String(year);

    // Return cached URL if available
    if (tileUrlCache[cacheKey]) {
      console.log(`Using cached tile URL for year ${year}`);
      return tileUrlCache[cacheKey];
    }

    console.log(`Fetching tile URL for year ${year}...`);

    const payload = {
      asset_id: "USDA/NAIP/DOQQ",
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      vis_params: { bands: ["N", "R", "G"] },
    };

    try {
      const response = await fetch(EE_TILE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const tileUrl = data.tile_url;

      // Cache the URL
      tileUrlCache[cacheKey] = tileUrl;
      console.log(`Tile URL for year ${year} cached successfully`);

      return tileUrl;
    } catch (error) {
      console.error(`Error fetching tile URL for year ${year}:`, error);
      throw error;
    }
  }

  /**
   * Prefetch tile URLs for all years
   */
  async function prefetchTileUrls(): Promise<void> {
    console.log("Prefetching NAIP tile URLs for all years...");
    const promises = years.map((year) =>
      fetchTileUrl(year).catch((err) => {
        console.error(`Failed to prefetch year ${year}:`, err);
        return null;
      })
    );
    await Promise.all(promises);
    console.log("NAIP prefetching complete");
  }

  // Fetch initial tile URL and update NAIP layer (which already exists as placeholder)
  fetchTileUrl(years[0])
    .then((initialTileUrl) => {
      // Update the existing raster source with initial tile URL
      const source = map.getSource(RASTER_SOURCE_ID) as maplibregl.RasterTileSource;
      if (source) {
        source.setTiles([initialTileUrl]);
        console.log("Updated NAIP Layer with initial tiles for year", years[0]);
      }

      // Create the time slider control
      const timeSlider = new TimeSliderControl({
        title: "NAIP Imagery",
        labels: labels,
        speed: 1500,
        loop: true,
        collapsed: true,
        panelWidth: 320,
        beforeId: "3DEP Hillshade",
        onChange: async (index) => {
          const year = years[index];
          console.log(`Displaying NAIP imagery for year: ${year}`);

          try {
            // Fetch the tile URL for the selected year (will use cache if available)
            const tileUrl = await fetchTileUrl(year);

            // Update the raster source with the new tile URL
            const source = map.getSource(RASTER_SOURCE_ID) as maplibregl.RasterTileSource;
            if (source) {
              source.setTiles([tileUrl]);
            }
          } catch (error) {
            console.error(`Error loading imagery for year ${year}:`, error);
            alert(`Failed to load imagery for year ${year}. Please try again.`);
          }
        },
        onAddLayer: async (index, _label, beforeId) => {
          const year = years[index];
          console.log(`Adding persistent layer for year: ${year}`);

          try {
            // Fetch the tile URL for the selected year
            const tileUrl = await fetchTileUrl(year);

            // Create unique IDs for the persistent layer with year
            persistentLayerCounter++;
            const sourceId = `NAIP-source-${year}`;
            const layerId = `NAIP Layer ${year}`;

            // Add the source
            map.addSource(sourceId, {
              type: "raster",
              tiles: [tileUrl],
              tileSize: 256,
            });

            // Add the layer before the specified layer (from beforeId option)
            map.addLayer(
              {
                id: layerId,
                type: "raster",
                source: sourceId,
                paint: {
                  "raster-opacity": 0.7,
                },
              },
              beforeId || RASTER_LAYER_ID // Use beforeId from options, fallback to RASTER_LAYER_ID
            );

            console.log(`Added persistent layer for year ${year} before layer: ${beforeId || RASTER_LAYER_ID}`);
          } catch (error) {
            console.error(`Error adding persistent layer for year ${year}:`, error);
            alert(`Failed to add layer for year ${year}. Please try again.`);
          }
        },
      });

      // Add the time slider control to the map
      map.addControl(timeSlider, "top-right");

      console.log("NAIP time slider control added to map");

      // Prefetch tile URLs in the background
      prefetchTileUrls().catch((err) => {
        console.error("Error during prefetching:", err);
      });
    })
    .catch((error) => {
      console.error("Error initializing NAIP time slider:", error);
    });
}
