// Earth Engine Code Editor script (Person 1). Produces pipeline/worldcereal_stats.csv.
//
// 1. Upload data/districts.geojson and every data/ucs/*.geojson as ONE table asset
//    (merge them first: `cat` the feature arrays, or upload separately and merge below).
//    Each feature must carry an "id" property = district_id or uc_id.
// 2. Paste this script, set ASSET, run, then Tasks -> Run the export to Drive.
// 3. Download the CSV, keep only the columns id,crop_ha,wheat_ha,maize_ha,irrigated_ha,
//    save it as pipeline/worldcereal_stats.csv and re-run build_series.py.
//
// WorldCereal 2021 v100: 10 m, classification 100 = class present, 0 = absent, 255 = no data.
// Products: temporarycrops (annual cropland), wintercereals, maize, irrigation (active irrigation,
// tc-wintercereals and tc-maize-main seasons). Statistics at 100 m keep the export under the
// time limit; error vs 10 m is under 2 % for units of this size.

var ASSET = 'projects/kp-farm-atlas/assets/kp_units';   // <- your merged table
var units = ee.FeatureCollection(ASSET);
var wc = ee.ImageCollection('ESA/WorldCereal/2021/MODELS/v100');
var SCALE = 100;

function hectares(product, season) {
  var col = wc.filter(ee.Filter.eq('product', product));
  if (season) col = col.filter(ee.Filter.eq('season', season));
  var mask = col.select('classification').mosaic().eq(100);
  return ee.Image.pixelArea().divide(1e4).updateMask(mask).rename(product);
}

var crop  = hectares('temporarycrops', 'tc-annual');
var wheat = hectares('wintercereals', 'tc-wintercereals');
var maize = hectares('maize', 'tc-maize-main');
// irrigated area within winter cereals: the traffic light is computed only here
var irr   = hectares('irrigation', 'tc-wintercereals');

var stack = crop.addBands(wheat).addBands(maize).addBands(irr);
var stats = stack.reduceRegions({
  collection: units,
  reducer: ee.Reducer.sum(),
  scale: SCALE,
  tileScale: 4
}).map(function (f) {
  return ee.Feature(null, {
    id: f.get('id'),
    crop_ha: ee.Number(f.get('temporarycrops')).round(),
    wheat_ha: ee.Number(f.get('wintercereals')).round(),
    maize_ha: ee.Number(f.get('maize')).round(),
    irrigated_ha: ee.Number(f.get('irrigation')).round()
  });
});

print('first rows', stats.limit(5));
Map.centerObject(units, 7);
Map.addLayer(wheat.gt(0).selfMask(), {palette: ['f9a825']}, 'winter cereals 2021');
Map.addLayer(irr.gt(0).selfMask(), {palette: ['1565c0']}, 'irrigated winter cereals 2021');

Export.table.toDrive({
  collection: stats,
  description: 'kp_worldcereal_stats',
  fileFormat: 'CSV',
  selectors: ['id', 'crop_ha', 'wheat_ha', 'maize_ha', 'irrigated_ha']
});
