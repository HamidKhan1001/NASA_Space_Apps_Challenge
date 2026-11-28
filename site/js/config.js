/* Atlas configuration: the only place that knows URLs, palette mirrors, the
   basemaps and the layer list. No behaviour lives here.
   NOTE: colours duplicate the values in css/tokens.css because Leaflet paints
   vectors in JavaScript and cannot read CSS variables. Keep the two in sync. */
window.Atlas = window.Atlas || {};

Atlas.config = {
  // Data sits beside the page ('data/') once build-site.sh has copied it in, or
  // one level up ('../data/') when the repository root is served from a clone.
  bases: ['data/', '../data/'],
  stringsUrl: 'strings.json',
  snapshotUrl: 'js/data-snapshot.js',
  plotlyUrl: 'https://cdn.plot.ly/plotly-basic-2.35.2.min.js',
  plotlyIntegrity: 'sha384-wQ3lfCxuvLfhHGiSdHF5+e3NZ1zNwEMd8/nII+K7VKChF9llO/OwOcn/aVRkB7az',

  // Semantic status colours (mirror --green/--amber/--red/--nodata in tokens.css).
  colors: { green: '#15803d', amber: '#d97706', red: '#c2250f', nodata: '#94a3b8' },
  // Cropland hectares quintile ramp (mirror --ramp-0 .. --ramp-4 in tokens.css).
  ramp: ['#eef4ea', '#cfe2c4', '#a3cb98', '#5fa86d', '#15803d'],
  // Diverging ramp for the history layer: wetter than usual (blue) to drier than usual (brown).
  // Deliberately avoids the green/amber/red of the traffic light.
  pctRamp: ['#3b78a8', '#9cc3d9', '#efebe2', '#d9b68a', '#9a5b22'],

  // Province view switches from districts to every union council at this zoom.
  detailZoom: 8,

  // Esri basemaps and the labels overlay (consumed by app.js setBase()).
  esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/',
  labelTile: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',

  langs: ['en', 'ur', 'ps'],
  rtlLangs: ['ur', 'ps'],
  dateLocale: { en: 'en-GB', ur: 'ur-PK', ps: 'ps-AF' },

  langStorageKey: 'atlas.lang',
  baseStorageKey: 'atlas.base',
  labelsStorageKey: 'atlas.labels',
  legendStorageKey: 'atlas.legend',

  breakpoints: { mobile: 820 }
};

Atlas.config.tileBases = {
  light: { url: Atlas.config.esri + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
           max: 16, labels: true, attr: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors' },
  imagery: { url: Atlas.config.esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}',
             max: 17, labels: true, attr: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
  terrain: { url: Atlas.config.esri + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
             max: 16, labels: false, attr: 'Tiles &copy; Esri, USGS, NOAA' }
};
