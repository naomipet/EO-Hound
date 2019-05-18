var map;

/**
 * Initialize the Google Map and add our custom layer overlay.
 * @param  {string} mapId
 * @param  {string} token
 */

var addLayers = function(mapId, token){
  ids = mapId.split(",");
  tokens = token.split(",");

  if(ids.length > 0){
    ids.forEach(addEELayers);

    function addEELayers(value, index, array){
      // The Google Maps API calls getTileUrl() when it tries to display a map
      // tile. This is a good place to swap in the MapID and token we got from
      // the Node.js script. The other values describe other properties of the
      // custom map type.
      var eeMapOptions = {
        getTileUrl: (tile, zoom) => {
          const baseUrl = 'https://earthengine.googleapis.com/map';
          const url = [baseUrl, value, zoom, tile.x, tile.y].join('/');
          return `${url}?token=${tokens[index]}`;
        },
        tileSize: new google.maps.Size(256, 256),
        name: "ee"+index.toString()
      }
      // Create the map type.
      var eeMapType = new google.maps.ImageMapType(eeMapOptions);
      // Add the EE layer to the map.
      map.overlayMapTypes.push(eeMapType);
    };
  }
}

const initialize = () => {
  const osmMapOptions = {
    getTileUrl: function(coord, zoom) {
        // "Wrap" x (longitude) at 180th meridian properly
        // NB: Don't touch coord.x: because coord param is by reference, and changing its x property breaks something in Google's lib
        var tilesPerGlobe = 1 << zoom;
        var x = coord.x % tilesPerGlobe;
        if (x < 0) {
            x = tilesPerGlobe+x;
        }
        // Wrap y (latitude) in a like manner if you want to enable vertical infinite scrolling

        return "https://tile.openstreetmap.org/" + zoom + "/" + x + "/" + coord.y + ".png";
    },
    tileSize: new google.maps.Size(256, 256),
    name: "OpenStreetMap",
    maxZoom: 18
  };


  // Create the osm map type.
  const osmMapType = new google.maps.ImageMapType(osmMapOptions);

  const myLatLng = new google.maps.LatLng(23.842523, 54.466968);
  const mapOptions = {
    center: myLatLng,
    zoom: 8,
    maxZoom: 10,
    streetViewControl: false,
  };


  // Create the base Google Map.
  map = new google.maps.Map(document.getElementById('map'), mapOptions);
  map.mapTypes.set('OpenStreetMap', osmMapType);
  map.setMapTypeId('OpenStreetMap');

  // Add the osm layers to the map.
  map.overlayMapTypes.push(osmMapType);

};
function loadGeoJsonString(geoString) {
  // Define the LatLng coordinates for another inner path.
  var geojson = JSON.parse(geoString);
  map.data.addGeoJson(geojson);
  //zoom(map);
  return geojson;
}

/**
 * Update a map's viewport to fit each geometry in a dataset
 * @param {google.maps.Map} map The map to adjust
 */
function zoom(map) {
  var bounds = new google.maps.LatLngBounds();
  map.fitBounds(bounds);
}
