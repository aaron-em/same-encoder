var chai = require('chai');
var expect = chai.expect;
var Buffer = require('buffer').Buffer;
var util = require('../../lib/util');

describe('Utility library', function() {
  it('should define #pack and #btoa', function() {
    expect(typeof util.btoa).to.equal('function');
    expect(typeof util.pack).to.equal('function');
  });

  describe('#btoa', function() {
    it('should correctly encode a string to base64', function() {
      var strings = [
        '1', '12', '123', // cover string length corner cases
        'Now is the time for all good men to come to the aid of their country.'
      ];

      strings.forEach(function(str) {
        expect(util.btoa(str))
          .to.equal(new Buffer(str).toString('base64'));
      });
    });
  });

  describe('#pack', function() {
    var caller = function(format, value) {
      return function() {
        util.pack(format, value);
      };
    };
    
    it('should implement "v" and "V" format characters', function() {
      expect(caller('v', 0)).to.not.throw();
      expect(caller('V', 0)).to.not.throw();
    });
    
    it('should throw on unimplemented format characters', function() {
      expect(caller('b', 0)).to.throw('Unimplemented pack format');
    });
    
    it('should correctly pack a little-endian unsigned short', function() {
      expect(util.pack('v', 60000)).to.equal('`ê');
    });
    
    it('should correctly pack a little-endian unsigned long', function() {
      expect(util.pack('V', 16777800)).to.equal('H\u0002\u0000\u0001');
    });
  });
});
