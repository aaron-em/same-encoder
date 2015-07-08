var util = require('lib/util')
  , btoa = window.btoa || util.btoa
  , player = null;

/**
 * Generate a DOM node with given properties and children.
 * 
 * @param {Object} details - Details of the node to create.
 * @param {string} details.name - The tag name of the node to create.
 * @param {Object=} details.attrs - Key-value map of attributes to apply to the node.
 * @param {Array=} details.children - Array of DOM nodes to append as children to the new node.
 * @returns {Node} - The newly created element.
 */
function element(details) {
  var el = document.createElement(details.name);
  
  if (typeof details.attrs !== 'undefined') {
    Object.keys(details.attrs).forEach(function(key) {
      el[key] = details.attrs[key];
    });
  }
  
  if (typeof details.children !== 'undefined') {
    details.children.forEach(function(child) {
      el.appendChild(child);
    });
  }
  return el;
}

/**
 * Append a player for the given RIFF WAVE stream to the element identified by the given target, replacing an existing player if any.
 * 
 * @param {string} wavFile - The raw RIFF WAVE data for which to create the player.
 * @param {string} targetSelector - The element to contain the player.
 * @returns {Node} The newly created player.
 */
module.exports = function(wavFile, targetSelector) {
  var target;
  
  if (player) {
    player.parentNode.removeChild(player);
  }

  player = element({
    name: 'audio',
    attrs: {
      'controls': true,
      'name': 'media'
    },
    children: [
      element({
        name: 'source',
        attrs: {
          type: 'audio/wav',
          src: 'data:audio/wav;base64,' + escape(btoa(wavFile))
        }
      })
    ]
  });

  target = document.querySelector(targetSelector);
  if (typeof target === 'undefined' || target === null) {
    throw new Error('No element matching selector "' + targetSelector + '"');
  } else {
    target.appendChild(player);
  }

  return player;
};
