var Writer = {}
  , writerFunction;

if (typeof window !== 'undefined') {
  writerFunction = require('lib/writers/browser.js');
} else if (typeof global !== 'undefined') {
  writerFunction = require('lib/writers/node.js');
} else {
  throw new Error('Unknown environment; no writer available');
}

Writer.write = writerFunction;

module.exports = Writer;
