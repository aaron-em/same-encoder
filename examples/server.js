var SAME = require('../index');

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

SAME.Writer.write(SAME.Encoder.encode(message), './output.wav');
console.log('Wrote ./output.wav.');
