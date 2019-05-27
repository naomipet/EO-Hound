/**
 * Initialize the Google Map and add our custom layer overlay.
 * @param  {string} mapId
 * @param  {string} token
 */
const initialize = () => {
  // The Google Maps API calls getTileUrl() when it tries to display a map
  // tile. This is a good place to swap in the MapID and token we got from
  // the Node.js script. The other values describe other properties of the
  // custom map type.
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
  }
    // Create the osm map type.
  const osmMapType = new google.maps.ImageMapType(osmMapOptions);

  const myLatLng = new google.maps.LatLng(23.842523, 54.466968);
  const mapOptions = {
    center: myLatLng,
    zoom: 8,
    maxZoom: 10,
    streetViewControl: false,
  };

  // Create the base osm Map.
  map = new google.maps.Map(document.getElementById('map'), mapOptions);
  map.mapTypes.set('OpenStreetMap', osmMapType);
  map.setMapTypeId('OpenStreetMap');

  // Add the layers to the map.
  map.overlayMapTypes.setAt(0, osmMapType)
  map.overlayMapTypes.push(null);        // Placeholder for ee
  map.overlayMapTypes.push(null);        // Placeholder for ee

  //form and general statistic
  var formInput = document.getElementById('form');
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(formInput);

  var divOpen = document.getElementById("formClose");
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(divOpen);

  var statisticDiv = document.getElementById("containerStatGen");
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(statisticDiv);

};

var addLayers = function(mapId, token){
  mapId = mapId.replace(/"/g, '').replace(/\[|\]/g, '')
  token= token.replace(/"/g, '').replace(/\[|\]/g, '')
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
      map.overlayMapTypes.setAt(index+1, eeMapType)
    };
  }
}

function loadGeoJsonString(geoString) {
  map.data.forEach(function(feature) {
    // filter...
    map.data.remove(feature);
  });
  // Define the LatLng coordinates for another inner path.
  var geojson = JSON.parse(geoString);
  map.data.addGeoJson(geojson)
  map.data.setStyle({
    fillColor: 'transparent',
    strokeWeight: 2
  })
  var bounds = new google.maps.LatLngBounds();


  for (var i = 0; i < geojson.features.length; i++) {
    for (var j = 0; j < geojson.features[i].geometry.coordinates.length; j++){
      geojson.features[i].geometry.coordinates[j].forEach(addBound);
    }
  }



  function addBound(geo){
    var lat = new google.maps.LatLng(geo[1], geo[0]);
    bounds.extend(lat);
  }
  map.fitBounds(bounds)
  var zoom = map.getZoom();
  map.setZoom(zoom-1)


  return geojson;
}

function loadGeoJson(geojson, highligtedFeature) {
  // Define the LatLng coordinates for another inner path.
  map.data.forEach(function(feature) {
    // filter...
    map.data.remove(feature);
  });
  map.data.addGeoJson(geojson)
  setFeatureStyle(highligtedFeature)
}

function setFeatureStyle(highligtedFeature){
    map.data.setStyle(function(feature) {
    var featureName = feature.getProperty('Name');
    var color = "gray";
    var strokeWeight = 2;
    if (featureName == highligtedFeature) {
      color = "green";
      var strokeWeight = 4
    }
    return {
      fillColor: 'transparent',
      strokeColor: color,
      strokeWeight: strokeWeight
    }
  });
}
