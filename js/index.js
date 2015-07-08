/*
 * Client-side wrapper for SAME encoding demo.
 * 
 * Nothing to see here, unless you're particularly curious about how
 * to get the day of the year from the current date. You want the
 * Github repo:
 * https://github.com/aaron-em/same-encoder.js
 */

var SAME = window.SAME
  , Writer = window.Writer
  , utcRightNow;

/**
 * Generate a SAMEable start date struct for right now (this day,
 * hour, and minute), accounting for leap years because why not.
 * 
 * @returns {Object} Right this UTC minute, in the format taken by the SAME encoder.
 */
utcRightNow = function() {
  var now = new Date()
    , monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    , utcYear = now.getUTCFullYear()
    , isUTCLeapYear = (utcYear % 4 === 0 || utcYear % 100 === 0 || utcYear % 400 === 0)
    , utcJulianDay = now.getUTCDate();

  if (isUTCLeapYear) {
    monthDays[1] = 29;
  }

  for (var m = 0; m < now.getUTCMonth(); m++) {
    utcJulianDay += monthDays[m];
  }

  return {
    day: utcJulianDay,
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes()
  };
};

document.addEventListener('DOMContentLoaded', function() {
  var message
    , player
    , encoded
    , saveLink;

  message = {
    originator: 'PEP',
    code: 'EAN',
    region: {
      subdiv: '0',
      stateCode: '00',
      countyCode: '000'
    },
    length: 600,
    start: utcRightNow(),
    sender: 'WHITEHSE'
  };
  
  // write message source object into div
  document.querySelector('div#source pre').innerHTML
    = JSON.stringify(message, false, 2);

  // attach player
  player = Writer.write(SAME.encode(message), 'div#player');

  // get base64-encoded file data from player
  encoded = player.querySelector('source').src;

  // and patch up the "save" link to work, if the browser can deal with it
  saveLink = document.querySelector('a#save');
  saveLink.href = encoded;
  saveLink.download = 'SAME-sample.wav';

  // finally, show the content
  document.querySelector('#content').style.display = 'block';
});
