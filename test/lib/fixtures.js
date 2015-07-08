var deasync = require('deasync');
var zlib = require('zlib');
var fs = require('fs');
var fixturePath = './test/fixtures/';
var fixtures = {};

var gunzipSync = deasync(zlib.gunzip);

fs.readdirSync(fixturePath).forEach(function(fixture) {
  if (! fixture.match(/\.gz$/)) return;
  var fixtureName = fixture.replace(/\.gz$/, '');
  var path = fixturePath + fixture;
  
  fixtures[fixtureName] = gunzipSync(fs.readFileSync(path))
    .toString('binary');

  // if this fixture can be parsed as JSON, use the parsed version
  try {
    fixtures[fixtureName] = JSON.parse(fixtures[fixtureName]);
  } catch (e) {
  }
});

if (Object.keys(fixtures).length === 0) {
  throw new Error('No test fixtures loaded; you may need to regenerate them');
}

module.exports = fixtures;
