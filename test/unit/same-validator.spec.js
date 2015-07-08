var chai = require('chai');
var expect = chai.expect;
var cases = require('lazytests');
var SAMEValidator = require('lib/same-validator');

var validMock = {
  originator: 'PEP',
  code: 'EAN',
  region: {
    subdiv: '0',
    stateCode: '24',
    countyCode: '510'
  },
  length: 0,
  start: {
    day: 142,
    hour: 14,
    minute: 30
  },
  sender: 'WHITEHSE'
};

var highScore = [
  'message.originator must be a defined SAME originator code',
  'message.code must be a defined SAME event type code',
  'message.region must be a non-empty object',
  'message.region.stateCode must be a defined SAME state code',
  'message.region.countyCode must be a defined SAME county code',
  'message.region.subdiv must be a defined SAME region subdivision value (try 0)',
  'message.length must be a valid SAME event length value',
  'message.start must be a non-empty object',
  'message.start.day must be a valid Julian date (1 <= n <= 366)',
  'message.start.hour must be a valid hour (0 <= n <= 23)',
  'message.start.minute must be a valid minute (0 <= n <= 59)',
  'message.sender must be a valid SAME sender identifier'
];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('SAME validator', function() {
  var mock;
  
  beforeEach(function() {
    mock = clone(validMock);
  });
  
  describe('happy path', function() {
    it('should return an empty array when given a valid complete message', function() {
      var result = SAMEValidator(validMock);
      expect(result).to.deep.equal([]);
    });

    it('should return an empty array when given a null message', function() {
      var result = SAMEValidator(null);
      expect(result).to.deep.equal([]);
    });
  });

  describe('high score', function() {
    it('should not abort on individual field errors', function() {
      expect(SAMEValidator({"lol": "wut"}))
        .to.deep.equal(highScore);
    });
  });

  describe('individual errors', function() {
    it('should fail and abort on grossly invalid message', function() {
      expect(SAMEValidator())
        .to.deep.equal(['message must be a non-empty object, or null']);
      expect(SAMEValidator('lol nope'))
        .to.deep.equal(['message must be a non-empty object, or null']);
      expect(SAMEValidator({}))
        .to.deep.equal(['message must be a non-empty object, or null']);
      expect(SAMEValidator([]))
        .to.deep.equal(['message must be a non-empty object, or null']);
    });

    cases(it,
          [['should fail when originator invalid',
            'originator', 'lol', 'defined SAME originator code'],
           
           ['should fail when event type code invalid',
            'code', 'lol', 'defined SAME event type code'],

           ['should fail when region grossly invalid',
            'region', [[], {}, null], 'region must be'],
           ['should fail when region state code invalid',
            ['region', 'stateCode'], 'nope', 'defined SAME state code'],
           ['should fail when region county code invalid',
            ['region', 'countyCode'], 'nope', 'defined SAME county code'],
           ['should fail when region subdivision invalid',
            ['region', 'subdiv'], 'nope', 'defined SAME region subdiv'],
           
           ['should fail when length invalid',
            'length', ['nope', '', 0103, 0615], 'valid SAME event length value'],

           ['should fail when start time grossly invalid',
            'start', [[], {}, null], 'start must be'],
           ['should fail when start day invalid',
            ['start', 'day'], ['lol', 0, 400], 'valid Julian date'],
           ['should fail when start hour invalid',
            ['start', 'hour'], ['lol', -1, 24], 'valid hour'],
           ['should fail when start minute invalid',
            ['start', 'minute'], ['lol', -1, 66], 'valid minute'],

           ['should fail when sender invalid',
            'sender', ['lol', 12345], 'valid SAME sender']
          ],
          function(messageKey, bogusValues, expectError) {
            var errRegexp = new RegExp(expectError);
            var target = mock;
            var targetKey;
            var result;
            var i;

            // if message key is an array, it represents a path into
            // the mock, so we use it to descend
            if (Array.isArray(messageKey)) {
              for (i = 0; i < messageKey.length - 1; i++) {
                target = target[messageKey[i]];
              }
              targetKey = messageKey[messageKey.length - 1];
            } else {
              targetKey = messageKey;
            }

            // test for failure on complete absence of target key
            delete target[targetKey];
            result = SAMEValidator(mock);
            expect(result.length).to.be.greaterThan(0);
            expect(result[0]).to.match(errRegexp);

            // test for failure on each of all bogus values given
            (Array.isArray(bogusValues) ? bogusValues : [bogusValues])
              .forEach(function(bogusValue) {
                target[targetKey] = bogusValue;
                result = SAMEValidator(mock);
                expect(result.length).to.be.greaterThan(0);
                expect(result[0]).to.match(errRegexp);
              });
          });
  });

  it('should accept state and county code 0', function() {
    mock.region.stateCode = '00';
    mock.region.countyCode = '000';
    expect(SAMEValidator(mock).length)
      .to.equal(0);
  });

  it('should accept nonzero state and county code 0', function() {
    mock.region.countyCode = '000';
    expect(SAMEValidator(mock).length)
      .to.equal(0);
  });

  it('should not accept state code 0 and nonzero county', function() {
    mock.region.stateCode = '00';
    var result = SAMEValidator(mock);
    expect(result.length)
      .to.equal(1);
    expect(result[0])
      .to.match(/must be a defined SAME county code/);
  });
});
