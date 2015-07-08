var WavMock = function(params) {
  this.data = [];
};

WavMock.prototype.append = function(frequency, length, volume) {
  this.data.push([frequency, length, volume]);
};

WavMock.prototype.render = function() {
  return this.data;
};

var SameValidatorMock = function(message) {
  return (SameValidatorMock.shouldPass ? [] : ['mock error']);
};

SameValidatorMock.shouldPass = true;

module.exports = {
  Wav: WavMock,
  SAMEValidator: SameValidatorMock
};
