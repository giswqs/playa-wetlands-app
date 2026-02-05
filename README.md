# Playa Wetlands App

An interactive web map for exploring playa wetlands, surface depressions, and watershed boundaries in the Playa region. Built with [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/), and [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/).

## Live Demo

[https://playa.gishub.org](https://playa.gishub.org)

## Features

- **Interactive Map** - Pan, zoom, and explore playa wetlands with satellite imagery
- **Data Layers**
  - WBDHU8 watershed boundaries (PMTiles)
  - Surface depressions at 10m resolution (PMTiles)
  - NWI wetlands styled by wetland type (PMTiles)
  - JRC Global Surface Water Occurrence (1984-2021)
  - 3DEP Hillshade Multidirectional (WMS)
  - NAIP False Color Composite (WMS)
  - Google Satellite basemap
- **Layer Control** - Toggle visibility and adjust opacity of all layers
- **Clickable Features** - Click depressions, NWI wetlands, or watershed boundaries to view attributes
- **Street View** - Google Street View and Mapillary integration
- **USGS 3DEP LiDAR** - Browse and visualize USGS LiDAR point clouds
- **3D Terrain** - Toggle terrain with hillshade visualization
- **Search** - Geocoding search to find places
- **Legends & Colorbar** - NWI wetland type legend, depression legend, and water occurrence colorbar
- **TypeScript** - Type-safe development with full IntelliSense support
- **GitHub Pages** - Automatic deployment on push to main branch
- **Docker** - Containerized deployment support

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (included with Node.js)

## Local Development

### Install Dependencies

```bash
npm install
```

### Set Up Environment Variables

Create a `.env` file for optional API keys:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_MAPILLARY_ACCESS_TOKEN=your_mapillary_token
```

The app works without these keys, but Street View features require them.

### Start Development Server

```bash
npm run dev
```

This starts the Vite development server at `http://localhost:5173` with hot module replacement.

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deployment

### GitHub Pages

The repository includes a GitHub Actions workflow that automatically deploys to GitHub Pages on push to `main`.

1. Go to **Settings** > **Pages** and select **GitHub Actions** as the source
2. Add API keys as repository secrets (optional):
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_MAPILLARY_ACCESS_TOKEN`
3. Push to `main` to trigger deployment

### Docker

Build and run locally:

```bash
docker build -t playa-wetlands-app .
docker run -p 8080:80 playa-wetlands-app
```

Then open http://localhost:8080 in your browser.

To pass API keys at build time:

```bash
docker build \
  --build-arg VITE_GOOGLE_MAPS_API_KEY=your_key \
  --build-arg VITE_MAPILLARY_ACCESS_TOKEN=your_token \
  -t playa-wetlands-app .
```

## Data Sources

| Layer | Source | Format |
|-------|--------|--------|
| WBDHU8 Boundaries | [Source Cooperative](https://source.coop/giswqs/playa) | PMTiles |
| Surface Depressions 10m | [Source Cooperative](https://source.coop/giswqs/playa) | PMTiles |
| NWI Wetlands | [Source Cooperative](https://source.coop/giswqs/playa) | PMTiles |
| JRC Water Occurrence | [EC JRC/Google](https://global-surface-water.appspot.com/) | WMTS |
| 3DEP Hillshade | [USGS National Map](https://elevation.nationalmap.gov/) | WMS |
| NAIP False Color | [USGS National Map](https://imagery.nationalmap.gov/) | WMS |

## Project Structure

```
playa-wetlands-app/
├── .github/workflows/
│   ├── deploy.yml            # GitHub Pages deployment
│   └── docker-publish.yml    # Docker image build and publish
├── public/
│   └── CNAME                 # Custom domain configuration
├── src/
│   ├── main.ts               # Application entry point
│   └── style.css             # Global styles
├── .env                      # API keys (not committed)
├── Dockerfile                # Docker build configuration
├── index.html                # HTML entry point
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── vite.config.ts            # Vite configuration
```

## Dependencies

### Runtime

- [maplibre-gl](https://www.npmjs.com/package/maplibre-gl) - Map rendering
- [pmtiles](https://www.npmjs.com/package/pmtiles) - PMTiles protocol support
- [maplibre-gl-layer-control](https://www.npmjs.com/package/maplibre-gl-layer-control) - Layer visibility and opacity control
- [maplibre-gl-components](https://www.npmjs.com/package/maplibre-gl-components) - Legend, colorbar, search, terrain, and HTML controls
- [maplibre-gl-streetview](https://www.npmjs.com/package/maplibre-gl-streetview) - Street View integration
- [maplibre-gl-usgs-lidar](https://www.npmjs.com/package/maplibre-gl-usgs-lidar) - USGS 3DEP LiDAR browser
- [@deck.gl/mapbox](https://www.npmjs.com/package/@deck.gl/mapbox) - deck.gl integration for MapLibre

### Development

- [vite](https://www.npmjs.com/package/vite) - Build tool and dev server
- [typescript](https://www.npmjs.com/package/typescript) - TypeScript compiler

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
