var chai = require('chai');
var expect = chai.expect;
var cases = require('lazytests');
var SAMEValues = require('../../../lib/fixtures/same.js');

describe('SAME format fixtures', function() {
  cases(it,
        [['should define .originator as an object', 'originator', 'object'],
         ['should define .code as an object', 'code', 'object'],
         ['should define .stateCode as an object', 'stateCode', 'object'],
         ['should define .countyCode as an object', 'countyCode', 'object'],
         ['should define .subdiv as an object', 'subdiv', 'object']
        ],
        function(target, type) {
          expect(typeof SAMEValues[target]).to.equal(type);
          expect(Object.keys(SAMEValues[target]).length)
            .to.be.greaterThan(0);
        });
});
