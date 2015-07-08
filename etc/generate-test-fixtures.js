/*
 * Generate the necessary fixtures for unit test comparisons.
 */

var Buffer = require('buffer').Buffer;
var zlib = require('zlib');
var fs = require('fs');
var Wav = require('lib/wav');
var Writer = require('lib/writer');
var fixturePath = 'test/fixtures/';
var fixtures = {
  renderTone: function(w) {
    w.append(440, 1, 32767);
    return {
      type: 'literal',
      data: JSON.stringify(w.renderTone(w.dataBuffer[0]))
    };
  },
  
  render_empty: function(w) {
    return {
      type: 'raw',
      data: w.render()
    };
  },
  
  render_complete: function(w) {
    w.append(440, 1, 32767);
    return {
      type: 'raw',
      data: w.render()
    };
  }
};

Object.keys(fixtures).forEach(function(name) {
  var path = fixturePath + name + '.gz';
  var fixtureFunc = fixtures[name];
  var gzip = zlib.createGzip({level: 9});
  var fixture;
  var w;
  
  w = new Wav({
    channels: 2,
    bitsPerSample: 16,
    sampleRate: 44100
  });

  fixture = fixtureFunc(w);

  var buf = new Buffer(fixture.data, 'binary');
  var out = fs.createWriteStream(path);
  gzip.pipe(out);
  gzip.write(buf);
  gzip.end();
});
