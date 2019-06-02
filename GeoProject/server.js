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

const app = express();


app.engine ('hbs', handlebars( {
  extname: 'hbs',
  defaultView: 'default',
  layoutsDir: __dirname + '/views/',
  partialsDir: __dirname + '/views/partials/'
} ) );
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

  dateStart = request.query.dateStart;
  dateEnd = request.query.dateEnd;
  var loadImage = false
  if(request.query.showImage == 'true'){
    loadImage = true
  }
  // jsonBbox = request.body.jsonBbox;
  cloudFilter = Number(request.query.cloudFilter);
  var coord = request.query.coordinates.split(",")
    //parse inputs
    //var res = request.params.geometry.split(",")
    //build bbox
    var geo =[]
    var numOfCoord = coord.length / 2
    if(numOfCoord <= 2){
      Error('Invalid geomtry', response)
    }
    for (var i = 0; i < numOfCoord; i++)
    {
      geo.push([parseFloat(coord[2*i]), parseFloat(coord[2*i+1])])
    }
    var poly = ee.Geometry.Polygon(geo, null, false)
    var bbox = ee.FeatureCollection(poly)
    //collection of images including all granules related to bbox, for statistics
    var collection = ee.ImageCollection(params.collectionSource).filterBounds(bbox).filterDate(dateStart,dateEnd).filter(ee.Filter.lt(params.cloudDescriptor, cloudFilter))

    //var collection = ee.ImageCollection(collectionSource).filterBounds(bbox).filterDate(dateStart,dateEnd).filter(ee.Filter.lt('cloudDescriptor', cloudFilter))
    var count = collection.size().getInfo()
    var output = {} // empty Object
    AddFieldToJson(output, 'count', count)



    //check if any images exist
    if(count == '0'){
      Error('No images for required dates',response)
    }
    else {
      var bboxArea = bbox.geometry().area(10).getInfo()
      var footprintData = GetFootpringData(request.query.imageCollection, bbox, bboxArea, params.nameDescriptor, response)
      //calc statistics on images
      var cloudsStat = GetCloudStat(collection, params.cloudDescriptor)
      // Get the date range of images in the collection.
      var range = collection.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
      var minDate = ee.Date(range.get('min'))
      var maxDate = ee.Date(range.get('max'))
      var downloadNames = collection.aggregate_array(params.idDescriptor).getInfo()
      //output data
      AddFieldToJson(output, 'cloudsAvg', cloudsStat.mean.getInfo().toFixed(2))
      AddFieldToJson(output, 'minDate', minDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'maxDate', maxDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'granulesDescending', footprintData.covarageDescending)
      AddFieldToJson(output, 'granulesAscending', footprintData.covarageAscending)
      AddFieldToJson(output, 'names', footprintData.names)
      AddFieldToJson(output, 'aream2', bboxArea.toFixed(2))
      AddFieldToJson(output, 'downloadNames', downloadNames)

      var mapid1 =[]
      var token1 =[]
      if(loadImage == true){
      //collection of images clipped to bbox, for image sample
      var filteredCollection = collection.map(function(im){return im.clip(bbox)})
      //get maps tokens and respond
      var rgbVis = {
        min: 0.0,
        max: 3000
      };

      var min = filteredCollection.min().select('B4', 'B3', 'B2');
      min.getMap(rgbVis, ({mapid, token}) => {
        mapid1.push(mapid.toString())
        token1.push(token.toString())
        AddFieldToJson(output, 'mapid', mapid1)
        AddFieldToJson(output, 'token', token1)
        response.send(output);
      })
    }
    else {
      response.send(output);
    }
    }

})

