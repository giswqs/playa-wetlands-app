import './style.css';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css';
import 'maplibre-gl-geo-editor/style.css';
import 'maplibre-gl-layer-control/style.css';
import 'maplibre-gl-streetview/style.css';
import 'mapillary-js/dist/mapillary.css';
import 'maplibre-gl-lidar/style.css';
import 'maplibre-gl-usgs-lidar/style.css';

import maplibregl from 'maplibre-gl';
import { LayerControl, type CustomLayerAdapter, type LayerState } from 'maplibre-gl-layer-control';
import { Legend, SearchControl } from 'maplibre-gl-components';
import { StreetViewControl } from 'maplibre-gl-streetview';
import { LidarControl } from 'maplibre-gl-lidar';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { UsgsLidarControl, UsgsLidarLayerAdapter } from 'maplibre-gl-usgs-lidar';

// Get API keys from environment variables (Vite exposes them via import.meta.env)
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN || '';

// Log configuration status
console.log('Google Street View:', GOOGLE_API_KEY ? 'Configured' : 'Not configured');
console.log('Mapillary:', MAPILLARY_TOKEN ? 'Configured' : 'Not configured');


const BASE_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const map = new maplibregl.Map({
  container: 'map',
  style: BASE_MAP_STYLE,
  center: [0, 0],
  zoom: 2,
  maxPitch: 85,
});

// Add navigation controls to top-right
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control to top-right (after navigation)
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Add globe control to top-right (after navigation)
map.addControl(new maplibregl.GlobeControl(), 'top-right');

map.on('load', () => {
  // Get all layers from the style
  const style = map.getStyle();
  if (!style || !style.layers) {
    return;
  }

  // Add Google Satellite basemap
  map.addSource('google-satellite', {
    type: 'raster',
    tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '&copy; Google',
  });

  map.addLayer(
    {
      id: 'Google Satellite',
      type: 'raster',
      source: 'google-satellite',
      paint: {
        'raster-opacity': 1,
      },
      layout: {
        visibility: 'none'
      },
    },
  );

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
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
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
          ]],
        },
      },
    ],
  };

  map.addSource('pljv-boundaries', {
    type: 'geojson',
    data: pljvBoundary,
  });

  map.addLayer({
    id: 'Playa Boundary',
    type: 'fill',
    source: 'pljv-boundaries',
    paint: {
      'fill-color': 'transparent',
      'fill-outline-color': '#3388ff',
    },
  });

  // Fit map to PLJV boundaries
  const bounds = new maplibregl.LngLatBounds();
  const geom = pljvBoundary.features[0].geometry;
  if (geom.type === 'Polygon') {
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
          Unit: ${p.unit ?? ''}<br/>
          Floor: ${p.floor ?? ''}<br/>
          Height: ${p.height?.toFixed(2)} m`,
        style: {
          backgroundColor: '#fff',
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '13px',
        },
      };
    },
  });

  map.addControl(deckOverlay);

  // Adapter to register deck.gl layers with the layer control
  const deckAdapter: CustomLayerAdapter = {
    type: 'deck',
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
    getSymbolType: () => 'circle',
  };

  // Add the LiDAR control (before layer control so adapter can be passed at construction)
  const lidarControl = new LidarControl({
    title: "LiDAR Viewer",
    collapsed: true,
    pointSize: 2,
    colorScheme: "elevation",
    pickable: false,
  });



  lidarControl.on("load", (event) => {
    console.log("Point cloud loaded:", event.pointCloud);
    lidarControl.flyToPointCloud();
  });

  // lidarControl.loadPointCloud(
  //   "https://apps.opengeos.org/USGS_LPC_TX_CoastalRegion_2018_A18_stratmap18-50cm-2995201a1.copc.laz"
  // );

  // lidarControl.setZOffsetEnabled(true);
  // lidarControl.setZOffset(0);

  // Add USGS LiDAR control
  // Create the USGS LiDAR control (created first for adapter, added to map after layer control)
  const usgsLidarControl = new UsgsLidarControl({
    title: 'USGS 3DEP LiDAR',
    collapsed: true,
    maxResults: 2500,
    showFootprints: true,
    autoZoomToResults: true,
    lidarControlOptions: {
      pointSize: 2,
      colorScheme: 'elevation',
      copcLoadingMode: 'dynamic',
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

  map.addControl(layerControl, 'top-right');

  map.addControl(usgsLidarControl, "top-right");
  // Add search control
  const searchControl = new SearchControl({
    placeholder: 'Search for a place...',
    flyToZoom: 14,
    showMarker: true,
    markerColor: '#e74c3c',
    collapsed: true,
  });
  map.addControl(searchControl, 'top-left');

  let defaultProvider: 'google' | 'mapillary' = 'google';
  if (!GOOGLE_API_KEY && MAPILLARY_TOKEN) {
    defaultProvider = 'mapillary';
  }

  const streetViewControl = new StreetViewControl({
    title: 'Street View',
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
      color: '#ff5722',
      showDirection: false,
      directionColor: '#1976d2',
    },
  });

  map.addControl(streetViewControl, 'top-left');

  searchControl.on('resultselect', (event) => {
    console.log('Selected place:', event.result?.name, 'at', event.result?.lng, event.result?.lat);
  });

  const shapeLegend = new Legend({
    title: 'Layer Types',
    items: [
      { label: 'Points of Interest', color: '#e74c3c', shape: 'circle' },
      { label: 'National Parks', color: '#2ecc71', shape: 'square' },
      { label: 'Rivers', color: '#3498db', shape: 'line' },
      { label: 'Roads', color: '#95a5a6', shape: 'line' },
      { label: 'Cities', color: '#9b59b6', shape: 'circle' },
    ],
    collapsible: true,
    collapsed: true,
    width: 180,
    position: 'bottom-left',
  });
  map.addControl(shapeLegend, 'bottom-left');
});
