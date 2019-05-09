exports.getCoverage = function(geomeries, bbox, bboxArea) {
  /*gets the coverage precentage of a bbox in a feature*/

  return ee.FeatureCollection(geomeries.map(function(feature) {
    var inter = feature.intersection(bbox.geometry());
    var featureInt = ee.Feature(inter);
    var area = featureInt.geometry().area().divide(100).divide(bboxArea);
    return feature.set({areaHa: area});
  }));
};


exports.AddFeatureLayer = function (collection) { // display each image in collection
  var list = ee.List([]);
  collection.evaluate(function(collection ) {// use map on client-side
    collection.features.map(function(feature) {
    var area = feature.properties.areaHa;
    var layerColor = exports.GetColor(area);
    var geo = ee.Geometry(feature.geometry);
    var name = feature.properties.Name;
    var outline = exports.EmptyRectangle(geo, 2);
    
    Map.addLayer(outline, {palette: layerColor}, name + ', ' + area.toFixed(2) +'%')
    });
  });
};

exports.GetColor = function(area){
  var palette = ['dbabab', 'd08f8f', 'b84d63', '9a3c4f', '871f34'];
  var step = 0.05;
  var colorIndex = ee.Number(area).multiply(step).floor().getInfo();
  return palette[colorIndex];
}


// Funtion for iteraton over the range of dates
exports.CreateMosaicList = function(imageCollection, range, dayDiff){
  var Day_mosaics = function(date, newlist) {
    date = ee.Date(date)
    newlist = ee.List(newlist)

    // Filter collection between date and the next day
    var imagesInRange = imageCollection.filterDate(date, date.advance(dayDiff,'month'))

    // Make the mosaic
    var image = imagesInRange.median()
    image = image.set('date', imagesInRange.first().date())

    // Add the mosaic to a list only if the collection has images
    return ee.List(ee.Algorithms.If(imagesInRange.size(), newlist.add(image), newlist))
    }
return ee.List(range.iterate(Day_mosaics, ee.List([])))
}

/***filter cloudy pictures and area****/
exports.maskS2clouds = function(image) {
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();
  var qa = image.select('QA60');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask)
}

exports.EmptyRectangle = function(polygon, width){
  var empty = ee.Image().byte();
  var outline = empty.paint({
    featureCollection: polygon,
    color: 1,
    width: width
  });
  return outline;
}

exports.GetFeatureGeometry = function(featureCol) {
  return featureCol.map(function(feature){
    return ee.Geometry(feature.geometry());
  });
}

exports.PrintLabel = function(stringText, displayIndex, panel){
  stringText.evaluate(function(result) { 
    panel.widgets().set(displayIndex, ui.Label(result));
  })
}

exports.GetImageDates = function(collection) {
  return ee.List(collection.toList(collection.size()).map(function(img){
    return ee.Image(img).date().format()
  }))
}

exports.GetDayDif = function(dateList) {
  var li= ee.List([])
  var lastDayIndex = dateList.size().add(-1);
  var difList = ee.List.sequence(0, lastDayIndex).map(function(n){
    var e = ee.Number(n).add(-1);
    var date = ee.Date(dateList.get(n));
    var dif = date.difference(dateList.get(e), 'day');
    return  ee.Algorithms.If(n, dif, 0);
  })
  return exports.RemoveZerosFromList(difList);
}

exports.RemoveZerosFromList = function(list){
  var mappingFunc = function(item, newlist) {
    newlist = ee.List(newlist)
    return ee.List(ee.Algorithms.If(item, newlist.add(item), newlist))
  }
  return ee.List(list.iterate(mappingFunc, ee.List([])))
}

exports.RemoveLayer = function(name, panel) {
  panel.clear();
  var layers = Map.layers()
  // list of layers names
  var names = []
  layers.forEach(function(lay) {
    var lay_name = lay.getName()
    names.push(lay_name)
  })
  // get index
  var index = names.indexOf(name)
  if (index > -1) {
    // if name in names
    var layer = layers.get(index)
    Map.remove(layer)
  }
}