app.get('/granule', (request, response) => {
  //parse inputs

  var granuleName = request.query.name
  var params = GetCollectionParams(request.query.imageCollection)
  var maxCloud = parseInt(request.query.cloudFilter)
  var start = ee.Date(request.query.dateStart)
  var finish = ee.Date(request.query.dateEnd)
  //collection of images including all granules related to bbox, for statistics
  var granuleImages, orbitDirection
  if(request.query.imageCollection == 'Landsat'){
    var path = Number(granuleName.slice(0, 3));
    var row = Number(granuleName.slice(3, 6));
    granuleImages = ee.ImageCollection(params.collectionSource).filterMetadata('WRS_PATH','equals', path).filterMetadata('WRS_ROW','equals', row).filterDate(start,finish).filter(ee.Filter.lt(params.cloudDescriptor, maxCloud))
    orbitDirection = 'DESCENDING'
  }
  else {
    granuleImages = ee.ImageCollection(params.collectionSource).filterMetadata('MGRS_TILE', 'equals', granuleName).filterDate(start,finish).filter(ee.Filter.lt(params.cloudDescriptor, maxCloud))
    orbitDirection = granuleImages.first().get(params.orbitDirDescriptor).getInfo()
  }

  var count = granuleImages.size().getInfo();
  if(count > 0){
    var clouds = granuleImages.aggregate_array(params.cloudDescriptor)

    // Get the date range of images in the collection.
    var range = granuleImages.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
    //var minDate = ee.Date(range.get('min'))
    //var maxDate = ee.Date(range.get('max'))
    var dates = GetImageDates(granuleImages)
    var diffs = GetDayDif(dates);
    var revisitTime = 0;
    if(diffs != 0)
    {
      revisitTime = diffs.reduce(ee.Reducer.mean()).getInfo().toFixed(2);
    }
    var datesList = dates.getInfo().map(date => new Date(date))
    var cloudList = clouds.getInfo().map(cloud => parseFloat(cloud))
    var maxDate=new Date(Math.max.apply(null,datesList));
    var minDate=new Date(Math.min.apply(null,datesList));
    var histLists = GetHistogramLists(datesList, cloudList);
    var downloadNames = granuleImages.aggregate_array(params.idDescriptor).getInfo()
    response.render('statistic', {name: granuleName, orbitDirection: orbitDirection, start: minDate.toLocaleDateString("en-US"), end: maxDate.toLocaleDateString("en-US"), numOfImages: count, revisitTime: revisitTime, labels: histLists.labels, dataCloud:histLists.data, dataCount:histLists.numOfImages, downloadNames: downloadNames});
  }
  else{
    Error('No images for the required tile', response)
  }
})

//documentation page
app.get('/about', (request, response) => {
  response.render('about')
})

//render 404 error page
app.use(function(req, res, next) {
  var error = res.status(404)
  res.render('404')
})

//render 500 error page
app.use(function(req, res, next) {
  var error = res.status(500)
  res.render('500')
})



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

GetFootpringData = function(collectionName, bbox, bboxArea, nameDescriptor,response){
  var footprint, names
  var covarageDescending ={}
  var  covarageAscending = {}
  if(collectionName == 'Landsat'){
  //feature collection of all granules partially covering the bbox
    try{
    footprint = ee.FeatureCollection('users/naomipet/landsat_descending').filterBounds(bbox)
    covarageDescending = GetCoverage(footprint, bbox, bboxArea, nameDescriptor).getInfo()
    names = footprint.aggregate_array(nameDescriptor).getInfo()
  }catch(e)
  {
    var output = {} // empty Object
    if(e.message == 'Collection query aborted after accumulating over 5000 elements.')
    AddFieldToJson(output, 'error', 'Too many images for query. Try choosing smaller geometry')
    else{
      //general error..
      AddFieldToJson(output, 'error', e.message)
    }
    response.send(output);
    var r = request(url)
    r.abort()
  }
    //footprint = ee.FeatureCollection('users/naomipet/landsat_ascending').filterBounds(bbox)
    //covarageAscending =(GetCoverage(footprint, bbox, bboxArea, nameDescriptor).getInfo())
    //names +=(","+footprint.aggregate_array(nameDescriptor).getInfo())
  }
  else{
    footprint = ee.FeatureCollection('users/naomipet/sentinel2_tiles_world').filterBounds(bbox)
    covarageDescending = GetCoverage(footprint, bbox, bboxArea, nameDescriptor).getInfo()
    names = footprint.aggregate_array(nameDescriptor).getInfo()
  }
  return {
      names: names,
      covarageDescending: covarageDescending,
      covarageAscending: covarageAscending
  };
}

