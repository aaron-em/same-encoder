var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var chai = require('chai');
var expect = chai.expect;
var proxyquire = require('proxyquire');
var mocks = require('../lib/mocks.js');
var WavMock = mocks.Wav;
var SAMEValidatorMock = mocks.SAMEValidator;

chai.use(sinonChai);

var SAME = proxyquire('lib/same', {
  'lib/wav': WavMock,
  'lib/same-validator': SAMEValidatorMock
});

var mockMessage = {
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
    hour: 01,
    minute: 30
  },
  sender: 'WHITEHSE'
};

var validConstants = {
  preamble: '\xab\xab\xab\xab'
    + '\xab\xab\xab\xab'
    + '\xab\xab\xab\xab'
    + '\xab\xab\xab\xab'
    + 'ZCZC',
  mark: [2083, 0.00192],
  space: [1563, 0.00192]
};

function byteArray(str) {
  return str
    .split('')
    .map(function(c) {
      return c.charCodeAt(0);
    });
}

describe('SAME module', function() {
  var spies = {};

  // Reset state modified in tests, to prevent order dependence
  beforeEach(function() {
    SAMEValidatorMock.shouldPass = true;
    
    Object.keys(spies).forEach(function(spyName) {
      spies[spyName].restore();
      delete spies[spyName];
    });
  });
  
  describe('Constants', function() {
    it('should correctly define the preamble', function() {
      expect(SAME.constants.preamble)
        .to.equal(validConstants.preamble);
    });

    it('should correctly define the mark and space bits', function() {
      expect(SAME.constants.bits.mark)
        .to.deep.equal(validConstants.mark);
      expect(SAME.constants.bits.space)
        .to.deep.equal(validConstants.space);
    });
  });

  describe('#validateMessage', function() {
    it('should be bound to SAMEValidator', function() {
      expect(SAME.validateMessage)
        .to.deep.equal(SAMEValidatorMock);
    });
  });

  describe('#constructMessageByteArray', function() {
    it('should correctly construct a header from a populated message', function() {
      expect(SAME.constructMessageByteArray(mockMessage))
        .to.deep.equal(byteArray(validConstants.preamble
                                 + '-PEP-EAN-024510+0000-1420130-WHITEHSE'));
    });
    
    it('should correctly construct a footer from a null message', function() {
      expect(SAME.constructMessageByteArray(null))
        .to.deep.equal(byteArray(validConstants.preamble + 'NNNN'));
    });
  });

  describe('#generateWaveData', function() {
    it('should correctly generate WAV freq specs from a byte array', function() {
      // this is what 'M' looks like as an array of SAME frequency
      // specifications
      var result = [ [ 2083, 0.00192, 4096 ],
                     [ 1563, 0.00192, 4096 ],
                     [ 2083, 0.00192, 4096 ],
                     [ 2083, 0.00192, 4096 ],
                     [ 1563, 0.00192, 4096 ],
                     [ 1563, 0.00192, 4096 ],
                     [ 2083, 0.00192, 4096 ],
                     [ 1563, 0.00192, 4096 ] ];
      
      expect(SAME.generateWaveData(byteArray('M')))
        .to.deep.equal(result);
    });
  });

  describe('#encode', function() {
    it('should validate the message, and throw on failure', function() {
      var caller = function(arg) {
        return function() {
          SAME.encode(arg);
        };
      };
      
      spies.validator = sinon.spy(SAME, 'validateMessage');

      expect(caller(null))
        .to.not.throw();
      expect(spies.validator).to.be.called;
      spies.validator.reset();

      SAMEValidatorMock.shouldPass = false;
      expect(caller(null))
        .to.throw('Message failed to validate');
      expect(spies.validator).to.be.called;
    });

    it('should return a RIFF WAVE stream encoding a valid message', function() {
      spies.construct = sinon.spy(SAME, 'constructMessageByteArray');
      spies.generate = sinon.spy(SAME, 'generateWaveData');
      spies.render = sinon.spy(WavMock.prototype, 'render');

      SAME.encode(null);
      expect(spies.construct).to.be.calledOnce;
      expect(spies.generate).to.be.calledOnce;
      expect(spies.render).to.be.calledOnce;
    });
  });
});
