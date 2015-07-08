// Contents freely ripped off from www.sk89q.com/playground/jswav

// base-64 encoder if one's needed
module.exports = {
  /**
   * Encode the given input in base64.
   *
   * (Newer browsers provide this functionality natively. This
   * implementation is intended as a polyfill for environments,
   * including Node, which don't.)
   *
   * @param {string} input - The input data to encode.
   * @returns {string} The base64 representation of the given input.
   *
   */
  btoa: function(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    do {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2)) {
        enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
        enc4 = 64;
      }

      output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + 
        keyStr.charAt(enc3) + keyStr.charAt(enc4);
    } while (i < input.length);

    return output;    
  },

  /**
   * Implement the subset of byte-packing necessary for .wav generation.
   */
  pack: function(fmt) {
    var output = '';
    
    var argi = 1;
    for (var i = 0; i < fmt.length; i++) {
      var c = fmt.charAt(i);
      var arg = arguments[argi];
      argi++;
      
      switch (c) {
      case "v": // little-endian unsigned short
        output += String.fromCharCode(arg & 255, (arg >> 8) & 255);
        break;
      case "V": // little-endian unsigned long
        output += String.fromCharCode(arg & 255, (arg >> 8) & 255, (arg >> 16) & 255, (arg >> 24) & 255);
        break;
      default:
        throw new Error("Unimplemented pack format character '"+c+"'");
      }
    }
    
    return output;
  }
};
