import './style.css';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css';
import 'maplibre-gl-geo-editor/style.css';
import 'maplibre-gl-layer-control/style.css';
import 'maplibre-gl-streetview/style.css';
import 'mapillary-js/dist/mapillary.css';
import 'maplibre-gl-lidar/style.css';

import maplibregl from 'maplibre-gl';
import { Geoman } from '@geoman-io/maplibre-geoman-free';
import { GeoEditor, type GeoJsonLoadResult, type GeoJsonSaveResult, type AttributeChangeEvent, type DrawMode, type EditMode } from 'maplibre-gl-geo-editor';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import { LayerControl, type CustomLayerAdapter, type LayerState } from 'maplibre-gl-layer-control';
import { Legend, SearchControl } from 'maplibre-gl-components';
import { StreetViewControl } from 'maplibre-gl-streetview';
import { LidarControl, LidarLayerAdapter } from 'maplibre-gl-lidar';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';

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
  const geoman = new Geoman(map, {});

  // Wait for Geoman to load
  map.on('gm:loaded', () => {
    console.log('Geoman loaded');

    // Create GeoEditor control with advanced features
    const geoEditor = new GeoEditor({
      position: 'top-left',
      collapsed: true,
      toolbarOrientation: 'vertical',
      columns: 2,
      showLabels: false,
      // Enable attribute editing panel instead of popup
      enableAttributeEditing: true,
      attributePanelPosition: 'right',
      attributePanelWidth: 320,
      attributePanelMaxHeight: '70vh', // Limit panel height (can also use pixels like 500)
      attributePanelTop: 10, // Offset from top (useful to avoid other controls)
      attributePanelSideOffset: 10, // Offset from right/left edge
      attributePanelTitle: 'Feature Properties',
      // Define attribute schema for different geometry types
      attributeSchema: {
        polygon: [
          { name: 'name', label: 'Name', type: 'string', required: true, placeholder: 'Enter name...' },
          {
            name: 'land_use',
            label: 'Land Use',
            type: 'select',
            options: [
              { value: 'residential', label: 'Residential' },
              { value: 'commercial', label: 'Commercial' },
              { value: 'industrial', label: 'Industrial' },
              { value: 'park', label: 'Park/Recreation' },
            ],
            defaultValue: 'residential',
          },
          { name: 'area_sqm', label: 'Area (sq m)', type: 'number', min: 0 },
          { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Enter description...' },
        ],
        line: [
          { name: 'name', label: 'Name', type: 'string', required: true },
          {
            name: 'road_type',
            label: 'Road Type',
            type: 'select',
            options: [
              { value: 'highway', label: 'Highway' },
              { value: 'main', label: 'Main Road' },
              { value: 'residential', label: 'Residential Street' },
              { value: 'path', label: 'Path/Trail' },
            ],
          },
          { name: 'lanes', label: 'Lanes', type: 'number', min: 1, max: 8, step: 1 },
          { name: 'speed_limit', label: 'Speed Limit (km/h)', type: 'number', min: 5, max: 130, step: 5 },
        ],
        point: [
          { name: 'name', label: 'Name', type: 'string', required: true },
          {
            name: 'category',
            label: 'Category',
            type: 'select',
            options: [
              { value: 'poi', label: 'Point of Interest' },
              { value: 'landmark', label: 'Landmark' },
              { value: 'facility', label: 'Facility' },
              { value: 'other', label: 'Other' },
            ],
            defaultValue: 'poi',
          },
          { name: 'active', label: 'Active', type: 'boolean', defaultValue: true },
        ],
        common: [
          { name: 'notes', label: 'Notes', type: 'textarea' },
          { name: 'color', label: 'Color', type: 'color', defaultValue: '#3388ff' },
          { name: 'created_date', label: 'Created Date', type: 'date' },
        ],
      },
      drawModes: [
        'polygon',
        'line',
        'rectangle',
        'circle',
        'marker',
        'circle_marker',
        'ellipse',
        'freehand',
      ],
      editModes: [
        'select',
        'drag',
        'change',
        'rotate',
        'cut',
        'delete',
        'scale',
        'copy',
        'split',
        'union',
        'difference',
        'simplify',
        'lasso',
      ],
      fileModes: ['open', 'save'],
      saveFilename: 'my-features.geojson',
      onFeatureCreate: (feature: Feature<Geometry, GeoJsonProperties>) => {
        console.log('Feature created:', feature);
      },
      onFeatureEdit: (feature: Feature<Geometry, GeoJsonProperties>, oldFeature: Feature<Geometry, GeoJsonProperties>) => {
        console.log('Feature edited:', feature, 'was:', oldFeature);
      },
      onFeatureDelete: (featureId: string | number) => {
        console.log('Feature deleted:', featureId);
      },
      onSelectionChange: (features: Feature<Geometry, GeoJsonProperties>[]) => {
        console.log('Selection changed:', features.length, 'features');
      },
      onModeChange: (mode: DrawMode | EditMode | null) => {
        console.log('Mode changed:', mode);
      },
      onGeoJsonLoad: (result: GeoJsonLoadResult) => {
        console.log(`Loaded ${result.count} features from ${result.filename}`);
      },
      onGeoJsonSave: (result: GeoJsonSaveResult) => {
        console.log(`Saved ${result.count} features to ${result.filename}`);
      },
      onAttributeChange: (event: AttributeChangeEvent) => {
        console.log('Attribute changed:', {
          isNew: event.isNewFeature,
          previous: event.previousProperties,
          new: event.newProperties,
        });
      },
    });

    // Connect GeoEditor with Geoman
    geoEditor.setGeoman(geoman);

    // Add the control to the map
    map.addControl(geoEditor, 'top-left');

    // Listen for GeoEditor events
    const container = map.getContainer();

    container.addEventListener('gm:copy', (e) => {
      console.log('Copy event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:paste', (e) => {
      console.log('Paste event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:union', (e) => {
      console.log('Union event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:difference', (e) => {
      console.log('Difference event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:split', (e) => {
      console.log('Split event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:simplify', (e) => {
      console.log('Simplify event:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:lassoend', (e) => {
      console.log('Lasso selection:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:geojsonload', (e) => {
      console.log('GeoJSON loaded:', (e as CustomEvent).detail);
    });

    container.addEventListener('gm:geojsonsave', (e) => {
      console.log('GeoJSON saved:', (e as CustomEvent).detail);
    });
  });

  // Get all layers from the style
  const style = map.getStyle();
  if (!style || !style.layers) {
    return;
  }

  // Add Google Satellite basemap
  map.addSource('google-satellite', {
    type: 'raster',
    tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '&copy; Google',
  });

  map.addLayer(
    {
      id: 'Satellite',
      type: 'raster',
      source: 'google-satellite',
      minzoom: 14,
      paint: {
        'raster-opacity': 1,
      },
      layout: {
        visibility: 'visible'
      },
    },
  );

  // Add a raster layer (using MapLibre demo tiles as example)
  map.addSource('raster-source', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '&copy; OpenStreetMap contributors'
  });

  map.addLayer({
    id: 'OpenStreetMap',
    type: 'raster',
    source: 'raster-source',
    paint: {
      'raster-opacity': 1.0
    },
    layout: {
      visibility: 'none'
    },
  }); // Insert below countries layer

  // Add 3D extruded buildings from GeoJSON
  map.addSource('tx-buildings', {
    type: 'geojson',
    data: 'https://apps.opengeos.org/tx_buildings.geojson',
  });

  map.addLayer({
    id: 'Buildings',
    type: 'fill-extrusion',
    source: 'tx-buildings',
    paint: {
      'fill-extrusion-color': [
        'interpolate',
        ['linear'],
        ['get', 'height'],
        0, '#ffffcc',
        0.5, '#a1dab4',
        1.0, '#41b6c4',
        1.5, '#2c7fb8',
        2.0, '#253494',
      ],
      'fill-extrusion-height': ['*', ['get', 'height'], 5],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.8,
    },
  });

  // Show popup on building click
  map.on('click', 'Buildings', (e) => {
    if (!e.features || e.features.length === 0) return;
    const props = e.features[0].properties;
    const html = `<strong>Building</strong><br/>
      Height: ${props.height?.toFixed(2)} m<br/>
      ${props.class ? `Class: ${props.class}<br/>` : ''}
      ${props.subtype ? `Subtype: ${props.subtype}<br/>` : ''}
      ${props.num_floors ? `Floors: ${props.num_floors}<br/>` : ''}
      ${props.roof_shape ? `Roof: ${props.roof_shape}<br/>` : ''}`;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  // Change cursor on hover
  map.on('mouseenter', 'Buildings', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'Buildings', () => {
    map.getCanvas().style.cursor = '';
  });

  // Add path layer from GeoJSON
  map.addSource('tx-lines', {
    type: 'geojson',
    data: 'https://apps.opengeos.org/tx_lines.geojson',
  });

  map.addLayer({
    id: 'Paths',
    type: 'line',
    source: 'tx-lines',
    paint: {
      'line-color': '#e74c3c',
      'line-width': 2,
      'line-opacity': 0.8,
    },
  });

  map.on('click', 'Paths', (e) => {
    if (!e.features || e.features.length === 0) return;
    const props = e.features[0].properties;
    const html = `<strong>Path</strong><br/>
      Type: ${props.path ?? ''}<br/>
      OSM ID: ${props.osm_id ?? ''}`;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on('mouseenter', 'Paths', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'Paths', () => {
    map.getCanvas().style.cursor = '';
  });

  // Add 3D point layer using deck.gl ScatterplotLayer
  function heightToColor(h: number): [number, number, number, number] {
    const t = Math.max(0, Math.min(1, (h - 3.5) / (12.5 - 3.5)));
    const stops = [
      [255, 255, 204],  // #ffffcc
      [161, 218, 180],  // #a1dab4
      [65, 182, 196],   // #41b6c4
      [44, 127, 184],   // #2c7fb8
      [37, 52, 148],    // #253494
    ];
    const idx = t * (stops.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, stops.length - 1);
    const f = idx - lo;
    return [
      Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f),
      Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f),
      Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f),
      220,
    ];
  }

  const pointsLayer = new ScatterplotLayer({
    id: 'Points',
    data: 'https://apps.opengeos.org/tx_points.geojson',
    dataTransform: (data: any) => data.features,
    getPosition: (d: any) => [d.geometry.coordinates[0], d.geometry.coordinates[1], d.properties.height * 5] as [number, number, number],
    getRadius: 3,
    getFillColor: (d: any) => heightToColor(d.properties.height),
    getLineColor: [255, 255, 255],
    getLineWidth: 1,
    stroked: true,
    radiusUnits: 'meters',
    lineWidthUnits: 'meters',
    pickable: true,
    billboard: true,
    parameters: { depthTest: false },
  });

  const deckLayers = new Map<string, any>();
  deckLayers.set('Points', pointsLayer);

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

  map.addControl(lidarControl, "top-right");

  lidarControl.on("load", (event) => {
    console.log("Point cloud loaded:", event.pointCloud);
    lidarControl.flyToPointCloud();
  });

  lidarControl.loadPointCloud(
    "https://apps.opengeos.org/USGS_LPC_TX_CoastalRegion_2018_A18_stratmap18-50cm-2995201a1.copc.laz"
  );

  lidarControl.setZOffsetEnabled(true);
  lidarControl.setZOffset(0);

  const lidarLayerAdapter = new LidarLayerAdapter(lidarControl);

  // Create the layer control with all adapters passed at construction
  const layerControl = new LayerControl({
    collapsed: true,
    panelWidth: 350,
    panelMinWidth: 240,
    panelMaxWidth: 450,
    basemapStyleUrl: BASE_MAP_STYLE,
    customLayerAdapters: [deckAdapter, lidarLayerAdapter],
  });

  map.addControl(layerControl, 'top-right');

  // Add search control
  const searchControl = new SearchControl({
    placeholder: 'Search for a place...',
    flyToZoom: 14,
    showMarker: true,
    markerColor: '#e74c3c',
    collapsed: true,
  });
  map.addControl(searchControl, 'top-right');

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

  map.addControl(streetViewControl, 'top-right');

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
