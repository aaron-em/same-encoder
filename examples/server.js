var sameEncoder = require('../index');
var SAME = sameEncoder.SAME;     // encoder library
var Writer = sameEncoder.Writer; // environment-specific writer (here, out to .wav)

var message = {
  originator: 'PEP',
  code: 'EAN',
  region: {
    subdiv: '0',
    stateCode: '00',
    countyCode: '000'
  },
  length: 600,
  start: {
    day: 123,
    hour: 5,
    minute: 30
  },
  sender: 'WHITEHSE'
};

Writer.write(SAME.encode(message), './output.wav');
console.log('Wrote ./output.wav.');
