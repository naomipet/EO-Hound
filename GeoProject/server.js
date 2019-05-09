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

const app = express()
  .engine('.hbs', handlebars({extname: '.hbs', cache: false}))
  .set('view engine', '.hbs')
  .use('/static', express.static('static'))
  .get('/', (request, response) => {

    var start = ee.Date('2018-04-01');
    var finish = ee.Date('2018-08-31');
    const image = ee.ImageCollection('COPERNICUS/S2').filterDate(start,finish);
    image.getMap({min: 0, max: 1000}, ({mapid, token}) => {
      response.render('index', {mapid, token});
    })
  // .get('/about', (request, response) =>{
  //   response.render('about');
  // });
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
