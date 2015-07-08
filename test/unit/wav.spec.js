var chai = require('chai');
var expect = chai.expect;

var fixtures = require('../lib/fixtures');

var Wav = require('lib/wav');

describe('WAV encoder module', function() {
  var mockParams = {
    channels: 2,
    sampleRate: 44100,
    bitsPerSample: 16
  };
  
  var subject;

  beforeEach(function() {
    subject = new Wav(mockParams);
  });
  
  describe('Constructor', function() {
    it('should throw WavError with invalid argument', function(done) {
      try {
        new Wav();
        done('Failed to throw');
      }
      catch (e) {
        expect(e instanceof Wav.Error).to.equal(true);
        expect(e.message)
          .to.equal('Wav constructor requires a "params" object (see documentation)');
        done();
      }
    });

    it('should throw WavError with invalid params', function(done) {
      try {
        new Wav({});
        done('Failed to throw');
      }
      catch (e) {
        expect(e instanceof Wav.Error).to.equal(true);
        expect(e.message)
          .to.match(/^Invalid parameters to Wav constructor\: /);
        expect(e.message)
          .to.have.string('"channels" must be integer > 0');
        expect(e.message)
          .to.have.string('"sampleRate" must be integer > 0');
        expect(e.message)
          .to.have.string('"bitsPerSample" must be integer > 0');
        done();
      }
    });

    it('should correctly set instance parameters', function() {
      expect(subject.params).to.deep.equal(mockParams);
      expect(subject.dataBuffer).to.deep.equal([]);
    });
  });

  describe('.append', function() {
    it('should append a tone spec with valid arguments', function() {
      var freq = 440;
      var len  = 1;
      var ampl = 32767;
      subject.append(freq, len, ampl);
      expect(subject.dataBuffer)
        .to.deep.equal([{
          frequency: freq,
          length: len,
          volume: ampl
        }]);
    });

    it('should throw with invalid arguments', function(done) {
      try {
        subject.append();
        done('Failed to throw');
      } catch (e) {
        expect(e.message)
          .to.match(/^Invalid parameters to \.append\(\)\: /);
        done();
      }
    });
  });

  describe('.renderTone', function() {
    it('should return correct RIFF WAVE data for a valid tone specification', function() {
      var tone = subject.renderTone({
        frequency: 440,
        length: 1,
        volume: 32767
      });
      
      expect(Object.keys(tone)).to.deep.equal(Object.keys(fixtures.renderTone));
      expect(tone.count).to.equal(fixtures.renderTone.count);
      // if we just expect tone.samples to equal renderTone.samples
      // and it doesn't, then mocha happily barfs almost a megabyte of
      // gibberish into the test results, and we don't want that
      expect(tone.samples === fixtures.renderTone.samples)
        .to.equal(true);
    });
  });

  describe('.render', function() {
    it('should correctly render RIFF WAVE headers', function() {
      var wav = subject.render();
      expect(wav === fixtures.render_empty)
        .to.equal(true);
    });

    it('should correctly render a complete RIFF WAVE file', function() {
      var wav;
      subject.append(440, 1, 32767);
      wav = subject.render();
      expect(wav === fixtures.render_complete)
        .to.equal(true);
    });
  });
});
