var Wav = require('lib/wav');
var SAMEValidator = require('lib/same-validator');
var SAME;

SAME = {};

/*
 * A collection of constants for use by the SAME encoder.
 */
SAME.constants = {
  preamble: '\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab'
    + 'ZCZC',
  bits: {
    // frequency, length
    mark: [2083, 0.00192],
    space: [1563, 0.00192]
  }
};

SAME.validateMessage = SAMEValidator;

/**
 * Left-pad a string with zeroes to the given length.
 *
 * @param {number} str - The string to pad.
 * @param {number} len - The overall length of the resulting string.
 * @returns {string} The string, padded.
 */
function zeropad (str, len) {
  if (str.length >= len) {
    return str;
  }
  
  while (str.length < len) {
    str = '0' + str;
  }
  return str;
}

/**
 * Convert a SAME message object into an array of numeric ASCII code points.
 *
 * NOTE: This function relies on the JS runtime using a default string
 * encoding of ASCII or UTF8. If it doesn't, the SAME messages
 * generated will be invalid.
 *
 * NOTE: This function expects to receive a valid SAME object. If it
 * doesn't, all sorts of fun things can happen, up to and including
 * uncaught exceptions.
 *
 * @param {Object} message - A SAME message object.
 * @returns {Array<Number>} An array of ASCII code points.
 */
SAME.constructMessageByteArray = function(message) {
  var msgContent = [];
  var subdivArr = [];
  var stateCodeArr = [];
  var countyCodeArr = [];
  
  if (message !== null) {
    // message header
    msgContent = [
      this.constants.preamble,
      '-',
      message.originator,
      '-',
      message.code,
	];
	
	//parse region codes
	subdivArr = message.region.subdiv.toString().split(';');
	stateCodeArr = message.region.stateCode.toString().split(';');
	countyCodeArr = message.region.countyCode.toString().split(';');
	
	//add region codes to msgContent
	for (var i = 0; i < subdivArr.length; i = i + 1) {
	  msgContent.push(
	    '-',
		zeropad(subdivArr[i], 1),
        zeropad(stateCodeArr[i], 2),
        zeropad(countyCodeArr[i], 3),
	  );
	}
	
	//add the rest of the data
	msgContent.push(
      '+',
      zeropad(message.length.toString(), 4),
      '-',
      zeropad(message.start.day.toString(), 3),
      zeropad(message.start.hour.toString(), 2),
      zeropad(message.start.minute.toString(), 2),
      '-',
      message.sender,
	  '-'
	);
  } else {
    // message footer
    msgContent = [
      this.constants.preamble, 'NNNN'
    ];
  }

  return msgContent
    .join('')
    .split('')
    .map(function(c) {
      return c.charCodeAt(0);
    });
};

/**
 * Convert a SAME message byte array to a RIFF WAVE stream.
 *
 * @param {Array} byteArray - An array of ASCII code points suitable for conversion.
 * @returns {String} The message encoded as RIFF WAVE data.
 */
SAME.generateWaveData = function(byteArray) {
  var whichBit = null;
  var volume = 4096;
  var wav = new Wav({
    channels: 2,
    sampleRate: 44100,
    bitsPerSample: 16
  });
  var byteCache = {};
  var byteSpec = [];
  var thisByte = -1;
  var thisBit;
  
  for (var i = 0; i < byteArray.length; i++) {
    thisByte = byteArray[i];
    if (byteCache[thisByte]) {
      byteSpec = byteCache[thisByte];
    } else {
      byteSpec = [];
      for (var e = 0; e < 8; e++) {
        thisBit = ((thisByte & Math.pow(2, e)) !== 0 ? 'mark' : 'space');
        whichBit = SAME.constants.bits[thisBit];
        byteSpec.push([whichBit[0], whichBit[1], volume]);
      }
      byteCache[thisByte] = byteSpec;
    }

    byteSpec.forEach(function(bitSpec) {
      wav.append.apply(wav, bitSpec);
    });
  }

  return wav.render();
};

/**
 * Encode a correctly formed SAME message, specified as an object, into a .wav file.
 *
 * @param {Object} A SAME message object.
 * @returns {string} A fully rendered SAME message in RIFF WAVE format.
 */
SAME.encode = function(message) {
  var validationErrors = this.validateMessage(message);
  if (validationErrors.length > 0) {
    throw new Error('Message failed to validate: '
                   + validationErrors.join('; '));
  }

  msgBytes = SAME.constructMessageByteArray(message);
  return SAME.generateWaveData(msgBytes);
};

module.exports = SAME;

