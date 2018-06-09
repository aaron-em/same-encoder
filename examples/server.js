var SAME = require('../index');

var message = {
  originator: 'PEP',
  sender: 'WHITEHSE',
  code: 'CEM',
  region: {
    // note that these are strings. Multiple codes can be specified separated by a semicolon
    subdiv: '0;0',
    stateCode: '34;34',
    countyCode: '001;003'
  },
  // note that these are numbers
  length: 1200,  // message applicability period (NOT event length!) as HHMM
  start: {      // message applicability period begins:
    day: 205,   // on this Julian day
    hour: 18,    // at this UTC hour
    minute: 13  // and this UTC minute
  }
};

SAME.Writer.write(SAME.Encoder.encode(message), './output.wav');
console.log('Wrote ./output.wav.');