GetCoverage = function(geomeries, bbox, bboxArea, nameDescriptor) {
  /*gets the coverage precentage of a bbox in a feature*/
  return ee.FeatureCollection(geomeries.map(function(feature) {
    var inter = feature.intersection(bbox.geometry(), 5)
    var featureInt = ee.Feature(inter)
    var name = feature.get(nameDescriptor)
    feature = feature.set({appName: name})
    return feature.set({areaPrecent: featureInt.geometry().area().divide(bboxArea).multiply(100)})
  }))
}

GetDayDif = function(dateList) {
  if(dateList.size().getInfo() == 1){
    return 0;
  }
  var lastDayIndex = dateList.size().add(-1)
  var difList = ee.List.sequence(0, lastDayIndex).map(function(n){
    var e = ee.Number(n).add(-1)
    var date = ee.Date(dateList.get(n))
    var dif = date.difference(dateList.get(e), 'day')
    return  ee.Algorithms.If(n, dif, 0)
  })
  return RemoveZerosFromList(difList)
}

GetCloudStat = function(collection, cloudDescriptor){
  var mean = collection.reduceColumns({
        reducer: ee.Reducer.mean(),
        selectors: [cloudDescriptor],
      })
  return {
      mean: mean.get('mean'),
  };
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
      nameDescriptor = 'WRSPR'
      orbitDirDescriptor = 'MODE'
      idDescriptor = 'LANDSAT_ID'
      break
    case 'Sentinel2A':
      collectionSource = 'COPERNICUS/S2_SR'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
      nameDescriptor = 'Name'
      orbitDirDescriptor = 'SENSING_ORBIT_DIRECTION'
      idDescriptor = 'DATASTRIP_ID'
      break
    default:
      collectionSource = 'COPERNICUS/S2'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
      nameDescriptor = 'Name'
      orbitDirDescriptor = 'SENSING_ORBIT_DIRECTION'
      idDescriptor = 'DATASTRIP_ID'
  }
  return {
      collectionSource: collectionSource,
      cloudDescriptor: cloudDescriptor,
      nameDescriptor: nameDescriptor,
      orbitDirDescriptor: orbitDirDescriptor,
      idDescriptor: idDescriptor
  };
}

AddFieldToJson = function(base, key, value){
  base[key] = []; // empty Array, which you can push() values into
  base[key]=value;
}

GetHistogramLists = function(datesList, cloudList){
  //var datesStrList = dates.split(',')
  //var cloudsStrList = clouds.split(',')

  var firstYear = datesList[0].getYear();
  var lastYear = datesList[datesList.length-1].getYear();
  var years = lastYear - firstYear + 1;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var labels = []
  var data = []
  var numOfImages = []
  if(years == 1){
    var firstMonth = datesList[0].getMonth();
    var lastMonth = datesList[datesList.length-1].getMonth()
    var months = lastMonth - firstMonth + 1;
    for(var i = 0; i < months; i++){
      var month = firstMonth + i;
      labels[i] = monthNames[month]
      var avg = 0;
      var count = 0;
      numOfImages[i] = 0;
      for(j = 0; j < cloudList.length; j++){
        if(datesList[j].getMonth() == month){
          avg += cloudList[j]
          count ++;
        }
      }
      data[i] = avg/count;
      numOfImages[i] = count;
    }
  }
  else {
    for(var i = 0; i < years; i++){
      var year = firstYear + i
      labels[i] = year + 1900;
      var avg = 0;
      var count = 0;
      numOfImages[i] = 0;
      for(j = 0; j < cloudList.length; j++){
        if(datesList[j].getYear() == year){
          avg += cloudList[j]
          numOfImages[i]++;
          count ++;
        }
      }
      data[i] = avg/count;
    }
  }
  return {
      labels: labels,
      data: data,
      numOfImages: numOfImages
  };
}

var Error = function(message, response){
  response.render('errorNoData', {error: message});
}
