/* Atlas configuration: endpoints, palette mirrors, layer list and breakpoints.
   The only place that knows URLs. No behaviour lives here.
   NOTE: colours duplicate the values in css/tokens.css because Leaflet paints
   vectors in JavaScript and cannot read CSS variables. Keep the two in sync. */
window.Atlas = window.Atlas || {};

Atlas.config = {
  dataRoot: 'data/',
  stringsUrl: 'strings.json',
  snapshotUrl: 'js/data-snapshot.js',
  plotlyUrl: 'https://cdn.plot.ly/plotly-basic-2.35.2.min.js',

  tile: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 14,
    opacity: 0.9
  },

  // Semantic status colours (mirror --green/--amber/--red/--nodata).
  colors: { green: '#2e7d32', amber: '#f9a825', red: '#c62828', nodata: '#9e9e9e' },
  // Cropland hectares quintile ramp (mirror --ramp-0 .. --ramp-4).
  ramp: ['#f1f5e9', '#c5dbb3', '#8fbf86', '#4e9a5a', '#1b5e20'],

  // Hectare layers offered as district sub-layers.
  haLayers: ['crop_ha', 'wheat_ha', 'maize_ha', 'irrigated_ha'],

  langs: ['en', 'ur', 'ps'],
  rtlLangs: ['ur', 'ps'],
  dateLocale: { en: 'en-GB', ur: 'ur-PK', ps: 'ps-AF' },
  langStorageKey: 'atlas.lang',

  breakpoints: { mobile: 760 }
};
