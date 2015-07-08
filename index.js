var obj = {
  // issue #2 and going forward
  Encoder: require('lib/same'),
  Writer: require('lib/writer'),
  Values: require('lib/fixtures/same')
};

// back compat for all my no users :)
obj.SAME = obj.Encoder;

module.exports = obj;
