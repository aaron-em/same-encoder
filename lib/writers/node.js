var Buffer = require('buffer').Buffer
  , fs = require('fs');

module.exports = function(wavFile, target) {
  var buf = new Buffer(wavFile, 'binary')
    , out = fs.createWriteStream(target);
  out.write(buf);
  out.end();
};