/**
 * server.js
 *
 * Works in the local development environment and when deployed. If successful,
 * shows a single web page with the SRTM DEM displayed in a Google Map. See
 * accompanying README file for instructions on how to set up authentication.
 */
const ee = require('@google/earthengine');
const express = require('express');
const handlebars  = require('express-handlebars');
var bodyParser = require('body-parser');
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const upload = multer({
    dest: "uploads/" // "uploads"
});


const app = express();


app.engine('.hbs', handlebars({extname: '.hbs', cache: false}));
app.set('view engine', '.hbs');
app.use('/static', express.static('static'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())


var imageCollection = null;
var dateStart = null;
var dateEnd = null;
var jsonBbox = null;
var cloudFilter = null;

app.get('/', (request, response) => {

  response.render('index', {addLayer: false} )
})

app.get('/filter', (request, response) => {


  var params = GetCollectionParams(request.query.imageCollection)
  var collectionSource = params.collectionSource
  var cloudDescriptor = params.cloudDescriptor
  dateStart = request.query.dateStart;
  dateEnd = request.query.dateEnd;
  // jsonBbox = request.body.jsonBbox;
  cloudFilter = Number(request.query.cloudFilter);
  var coord = request.query.coordinates.split(",")
    //parse inputs
    //var res = request.params.geometry.split(",")
    //build bbox
    var geo =[]
    for (var i = 0; i < 4; i++)
    {
      geo.push([parseFloat(coord[2*i]), parseFloat(coord[2*i+1])])
    }
    var poly = ee.Geometry.Polygon(geo)
    var bbox = ee.FeatureCollection(poly)
    //collection of images including all granules related to bbox, for statistics
    var collection = ee.ImageCollection(collectionSource).filterBounds(bbox).filterDate(dateStart,dateEnd).filter(ee.Filter.lt(cloudDescriptor, cloudFilter))
    //var collection = ee.ImageCollection(collectionSource).filterBounds(bbox).filterDate(dateStart,dateEnd).filter(ee.Filter.lt('cloudDescriptor', cloudFilter))
    var count = collection.size().getInfo()
    var output = {} // empty Object
    AddFieldToJson(output, 'count', count)
    //check if any images exist
    if(count == '0'){
      response.send(output);
    }
    else {
      //collection of images clipped to bbox, for image sample
      var filteredCollection = collection.filter(ee.Filter.lt(cloudDescriptor, 15))
                      .map(function(im){return im.clip(bbox)})
      var footprint, names
      if(request.query.imageCollection == 'Landsat'){
      //feature collection of all granules partially covering the bbox
        footprint = ee.FeatureCollection('users/naomipet/landsat_descending').filterBounds(bbox)
        names = footprint.aggregate_array('WRSPR')
      }
      else{
        footprint = ee.FeatureCollection('users/naomipet/sentinel2_tiles_world').filterBounds(bbox)
        names = footprint.aggregate_array('Name')
      }

      var bboxArea = bbox.geometry().area().divide(100 * 100).getInfo()
      //get a new feature collection, that is sentinelFootprint with a new property- precentage of area that is covered by bbox
      var covarage = GetCoverage(footprint, bbox, bboxArea)


      //calc statistics
      var clouds = collection.aggregate_array(cloudDescriptor)
      // // Get the date range of images in the collection.
      var range = collection.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
      var minDate = ee.Date(range.get('min'))
      var maxDate = ee.Date(range.get('max'))
      //
      // //output data

      AddFieldToJson(output, 'clouds', clouds.getInfo())
      AddFieldToJson(output, 'minDate', minDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'maxDate', maxDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'granules', covarage.getInfo())
      AddFieldToJson(output, 'names', names.getInfo())

      var mapid1 =[]
      var token1 =[]
      //get maps tokens and respond
      var rgbVis = {
        min: 0.0,
        max: 3000,
        bands: ['B4', 'B3', 'B2'],
      };
      filteredCollection.getMap(rgbVis, ({mapid, token}) => {
        mapid1.push(mapid.toString())
        token1.push(token.toString())
        AddFieldToJson(output, 'mapid', mapid1)
        AddFieldToJson(output, 'token', token1)
        response.send(output);
      })
    }

})

app.get('/granule', (request, response) => {
  //parse inputs
  var output = {} // empty Object

  var granuleName = request.query.name
  var params = GetCollectionParams(request.query.imageCollection)
  var collectionSource = params.collectionSource
  var cloudDescriptor = params.cloudDescriptor
  var maxCloud = parseInt(request.query.cloudFilter)
  var start = ee.Date(request.query.dateStart)
  var finish = ee.Date(request.query.dateEnd)
  //collection of images including all granules related to bbox, for statistics
  var granuleImages
  if(request.query.imageCollection == 'Landsat'){
    var path = Number(granuleName.slice(0, 3));
    var row = Number(granuleName.slice(3, 6));
    granuleImages = ee.ImageCollection(collectionSource).filter(ee.Filter.eq('WRS_PATH', path)).filter(ee.Filter.eq('WRS_ROW', row)).filterDate(start,finish).filter(ee.Filter.lt(cloudDescriptor, maxCloud))
  }
  else {
    granuleImages = ee.ImageCollection(collectionSource).filterMetadata('MGRS_TILE', 'equals', granuleName).filterDate(start,finish).filter(ee.Filter.lt(cloudDescriptor, maxCloud))
  }
  var count = granuleImages.size();
  var clouds = granuleImages.aggregate_array(cloudDescriptor)
  // Get the date range of images in the collection.
  var range = granuleImages.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
  var minDate = ee.Date(range.get('min'))
  var maxDate = ee.Date(range.get('max'))
  var dates = GetImageDates(granuleImages);
  var diffs = GetDayDif(dates);
  var revisitTime = diffs.reduce(ee.Reducer.mean()).getInfo().toFixed(2);

  //output data
   var output = {} // empty Object
   AddFieldToJson(output, 'granuleName', granuleName)
  AddFieldToJson(output, 'count', count.getInfo())
  AddFieldToJson(output, 'clouds', clouds.getInfo())
  AddFieldToJson(output, 'minDate', minDate.format('d-M-Y').getInfo())
  AddFieldToJson(output, 'maxDate', maxDate.format('d-M-Y').getInfo())
  AddFieldToJson(output, 'revisitTime', revisitTime)
  response.send(output);
})

app.get('/about', (request, response) => {
  response.render('about');
});

// Private key, in `.json` format, for an Earth Engine service account.
const PRIVATE_KEY = require('./privatekey.json');
const PORT = process.env.PORT || 3000;

ee.data.authenticateViaPrivateKey(PRIVATE_KEY, () => {
  ee.initialize(null, null, () => {
    app.listen(PORT);
    console.log(`Listening on port ${PORT}`);
  });
});

//utils
GetCoverage = function(geomeries, bbox, bboxArea) {
  /*gets the coverage precentage of a bbox in a feature*/
  return ee.FeatureCollection(geomeries.map(function(feature) {
    var inter = feature.intersection(bbox.geometry())
    var featureInt = ee.Feature(inter)
    return feature.set({areaHa: featureInt.geometry().area().divide(100).divide(bboxArea)})
  }))
}

GetDayDif = function(dateList) {
  var li= ee.List([])
  var lastDayIndex = dateList.size().add(-1)
  var difList = ee.List.sequence(0, lastDayIndex).map(function(n){
    var e = ee.Number(n).add(-1)
    var date = ee.Date(dateList.get(n))
    var dif = date.difference(dateList.get(e), 'day')
    return  ee.Algorithms.If(n, dif, 0)
  })
  return RemoveZerosFromList(difList)
}

RemoveZerosFromList = function(list){
  var mappingFunc = function(item, newlist) {
    newlist = ee.List(newlist)
    return ee.List(ee.Algorithms.If(item, newlist.add(item), newlist))
  }
  return ee.List(list.iterate(mappingFunc, ee.List([])))
}

GetImageDates = function(collection) {
  return ee.List(collection.toList(collection.size()).map(function(img){
    return ee.Image(img).date().format()
  }))
}

GetCollectionParams = function(name){
  switch(name) {
    case 'Landsat': //not operational!
      collectionSource = 'LANDSAT/LC08/C01/T1_SR'
      cloudDescriptor = 'CLOUD_COVER'
      break
    case 'Sentinel2A':
      collectionSource = 'COPERNICUS/S2_SR'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
      break
    default:
      collectionSource = 'COPERNICUS/S2'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
  }
  return {
      collectionSource: collectionSource,
      cloudDescriptor: cloudDescriptor
  };
}

GetFootprint = function(name){
  switch(name) {
    case 'Landsat': //not operational!
      footprint = ee.FeatureCollection('users/naomipet/landsat_descending').filterBounds(bbox)
      break
    case 'Sentinel2A':
      footprint = ee.FeatureCollection('users/naomipet/sentinel2_tiles_world').filterBounds(bbox)
      break
    default:
      footprint = ee.FeatureCollection('users/naomipet/sentinel2_tiles_world').filterBounds(bbox)
  }
  return {
      footprint: footprint,
  };
}




AddFieldToJson = function(base, key, value){
  base[key] = []; // empty Array, which you can push() values into
  base[key]=value;
}
