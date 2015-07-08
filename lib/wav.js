var pack = require('lib/util').pack
  , xtype = require('xtypejs');

xtype.options.setNameScheme('compact');

/**
 * A subclass of Error specific to Wav class.
 * 
 * @param {string} message - The message to include in the error.
 */
var WavError = function(message) {
  this.name = 'WavError';
  this.message = message || '';
  
};
WavError.prototype = Error.prototype;

/**
 * A class for generating .wav (RIFF WAVE) format files containing a series of sine wave tones.
 * 
 * @param {Object} params - An object of parameters for the wave file.
 * @param {number} params.channels - The number of channels to generate. Must be an integer > 0.
 * @param {number} params.sampleRate - The number of samples per second to generate. Must be an integer > 0.
 * @param {number} params.bitsPerSample - The number of bits per sample to generate. Must be an integer > 0.
 */
var Wav = function(params) {
  var paramErrors = [];

  // Validate parameters
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new WavError('Wav constructor requires a "params" object (see documentation)');
  }
  
  if (! xtype.is(params.channels, 'int+')) {
    paramErrors.push('"channels" must be integer > 0');
  }

  if (! xtype.is(params.sampleRate, 'int+')) {
    paramErrors.push('"sampleRate" must be integer > 0');
  }

  if (! xtype.is(params.bitsPerSample, 'int+')) {
    paramErrors.push('"bitsPerSample" must be integer > 0');
  }

  if (paramErrors.length > 0) {
    throw new WavError('Invalid parameters to Wav constructor: ' + paramErrors.join('; '));
  }

  // Set up instance
  this.params = params;
  this.dataBuffer = [];
};

/**
 * Append a tone specification to the .wav object's data buffer.
 * @param {number} frequency - The frequency of the tone. Must be an integer (I think).
 * @param {number} length - The length, in (possibly fractional) seconds, of the tone.
 * @param {number} volume - The volume of the tone. Must be an integer between 0 and 32767 inclusive.
 */
Wav.prototype.append = function(frequency, length, volume) {
  var paramErrors = [];

  if (! xtype.is(frequency, 'int+')) {
    paramErrors.push('frequency must be integer > 0');
  }

  if (! xtype.is(length, 'num+')) {
    paramErrors.push('length must be real > 0');
  }

  if (! (xtype.is(volume, 'int+') && volume <= 32767)) {
    paramErrors.push('volume must be integer 0 <= i <= 32767');
  }

  if (paramErrors.length > 0) {
    throw new WavError('Invalid parameters to .append(): ' + paramErrors.join('; '));
  };
  
  this.dataBuffer.push({
    frequency: frequency,
    length: length,
    volume: volume
  });
};

/**
 * Render a tone specification into samples suitable for inclusion in wave file data.
 * Not intended to be called directly. Do so at your own risk.
 * 
 * @param {Object} spec - A tone specification (see {@link Wav.prototype.append} for details).
 */
Wav.prototype.renderTone = function(spec) {
  var tone = {
    count: 0,
    samples: ''
  };

  for (var i = 0; i < this.params.sampleRate * spec.length; i++) {
    for (var c = 0; c < this.params.channels; c++) {
      var sample = spec.volume *
            Math.sin((2 * Math.PI) * (i / this.params.sampleRate) * spec.frequency);
      tone.samples += pack("v", sample);
      tone.count++;
    }
  }

  return tone;
};

/**
 * Render the object's data buffer into a complete RIFF WAVE file.
 * @returns {string} - A complete RIFF WAVE file, ready for writing into a file, a browser audio element, or whatever else you like.
 */
Wav.prototype.render = function() {
  var self = this
    , sampleCount = 0
    , sampleData = ''
    , formatChunk
    , dataChunk
    , wav;

  this.dataBuffer.forEach(function(sampleSpec) {
    var rendered = self.renderTone(sampleSpec);
    sampleCount += rendered.count;
    sampleData += rendered.samples;
  });

  formatChunk = [
    'fmt ',
    pack("V", 16),
    pack("v", 1),
    pack("v", this.params.channels),
    pack("V", this.params.sampleRate),
    pack("V", (this.params.sampleRate
               * this.params.channels
               * this.params.bitsPerSample
               / 8)),
    pack("v", (this.params.channels
               * this.params.bitsPerSample
               / 8)),
    pack("v", this.params.bitsPerSample)
  ].join('');

  dataChunk = [
    'data',
    pack('V', (sampleCount * this.params.channels * this.params.bitsPerSample / 8)),
    sampleData
  ].join('');

  wav = [
    'RIFF',
    pack('V', (4 + (8 + formatChunk.length) + (8 + dataChunk.length))),
    'WAVE',
    formatChunk,
    dataChunk
  ].join('');

  return wav;
};

Wav.Error = WavError;

module.exports = Wav;
