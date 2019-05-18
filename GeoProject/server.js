 /**
 * server.js
 *
 * Works in the local development environment and when deployed. If successful,
 * shows a single web page with the SRTM DEM displayed in a Google Map. See
 * accompanying README file for instructions on how to set up authentication.
 */
const ee = require('@google/earthengine')
const express = require('express')
const handlebars  = require('express-handlebars')


const app = express()
  .engine('.hbs', handlebars({extname: '.hbs', cache: false}))
  .set('view engine', '.hbs')
  .use('/static', express.static('static'))

  app.get('/', (request, response) => {

    const prop = "bbb"
    var mapid = 0
    var token = 0
    response.render('index', {prop, mapid, token} )
  })

  app.get('/filter/:collectionSource/:startDate/:finishDate/:maxCloud/:geometry', (request, response) => {
    //parse inputs
    var res = request.params.geometry.split(",")
    var collectionSource = GetCollectionName(request.params.collectionSource)
    var maxCloud = parseInt(request.params.maxCloud)
    var start = ee.Date(request.params.startDate)
    var finish = ee.Date(request.params.finishDate)

    //build bbox
    var geo =[]
    for (var i = 0; i < 4; i++)
    {
      geo.push([parseFloat(res[2*i]), parseFloat(res[2*i+1])])
    }
    var poly = ee.Geometry.Polygon(geo)
    var bbox = ee.FeatureCollection(poly)

    //collection of images including all granules related to bbox, for statistics
    var collection = ee.ImageCollection(collectionSource).filterBounds(bbox).filterDate(start,finish).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud))
    //check if any images exist
    var count = collection.size()
    var prop
    if(count.getInfo() == '0'){
      prop = 'no images'
      response.render('index', {prop} )
    }
    else {
      //collection of images clipped to bbox, for image sample
      var filteredCollection = collection.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
                      .map(function(im){return im.clip(bbox)})
      //feature collection of all granules partially covering the bbox
      var sentinelFootprint = ee.FeatureCollection('users/naomipet/sentinel2_tiles_world').filterBounds(bbox)

      //create empty rectangles from granules
      var empty = ee.Image().byte()
      var outline = empty.paint({
        featureCollection: sentinelFootprint,
        width: 2
      })
      var bboxArea = bbox.geometry().area().divide(100 * 100).getInfo()
      //get a new feature collection, that is sentinelFootprint with a new property- precentage of area that is covered by bbox
      var covarage = GetCoverage(sentinelFootprint, bbox, bboxArea)
      var granuleNames = sentinelFootprint.aggregate_array("Name")

      //calc statistics
      var areas = covarage.aggregate_array("areaHa")
      var clouds = collection.aggregate_array('CLOUDY_PIXEL_PERCENTAGE')
      // Get the date range of images in the collection.
      var range = collection.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
      var minDate = ee.Date(range.get('min'))
      var maxDate = ee.Date(range.get('max'))

      //output data
      var output = {} // empty Object
      AddFieldToJson(output, 'areas', areas.getInfo())
      AddFieldToJson(output, 'clouds', clouds.getInfo())
      AddFieldToJson(output, 'count', count.getInfo())
      AddFieldToJson(output, 'minDate', minDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'maxDate', maxDate.format('d-M-Y').getInfo())
      AddFieldToJson(output, 'names', granuleNames.getInfo())

      //prop = "areas: " + areas.getInfo() + " clouds: "+ clouds.getInfo() + "count: " + count.getInfo() + "minDate: " + minDate.format('d-M-Y').getInfo() + " maxDate: " + maxDate.format('d-M-Y').getInfo() + "names: " + granuleNames.getInfo()
      var mapid1 =[]
      var token1 =[]
      //get maps tokens and respond
      filteredCollection.getMap({min: 0, max: 3000}, ({mapid, token}) => {
        mapid1.push(mapid.toString())
        token1.push(token.toString())
        outline.getMap({palette: '871f34'}, ({mapid, token}) => {
          mapid1.push(mapid.toString())
          token1.push(token.toString())
          AddFieldToJson(output, 'mapid', mapid1)
          AddFieldToJson(output, 'token', token1)

          response.send(output);
        //response.render('index', {prop, mapid1, token1} )
        })
      })
    }

})

app.get('/granule/:collectionSource/:startDate/:finishDate/:maxCloud/:name', (request, response) => {
  //parse inputs
  var granuleName = request.params.name
  var collectionSource = GetCollectionName(request.params.collectionSource)
  var maxCloud = parseInt(request.params.maxCloud)
  var start = ee.Date(request.params.startDate)
  var finish = ee.Date(request.params.finishDate)
  //collection of images including all granules related to bbox, for statistics
  var granuleImages = ee.ImageCollection(collectionSource).filterMetadata('MGRS_TILE', 'equals', granuleName).filterDate(start,finish).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud))
  var count = granuleImages.size();
  var clouds = granuleImages.aggregate_array('CLOUDY_PIXEL_PERCENTAGE')
  var cloudStats = granuleImages.reduceColumns({
        reducer: ee.Reducer.mean(),
        selectors: ['CLOUDY_PIXEL_PERCENTAGE'],
      })
  var cloudsMean = cloudStats.get('mean').getInfo().toFixed(2);
  // Get the date range of images in the collection.
  var range = granuleImages.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
  var minDate = ee.Date(range.get('min'))
  var maxDate = ee.Date(range.get('max'))
  var dates = GetImageDates(granuleImages);
  var diffs = GetDayDif(dates);
  var revisitTime = diffs.reduce(ee.Reducer.mean()).getInfo().toFixed(2);

  //output data
  prop = " granule name:" + granuleName + " numOfImages: " + count.getInfo() + " clouds: "+ clouds.getInfo() + "minDate: " + minDate.format('d-M-Y').getInfo() + " maxDate: " + maxDate.format('d-M-Y').getInfo() + " revisit time: " + revisitTime + "cloudsMean" + cloudsMean
  response.render('index', {prop} )
})




// Private key, in `.json` format, for an Earth Engine service account.
const PRIVATE_KEY = require('./privatekey.json')
const PORT = process.env.PORT || 3000

ee.data.authenticateViaPrivateKey(PRIVATE_KEY, () => {
  ee.initialize(null, null, () => {
    app.listen(PORT)
    console.log(`Listening on port ${PORT}`)
  })
})



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

GetCollectionName = function(name){
  var collectionSource = ''
  switch(name) {
    case 'Landsat': //not operational!
      collectionSource = 'LANDSAT/LC08/C01/T1_SR'
      break
    case 'Sentinel2A':
      collectionSource = 'COPERNICUS/S2_SR'
      break
    default:
      collectionSource = 'COPERNICUS/S2'
  }
  return collectionSource
}

AddFieldToJson = function(base, key, value){
  base[key] = []; // empty Array, which you can push() values into
  base[key].push(value);
}
