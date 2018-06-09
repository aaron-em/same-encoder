/* jshint -W014 */

var SAMEValues = require('lib/fixtures/same');
var jsonQuery = require('json-query');
var xtype = require('xtypejs');

xtype.options.setNameScheme('compact');

function jq(obj, path) {
  return jsonQuery(path, {source: obj})
    .value;
}

var messages = [];

function hasValidCountyCode(region) {
  //parse region codes
  var subdivArr = region.subdiv.toString().split(';');
  var stateCodeArr = region.stateCode.toString().split(';');
  var countyCodeArr = region.countyCode.toString().split(';');
  
  messages.push("subdivs: " + subdivArr);
  messages.push("|");
  messages.push("stateCodes: " + stateCodeArr);
  messages.push("|");
  messages.push("countyCodes: " + countyCodeArr);
  
  //Only want to return false if failed, will return true at very end assuming nothing failed
  for (var i = 0; i < subdivArr.length; i = i + 1) {
    messages.push("Current stateCode: " + stateCodeArr[i]);
	messages.push("Current countyCode: " + countyCodeArr[i]);
	var s = parseInt(stateCodeArr[i], 10);
    var c = parseInt(countyCodeArr[i], 10);
  
    // easy cases:
    //if (s === 0 && c === 0) return true;  // 0 for both is allowed, as "whole country"
    //if (s !== 0 && c === 0) return true;  // 0 for county is allowed, as "whole state"
    if (s === 0 && c !== 0) return false; // but 0 for state and nonzero county isn't
  
    // usual case: if the state is defined, and if the state contains
    // the given county code, it's valid
	messages.push("Last check");
	var isFalse = (typeof SAMEValues.countyCode[region.stateCode] !== 'undefined')
    && SAMEValues.countyCode[region.stateCode]
      .hasOwnProperty(region.countyCode);
    if (isFalse) {
	  messages.push("Return false last check");
	  return false;
	}
  }
  messages.push("Return true");
  return true;
}

function hasValidSubdivCode(subdiv) {
  var subdivArr = subdiv.toString().split(';');
  for (var i = 0; i < subdivArr.length; i = i + 1) {
    if (!SAMEValues.subdiv.hasOwnProperty(subdivArr[i])) {
	  return false;
	}
  }
  return true;
}

function hasValidStateCode(stateCode) {
  var stateCodeArr = stateCode.toString().split(';');
  for (var i = 0; i < stateCodeArr.length; i = i + 1) {
    var pass = parseInt(stateCode) === 0
         || SAMEValues.stateCode.hasOwnProperty(stateCodeArr[i]);
    if (!pass) {
	  return false;
	}
  }
  return true;
}

function isValidLength(n) {
  var hr, mn;

  // hr = parseInt(n.slice(0, 2), 10);
  // mn = parseInt(n.slice(2, 4), 10);

  hr = Math.floor(n / 100);
  mn = n - (100 * hr);

  // timespec < 1 hour must be in 15-minute increment
  if (hr <= 1 && (mn % 15 !== 0)) {
    return false;
  }

  // otherwise, must be in 30-minute increment
  if (mn % 30 !== 0) {
    return false;
  }

  return true;
}

/**
 * Validate a SAME message object.
 * 
 * FIXME: support multiple regions (up to 31 in the standard).
 * 
 * @param {Object|null} message - Valid SAME message content to encode, or null to encode a SAME trailer (preamble + 'NNNN').
 * @param {string} message.originator - SAME message originator.
 * @param {string} message.code - SAME message type code.
 * @param {Object} message.region - SAME message region of applicability.
 * @param {string} message.region.stateCode - SAME message state code.
 * @param {string} message.region.countyCode - SAME message county code.
 * @param {string} message.region.subdiv - SAME message region subdivision code.
 * @param {string} message.length - SAME event length (delta time after start).
 * @param {Object} message.start - SAME event start time (UTC).
 * @param {string} message.start.day - SAME event start date (Julian day).
 * @param {string} message.start.hour - SAME event start hour (24-hour time).
 * @param {string} message.start.minute - SAME event start minute.
 * @param {string} message.sender - SAME event sender identifier.
 *
 * @returns {Array} An array of errors found in the passed message.
 */
module.exports = function(message) {
  var errors = [];
  var halt = false;

  var check = function(path, type) {
    return xtype.is(jq(message, path), type);
  };

  // early valid return if null (no further validation required)
  if (message === null) {
    return [];
  }

  // FIXME validate uppercase too

  var validators = [
    [check('.', '-obj0'),
     'message must be a non-empty object, or null',
     true],

    [check('.originator', 'str')
     && SAMEValues.originator.hasOwnProperty(message.originator),
     'message.originator must be a defined SAME originator code'],

    [check('.code', 'str')
     && SAMEValues.code.hasOwnProperty(message.code),
     'message.code must be a defined SAME event type code'],

    [check('.region', '-obj0'),
     'message.region must be a non-empty object'],

    [check('.region.stateCode', 'str')
     && hasValidStateCode(message.region.stateCode),
     'message.region.stateCode must be a defined SAME state code'],

    [check('.region.countyCode', 'str')
     && hasValidCountyCode(message.region),
     'message.region.countyCode must be a defined SAME county code'],

    [check('.region.subdiv', 'str')
     && hasValidSubdivCode(message.region.subdiv),
     'message.region.subdiv must be a defined SAME region subdivision value (try 0)'],

    [check('.length', 'int')
     && isValidLength(message.length),
     'message.length must be a valid SAME event length value'],
    
    [check('.start', '-obj0'),
     'message.start must be a non-empty object'],

    [check('.start.day', 'num+')
     && (message.start.day > 0 && message.start.day <= 366),
     'message.start.day must be a valid Julian date (1 <= n <= 366)'],

    [check('.start.hour', 'num')
     && (message.start.hour >= 0 && message.start.hour <= 23),
     'message.start.hour must be a valid hour (0 <= n <= 23)'],

    [check('.start.minute', 'num')
     && (message.start.minute >= 0 && message.start.minute <= 59),
     'message.start.minute must be a valid minute (0 <= n <= 59)'],

    [check('.sender', 'str') && message.sender.length === 8,
     'message.sender must be a valid SAME sender identifier']
  ];

  validators.forEach(function(val) {
    if (halt) return;

    if (! val[0]) {
      errors.push(val[1]);
      if (val[2]) {
        halt = true;
      }
    }
  });
  var returns = [errors, messages];
  
  return returns;
};
