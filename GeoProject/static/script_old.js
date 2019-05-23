/**
 * Initialize the Google Map and add our custom layer overlay.
 * @param  {string} mapId
 * @param  {string} token
 */
const initialize = (mapId, token, imageCollection, dateStart, dateEnd, cloudFilter) => {
  // The Google Maps API calls getTileUrl() when it tries to display a map
  // tile. This is a good place to swap in the MapID and token we got from
  // the Node.js script. The other values describe other properties of the
  // custom map type.
  const eeMapOptions = {
    getTileUrl: (tile, zoom) => {
      const baseUrl = 'https://earthengine.googleapis.com/map';
      const url = [baseUrl, mapId, zoom, tile.x, tile.y].join('/');
      return `${url}?token=${token}`;
    },
    tileSize: new google.maps.Size(256, 256)
  };

  // Create the map type.
  const mapType = new google.maps.ImageMapType(eeMapOptions);

  const myLatLng = new google.maps.LatLng(23.842523, 54.466968);
  const mapOptions = {
    center: myLatLng,
    zoom: 8,
    maxZoom: 10,
    streetViewControl: false,
  };

  // Create the base Google Map.
  const map = new google.maps.Map(document.getElementById('map'), mapOptions);

  // Add the EE layer to the map.
  map.overlayMapTypes.push(mapType);

  //form
  var formInput = document.getElementById('form');
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(formInput);

  var divOpen = document.getElementById("formClose");
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(divOpen);


  //close on click
  var divClose = document.getElementById("form");
  var divOpen = document.getElementById("formClose");


  $("#closeTab").click(function(){
    $(divClose).fadeToggle();
    $(divOpen).fadeToggle();
  });

  $("#openTab").click(function(){
    $(divOpen).fadeToggle();
    $(divClose).fadeToggle();

  });

  if(imageCollection != ""){
  $("select[name='imageCollection']").val(imageCollection);
  $("input[name='dateStart']").val(dateStart);
  $("input[name='dateEnd']").val(dateEnd);
  $("input[type='number']").val(Number(cloudFilter));
  };


};
