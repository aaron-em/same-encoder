(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.SAME = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Safari 5-7 lacks support for changing the `Object.prototype.constructor` property
 *     on objects.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  function Bar () {}
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    arr.constructor = Bar
    return arr.foo() === 42 && // typed array instances can be augmented
        arr.constructor === Bar && // constructor can be set
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    this.length = 0
    this.parent = undefined
  }

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    array.byteLength
    that = Buffer._augment(new Uint8Array(array))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
} else {
  // pre-set for values that may exist in the future
  Buffer.prototype.length = undefined
  Buffer.prototype.parent = undefined
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` is deprecated
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` is deprecated
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":3,"ieee754":4,"isarray":5}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],6:[function(require,module,exports){
var State = require('./lib/state')
var tokenize = require('./lib/tokenize')

var tokenizedCache = {}

module.exports = function jsonQuery(query, options){

  // extract params for ['test[param=?]', 'value'] type queries
  var params = options && options.params || null
  if (Array.isArray(query)){
    params = query.slice(1)
    query = query[0]
  }

  if (!tokenizedCache[query]){
    tokenizedCache[query] = tokenize(query, true)
  }

  return handleQuery(tokenizedCache[query], options, params)
}


module.exports.lastParent = function(query){
  var last = query.parents[query.parents.length - 1]
  if (last){
    return last.value
  } else {
    return null
  }
}


function handleQuery (tokens, options, params){

  var state = new State(options, params, handleQuery)

  for (var i=0;i<tokens.length;i++) {
    if (handleToken(tokens[i], state)){
      break
    }
  }

  // flush
  handleToken(null, state)

  // set databind hooks
  if (state.currentItem instanceof Object){
    state.addReference(state.currentItem)
  } else {
    var parentObject = getLastParentObject(state.currentParents)
    if (parentObject){
      state.addReference(parentObject)
    }
  }

  return {
    value: state.currentItem,
    key: state.currentKey,
    references: state.currentReferences,
    parents: state.currentParents
  } 
}

function handleToken(token, state){
  // state: setCurrent, getValue, getValues, resetCurrent, deepQuery, rootContext, currentItem, currentKey, options, filters
  
  if (token == null){
    // process end of query
    
    if (!state.currentItem && state.options.force){
      state.force(state.options.force)
    }
    
  } else if (token.get){
    
    var key = state.getValue(token.get)
    if (state.override && state.currentItem === state.rootContext && state.override[key] !== undefined){
      state.setCurrent(key, state.override[key])
    } else {
      if (state.currentItem || (state.options.force && state.force({}))){
        state.setCurrent(key, state.currentItem[key])
      } else {
        state.setCurrent(key, null)
      }
    }
    
  } else if (token.select){
    
    if (Array.isArray(state.currentItem) || (state.options.force && state.force([]))){
      var values = state.getValues(token.select)
      var result = selectWithKey(state.currentItem, values[0], values[1])
      state.setCurrent(result[0], result[1])
    } else {
      state.setCurrent(null, null)
    }
    
  } else if (token.root){

    state.resetCurrent()
    if (token.args && token.args.length){
      state.setCurrent(null, state.getValue(token.args[0]))
    } else {
      state.setCurrent(null, state.rootContext)
    }
    
  } else if (token.parent){
    
    state.resetCurrent()
    state.setCurrent(null, state.options.parent)
    
  } else if (token.or){

    if (state.currentItem){
      return true
    } else {
      state.resetCurrent()
      state.setCurrent(null, state.context)
    }

  } else if (token.filter){
    var helper = state.getLocal(token.filter) || state.getGlobal(token.filter)
    if (typeof helper === 'function'){
      // function(input, args...)
      var values = state.getValues(token.args || [])
      var result = helper.apply(state.options, [state.currentItem].concat(values))
      state.setCurrent(null, result)
    } else {
      // fallback to old filters
      var filter = state.getFilter(token.filter)
      if (typeof filter === 'function'){
        var values = state.getValues(token.args || [])
        var result = filter.call(state.options, state.currentItem, {args: values, state: state, data: state.rootContext})
        state.setCurrent(null, result)
      }
    }
  } else if (token.deep){
    if (state.currentItem){
      var result = state.deepQuery(state.currentItem, token.deep, state.options)

      if (result){
        state.setCurrent(result.key, result.value)
        for (var i=0;i<result.parents.length;i++){
          state.currentParents.push(result.parents[i])
        }
      } else {
        state.setCurrent(null, null)
      }      

    } else {
      state.currentItem = null
    }
  }
}

function selectWithKey(source, key, value){
  if (source && source.length){
    for (var i=0;i<source.length;i++){
      if (source[i][key] == value){
        return [i, source[i]]
      }
    }
  }
  return [null, null]
}


function getLastParentObject(parents){
  for (var i=0;i<parents.length;i++){
    if (!(parents[i+1]) || !(parents[i+1].value instanceof Object)){
      return parents[i].value
    }
  }
}

},{"./lib/state":7,"./lib/tokenize":8}],7:[function(require,module,exports){
module.exports = State

function State(options, params, handleQuery){

  options = options || {}

  //this.options = options
  this.handleQuery = handleQuery
  this.options = options
  this.locals = this.options.locals || {}
  this.globals = this.options.globals || {}
  this.rootContext = firstNonNull(options.data, options.rootContext, options.context, options.source)
  this.parent = options.parent
  this.override = options.override
  this.filters = options.filters || {}
  this.params = params || options.params || []
  this.context = firstNonNull(options.currentItem, options.context, options.source)
  this.currentItem = firstNonNull(this.context, options.rootContext)
  this.currentKey = null
  this.currentReferences = []
  this.currentParents = []
}

State.prototype = {
  
  // current manipulation
  setCurrent: function(key, value){
    if (this.currentItem || this.currentKey || this.currentParents.length>0){
      this.currentParents.push({key: this.currentKey, value: this.currentItem})
    }
    this.currentItem = value
    this.currentKey = key
  },

  resetCurrent: function(){
    this.currentItem = null
    this.currentKey = null
    this.currentParents = []
  },
  
  force: function(def){
    var parent = this.currentParents[this.currentParents.length-1]
    if (!this.currentItem && parent && (this.currentKey != null)){
      this.currentItem = def || {}
      parent.value[this.currentKey] = this.currentItem
    }
    return !!this.currentItem
  },

  getLocal: function(localName){
    if (~localName.indexOf('/')){
      var result = null
      var parts = localName.split('/')

      for (var i=0;i<parts.length;i++){
        var part = parts[i]
        if (i == 0){
          result = this.locals[part]
        } else if (result && result[part]){
          result = result[part]
        }
      }

      return result
    } else {
      return this.locals[localName]
    }
  },

  getGlobal: function(globalName){
    if (~globalName.indexOf('/')){
      var result = null
      var parts = globalName.split('/')

      for (var i=0;i<parts.length;i++){
        var part = parts[i]
        if (i == 0){
          result = this.globals[part]
        } else if (result && result[part]){
          result = result[part]
        }
      }

      return result
    } else {
      return this.globals[globalName]
    }
  },
  
  getFilter: function(filterName){
    if (~filterName.indexOf('/')){
      var result = null
      var filterParts = filterName.split('/')

      for (var i=0;i<filterParts.length;i++){
        var part = filterParts[i]
        if (i == 0){
          result = this.filters[part]
        } else if (result && result[part]){
          result = result[part]
        }
      }

      return result
    } else {
      return this.filters[filterName]
    }
  },

  addReferences: function(references){
    if (references){
      references.forEach(this.addReference, this)
    }
  },
  
  addReference: function(ref){
    if (ref instanceof Object && !~this.currentReferences.indexOf(ref)){
      this.currentReferences.push(ref)
    }
  },

  // helper functions
  getValues: function(values, callback){
    return values.map(this.getValue, this)
  },

  getValue: function(value){
    if (value._param != null){
      return this.params[value._param]
    } else if (value._sub){
      
      var options = copy(this.options)
      options.force = null
      options.currentItem = null

      var result = this.handleQuery(value._sub, options, this.params)
      this.addReferences(result.references)
      return result.value

    } else {
      return value
    }
  },

  deepQuery: function(source, tokens, options, callback){
    var keys = Object.keys(source)

    for (var key in source){
      if (key in source){

        var options = copy(this.options)
        options.currentItem = source[key]

        var result = this.handleQuery(tokens, options, this.params)

        if (result.value){
          return result
        }
      }
    }

    return null
  }

}

function firstNonNull(args){
  for (var i=0;i<arguments.length;i++){
    if (arguments[i] != null){
      return arguments[i]
    }
  }
}

function copy(obj){
  var result = {}
  if (obj){
    for (var key in obj){
      if (key in obj){
        result[key] = obj[key]
      }
    }
  }
  return result
}
},{}],8:[function(require,module,exports){
// todo: syntax checking
// todo: test handle args

module.exports = function(query, shouldAssignParamIds){
  if (!query) return []
    
  var result = []
    , prevChar, char
    , nextChar = query.charAt(0)
    , bStart = 0
    , bEnd = 0
    , partOffset = 0
    , pos = 0
    , depth = 0
    , mode = 'get'
    , deepQuery = null
    
  // if query contains params then number them
  if (shouldAssignParamIds){
    query = assignParamIds(query)
  }

  var tokens = {
    '.': {mode: 'get'},
    ':': {mode: 'filter'},
    '|': {handle: 'or'},
    '[': {open: 'select'},
    ']': {close: 'select'},
    '{': {open: 'meta'},
    '}': {close: 'meta'},
    '(': {open: 'args'},
    ')': {close: 'args'}
  }
  
  function push(item){
    if (deepQuery){
      deepQuery.push(item)
    } else {
      result.push(item)
    }
  }
  
  var handlers = {
    get: function(buffer){
      var trimmed = typeof buffer === 'string' ? buffer.trim() : null
      if (trimmed){
        push({get:trimmed})
      }
    },
    select: function(buffer){
      if (buffer){
        push(tokenizeSelect(buffer))
      } else {
        // deep query override
        var x = {deep: []}
        result.push(x)
        deepQuery = x.deep
      }
    },
    filter: function(buffer){
      if (buffer){
        push({filter:buffer.trim()})
      }
    }, 
    or: function(){
      deepQuery = null
      result.push({or:true})
      partOffset = i + 1
    },
    args: function(buffer){
      var args = tokenizeArgs(buffer)
      result[result.length-1].args = args
    }
  }
  
  function handleBuffer(){
    var buffer = query.slice(bStart, bEnd)
    if (handlers[mode]){
      handlers[mode](buffer)
    }
    mode = 'get'
    bStart = bEnd + 1
  }
  
  for (var i = 0;i < query.length;i++){
    
    
    // update char values
    prevChar = char; char = nextChar; nextChar = query.charAt(i + 1);
    pos = i - partOffset
    
    // root query check
    if (pos === 0 && (char !== ':' && char !== '.')){
      result.push({root:true})
    }
    
    // parent query check
    if (pos === 0 && (char === '.' && nextChar === '.')){
      result.push({parent:true})
    }
    
    var token = tokens[char]
    if (token){
            
      // set mode
      if (depth === 0 && (token.mode || token.open)){
        handleBuffer()
        mode = token.mode || token.open
      }
      
      if (depth === 0 && token.handle){
        handleBuffer()
        handlers[token.handle]()
      }
            
      if (token.open){
        depth += 1
      } else if (token.close){
        depth -= 1
      } 
      
      // reset mode to get
      if (depth === 0 && token.close){
        handleBuffer()
      } 
      
    }
    
    bEnd = i + 1

  }
  
  handleBuffer()
  
  return result
}

function tokenizeArgs(argsQuery){
  return depthSplit(argsQuery, ',').map(function(s){
    return handleSelectPart(s.trim())
  })
}

function tokenizeSelect(selectQuery){
  
  var parts = depthSplit(selectQuery, '=', 2)
  
  if (parts.length === 1){
    return { get: handleSelectPart(parts[0]) }
  } else {
    return { select: [handleSelectPart(parts[0]), handleSelectPart(parts[1])] }
  }

}

function handleSelectPart(part){
  if (part.charAt(0) === '{' && part.charAt(part.length-1) === '}'){
    var innerQuery = part.slice(1, -1)
    return {_sub: module.exports(innerQuery)}
  } else {
    return paramToken(part)
  }
}

function paramToken(text){
  if (text.charAt(0) === '?'){
    var num = parseInt(text.slice(1))
    if (!isNaN(num)){
      return {_param: num}
    } else {
      return text
    }
  } else {
    return text
  }
}

function depthSplit(text, delimiter, max){
  var openers = ['[', '(', '{']
    , closers = [']', ')', '}']
    , depth = 0
    
  if (!text){
    return []
  }
  
  if (max === 1 || text.length === 1){
    return [text]
  }
  var remainder = text
  var result = []
  var lastSlice = 0
  
  for (var i=0;i<text.length;i++){
    var char = text.charAt(i)
    
    if (depth === 0 && char === delimiter){

      result.push(text.slice(lastSlice, i))
      remainder = text.slice(i+1)
      lastSlice = i+1
      
      if (max && result.length >= max-1){
        break;
      }
      
    } else if (~openers.indexOf(char)){
      depth += 1
    } else if (~closers.indexOf(char)){
      depth -= 1
    }
    
  }
  
  result.push(remainder)
  
  return result
}

function assignParamIds(query){
  var index = 0
  return query.replace(/\?/g, function(match){
    return match + (index++)
  })
}

},{}],9:[function(require,module,exports){
module.exports={
  "10": {
    "001": "Kent County",
    "003": "New Castle County",
    "005": "Sussex County"
  },
  "11": {
    "001": "District of Columbia"
  },
  "12": {
    "101": "Pasco County",
    "103": "Pinellas County",
    "105": "Polk County",
    "107": "Putnam County",
    "109": "St. Johns County",
    "111": "St. Lucie County",
    "113": "Santa Rosa County",
    "115": "Sarasota County",
    "117": "Seminole County",
    "119": "Sumter County",
    "121": "Suwannee County",
    "123": "Taylor County",
    "125": "Union County",
    "127": "Volusia County",
    "129": "Wakulla County",
    "131": "Walton County",
    "133": "Washington County",
    "001": "Alachua County",
    "003": "Baker County",
    "005": "Bay County",
    "007": "Bradford County",
    "009": "Brevard County",
    "011": "Broward County",
    "013": "Calhoun County",
    "015": "Charlotte County",
    "017": "Citrus County",
    "019": "Clay County",
    "021": "Collier County",
    "023": "Columbia County",
    "027": "DeSoto County",
    "029": "Dixie County",
    "031": "Duval County",
    "033": "Escambia County",
    "035": "Flagler County",
    "037": "Franklin County",
    "039": "Gadsden County",
    "041": "Gilchrist County",
    "043": "Glades County",
    "045": "Gulf County",
    "047": "Hamilton County",
    "049": "Hardee County",
    "051": "Hendry County",
    "053": "Hernando County",
    "055": "Highlands County",
    "057": "Hillsborough County",
    "059": "Holmes County",
    "061": "Indian River County",
    "063": "Jackson County",
    "065": "Jefferson County",
    "067": "Lafayette County",
    "069": "Lake County",
    "071": "Lee County",
    "073": "Leon County",
    "075": "Levy County",
    "077": "Liberty County",
    "079": "Madison County",
    "081": "Manatee County",
    "083": "Marion County",
    "085": "Martin County",
    "086": "Miami-Dade County",
    "087": "Monroe County",
    "089": "Nassau County",
    "091": "Okaloosa County",
    "093": "Okeechobee County",
    "095": "Orange County",
    "097": "Osceola County",
    "099": "Palm Beach County"
  },
  "13": {
    "101": "Echols County",
    "103": "Effingham County",
    "105": "Elbert County",
    "107": "Emanuel County",
    "109": "Evans County",
    "111": "Fannin County",
    "113": "Fayette County",
    "115": "Floyd County",
    "117": "Forsyth County",
    "119": "Franklin County",
    "121": "Fulton County",
    "123": "Gilmer County",
    "125": "Glascock County",
    "127": "Glynn County",
    "129": "Gordon County",
    "131": "Grady County",
    "133": "Greene County",
    "135": "Gwinnett County",
    "137": "Habersham County",
    "139": "Hall County",
    "141": "Hancock County",
    "143": "Haralson County",
    "145": "Harris County",
    "147": "Hart County",
    "149": "Heard County",
    "151": "Henry County",
    "153": "Houston County",
    "155": "Irwin County",
    "157": "Jackson County",
    "159": "Jasper County",
    "161": "Jeff Davis County",
    "163": "Jefferson County",
    "165": "Jenkins County",
    "167": "Johnson County",
    "169": "Jones County",
    "171": "Lamar County",
    "173": "Lanier County",
    "175": "Laurens County",
    "177": "Lee County",
    "179": "Liberty County",
    "181": "Lincoln County",
    "183": "Long County",
    "185": "Lowndes County",
    "187": "Lumpkin County",
    "189": "McDuffie County",
    "191": "McIntosh County",
    "193": "Macon County",
    "195": "Madison County",
    "197": "Marion County",
    "199": "Meriwether County",
    "201": "Miller County",
    "205": "Mitchell County",
    "207": "Monroe County",
    "209": "Montgomery County",
    "211": "Morgan County",
    "213": "Murray County",
    "215": "Muscogee County",
    "217": "Newton County",
    "219": "Oconee County",
    "221": "Oglethorpe County",
    "223": "Paulding County",
    "225": "Peach County",
    "227": "Pickens County",
    "229": "Pierce County",
    "231": "Pike County",
    "233": "Polk County",
    "235": "Pulaski County",
    "237": "Putnam County",
    "239": "Quitman County",
    "241": "Rabun County",
    "243": "Randolph County",
    "245": "Richmond County",
    "247": "Rockdale County",
    "249": "Schley County",
    "251": "Screven County",
    "253": "Seminole County",
    "255": "Spalding County",
    "257": "Stephens County",
    "259": "Stewart County",
    "261": "Sumter County",
    "263": "Talbot County",
    "265": "Taliaferro County",
    "267": "Tattnall County",
    "269": "Taylor County",
    "271": "Telfair County",
    "273": "Terrell County",
    "275": "Thomas County",
    "277": "Tift County",
    "279": "Toombs County",
    "281": "Towns County",
    "283": "Treutlen County",
    "285": "Troup County",
    "287": "Turner County",
    "289": "Twiggs County",
    "291": "Union County",
    "293": "Upson County",
    "295": "Walker County",
    "297": "Walton County",
    "299": "Ware County",
    "301": "Warren County",
    "303": "Washington County",
    "305": "Wayne County",
    "307": "Webster County",
    "309": "Wheeler County",
    "311": "White County",
    "313": "Whitfield County",
    "315": "Wilcox County",
    "317": "Wilkes County",
    "319": "Wilkinson County",
    "321": "Worth County",
    "001": "Appling County",
    "003": "Atkinson County",
    "005": "Bacon County",
    "007": "Baker County",
    "009": "Baldwin County",
    "011": "Banks County",
    "013": "Barrow County",
    "015": "Bartow County",
    "017": "Ben Hill County",
    "019": "Berrien County",
    "021": "Bibb County",
    "023": "Bleckley County",
    "025": "Brantley County",
    "027": "Brooks County",
    "029": "Bryan County",
    "031": "Bulloch County",
    "033": "Burke County",
    "035": "Butts County",
    "037": "Calhoun County",
    "039": "Camden County",
    "043": "Candler County",
    "045": "Carroll County",
    "047": "Catoosa County",
    "049": "Charlton County",
    "051": "Chatham County",
    "053": "Chattahoochee County",
    "055": "Chattooga County",
    "057": "Cherokee County",
    "059": "Clarke County",
    "061": "Clay County",
    "063": "Clayton County",
    "065": "Clinch County",
    "067": "Cobb County",
    "069": "Coffee County",
    "071": "Colquitt County",
    "073": "Columbia County",
    "075": "Cook County",
    "077": "Coweta County",
    "079": "Crawford County",
    "081": "Crisp County",
    "083": "Dade County",
    "085": "Dawson County",
    "087": "Decatur County",
    "089": "DeKalb County",
    "091": "Dodge County",
    "093": "Dooly County",
    "095": "Dougherty County",
    "097": "Douglas County",
    "099": "Early County"
  },
  "15": {
    "001": "Hawaii County",
    "003": "Honolulu County",
    "005": "Kalawao County",
    "007": "Kauai County",
    "009": "Maui County"
  },
  "16": {
    "001": "Ada County",
    "003": "Adams County",
    "005": "Bannock County",
    "007": "Bear Lake County",
    "009": "Benewah County",
    "011": "Bingham County",
    "013": "Blaine County",
    "015": "Boise County",
    "017": "Bonner County",
    "019": "Bonneville County",
    "021": "Boundary County",
    "023": "Butte County",
    "025": "Camas County",
    "027": "Canyon County",
    "029": "Caribou County",
    "031": "Cassia County",
    "033": "Clark County",
    "035": "Clearwater County",
    "037": "Custer County",
    "039": "Elmore County",
    "041": "Franklin County",
    "043": "Fremont County",
    "045": "Gem County",
    "047": "Gooding County",
    "049": "Idaho County",
    "051": "Jefferson County",
    "053": "Jerome County",
    "055": "Kootenai County",
    "057": "Latah County",
    "059": "Lemhi County",
    "061": "Lewis County",
    "063": "Lincoln County",
    "065": "Madison County",
    "067": "Minidoka County",
    "069": "Nez Perce County",
    "071": "Oneida County",
    "073": "Owyhee County",
    "075": "Payette County",
    "077": "Power County",
    "079": "Shoshone County",
    "081": "Teton County",
    "083": "Twin Falls County",
    "085": "Valley County",
    "087": "Washington County"
  },
  "17": {
    "101": "Lawrence County",
    "103": "Lee County",
    "105": "Livingston County",
    "107": "Logan County",
    "109": "McDonough County",
    "111": "McHenry County",
    "113": "McLean County",
    "115": "Macon County",
    "117": "Macoupin County",
    "119": "Madison County",
    "121": "Marion County",
    "123": "Marshall County",
    "125": "Mason County",
    "127": "Massac County",
    "129": "Menard County",
    "131": "Mercer County",
    "133": "Monroe County",
    "135": "Montgomery County",
    "137": "Morgan County",
    "139": "Moultrie County",
    "141": "Ogle County",
    "143": "Peoria County",
    "145": "Perry County",
    "147": "Piatt County",
    "149": "Pike County",
    "151": "Pope County",
    "153": "Pulaski County",
    "155": "Putnam County",
    "157": "Randolph County",
    "159": "Richland County",
    "161": "Rock Island County",
    "163": "St. Clair County",
    "165": "Saline County",
    "167": "Sangamon County",
    "169": "Schuyler County",
    "171": "Scott County",
    "173": "Shelby County",
    "175": "Stark County",
    "177": "Stephenson County",
    "179": "Tazewell County",
    "181": "Union County",
    "183": "Vermilion County",
    "185": "Wabash County",
    "187": "Warren County",
    "189": "Washington County",
    "191": "Wayne County",
    "193": "White County",
    "195": "Whiteside County",
    "197": "Will County",
    "199": "Williamson County",
    "201": "Winnebago County",
    "203": "Woodford County",
    "001": "Adams County",
    "003": "Alexander County",
    "005": "Bond County",
    "007": "Boone County",
    "009": "Brown County",
    "011": "Bureau County",
    "013": "Calhoun County",
    "015": "Carroll County",
    "017": "Cass County",
    "019": "Champaign County",
    "021": "Christian County",
    "023": "Clark County",
    "025": "Clay County",
    "027": "Clinton County",
    "029": "Coles County",
    "031": "Cook County",
    "033": "Crawford County",
    "035": "Cumberland County",
    "037": "DeKalb County",
    "039": "De Witt County",
    "041": "Douglas County",
    "043": "DuPage County",
    "045": "Edgar County",
    "047": "Edwards County",
    "049": "Effingham County",
    "051": "Fayette County",
    "053": "Ford County",
    "055": "Franklin County",
    "057": "Fulton County",
    "059": "Gallatin County",
    "061": "Greene County",
    "063": "Grundy County",
    "065": "Hamilton County",
    "067": "Hancock County",
    "069": "Hardin County",
    "071": "Henderson County",
    "073": "Henry County",
    "075": "Iroquois County",
    "077": "Jackson County",
    "079": "Jasper County",
    "081": "Jefferson County",
    "083": "Jersey County",
    "085": "Jo Daviess County",
    "087": "Johnson County",
    "089": "Kane County",
    "091": "Kankakee County",
    "093": "Kendall County",
    "095": "Knox County",
    "097": "Lake County",
    "099": "LaSalle County"
  },
  "18": {
    "101": "Martin County",
    "103": "Miami County",
    "105": "Monroe County",
    "107": "Montgomery County",
    "109": "Morgan County",
    "111": "Newton County",
    "113": "Noble County",
    "115": "Ohio County",
    "117": "Orange County",
    "119": "Owen County",
    "121": "Parke County",
    "123": "Perry County",
    "125": "Pike County",
    "127": "Porter County",
    "129": "Posey County",
    "131": "Pulaski County",
    "133": "Putnam County",
    "135": "Randolph County",
    "137": "Ripley County",
    "139": "Rush County",
    "141": "St. Joseph County",
    "143": "Scott County",
    "145": "Shelby County",
    "147": "Spencer County",
    "149": "Starke County",
    "151": "Steuben County",
    "153": "Sullivan County",
    "155": "Switzerland County",
    "157": "Tippecanoe County",
    "159": "Tipton County",
    "161": "Union County",
    "163": "Vanderburgh County",
    "165": "Vermillion County",
    "167": "Vigo County",
    "169": "Wabash County",
    "171": "Warren County",
    "173": "Warrick County",
    "175": "Washington County",
    "177": "Wayne County",
    "179": "Wells County",
    "181": "White County",
    "183": "Whitley County",
    "001": "Adams County",
    "003": "Allen County",
    "005": "Bartholomew County",
    "007": "Benton County",
    "009": "Blackford County",
    "011": "Boone County",
    "013": "Brown County",
    "015": "Carroll County",
    "017": "Cass County",
    "019": "Clark County",
    "021": "Clay County",
    "023": "Clinton County",
    "025": "Crawford County",
    "027": "Daviess County",
    "029": "Dearborn County",
    "031": "Decatur County",
    "033": "DeKalb County",
    "035": "Delaware County",
    "037": "Dubois County",
    "039": "Elkhart County",
    "041": "Fayette County",
    "043": "Floyd County",
    "045": "Fountain County",
    "047": "Franklin County",
    "049": "Fulton County",
    "051": "Gibson County",
    "053": "Grant County",
    "055": "Greene County",
    "057": "Hamilton County",
    "059": "Hancock County",
    "061": "Harrison County",
    "063": "Hendricks County",
    "065": "Henry County",
    "067": "Howard County",
    "069": "Huntington County",
    "071": "Jackson County",
    "073": "Jasper County",
    "075": "Jay County",
    "077": "Jefferson County",
    "079": "Jennings County",
    "081": "Johnson County",
    "083": "Knox County",
    "085": "Kosciusko County",
    "087": "LaGrange County",
    "089": "Lake County",
    "091": "LaPorte County",
    "093": "Lawrence County",
    "095": "Madison County",
    "097": "Marion County",
    "099": "Marshall County"
  },
  "19": {
    "101": "Jefferson County",
    "103": "Johnson County",
    "105": "Jones County",
    "107": "Keokuk County",
    "109": "Kossuth County",
    "111": "Lee County",
    "113": "Linn County",
    "115": "Louisa County",
    "117": "Lucas County",
    "119": "Lyon County",
    "121": "Madison County",
    "123": "Mahaska County",
    "125": "Marion County",
    "127": "Marshall County",
    "129": "Mills County",
    "131": "Mitchell County",
    "133": "Monona County",
    "135": "Monroe County",
    "137": "Montgomery County",
    "139": "Muscatine County",
    "141": "O'Brien County",
    "143": "Osceola County",
    "145": "Page County",
    "147": "Palo Alto County",
    "149": "Plymouth County",
    "151": "Pocahontas County",
    "153": "Polk County",
    "155": "Pottawattamie County",
    "157": "Poweshiek County",
    "159": "Ringgold County",
    "161": "Sac County",
    "163": "Scott County",
    "165": "Shelby County",
    "167": "Sioux County",
    "169": "Story County",
    "171": "Tama County",
    "173": "Taylor County",
    "175": "Union County",
    "177": "Van Buren County",
    "179": "Wapello County",
    "181": "Warren County",
    "183": "Washington County",
    "185": "Wayne County",
    "187": "Webster County",
    "189": "Winnebago County",
    "191": "Winneshiek County",
    "193": "Woodbury County",
    "195": "Worth County",
    "197": "Wright County",
    "001": "Adair County",
    "003": "Adams County",
    "005": "Allamakee County",
    "007": "Appanoose County",
    "009": "Audubon County",
    "011": "Benton County",
    "013": "Black Hawk County",
    "015": "Boone County",
    "017": "Bremer County",
    "019": "Buchanan County",
    "021": "Buena Vista County",
    "023": "Butler County",
    "025": "Calhoun County",
    "027": "Carroll County",
    "029": "Cass County",
    "031": "Cedar County",
    "033": "Cerro Gordo County",
    "035": "Cherokee County",
    "037": "Chickasaw County",
    "039": "Clarke County",
    "041": "Clay County",
    "043": "Clayton County",
    "045": "Clinton County",
    "047": "Crawford County",
    "049": "Dallas County",
    "051": "Davis County",
    "053": "Decatur County",
    "055": "Delaware County",
    "057": "Des Moines County",
    "059": "Dickinson County",
    "061": "Dubuque County",
    "063": "Emmet County",
    "065": "Fayette County",
    "067": "Floyd County",
    "069": "Franklin County",
    "071": "Fremont County",
    "073": "Greene County",
    "075": "Grundy County",
    "077": "Guthrie County",
    "079": "Hamilton County",
    "081": "Hancock County",
    "083": "Hardin County",
    "085": "Harrison County",
    "087": "Henry County",
    "089": "Howard County",
    "091": "Humboldt County",
    "093": "Ida County",
    "095": "Iowa County",
    "097": "Jackson County",
    "099": "Jasper County"
  },
  "20": {
    "101": "Lane County",
    "103": "Leavenworth County",
    "105": "Lincoln County",
    "107": "Linn County",
    "109": "Logan County",
    "111": "Lyon County",
    "113": "McPherson County",
    "115": "Marion County",
    "117": "Marshall County",
    "119": "Meade County",
    "121": "Miami County",
    "123": "Mitchell County",
    "125": "Montgomery County",
    "127": "Morris County",
    "129": "Morton County",
    "131": "Nemaha County",
    "133": "Neosho County",
    "135": "Ness County",
    "137": "Norton County",
    "139": "Osage County",
    "141": "Osborne County",
    "143": "Ottawa County",
    "145": "Pawnee County",
    "147": "Phillips County",
    "149": "Pottawatomie County",
    "151": "Pratt County",
    "153": "Rawlins County",
    "155": "Reno County",
    "157": "Republic County",
    "159": "Rice County",
    "161": "Riley County",
    "163": "Rooks County",
    "165": "Rush County",
    "167": "Russell County",
    "169": "Saline County",
    "171": "Scott County",
    "173": "Sedgwick County",
    "175": "Seward County",
    "177": "Shawnee County",
    "179": "Sheridan County",
    "181": "Sherman County",
    "183": "Smith County",
    "185": "Stafford County",
    "187": "Stanton County",
    "189": "Stevens County",
    "191": "Sumner County",
    "193": "Thomas County",
    "195": "Trego County",
    "197": "Wabaunsee County",
    "199": "Wallace County",
    "201": "Washington County",
    "203": "Wichita County",
    "205": "Wilson County",
    "207": "Woodson County",
    "209": "Wyandotte County",
    "001": "Allen County",
    "003": "Anderson County",
    "005": "Atchison County",
    "007": "Barber County",
    "009": "Barton County",
    "011": "Bourbon County",
    "013": "Brown County",
    "015": "Butler County",
    "017": "Chase County",
    "019": "Chautauqua County",
    "021": "Cherokee County",
    "023": "Cheyenne County",
    "025": "Clark County",
    "027": "Clay County",
    "029": "Cloud County",
    "031": "Coffey County",
    "033": "Comanche County",
    "035": "Cowley County",
    "037": "Crawford County",
    "039": "Decatur County",
    "041": "Dickinson County",
    "043": "Doniphan County",
    "045": "Douglas County",
    "047": "Edwards County",
    "049": "Elk County",
    "051": "Ellis County",
    "053": "Ellsworth County",
    "055": "Finney County",
    "057": "Ford County",
    "059": "Franklin County",
    "061": "Geary County",
    "063": "Gove County",
    "065": "Graham County",
    "067": "Grant County",
    "069": "Gray County",
    "071": "Greeley County",
    "073": "Greenwood County",
    "075": "Hamilton County",
    "077": "Harper County",
    "079": "Harvey County",
    "081": "Haskell County",
    "083": "Hodgeman County",
    "085": "Jackson County",
    "087": "Jefferson County",
    "089": "Jewell County",
    "091": "Johnson County",
    "093": "Kearny County",
    "095": "Kingman County",
    "097": "Kiowa County",
    "099": "Labette County"
  },
  "21": {
    "101": "Henderson County",
    "103": "Henry County",
    "105": "Hickman County",
    "107": "Hopkins County",
    "109": "Jackson County",
    "111": "Jefferson County",
    "113": "Jessamine County",
    "115": "Johnson County",
    "117": "Kenton County",
    "119": "Knott County",
    "121": "Knox County",
    "123": "Larue County",
    "125": "Laurel County",
    "127": "Lawrence County",
    "129": "Lee County",
    "131": "Leslie County",
    "133": "Letcher County",
    "135": "Lewis County",
    "137": "Lincoln County",
    "139": "Livingston County",
    "141": "Logan County",
    "143": "Lyon County",
    "145": "McCracken County",
    "147": "McCreary County",
    "149": "McLean County",
    "151": "Madison County",
    "153": "Magoffin County",
    "155": "Marion County",
    "157": "Marshall County",
    "159": "Martin County",
    "161": "Mason County",
    "163": "Meade County",
    "165": "Menifee County",
    "167": "Mercer County",
    "169": "Metcalfe County",
    "171": "Monroe County",
    "173": "Montgomery County",
    "175": "Morgan County",
    "177": "Muhlenberg County",
    "179": "Nelson County",
    "181": "Nicholas County",
    "183": "Ohio County",
    "185": "Oldham County",
    "187": "Owen County",
    "189": "Owsley County",
    "191": "Pendleton County",
    "193": "Perry County",
    "195": "Pike County",
    "197": "Powell County",
    "199": "Pulaski County",
    "201": "Robertson County",
    "203": "Rockcastle County",
    "205": "Rowan County",
    "207": "Russell County",
    "209": "Scott County",
    "211": "Shelby County",
    "213": "Simpson County",
    "215": "Spencer County",
    "217": "Taylor County",
    "219": "Todd County",
    "221": "Trigg County",
    "223": "Trimble County",
    "225": "Union County",
    "227": "Warren County",
    "229": "Washington County",
    "231": "Wayne County",
    "233": "Webster County",
    "235": "Whitley County",
    "237": "Wolfe County",
    "239": "Woodford County",
    "001": "Adair County",
    "003": "Allen County",
    "005": "Anderson County",
    "007": "Ballard County",
    "009": "Barren County",
    "011": "Bath County",
    "013": "Bell County",
    "015": "Boone County",
    "017": "Bourbon County",
    "019": "Boyd County",
    "021": "Boyle County",
    "023": "Bracken County",
    "025": "Breathitt County",
    "027": "Breckinridge County",
    "029": "Bullitt County",
    "031": "Butler County",
    "033": "Caldwell County",
    "035": "Calloway County",
    "037": "Campbell County",
    "039": "Carlisle County",
    "041": "Carroll County",
    "043": "Carter County",
    "045": "Casey County",
    "047": "Christian County",
    "049": "Clark County",
    "051": "Clay County",
    "053": "Clinton County",
    "055": "Crittenden County",
    "057": "Cumberland County",
    "059": "Daviess County",
    "061": "Edmonson County",
    "063": "Elliott County",
    "065": "Estill County",
    "067": "Fayette County",
    "069": "Fleming County",
    "071": "Floyd County",
    "073": "Franklin County",
    "075": "Fulton County",
    "077": "Gallatin County",
    "079": "Garrard County",
    "081": "Grant County",
    "083": "Graves County",
    "085": "Grayson County",
    "087": "Green County",
    "089": "Greenup County",
    "091": "Hancock County",
    "093": "Hardin County",
    "095": "Harlan County",
    "097": "Harrison County",
    "099": "Hart County"
  },
  "22": {
    "101": "St. Mary Parish",
    "103": "St. Tammany Parish",
    "105": "Tangipahoa Parish",
    "107": "Tensas Parish",
    "109": "Terrebonne Parish",
    "111": "Union Parish",
    "113": "Vermilion Parish",
    "115": "Vernon Parish",
    "117": "Washington Parish",
    "119": "Webster Parish",
    "121": "West Baton Rouge Parish",
    "123": "West Carroll Parish",
    "125": "West Feliciana Parish",
    "127": "Winn Parish",
    "001": "Acadia Parish",
    "003": "Allen Parish",
    "005": "Ascension Parish",
    "007": "Assumption Parish",
    "009": "Avoyelles Parish",
    "011": "Beauregard Parish",
    "013": "Bienville Parish",
    "015": "Bossier Parish",
    "017": "Caddo Parish",
    "019": "Calcasieu Parish",
    "021": "Caldwell Parish",
    "023": "Cameron Parish",
    "025": "Catahoula Parish",
    "027": "Claiborne Parish",
    "029": "Concordia Parish",
    "031": "De Soto Parish",
    "033": "East Baton Rouge Parish",
    "035": "East Carroll Parish",
    "037": "East Feliciana Parish",
    "039": "Evangeline Parish",
    "041": "Franklin Parish",
    "043": "Grant Parish",
    "045": "Iberia Parish",
    "047": "Iberville Parish",
    "049": "Jackson Parish",
    "051": "Jefferson Parish",
    "053": "Jefferson Davis Parish",
    "055": "Lafayette Parish",
    "057": "Lafourche Parish",
    "059": "La Salle Parish",
    "061": "Lincoln Parish",
    "063": "Livingston Parish",
    "065": "Madison Parish",
    "067": "Morehouse Parish",
    "069": "Natchitoches Parish",
    "071": "Orleans Parish",
    "073": "Ouachita Parish",
    "075": "Plaquemines Parish",
    "077": "Pointe Coupee Parish",
    "079": "Rapides Parish",
    "081": "Red River Parish",
    "083": "Richland Parish",
    "085": "Sabine Parish",
    "087": "St. Bernard Parish",
    "089": "St. Charles Parish",
    "091": "St. Helena Parish",
    "093": "St. James Parish",
    "095": "St. John the Baptist Parish",
    "097": "St. Landry Parish",
    "099": "St. Martin Parish"
  },
  "23": {
    "001": "Androscoggin County",
    "003": "Aroostook County",
    "005": "Cumberland County",
    "007": "Franklin County",
    "009": "Hancock County",
    "011": "Kennebec County",
    "013": "Knox County",
    "015": "Lincoln County",
    "017": "Oxford County",
    "019": "Penobscot County",
    "021": "Piscataquis County",
    "023": "Sagadahoc County",
    "025": "Somerset County",
    "027": "Waldo County",
    "029": "Washington County",
    "031": "York County"
  },
  "24": {
    "510": "Baltimore city",
    "001": "Allegany County",
    "003": "Anne Arundel County",
    "005": "Baltimore County",
    "009": "Calvert County",
    "011": "Caroline County",
    "013": "Carroll County",
    "015": "Cecil County",
    "017": "Charles County",
    "019": "Dorchester County",
    "021": "Frederick County",
    "023": "Garrett County",
    "025": "Harford County",
    "027": "Howard County",
    "029": "Kent County",
    "031": "Montgomery County",
    "033": "Prince George's County",
    "035": "Queen Anne's County",
    "037": "St. Mary's County",
    "039": "Somerset County",
    "041": "Talbot County",
    "043": "Washington County",
    "045": "Wicomico County",
    "047": "Worcester County"
  },
  "25": {
    "001": "Barnstable County",
    "003": "Berkshire County",
    "005": "Bristol County",
    "007": "Dukes County",
    "009": "Essex County",
    "011": "Franklin County",
    "013": "Hampden County",
    "015": "Hampshire County",
    "017": "Middlesex County",
    "019": "Nantucket County",
    "021": "Norfolk County",
    "023": "Plymouth County",
    "025": "Suffolk County",
    "027": "Worcester County"
  },
  "26": {
    "101": "Manistee County",
    "103": "Marquette County",
    "105": "Mason County",
    "107": "Mecosta County",
    "109": "Menominee County",
    "111": "Midland County",
    "113": "Missaukee County",
    "115": "Monroe County",
    "117": "Montcalm County",
    "119": "Montmorency County",
    "121": "Muskegon County",
    "123": "Newaygo County",
    "125": "Oakland County",
    "127": "Oceana County",
    "129": "Ogemaw County",
    "131": "Ontonagon County",
    "133": "Osceola County",
    "135": "Oscoda County",
    "137": "Otsego County",
    "139": "Ottawa County",
    "141": "Presque Isle County",
    "143": "Roscommon County",
    "145": "Saginaw County",
    "147": "St. Clair County",
    "149": "St. Joseph County",
    "151": "Sanilac County",
    "153": "Schoolcraft County",
    "155": "Shiawassee County",
    "157": "Tuscola County",
    "159": "Van Buren County",
    "161": "Washtenaw County",
    "163": "Wayne County",
    "165": "Wexford County",
    "001": "Alcona County",
    "003": "Alger County",
    "005": "Allegan County",
    "007": "Alpena County",
    "009": "Antrim County",
    "011": "Arenac County",
    "013": "Baraga County",
    "015": "Barry County",
    "017": "Bay County",
    "019": "Benzie County",
    "021": "Berrien County",
    "023": "Branch County",
    "025": "Calhoun County",
    "027": "Cass County",
    "029": "Charlevoix County",
    "031": "Cheboygan County",
    "033": "Chippewa County",
    "035": "Clare County",
    "037": "Clinton County",
    "039": "Crawford County",
    "041": "Delta County",
    "043": "Dickinson County",
    "045": "Eaton County",
    "047": "Emmet County",
    "049": "Genesee County",
    "051": "Gladwin County",
    "053": "Gogebic County",
    "055": "Grand Traverse County",
    "057": "Gratiot County",
    "059": "Hillsdale County",
    "061": "Houghton County",
    "063": "Huron County",
    "065": "Ingham County",
    "067": "Ionia County",
    "069": "Iosco County",
    "071": "Iron County",
    "073": "Isabella County",
    "075": "Jackson County",
    "077": "Kalamazoo County",
    "079": "Kalkaska County",
    "081": "Kent County",
    "083": "Keweenaw County",
    "085": "Lake County",
    "087": "Lapeer County",
    "089": "Leelanau County",
    "091": "Lenawee County",
    "093": "Livingston County",
    "095": "Luce County",
    "097": "Mackinac County",
    "099": "Macomb County"
  },
  "27": {
    "101": "Murray County",
    "103": "Nicollet County",
    "105": "Nobles County",
    "107": "Norman County",
    "109": "Olmsted County",
    "111": "Otter Tail County",
    "113": "Pennington County",
    "115": "Pine County",
    "117": "Pipestone County",
    "119": "Polk County",
    "121": "Pope County",
    "123": "Ramsey County",
    "125": "Red Lake County",
    "127": "Redwood County",
    "129": "Renville County",
    "131": "Rice County",
    "133": "Rock County",
    "135": "Roseau County",
    "137": "St. Louis County",
    "139": "Scott County",
    "141": "Sherburne County",
    "143": "Sibley County",
    "145": "Stearns County",
    "147": "Steele County",
    "149": "Stevens County",
    "151": "Swift County",
    "153": "Todd County",
    "155": "Traverse County",
    "157": "Wabasha County",
    "159": "Wadena County",
    "161": "Waseca County",
    "163": "Washington County",
    "165": "Watonwan County",
    "167": "Wilkin County",
    "169": "Winona County",
    "171": "Wright County",
    "173": "Yellow Medicine County",
    "001": "Aitkin County",
    "003": "Anoka County",
    "005": "Becker County",
    "007": "Beltrami County",
    "009": "Benton County",
    "011": "Big Stone County",
    "013": "Blue Earth County",
    "015": "Brown County",
    "017": "Carlton County",
    "019": "Carver County",
    "021": "Cass County",
    "023": "Chippewa County",
    "025": "Chisago County",
    "027": "Clay County",
    "029": "Clearwater County",
    "031": "Cook County",
    "033": "Cottonwood County",
    "035": "Crow Wing County",
    "037": "Dakota County",
    "039": "Dodge County",
    "041": "Douglas County",
    "043": "Faribault County",
    "045": "Fillmore County",
    "047": "Freeborn County",
    "049": "Goodhue County",
    "051": "Grant County",
    "053": "Hennepin County",
    "055": "Houston County",
    "057": "Hubbard County",
    "059": "Isanti County",
    "061": "Itasca County",
    "063": "Jackson County",
    "065": "Kanabec County",
    "067": "Kandiyohi County",
    "069": "Kittson County",
    "071": "Koochiching County",
    "073": "Lac qui Parle County",
    "075": "Lake County",
    "077": "Lake of the Woods County",
    "079": "Le Sueur County",
    "081": "Lincoln County",
    "083": "Lyon County",
    "085": "McLeod County",
    "087": "Mahnomen County",
    "089": "Marshall County",
    "091": "Martin County",
    "093": "Meeker County",
    "095": "Mille Lacs County",
    "097": "Morrison County",
    "099": "Mower County"
  },
  "28": {
    "101": "Newton County",
    "103": "Noxubee County",
    "105": "Oktibbeha County",
    "107": "Panola County",
    "109": "Pearl River County",
    "111": "Perry County",
    "113": "Pike County",
    "115": "Pontotoc County",
    "117": "Prentiss County",
    "119": "Quitman County",
    "121": "Rankin County",
    "123": "Scott County",
    "125": "Sharkey County",
    "127": "Simpson County",
    "129": "Smith County",
    "131": "Stone County",
    "133": "Sunflower County",
    "135": "Tallahatchie County",
    "137": "Tate County",
    "139": "Tippah County",
    "141": "Tishomingo County",
    "143": "Tunica County",
    "145": "Union County",
    "147": "Walthall County",
    "149": "Warren County",
    "151": "Washington County",
    "153": "Wayne County",
    "155": "Webster County",
    "157": "Wilkinson County",
    "159": "Winston County",
    "161": "Yalobusha County",
    "163": "Yazoo County",
    "001": "Adams County",
    "003": "Alcorn County",
    "005": "Amite County",
    "007": "Attala County",
    "009": "Benton County",
    "011": "Bolivar County",
    "013": "Calhoun County",
    "015": "Carroll County",
    "017": "Chickasaw County",
    "019": "Choctaw County",
    "021": "Claiborne County",
    "023": "Clarke County",
    "025": "Clay County",
    "027": "Coahoma County",
    "029": "Copiah County",
    "031": "Covington County",
    "033": "DeSoto County",
    "035": "Forrest County",
    "037": "Franklin County",
    "039": "George County",
    "041": "Greene County",
    "043": "Grenada County",
    "045": "Hancock County",
    "047": "Harrison County",
    "049": "Hinds County",
    "051": "Holmes County",
    "053": "Humphreys County",
    "055": "Issaquena County",
    "057": "Itawamba County",
    "059": "Jackson County",
    "061": "Jasper County",
    "063": "Jefferson County",
    "065": "Jefferson Davis County",
    "067": "Jones County",
    "069": "Kemper County",
    "071": "Lafayette County",
    "073": "Lamar County",
    "075": "Lauderdale County",
    "077": "Lawrence County",
    "079": "Leake County",
    "081": "Lee County",
    "083": "Leflore County",
    "085": "Lincoln County",
    "087": "Lowndes County",
    "089": "Madison County",
    "091": "Marion County",
    "093": "Marshall County",
    "095": "Monroe County",
    "097": "Montgomery County",
    "099": "Neshoba County"
  },
  "29": {
    "101": "Johnson County",
    "103": "Knox County",
    "105": "Laclede County",
    "107": "Lafayette County",
    "109": "Lawrence County",
    "111": "Lewis County",
    "113": "Lincoln County",
    "115": "Linn County",
    "117": "Livingston County",
    "119": "McDonald County",
    "121": "Macon County",
    "123": "Madison County",
    "125": "Maries County",
    "127": "Marion County",
    "129": "Mercer County",
    "131": "Miller County",
    "133": "Mississippi County",
    "135": "Moniteau County",
    "137": "Monroe County",
    "139": "Montgomery County",
    "141": "Morgan County",
    "143": "New Madrid County",
    "145": "Newton County",
    "147": "Nodaway County",
    "149": "Oregon County",
    "151": "Osage County",
    "153": "Ozark County",
    "155": "Pemiscot County",
    "157": "Perry County",
    "159": "Pettis County",
    "161": "Phelps County",
    "163": "Pike County",
    "165": "Platte County",
    "167": "Polk County",
    "169": "Pulaski County",
    "171": "Putnam County",
    "173": "Ralls County",
    "175": "Randolph County",
    "177": "Ray County",
    "179": "Reynolds County",
    "181": "Ripley County",
    "183": "St. Charles County",
    "185": "St. Clair County",
    "186": "Ste. Genevieve County",
    "187": "St. Francois County",
    "189": "St. Louis County",
    "195": "Saline County",
    "197": "Schuyler County",
    "199": "Scotland County",
    "201": "Scott County",
    "203": "Shannon County",
    "205": "Shelby County",
    "207": "Stoddard County",
    "209": "Stone County",
    "211": "Sullivan County",
    "213": "Taney County",
    "215": "Texas County",
    "217": "Vernon County",
    "219": "Warren County",
    "221": "Washington County",
    "223": "Wayne County",
    "225": "Webster County",
    "227": "Worth County",
    "229": "Wright County",
    "510": "St. Louis city",
    "001": "Adair County",
    "003": "Andrew County",
    "005": "Atchison County",
    "007": "Audrain County",
    "009": "Barry County",
    "011": "Barton County",
    "013": "Bates County",
    "015": "Benton County",
    "017": "Bollinger County",
    "019": "Boone County",
    "021": "Buchanan County",
    "023": "Butler County",
    "025": "Caldwell County",
    "027": "Callaway County",
    "029": "Camden County",
    "031": "Cape Girardeau County",
    "033": "Carroll County",
    "035": "Carter County",
    "037": "Cass County",
    "039": "Cedar County",
    "041": "Chariton County",
    "043": "Christian County",
    "045": "Clark County",
    "047": "Clay County",
    "049": "Clinton County",
    "051": "Cole County",
    "053": "Cooper County",
    "055": "Crawford County",
    "057": "Dade County",
    "059": "Dallas County",
    "061": "Daviess County",
    "063": "DeKalb County",
    "065": "Dent County",
    "067": "Douglas County",
    "069": "Dunklin County",
    "071": "Franklin County",
    "073": "Gasconade County",
    "075": "Gentry County",
    "077": "Greene County",
    "079": "Grundy County",
    "081": "Harrison County",
    "083": "Henry County",
    "085": "Hickory County",
    "087": "Holt County",
    "089": "Howard County",
    "091": "Howell County",
    "093": "Iron County",
    "095": "Jackson County",
    "097": "Jasper County",
    "099": "Jefferson County"
  },
  "30": {
    "101": "Toole County",
    "103": "Treasure County",
    "105": "Valley County",
    "107": "Wheatland County",
    "109": "Wibaux County",
    "111": "Yellowstone County",
    "001": "Beaverhead County",
    "003": "Big Horn County",
    "005": "Blaine County",
    "007": "Broadwater County",
    "009": "Carbon County",
    "011": "Carter County",
    "013": "Cascade County",
    "015": "Chouteau County",
    "017": "Custer County",
    "019": "Daniels County",
    "021": "Dawson County",
    "023": "Deer Lodge County",
    "025": "Fallon County",
    "027": "Fergus County",
    "029": "Flathead County",
    "031": "Gallatin County",
    "033": "Garfield County",
    "035": "Glacier County",
    "037": "Golden Valley County",
    "039": "Granite County",
    "041": "Hill County",
    "043": "Jefferson County",
    "045": "Judith Basin County",
    "047": "Lake County",
    "049": "Lewis and Clark County",
    "051": "Liberty County",
    "053": "Lincoln County",
    "055": "McCone County",
    "057": "Madison County",
    "059": "Meagher County",
    "061": "Mineral County",
    "063": "Missoula County",
    "065": "Musselshell County",
    "067": "Park County",
    "069": "Petroleum County",
    "071": "Phillips County",
    "073": "Pondera County",
    "075": "Powder River County",
    "077": "Powell County",
    "079": "Prairie County",
    "081": "Ravalli County",
    "083": "Richland County",
    "085": "Roosevelt County",
    "087": "Rosebud County",
    "089": "Sanders County",
    "091": "Sheridan County",
    "093": "Silver Bow County",
    "095": "Stillwater County",
    "097": "Sweet Grass County",
    "099": "Teton County"
  },
  "31": {
    "101": "Keith County",
    "103": "Keya Paha County",
    "105": "Kimball County",
    "107": "Knox County",
    "109": "Lancaster County",
    "111": "Lincoln County",
    "113": "Logan County",
    "115": "Loup County",
    "117": "McPherson County",
    "119": "Madison County",
    "121": "Merrick County",
    "123": "Morrill County",
    "125": "Nance County",
    "127": "Nemaha County",
    "129": "Nuckolls County",
    "131": "Otoe County",
    "133": "Pawnee County",
    "135": "Perkins County",
    "137": "Phelps County",
    "139": "Pierce County",
    "141": "Platte County",
    "143": "Polk County",
    "145": "Red Willow County",
    "147": "Richardson County",
    "149": "Rock County",
    "151": "Saline County",
    "153": "Sarpy County",
    "155": "Saunders County",
    "157": "Scotts Bluff County",
    "159": "Seward County",
    "161": "Sheridan County",
    "163": "Sherman County",
    "165": "Sioux County",
    "167": "Stanton County",
    "169": "Thayer County",
    "171": "Thomas County",
    "173": "Thurston County",
    "175": "Valley County",
    "177": "Washington County",
    "179": "Wayne County",
    "181": "Webster County",
    "183": "Wheeler County",
    "185": "York County",
    "001": "Adams County",
    "003": "Antelope County",
    "005": "Arthur County",
    "007": "Banner County",
    "009": "Blaine County",
    "011": "Boone County",
    "013": "Box Butte County",
    "015": "Boyd County",
    "017": "Brown County",
    "019": "Buffalo County",
    "021": "Burt County",
    "023": "Butler County",
    "025": "Cass County",
    "027": "Cedar County",
    "029": "Chase County",
    "031": "Cherry County",
    "033": "Cheyenne County",
    "035": "Clay County",
    "037": "Colfax County",
    "039": "Cuming County",
    "041": "Custer County",
    "043": "Dakota County",
    "045": "Dawes County",
    "047": "Dawson County",
    "049": "Deuel County",
    "051": "Dixon County",
    "053": "Dodge County",
    "055": "Douglas County",
    "057": "Dundy County",
    "059": "Fillmore County",
    "061": "Franklin County",
    "063": "Frontier County",
    "065": "Furnas County",
    "067": "Gage County",
    "069": "Garden County",
    "071": "Garfield County",
    "073": "Gosper County",
    "075": "Grant County",
    "077": "Greeley County",
    "079": "Hall County",
    "081": "Hamilton County",
    "083": "Harlan County",
    "085": "Hayes County",
    "087": "Hitchcock County",
    "089": "Holt County",
    "091": "Hooker County",
    "093": "Howard County",
    "095": "Jefferson County",
    "097": "Johnson County",
    "099": "Kearney County"
  },
  "32": {
    "510": "Carson City",
    "001": "Churchill County",
    "003": "Clark County",
    "005": "Douglas County",
    "007": "Elko County",
    "009": "Esmeralda County",
    "011": "Eureka County",
    "013": "Humboldt County",
    "015": "Lander County",
    "017": "Lincoln County",
    "019": "Lyon County",
    "021": "Mineral County",
    "023": "Nye County",
    "027": "Pershing County",
    "029": "Storey County",
    "031": "Washoe County",
    "033": "White Pine County"
  },
  "33": {
    "001": "Belknap County",
    "003": "Carroll County",
    "005": "Cheshire County",
    "007": "Coos County",
    "009": "Grafton County",
    "011": "Hillsborough County",
    "013": "Merrimack County",
    "015": "Rockingham County",
    "017": "Strafford County",
    "019": "Sullivan County"
  },
  "34": {
    "001": "Atlantic County",
    "003": "Bergen County",
    "005": "Burlington County",
    "007": "Camden County",
    "009": "Cape May County",
    "011": "Cumberland County",
    "013": "Essex County",
    "015": "Gloucester County",
    "017": "Hudson County",
    "019": "Hunterdon County",
    "021": "Mercer County",
    "023": "Middlesex County",
    "025": "Monmouth County",
    "027": "Morris County",
    "029": "Ocean County",
    "031": "Passaic County",
    "033": "Salem County",
    "035": "Somerset County",
    "037": "Sussex County",
    "039": "Union County",
    "041": "Warren County"
  },
  "35": {
    "001": "Bernalillo County",
    "003": "Catron County",
    "005": "Chaves County",
    "006": "Cibola County",
    "007": "Colfax County",
    "009": "Curry County",
    "011": "De Baca County",
    "013": "Dona Ana County",
    "015": "Eddy County",
    "017": "Grant County",
    "019": "Guadalupe County",
    "021": "Harding County",
    "023": "Hidalgo County",
    "025": "Lea County",
    "027": "Lincoln County",
    "028": "Los Alamos County",
    "029": "Luna County",
    "031": "McKinley County",
    "033": "Mora County",
    "035": "Otero County",
    "037": "Quay County",
    "039": "Rio Arriba County",
    "041": "Roosevelt County",
    "043": "Sandoval County",
    "045": "San Juan County",
    "047": "San Miguel County",
    "049": "Santa Fe County",
    "051": "Sierra County",
    "053": "Socorro County",
    "055": "Taos County",
    "057": "Torrance County",
    "059": "Union County",
    "061": "Valencia County"
  },
  "36": {
    "101": "Steuben County",
    "103": "Suffolk County",
    "105": "Sullivan County",
    "107": "Tioga County",
    "109": "Tompkins County",
    "111": "Ulster County",
    "113": "Warren County",
    "115": "Washington County",
    "117": "Wayne County",
    "119": "Westchester County",
    "121": "Wyoming County",
    "123": "Yates County",
    "001": "Albany County",
    "003": "Allegany County",
    "005": "Bronx County",
    "007": "Broome County",
    "009": "Cattaraugus County",
    "011": "Cayuga County",
    "013": "Chautauqua County",
    "015": "Chemung County",
    "017": "Chenango County",
    "019": "Clinton County",
    "021": "Columbia County",
    "023": "Cortland County",
    "025": "Delaware County",
    "027": "Dutchess County",
    "029": "Erie County",
    "031": "Essex County",
    "033": "Franklin County",
    "035": "Fulton County",
    "037": "Genesee County",
    "039": "Greene County",
    "041": "Hamilton County",
    "043": "Herkimer County",
    "045": "Jefferson County",
    "047": "Kings County",
    "049": "Lewis County",
    "051": "Livingston County",
    "053": "Madison County",
    "055": "Monroe County",
    "057": "Montgomery County",
    "059": "Nassau County",
    "061": "New York County",
    "063": "Niagara County",
    "065": "Oneida County",
    "067": "Onondaga County",
    "069": "Ontario County",
    "071": "Orange County",
    "073": "Orleans County",
    "075": "Oswego County",
    "077": "Otsego County",
    "079": "Putnam County",
    "081": "Queens County",
    "083": "Rensselaer County",
    "085": "Richmond County",
    "087": "Rockland County",
    "089": "St. Lawrence County",
    "091": "Saratoga County",
    "093": "Schenectady County",
    "095": "Schoharie County",
    "097": "Schuyler County",
    "099": "Seneca County"
  },
  "37": {
    "101": "Johnston County",
    "103": "Jones County",
    "105": "Lee County",
    "107": "Lenoir County",
    "109": "Lincoln County",
    "111": "McDowell County",
    "113": "Macon County",
    "115": "Madison County",
    "117": "Martin County",
    "119": "Mecklenburg County",
    "121": "Mitchell County",
    "123": "Montgomery County",
    "125": "Moore County",
    "127": "Nash County",
    "129": "New Hanover County",
    "131": "Northampton County",
    "133": "Onslow County",
    "135": "Orange County",
    "137": "Pamlico County",
    "139": "Pasquotank County",
    "141": "Pender County",
    "143": "Perquimans County",
    "145": "Person County",
    "147": "Pitt County",
    "149": "Polk County",
    "151": "Randolph County",
    "153": "Richmond County",
    "155": "Robeson County",
    "157": "Rockingham County",
    "159": "Rowan County",
    "161": "Rutherford County",
    "163": "Sampson County",
    "165": "Scotland County",
    "167": "Stanly County",
    "169": "Stokes County",
    "171": "Surry County",
    "173": "Swain County",
    "175": "Transylvania County",
    "177": "Tyrrell County",
    "179": "Union County",
    "181": "Vance County",
    "183": "Wake County",
    "185": "Warren County",
    "187": "Washington County",
    "189": "Watauga County",
    "191": "Wayne County",
    "193": "Wilkes County",
    "195": "Wilson County",
    "197": "Yadkin County",
    "199": "Yancey County",
    "001": "Alamance County",
    "003": "Alexander County",
    "005": "Alleghany County",
    "007": "Anson County",
    "009": "Ashe County",
    "011": "Avery County",
    "013": "Beaufort County",
    "015": "Bertie County",
    "017": "Bladen County",
    "019": "Brunswick County",
    "021": "Buncombe County",
    "023": "Burke County",
    "025": "Cabarrus County",
    "027": "Caldwell County",
    "029": "Camden County",
    "031": "Carteret County",
    "033": "Caswell County",
    "035": "Catawba County",
    "037": "Chatham County",
    "039": "Cherokee County",
    "041": "Chowan County",
    "043": "Clay County",
    "045": "Cleveland County",
    "047": "Columbus County",
    "049": "Craven County",
    "051": "Cumberland County",
    "053": "Currituck County",
    "055": "Dare County",
    "057": "Davidson County",
    "059": "Davie County",
    "061": "Duplin County",
    "063": "Durham County",
    "065": "Edgecombe County",
    "067": "Forsyth County",
    "069": "Franklin County",
    "071": "Gaston County",
    "073": "Gates County",
    "075": "Graham County",
    "077": "Granville County",
    "079": "Greene County",
    "081": "Guilford County",
    "083": "Halifax County",
    "085": "Harnett County",
    "087": "Haywood County",
    "089": "Henderson County",
    "091": "Hertford County",
    "093": "Hoke County",
    "095": "Hyde County",
    "097": "Iredell County",
    "099": "Jackson County"
  },
  "38": {
    "101": "Ward County",
    "103": "Wells County",
    "105": "Williams County",
    "001": "Adams County",
    "003": "Barnes County",
    "005": "Benson County",
    "007": "Billings County",
    "009": "Bottineau County",
    "011": "Bowman County",
    "013": "Burke County",
    "015": "Burleigh County",
    "017": "Cass County",
    "019": "Cavalier County",
    "021": "Dickey County",
    "023": "Divide County",
    "025": "Dunn County",
    "027": "Eddy County",
    "029": "Emmons County",
    "031": "Foster County",
    "033": "Golden Valley County",
    "035": "Grand Forks County",
    "037": "Grant County",
    "039": "Griggs County",
    "041": "Hettinger County",
    "043": "Kidder County",
    "045": "LaMoure County",
    "047": "Logan County",
    "049": "McHenry County",
    "051": "McIntosh County",
    "053": "McKenzie County",
    "055": "McLean County",
    "057": "Mercer County",
    "059": "Morton County",
    "061": "Mountrail County",
    "063": "Nelson County",
    "065": "Oliver County",
    "067": "Pembina County",
    "069": "Pierce County",
    "071": "Ramsey County",
    "073": "Ransom County",
    "075": "Renville County",
    "077": "Richland County",
    "079": "Rolette County",
    "081": "Sargent County",
    "083": "Sheridan County",
    "085": "Sioux County",
    "087": "Slope County",
    "089": "Stark County",
    "091": "Steele County",
    "093": "Stutsman County",
    "095": "Towner County",
    "097": "Traill County",
    "099": "Walsh County"
  },
  "39": {
    "101": "Marion County",
    "103": "Medina County",
    "105": "Meigs County",
    "107": "Mercer County",
    "109": "Miami County",
    "111": "Monroe County",
    "113": "Montgomery County",
    "115": "Morgan County",
    "117": "Morrow County",
    "119": "Muskingum County",
    "121": "Noble County",
    "123": "Ottawa County",
    "125": "Paulding County",
    "127": "Perry County",
    "129": "Pickaway County",
    "131": "Pike County",
    "133": "Portage County",
    "135": "Preble County",
    "137": "Putnam County",
    "139": "Richland County",
    "141": "Ross County",
    "143": "Sandusky County",
    "145": "Scioto County",
    "147": "Seneca County",
    "149": "Shelby County",
    "151": "Stark County",
    "153": "Summit County",
    "155": "Trumbull County",
    "157": "Tuscarawas County",
    "159": "Union County",
    "161": "Van Wert County",
    "163": "Vinton County",
    "165": "Warren County",
    "167": "Washington County",
    "169": "Wayne County",
    "171": "Williams County",
    "173": "Wood County",
    "175": "Wyandot County",
    "001": "Adams County",
    "003": "Allen County",
    "005": "Ashland County",
    "007": "Ashtabula County",
    "009": "Athens County",
    "011": "Auglaize County",
    "013": "Belmont County",
    "015": "Brown County",
    "017": "Butler County",
    "019": "Carroll County",
    "021": "Champaign County",
    "023": "Clark County",
    "025": "Clermont County",
    "027": "Clinton County",
    "029": "Columbiana County",
    "031": "Coshocton County",
    "033": "Crawford County",
    "035": "Cuyahoga County",
    "037": "Darke County",
    "039": "Defiance County",
    "041": "Delaware County",
    "043": "Erie County",
    "045": "Fairfield County",
    "047": "Fayette County",
    "049": "Franklin County",
    "051": "Fulton County",
    "053": "Gallia County",
    "055": "Geauga County",
    "057": "Greene County",
    "059": "Guernsey County",
    "061": "Hamilton County",
    "063": "Hancock County",
    "065": "Hardin County",
    "067": "Harrison County",
    "069": "Henry County",
    "071": "Highland County",
    "073": "Hocking County",
    "075": "Holmes County",
    "077": "Huron County",
    "079": "Jackson County",
    "081": "Jefferson County",
    "083": "Knox County",
    "085": "Lake County",
    "087": "Lawrence County",
    "089": "Licking County",
    "091": "Logan County",
    "093": "Lorain County",
    "095": "Lucas County",
    "097": "Madison County",
    "099": "Mahoning County"
  },
  "40": {
    "101": "Muskogee County",
    "103": "Noble County",
    "105": "Nowata County",
    "107": "Okfuskee County",
    "109": "Oklahoma County",
    "111": "Okmulgee County",
    "113": "Osage County",
    "115": "Ottawa County",
    "117": "Pawnee County",
    "119": "Payne County",
    "121": "Pittsburg County",
    "123": "Pontotoc County",
    "125": "Pottawatomie County",
    "127": "Pushmataha County",
    "129": "Roger Mills County",
    "131": "Rogers County",
    "133": "Seminole County",
    "135": "Sequoyah County",
    "137": "Stephens County",
    "139": "Texas County",
    "141": "Tillman County",
    "143": "Tulsa County",
    "145": "Wagoner County",
    "147": "Washington County",
    "149": "Washita County",
    "151": "Woods County",
    "153": "Woodward County",
    "001": "Adair County",
    "003": "Alfalfa County",
    "005": "Atoka County",
    "007": "Beaver County",
    "009": "Beckham County",
    "011": "Blaine County",
    "013": "Bryan County",
    "015": "Caddo County",
    "017": "Canadian County",
    "019": "Carter County",
    "021": "Cherokee County",
    "023": "Choctaw County",
    "025": "Cimarron County",
    "027": "Cleveland County",
    "029": "Coal County",
    "031": "Comanche County",
    "033": "Cotton County",
    "035": "Craig County",
    "037": "Creek County",
    "039": "Custer County",
    "041": "Delaware County",
    "043": "Dewey County",
    "045": "Ellis County",
    "047": "Garfield County",
    "049": "Garvin County",
    "051": "Grady County",
    "053": "Grant County",
    "055": "Greer County",
    "057": "Harmon County",
    "059": "Harper County",
    "061": "Haskell County",
    "063": "Hughes County",
    "065": "Jackson County",
    "067": "Jefferson County",
    "069": "Johnston County",
    "071": "Kay County",
    "073": "Kingfisher County",
    "075": "Kiowa County",
    "077": "Latimer County",
    "079": "Le Flore County",
    "081": "Lincoln County",
    "083": "Logan County",
    "085": "Love County",
    "087": "McClain County",
    "089": "McCurtain County",
    "091": "McIntosh County",
    "093": "Major County",
    "095": "Marshall County",
    "097": "Mayes County",
    "099": "Murray County"
  },
  "41": {
    "001": "Baker County",
    "003": "Benton County",
    "005": "Clackamas County",
    "007": "Clatsop County",
    "009": "Columbia County",
    "011": "Coos County",
    "013": "Crook County",
    "015": "Curry County",
    "017": "Deschutes County",
    "019": "Douglas County",
    "021": "Gilliam County",
    "023": "Grant County",
    "025": "Harney County",
    "027": "Hood River County",
    "029": "Jackson County",
    "031": "Jefferson County",
    "033": "Josephine County",
    "035": "Klamath County",
    "037": "Lake County",
    "039": "Lane County",
    "041": "Lincoln County",
    "043": "Linn County",
    "045": "Malheur County",
    "047": "Marion County",
    "049": "Morrow County",
    "051": "Multnomah County",
    "053": "Polk County",
    "055": "Sherman County",
    "057": "Tillamook County",
    "059": "Umatilla County",
    "061": "Union County",
    "063": "Wallowa County",
    "065": "Wasco County",
    "067": "Washington County",
    "069": "Wheeler County",
    "071": "Yamhill County"
  },
  "42": {
    "101": "Philadelphia County",
    "103": "Pike County",
    "105": "Potter County",
    "107": "Schuylkill County",
    "109": "Snyder County",
    "111": "Somerset County",
    "113": "Sullivan County",
    "115": "Susquehanna County",
    "117": "Tioga County",
    "119": "Union County",
    "121": "Venango County",
    "123": "Warren County",
    "125": "Washington County",
    "127": "Wayne County",
    "129": "Westmoreland County",
    "131": "Wyoming County",
    "133": "York County",
    "001": "Adams County",
    "003": "Allegheny County",
    "005": "Armstrong County",
    "007": "Beaver County",
    "009": "Bedford County",
    "011": "Berks County",
    "013": "Blair County",
    "015": "Bradford County",
    "017": "Bucks County",
    "019": "Butler County",
    "021": "Cambria County",
    "023": "Cameron County",
    "025": "Carbon County",
    "027": "Centre County",
    "029": "Chester County",
    "031": "Clarion County",
    "033": "Clearfield County",
    "035": "Clinton County",
    "037": "Columbia County",
    "039": "Crawford County",
    "041": "Cumberland County",
    "043": "Dauphin County",
    "045": "Delaware County",
    "047": "Elk County",
    "049": "Erie County",
    "051": "Fayette County",
    "053": "Forest County",
    "055": "Franklin County",
    "057": "Fulton County",
    "059": "Greene County",
    "061": "Huntingdon County",
    "063": "Indiana County",
    "065": "Jefferson County",
    "067": "Juniata County",
    "069": "Lackawanna County",
    "071": "Lancaster County",
    "073": "Lawrence County",
    "075": "Lebanon County",
    "077": "Lehigh County",
    "079": "Luzerne County",
    "081": "Lycoming County",
    "083": "McKean County",
    "085": "Mercer County",
    "087": "Mifflin County",
    "089": "Monroe County",
    "091": "Montgomery County",
    "093": "Montour County",
    "095": "Northampton County",
    "097": "Northumberland County",
    "099": "Perry County"
  },
  "44": {
    "001": "Bristol County",
    "003": "Kent County",
    "005": "Newport County",
    "007": "Providence County",
    "009": "Washington County"
  },
  "45": {
    "001": "Abbeville County",
    "003": "Aiken County",
    "005": "Allendale County",
    "007": "Anderson County",
    "009": "Bamberg County",
    "011": "Barnwell County",
    "013": "Beaufort County",
    "015": "Berkeley County",
    "017": "Calhoun County",
    "019": "Charleston County",
    "021": "Cherokee County",
    "023": "Chester County",
    "025": "Chesterfield County",
    "027": "Clarendon County",
    "029": "Colleton County",
    "031": "Darlington County",
    "033": "Dillon County",
    "035": "Dorchester County",
    "037": "Edgefield County",
    "039": "Fairfield County",
    "041": "Florence County",
    "043": "Georgetown County",
    "045": "Greenville County",
    "047": "Greenwood County",
    "049": "Hampton County",
    "051": "Horry County",
    "053": "Jasper County",
    "055": "Kershaw County",
    "057": "Lancaster County",
    "059": "Laurens County",
    "061": "Lee County",
    "063": "Lexington County",
    "065": "McCormick County",
    "067": "Marion County",
    "069": "Marlboro County",
    "071": "Newberry County",
    "073": "Oconee County",
    "075": "Orangeburg County",
    "077": "Pickens County",
    "079": "Richland County",
    "081": "Saluda County",
    "083": "Spartanburg County",
    "085": "Sumter County",
    "087": "Union County",
    "089": "Williamsburg County",
    "091": "York County"
  },
  "46": {
    "101": "Moody County",
    "103": "Pennington County",
    "105": "Perkins County",
    "107": "Potter County",
    "109": "Roberts County",
    "111": "Sanborn County",
    "113": "Shannon County",
    "115": "Spink County",
    "117": "Stanley County",
    "119": "Sully County",
    "121": "Todd County",
    "123": "Tripp County",
    "125": "Turner County",
    "127": "Union County",
    "129": "Walworth County",
    "135": "Yankton County",
    "137": "Ziebach County",
    "003": "Aurora County",
    "005": "Beadle County",
    "007": "Bennett County",
    "009": "Bon Homme County",
    "011": "Brookings County",
    "013": "Brown County",
    "015": "Brule County",
    "017": "Buffalo County",
    "019": "Butte County",
    "021": "Campbell County",
    "023": "Charles Mix County",
    "025": "Clark County",
    "027": "Clay County",
    "029": "Codington County",
    "031": "Corson County",
    "033": "Custer County",
    "035": "Davison County",
    "037": "Day County",
    "039": "Deuel County",
    "041": "Dewey County",
    "043": "Douglas County",
    "045": "Edmunds County",
    "047": "Fall River County",
    "049": "Faulk County",
    "051": "Grant County",
    "053": "Gregory County",
    "055": "Haakon County",
    "057": "Hamlin County",
    "059": "Hand County",
    "061": "Hanson County",
    "063": "Harding County",
    "065": "Hughes County",
    "067": "Hutchinson County",
    "069": "Hyde County",
    "071": "Jackson County",
    "073": "Jerauld County",
    "075": "Jones County",
    "077": "Kingsbury County",
    "079": "Lake County",
    "081": "Lawrence County",
    "083": "Lincoln County",
    "085": "Lyman County",
    "087": "McCook County",
    "089": "McPherson County",
    "091": "Marshall County",
    "093": "Meade County",
    "095": "Mellette County",
    "097": "Miner County",
    "099": "Minnehaha County"
  },
  "47": {
    "101": "Lewis County",
    "103": "Lincoln County",
    "105": "Loudon County",
    "107": "McMinn County",
    "109": "McNairy County",
    "111": "Macon County",
    "113": "Madison County",
    "115": "Marion County",
    "117": "Marshall County",
    "119": "Maury County",
    "121": "Meigs County",
    "123": "Monroe County",
    "125": "Montgomery County",
    "127": "Moore County",
    "129": "Morgan County",
    "131": "Obion County",
    "133": "Overton County",
    "135": "Perry County",
    "137": "Pickett County",
    "139": "Polk County",
    "141": "Putnam County",
    "143": "Rhea County",
    "145": "Roane County",
    "147": "Robertson County",
    "149": "Rutherford County",
    "151": "Scott County",
    "153": "Sequatchie County",
    "155": "Sevier County",
    "157": "Shelby County",
    "159": "Smith County",
    "161": "Stewart County",
    "163": "Sullivan County",
    "165": "Sumner County",
    "167": "Tipton County",
    "169": "Trousdale County",
    "171": "Unicoi County",
    "173": "Union County",
    "175": "Van Buren County",
    "177": "Warren County",
    "179": "Washington County",
    "181": "Wayne County",
    "183": "Weakley County",
    "185": "White County",
    "187": "Williamson County",
    "189": "Wilson County",
    "001": "Anderson County",
    "003": "Bedford County",
    "005": "Benton County",
    "007": "Bledsoe County",
    "009": "Blount County",
    "011": "Bradley County",
    "013": "Campbell County",
    "015": "Cannon County",
    "017": "Carroll County",
    "019": "Carter County",
    "021": "Cheatham County",
    "023": "Chester County",
    "025": "Claiborne County",
    "027": "Clay County",
    "029": "Cocke County",
    "031": "Coffee County",
    "033": "Crockett County",
    "035": "Cumberland County",
    "037": "Davidson County",
    "039": "Decatur County",
    "041": "DeKalb County",
    "043": "Dickson County",
    "045": "Dyer County",
    "047": "Fayette County",
    "049": "Fentress County",
    "051": "Franklin County",
    "053": "Gibson County",
    "055": "Giles County",
    "057": "Grainger County",
    "059": "Greene County",
    "061": "Grundy County",
    "063": "Hamblen County",
    "065": "Hamilton County",
    "067": "Hancock County",
    "069": "Hardeman County",
    "071": "Hardin County",
    "073": "Hawkins County",
    "075": "Haywood County",
    "077": "Henderson County",
    "079": "Henry County",
    "081": "Hickman County",
    "083": "Houston County",
    "085": "Humphreys County",
    "087": "Jackson County",
    "089": "Jefferson County",
    "091": "Johnson County",
    "093": "Knox County",
    "095": "Lake County",
    "097": "Lauderdale County",
    "099": "Lawrence County"
  },
  "48": {
    "101": "Cottle County",
    "103": "Crane County",
    "105": "Crockett County",
    "107": "Crosby County",
    "109": "Culberson County",
    "111": "Dallam County",
    "113": "Dallas County",
    "115": "Dawson County",
    "117": "Deaf Smith County",
    "119": "Delta County",
    "121": "Denton County",
    "123": "DeWitt County",
    "125": "Dickens County",
    "127": "Dimmit County",
    "129": "Donley County",
    "131": "Duval County",
    "133": "Eastland County",
    "135": "Ector County",
    "137": "Edwards County",
    "139": "Ellis County",
    "141": "El Paso County",
    "143": "Erath County",
    "145": "Falls County",
    "147": "Fannin County",
    "149": "Fayette County",
    "151": "Fisher County",
    "153": "Floyd County",
    "155": "Foard County",
    "157": "Fort Bend County",
    "159": "Franklin County",
    "161": "Freestone County",
    "163": "Frio County",
    "165": "Gaines County",
    "167": "Galveston County",
    "169": "Garza County",
    "171": "Gillespie County",
    "173": "Glasscock County",
    "175": "Goliad County",
    "177": "Gonzales County",
    "179": "Gray County",
    "181": "Grayson County",
    "183": "Gregg County",
    "185": "Grimes County",
    "187": "Guadalupe County",
    "189": "Hale County",
    "191": "Hall County",
    "193": "Hamilton County",
    "195": "Hansford County",
    "197": "Hardeman County",
    "199": "Hardin County",
    "201": "Harris County",
    "203": "Harrison County",
    "205": "Hartley County",
    "207": "Haskell County",
    "209": "Hays County",
    "211": "Hemphill County",
    "213": "Henderson County",
    "215": "Hidalgo County",
    "217": "Hill County",
    "219": "Hockley County",
    "221": "Hood County",
    "223": "Hopkins County",
    "225": "Houston County",
    "227": "Howard County",
    "229": "Hudspeth County",
    "231": "Hunt County",
    "233": "Hutchinson County",
    "235": "Irion County",
    "237": "Jack County",
    "239": "Jackson County",
    "241": "Jasper County",
    "243": "Jeff Davis County",
    "245": "Jefferson County",
    "247": "Jim Hogg County",
    "249": "Jim Wells County",
    "251": "Johnson County",
    "253": "Jones County",
    "255": "Karnes County",
    "257": "Kaufman County",
    "259": "Kendall County",
    "261": "Kenedy County",
    "263": "Kent County",
    "265": "Kerr County",
    "267": "Kimble County",
    "269": "King County",
    "271": "Kinney County",
    "273": "Kleberg County",
    "275": "Knox County",
    "277": "Lamar County",
    "279": "Lamb County",
    "281": "Lampasas County",
    "283": "La Salle County",
    "285": "Lavaca County",
    "287": "Lee County",
    "289": "Leon County",
    "291": "Liberty County",
    "293": "Limestone County",
    "295": "Lipscomb County",
    "297": "Live Oak County",
    "299": "Llano County",
    "301": "Loving County",
    "303": "Lubbock County",
    "305": "Lynn County",
    "307": "McCulloch County",
    "309": "McLennan County",
    "311": "McMullen County",
    "313": "Madison County",
    "315": "Marion County",
    "317": "Martin County",
    "319": "Mason County",
    "321": "Matagorda County",
    "323": "Maverick County",
    "325": "Medina County",
    "327": "Menard County",
    "329": "Midland County",
    "331": "Milam County",
    "333": "Mills County",
    "335": "Mitchell County",
    "337": "Montague County",
    "339": "Montgomery County",
    "341": "Moore County",
    "343": "Morris County",
    "345": "Motley County",
    "347": "Nacogdoches County",
    "349": "Navarro County",
    "351": "Newton County",
    "353": "Nolan County",
    "355": "Nueces County",
    "357": "Ochiltree County",
    "359": "Oldham County",
    "361": "Orange County",
    "363": "Palo Pinto County",
    "365": "Panola County",
    "367": "Parker County",
    "369": "Parmer County",
    "371": "Pecos County",
    "373": "Polk County",
    "375": "Potter County",
    "377": "Presidio County",
    "379": "Rains County",
    "381": "Randall County",
    "383": "Reagan County",
    "385": "Real County",
    "387": "Red River County",
    "389": "Reeves County",
    "391": "Refugio County",
    "393": "Roberts County",
    "395": "Robertson County",
    "397": "Rockwall County",
    "399": "Runnels County",
    "401": "Rusk County",
    "403": "Sabine County",
    "405": "San Augustine County",
    "407": "San Jacinto County",
    "409": "San Patricio County",
    "411": "San Saba County",
    "413": "Schleicher County",
    "415": "Scurry County",
    "417": "Shackelford County",
    "419": "Shelby County",
    "421": "Sherman County",
    "423": "Smith County",
    "425": "Somervell County",
    "427": "Starr County",
    "429": "Stephens County",
    "431": "Sterling County",
    "433": "Stonewall County",
    "435": "Sutton County",
    "437": "Swisher County",
    "439": "Tarrant County",
    "441": "Taylor County",
    "443": "Terrell County",
    "445": "Terry County",
    "447": "Throckmorton County",
    "449": "Titus County",
    "451": "Tom Green County",
    "453": "Travis County",
    "455": "Trinity County",
    "457": "Tyler County",
    "459": "Upshur County",
    "461": "Upton County",
    "463": "Uvalde County",
    "465": "Val Verde County",
    "467": "Van Zandt County",
    "469": "Victoria County",
    "471": "Walker County",
    "473": "Waller County",
    "475": "Ward County",
    "477": "Washington County",
    "479": "Webb County",
    "481": "Wharton County",
    "483": "Wheeler County",
    "485": "Wichita County",
    "487": "Wilbarger County",
    "489": "Willacy County",
    "491": "Williamson County",
    "493": "Wilson County",
    "495": "Winkler County",
    "497": "Wise County",
    "499": "Wood County",
    "501": "Yoakum County",
    "503": "Young County",
    "505": "Zapata County",
    "507": "Zavala County",
    "001": "Anderson County",
    "003": "Andrews County",
    "005": "Angelina County",
    "007": "Aransas County",
    "009": "Archer County",
    "011": "Armstrong County",
    "013": "Atascosa County",
    "015": "Austin County",
    "017": "Bailey County",
    "019": "Bandera County",
    "021": "Bastrop County",
    "023": "Baylor County",
    "025": "Bee County",
    "027": "Bell County",
    "029": "Bexar County",
    "031": "Blanco County",
    "033": "Borden County",
    "035": "Bosque County",
    "037": "Bowie County",
    "039": "Brazoria County",
    "041": "Brazos County",
    "043": "Brewster County",
    "045": "Briscoe County",
    "047": "Brooks County",
    "049": "Brown County",
    "051": "Burleson County",
    "053": "Burnet County",
    "055": "Caldwell County",
    "057": "Calhoun County",
    "059": "Callahan County",
    "061": "Cameron County",
    "063": "Camp County",
    "065": "Carson County",
    "067": "Cass County",
    "069": "Castro County",
    "071": "Chambers County",
    "073": "Cherokee County",
    "075": "Childress County",
    "077": "Clay County",
    "079": "Cochran County",
    "081": "Coke County",
    "083": "Coleman County",
    "085": "Collin County",
    "087": "Collingsworth County",
    "089": "Colorado County",
    "091": "Comal County",
    "093": "Comanche County",
    "095": "Concho County",
    "097": "Cooke County",
    "099": "Coryell County"
  },
  "49": {
    "001": "Beaver County",
    "003": "Box Elder County",
    "005": "Cache County",
    "007": "Carbon County",
    "009": "Daggett County",
    "011": "Davis County",
    "013": "Duchesne County",
    "015": "Emery County",
    "017": "Garfield County",
    "019": "Grand County",
    "021": "Iron County",
    "023": "Juab County",
    "025": "Kane County",
    "027": "Millard County",
    "029": "Morgan County",
    "031": "Piute County",
    "033": "Rich County",
    "035": "Salt Lake County",
    "037": "San Juan County",
    "039": "Sanpete County",
    "041": "Sevier County",
    "043": "Summit County",
    "045": "Tooele County",
    "047": "Uintah County",
    "049": "Utah County",
    "051": "Wasatch County",
    "053": "Washington County",
    "055": "Wayne County",
    "057": "Weber County"
  },
  "50": {
    "001": "Addison County",
    "003": "Bennington County",
    "005": "Caledonia County",
    "007": "Chittenden County",
    "009": "Essex County",
    "011": "Franklin County",
    "013": "Grand Isle County",
    "015": "Lamoille County",
    "017": "Orange County",
    "019": "Orleans County",
    "021": "Rutland County",
    "023": "Washington County",
    "025": "Windham County",
    "027": "Windsor County"
  },
  "51": {
    "101": "King William County",
    "103": "Lancaster County",
    "105": "Lee County",
    "107": "Loudoun County",
    "109": "Louisa County",
    "111": "Lunenburg County",
    "113": "Madison County",
    "115": "Mathews County",
    "117": "Mecklenburg County",
    "119": "Middlesex County",
    "121": "Montgomery County",
    "125": "Nelson County",
    "127": "New Kent County",
    "131": "Northampton County",
    "133": "Northumberland County",
    "135": "Nottoway County",
    "137": "Orange County",
    "139": "Page County",
    "141": "Patrick County",
    "143": "Pittsylvania County",
    "145": "Powhatan County",
    "147": "Prince Edward County",
    "149": "Prince George County",
    "153": "Prince William County",
    "155": "Pulaski County",
    "157": "Rappahannock County",
    "159": "Richmond County",
    "161": "Roanoke County",
    "163": "Rockbridge County",
    "165": "Rockingham County",
    "167": "Russell County",
    "169": "Scott County",
    "171": "Shenandoah County",
    "173": "Smyth County",
    "175": "Southampton County",
    "177": "Spotsylvania County",
    "179": "Stafford County",
    "181": "Surry County",
    "183": "Sussex County",
    "185": "Tazewell County",
    "187": "Warren County",
    "191": "Washington County",
    "193": "Westmoreland County",
    "195": "Wise County",
    "197": "Wythe County",
    "199": "York County",
    "510": "Alexandria city",
    "515": "Bedford city",
    "520": "Bristol city",
    "530": "Buena Vista city",
    "540": "Charlottesville city",
    "550": "Chesapeake city",
    "570": "Colonial Heights city",
    "580": "Covington city",
    "590": "Danville city",
    "595": "Emporia city",
    "600": "Fairfax city",
    "610": "Falls Church city",
    "620": "Franklin city",
    "630": "Fredericksburg city",
    "640": "Galax city",
    "650": "Hampton city",
    "660": "Harrisonburg city",
    "670": "Hopewell city",
    "678": "Lexington city",
    "680": "Lynchburg city",
    "683": "Manassas city",
    "685": "Manassas Park city",
    "690": "Martinsville city",
    "700": "Newport News city",
    "710": "Norfolk city",
    "720": "Norton city",
    "730": "Petersburg city",
    "735": "Poquoson city",
    "740": "Portsmouth city",
    "750": "Radford city",
    "760": "Richmond city",
    "770": "Roanoke city",
    "775": "Salem city",
    "790": "Staunton city",
    "800": "Suffolk city",
    "810": "Virginia Beach city",
    "820": "Waynesboro city",
    "830": "Williamsburg city",
    "840": "Winchester city",
    "001": "Accomack County",
    "003": "Albemarle County",
    "005": "Alleghany County",
    "007": "Amelia County",
    "009": "Amherst County",
    "011": "Appomattox County",
    "013": "Arlington County",
    "015": "Augusta County",
    "017": "Bath County",
    "019": "Bedford County",
    "021": "Bland County",
    "023": "Botetourt County",
    "025": "Brunswick County",
    "027": "Buchanan County",
    "029": "Buckingham County",
    "031": "Campbell County",
    "033": "Caroline County",
    "035": "Carroll County",
    "036": "Charles City County",
    "037": "Charlotte County",
    "041": "Chesterfield County",
    "043": "Clarke County",
    "045": "Craig County",
    "047": "Culpeper County",
    "049": "Cumberland County",
    "051": "Dickenson County",
    "053": "Dinwiddie County",
    "057": "Essex County",
    "059": "Fairfax County",
    "061": "Fauquier County",
    "063": "Floyd County",
    "065": "Fluvanna County",
    "067": "Franklin County",
    "069": "Frederick County",
    "071": "Giles County",
    "073": "Gloucester County",
    "075": "Goochland County",
    "077": "Grayson County",
    "079": "Greene County",
    "081": "Greensville County",
    "083": "Halifax County",
    "085": "Hanover County",
    "087": "Henrico County",
    "089": "Henry County",
    "091": "Highland County",
    "093": "Isle of Wight County",
    "095": "James City County",
    "097": "King and Queen County",
    "099": "King George County"
  },
  "53": {
    "001": "Adams County",
    "003": "Asotin County",
    "005": "Benton County",
    "007": "Chelan County",
    "009": "Clallam County",
    "011": "Clark County",
    "013": "Columbia County",
    "015": "Cowlitz County",
    "017": "Douglas County",
    "019": "Ferry County",
    "021": "Franklin County",
    "023": "Garfield County",
    "025": "Grant County",
    "027": "Grays Harbor County",
    "029": "Island County",
    "031": "Jefferson County",
    "033": "King County",
    "035": "Kitsap County",
    "037": "Kittitas County",
    "039": "Klickitat County",
    "041": "Lewis County",
    "043": "Lincoln County",
    "045": "Mason County",
    "047": "Okanogan County",
    "049": "Pacific County",
    "051": "Pend Oreille County",
    "053": "Pierce County",
    "055": "San Juan County",
    "057": "Skagit County",
    "059": "Skamania County",
    "061": "Snohomish County",
    "063": "Spokane County",
    "065": "Stevens County",
    "067": "Thurston County",
    "069": "Wahkiakum County",
    "071": "Walla Walla County",
    "073": "Whatcom County",
    "075": "Whitman County",
    "077": "Yakima County"
  },
  "54": {
    "101": "Webster County",
    "103": "Wetzel County",
    "105": "Wirt County",
    "107": "Wood County",
    "109": "Wyoming County",
    "001": "Barbour County",
    "003": "Berkeley County",
    "005": "Boone County",
    "007": "Braxton County",
    "009": "Brooke County",
    "011": "Cabell County",
    "013": "Calhoun County",
    "015": "Clay County",
    "017": "Doddridge County",
    "019": "Fayette County",
    "021": "Gilmer County",
    "023": "Grant County",
    "025": "Greenbrier County",
    "027": "Hampshire County",
    "029": "Hancock County",
    "031": "Hardy County",
    "033": "Harrison County",
    "035": "Jackson County",
    "037": "Jefferson County",
    "039": "Kanawha County",
    "041": "Lewis County",
    "043": "Lincoln County",
    "045": "Logan County",
    "047": "McDowell County",
    "049": "Marion County",
    "051": "Marshall County",
    "053": "Mason County",
    "055": "Mercer County",
    "057": "Mineral County",
    "059": "Mingo County",
    "061": "Monongalia County",
    "063": "Monroe County",
    "065": "Morgan County",
    "067": "Nicholas County",
    "069": "Ohio County",
    "071": "Pendleton County",
    "073": "Pleasants County",
    "075": "Pocahontas County",
    "077": "Preston County",
    "079": "Putnam County",
    "081": "Raleigh County",
    "083": "Randolph County",
    "085": "Ritchie County",
    "087": "Roane County",
    "089": "Summers County",
    "091": "Taylor County",
    "093": "Tucker County",
    "095": "Tyler County",
    "097": "Upshur County",
    "099": "Wayne County"
  },
  "55": {
    "101": "Racine County",
    "103": "Richland County",
    "105": "Rock County",
    "107": "Rusk County",
    "109": "St. Croix County",
    "111": "Sauk County",
    "113": "Sawyer County",
    "115": "Shawano County",
    "117": "Sheboygan County",
    "119": "Taylor County",
    "121": "Trempealeau County",
    "123": "Vernon County",
    "125": "Vilas County",
    "127": "Walworth County",
    "129": "Washburn County",
    "131": "Washington County",
    "133": "Waukesha County",
    "135": "Waupaca County",
    "137": "Waushara County",
    "139": "Winnebago County",
    "141": "Wood County",
    "001": "Adams County",
    "003": "Ashland County",
    "005": "Barron County",
    "007": "Bayfield County",
    "009": "Brown County",
    "011": "Buffalo County",
    "013": "Burnett County",
    "015": "Calumet County",
    "017": "Chippewa County",
    "019": "Clark County",
    "021": "Columbia County",
    "023": "Crawford County",
    "025": "Dane County",
    "027": "Dodge County",
    "029": "Door County",
    "031": "Douglas County",
    "033": "Dunn County",
    "035": "Eau Claire County",
    "037": "Florence County",
    "039": "Fond du Lac County",
    "041": "Forest County",
    "043": "Grant County",
    "045": "Green County",
    "047": "Green Lake County",
    "049": "Iowa County",
    "051": "Iron County",
    "053": "Jackson County",
    "055": "Jefferson County",
    "057": "Juneau County",
    "059": "Kenosha County",
    "061": "Kewaunee County",
    "063": "La Crosse County",
    "065": "Lafayette County",
    "067": "Langlade County",
    "069": "Lincoln County",
    "071": "Manitowoc County",
    "073": "Marathon County",
    "075": "Marinette County",
    "077": "Marquette County",
    "078": "Menominee County",
    "079": "Milwaukee County",
    "081": "Monroe County",
    "083": "Oconto County",
    "085": "Oneida County",
    "087": "Outagamie County",
    "089": "Ozaukee County",
    "091": "Pepin County",
    "093": "Pierce County",
    "095": "Polk County",
    "097": "Portage County",
    "099": "Price County"
  },
  "56": {
    "001": "Albany County",
    "003": "Big Horn County",
    "005": "Campbell County",
    "007": "Carbon County",
    "009": "Converse County",
    "011": "Crook County",
    "013": "Fremont County",
    "015": "Goshen County",
    "017": "Hot Springs County",
    "019": "Johnson County",
    "021": "Laramie County",
    "023": "Lincoln County",
    "025": "Natrona County",
    "027": "Niobrara County",
    "029": "Park County",
    "031": "Platte County",
    "033": "Sheridan County",
    "035": "Sublette County",
    "037": "Sweetwater County",
    "039": "Teton County",
    "041": "Uinta County",
    "043": "Washakie County",
    "045": "Weston County"
  },
  "60": {
    "010": "Eastern District",
    "020": "Manu'a District",
    "030": "Rose Island",
    "040": "Swains Island",
    "050": "Western District"
  },
  "66": {
    "010": "Guam"
  },
  "69": {
    "100": "Rota Municipality",
    "110": "Saipan Municipality",
    "120": "Tinian Municipality",
    "085": "Northern Islands Municipality"
  },
  "72": {
    "101": "Morovis Municipio",
    "103": "Naguabo Municipio",
    "105": "Naranjito Municipio",
    "107": "Orocovis Municipio",
    "109": "Patillas Municipio",
    "111": "Penuelas Municipio",
    "113": "Ponce Municipio",
    "115": "Quebradillas Municipio",
    "117": "Rincon Municipio",
    "119": "Rio Grande Municipio",
    "121": "Sabana Grande Municipio",
    "123": "Salinas Municipio",
    "125": "San German Municipio",
    "127": "San Juan Municipio",
    "129": "San Lorenzo Municipio",
    "131": "San Sebastian Municipio",
    "133": "Santa Isabel Municipio",
    "135": "Toa Alta Municipio",
    "137": "Toa Baja Municipio",
    "139": "Trujillo Alto Municipio",
    "141": "Utuado Municipio",
    "143": "Vega Alta Municipio",
    "145": "Vega Baja Municipio",
    "147": "Vieques Municipio",
    "149": "Villalba Municipio",
    "151": "Yabucoa Municipio",
    "153": "Yauco Municipio",
    "001": "Adjuntas Municipio",
    "003": "Aguada Municipio",
    "005": "Aguadilla Municipio",
    "007": "Aguas Buenas Municipio",
    "009": "Aibonito Municipio",
    "011": "Anasco Municipio",
    "013": "Arecibo Municipio",
    "015": "Arroyo Municipio",
    "017": "Barceloneta Municipio",
    "019": "Barranquitas Municipio",
    "021": "Bayamon Municipio",
    "023": "Cabo Rojo Municipio",
    "025": "Caguas Municipio",
    "027": "Camuy Municipio",
    "029": "Canovanas Municipio",
    "031": "Carolina Municipio",
    "033": "Catano Municipio",
    "035": "Cayey Municipio",
    "037": "Ceiba Municipio",
    "039": "Ciales Municipio",
    "041": "Cidra Municipio",
    "043": "Coamo Municipio",
    "045": "Comerio Municipio",
    "047": "Corozal Municipio",
    "049": "Culebra Municipio",
    "051": "Dorado Municipio",
    "053": "Fajardo Municipio",
    "054": "Florida Municipio",
    "055": "Guanica Municipio",
    "057": "Guayama Municipio",
    "059": "Guayanilla Municipio",
    "061": "Guaynabo Municipio",
    "063": "Gurabo Municipio",
    "065": "Hatillo Municipio",
    "067": "Hormigueros Municipio",
    "069": "Humacao Municipio",
    "071": "Isabela Municipio",
    "073": "Jayuya Municipio",
    "075": "Juana Diaz Municipio",
    "077": "Juncos Municipio",
    "079": "Lajas Municipio",
    "081": "Lares Municipio",
    "083": "Las Marias Municipio",
    "085": "Las Piedras Municipio",
    "087": "Loiza Municipio",
    "089": "Luquillo Municipio",
    "091": "Manati Municipio",
    "093": "Maricao Municipio",
    "095": "Maunabo Municipio",
    "097": "Mayaguez Municipio",
    "099": "Moca Municipio"
  },
  "74": {
    "300": "Midway Islands"
  },
  "78": {
    "010": "St. Croix Island",
    "020": "St. John Island",
    "030": "St. Thomas Island"
  },
  "01": {
    "101": "Montgomery County",
    "103": "Morgan County",
    "105": "Perry County",
    "107": "Pickens County",
    "109": "Pike County",
    "111": "Randolph County",
    "113": "Russell County",
    "115": "St. Clair County",
    "117": "Shelby County",
    "119": "Sumter County",
    "121": "Talladega County",
    "123": "Tallapoosa County",
    "125": "Tuscaloosa County",
    "127": "Walker County",
    "129": "Washington County",
    "131": "Wilcox County",
    "133": "Winston County",
    "001": "Autauga County",
    "003": "Baldwin County",
    "005": "Barbour County",
    "007": "Bibb County",
    "009": "Blount County",
    "011": "Bullock County",
    "013": "Butler County",
    "015": "Calhoun County",
    "017": "Chambers County",
    "019": "Cherokee County",
    "021": "Chilton County",
    "023": "Choctaw County",
    "025": "Clarke County",
    "027": "Clay County",
    "029": "Cleburne County",
    "031": "Coffee County",
    "033": "Colbert County",
    "035": "Conecuh County",
    "037": "Coosa County",
    "039": "Covington County",
    "041": "Crenshaw County",
    "043": "Cullman County",
    "045": "Dale County",
    "047": "Dallas County",
    "049": "DeKalb County",
    "051": "Elmore County",
    "053": "Escambia County",
    "055": "Etowah County",
    "057": "Fayette County",
    "059": "Franklin County",
    "061": "Geneva County",
    "063": "Greene County",
    "065": "Hale County",
    "067": "Henry County",
    "069": "Houston County",
    "071": "Jackson County",
    "073": "Jefferson County",
    "075": "Lamar County",
    "077": "Lauderdale County",
    "079": "Lawrence County",
    "081": "Lee County",
    "083": "Limestone County",
    "085": "Lowndes County",
    "087": "Macon County",
    "089": "Madison County",
    "091": "Marengo County",
    "093": "Marion County",
    "095": "Marshall County",
    "097": "Mobile County",
    "099": "Monroe County"
  },
  "02": {
    "100": "Haines Borough",
    "105": "Hoonah-Angoon Census Area",
    "110": "Juneau City and Borough",
    "122": "Kenai Peninsula Borough",
    "130": "Ketchikan Gateway Borough",
    "150": "Kodiak Island Borough",
    "164": "Lake and Peninsula Borough",
    "170": "Matanuska-Susitna Borough",
    "180": "Nome Census Area",
    "185": "North Slope Borough",
    "188": "Northwest Arctic Borough",
    "195": "Petersburg Census Area",
    "198": "Prince of Wales-Hyder Census Area",
    "220": "Sitka City and Borough",
    "230": "Skagway Municipality",
    "240": "Southeast Fairbanks Census Area",
    "261": "Valdez-Cordova Census Area",
    "270": "Wade Hampton Census Area",
    "275": "Wrangell City and Borough",
    "282": "Yakutat City and Borough",
    "290": "Yukon-Koyukuk Census Area",
    "013": "Aleutians East Borough",
    "016": "Aleutians West Census Area",
    "020": "Anchorage Municipality",
    "050": "Bethel Census Area",
    "060": "Bristol Bay Borough",
    "068": "Denali Borough",
    "070": "Dillingham Census Area",
    "090": "Fairbanks North Star Borough"
  },
  "04": {
    "001": "Apache County",
    "003": "Cochise County",
    "005": "Coconino County",
    "007": "Gila County",
    "009": "Graham County",
    "011": "Greenlee County",
    "012": "La Paz County",
    "013": "Maricopa County",
    "015": "Mohave County",
    "017": "Navajo County",
    "019": "Pima County",
    "021": "Pinal County",
    "023": "Santa Cruz County",
    "025": "Yavapai County",
    "027": "Yuma County"
  },
  "05": {
    "101": "Newton County",
    "103": "Ouachita County",
    "105": "Perry County",
    "107": "Phillips County",
    "109": "Pike County",
    "111": "Poinsett County",
    "113": "Polk County",
    "115": "Pope County",
    "117": "Prairie County",
    "119": "Pulaski County",
    "121": "Randolph County",
    "123": "St. Francis County",
    "125": "Saline County",
    "127": "Scott County",
    "129": "Searcy County",
    "131": "Sebastian County",
    "133": "Sevier County",
    "135": "Sharp County",
    "137": "Stone County",
    "139": "Union County",
    "141": "Van Buren County",
    "143": "Washington County",
    "145": "White County",
    "147": "Woodruff County",
    "149": "Yell County",
    "001": "Arkansas County",
    "003": "Ashley County",
    "005": "Baxter County",
    "007": "Benton County",
    "009": "Boone County",
    "011": "Bradley County",
    "013": "Calhoun County",
    "015": "Carroll County",
    "017": "Chicot County",
    "019": "Clark County",
    "021": "Clay County",
    "023": "Cleburne County",
    "025": "Cleveland County",
    "027": "Columbia County",
    "029": "Conway County",
    "031": "Craighead County",
    "033": "Crawford County",
    "035": "Crittenden County",
    "037": "Cross County",
    "039": "Dallas County",
    "041": "Desha County",
    "043": "Drew County",
    "045": "Faulkner County",
    "047": "Franklin County",
    "049": "Fulton County",
    "051": "Garland County",
    "053": "Grant County",
    "055": "Greene County",
    "057": "Hempstead County",
    "059": "Hot Spring County",
    "061": "Howard County",
    "063": "Independence County",
    "065": "Izard County",
    "067": "Jackson County",
    "069": "Jefferson County",
    "071": "Johnson County",
    "073": "Lafayette County",
    "075": "Lawrence County",
    "077": "Lee County",
    "079": "Lincoln County",
    "081": "Little River County",
    "083": "Logan County",
    "085": "Lonoke County",
    "087": "Madison County",
    "089": "Marion County",
    "091": "Miller County",
    "093": "Mississippi County",
    "095": "Monroe County",
    "097": "Montgomery County",
    "099": "Nevada County"
  },
  "06": {
    "101": "Sutter County",
    "103": "Tehama County",
    "105": "Trinity County",
    "107": "Tulare County",
    "109": "Tuolumne County",
    "111": "Ventura County",
    "113": "Yolo County",
    "115": "Yuba County",
    "001": "Alameda County",
    "003": "Alpine County",
    "005": "Amador County",
    "007": "Butte County",
    "009": "Calaveras County",
    "011": "Colusa County",
    "013": "Contra Costa County",
    "015": "Del Norte County",
    "017": "El Dorado County",
    "019": "Fresno County",
    "021": "Glenn County",
    "023": "Humboldt County",
    "025": "Imperial County",
    "027": "Inyo County",
    "029": "Kern County",
    "031": "Kings County",
    "033": "Lake County",
    "035": "Lassen County",
    "037": "Los Angeles County",
    "039": "Madera County",
    "041": "Marin County",
    "043": "Mariposa County",
    "045": "Mendocino County",
    "047": "Merced County",
    "049": "Modoc County",
    "051": "Mono County",
    "053": "Monterey County",
    "055": "Napa County",
    "057": "Nevada County",
    "059": "Orange County",
    "061": "Placer County",
    "063": "Plumas County",
    "065": "Riverside County",
    "067": "Sacramento County",
    "069": "San Benito County",
    "071": "San Bernardino County",
    "073": "San Diego County",
    "075": "San Francisco County",
    "077": "San Joaquin County",
    "079": "San Luis Obispo County",
    "081": "San Mateo County",
    "083": "Santa Barbara County",
    "085": "Santa Clara County",
    "087": "Santa Cruz County",
    "089": "Shasta County",
    "091": "Sierra County",
    "093": "Siskiyou County",
    "095": "Solano County",
    "097": "Sonoma County",
    "099": "Stanislaus County"
  },
  "08": {
    "101": "Pueblo County",
    "103": "Rio Blanco County",
    "105": "Rio Grande County",
    "107": "Routt County",
    "109": "Saguache County",
    "111": "San Juan County",
    "113": "San Miguel County",
    "115": "Sedgwick County",
    "117": "Summit County",
    "119": "Teller County",
    "121": "Washington County",
    "123": "Weld County",
    "125": "Yuma County",
    "001": "Adams County",
    "003": "Alamosa County",
    "005": "Arapahoe County",
    "007": "Archuleta County",
    "009": "Baca County",
    "011": "Bent County",
    "013": "Boulder County",
    "014": "Broomfield County",
    "015": "Chaffee County",
    "017": "Cheyenne County",
    "019": "Clear Creek County",
    "021": "Conejos County",
    "023": "Costilla County",
    "025": "Crowley County",
    "027": "Custer County",
    "029": "Delta County",
    "031": "Denver County",
    "033": "Dolores County",
    "035": "Douglas County",
    "037": "Eagle County",
    "039": "Elbert County",
    "041": "El Paso County",
    "043": "Fremont County",
    "045": "Garfield County",
    "047": "Gilpin County",
    "049": "Grand County",
    "051": "Gunnison County",
    "053": "Hinsdale County",
    "055": "Huerfano County",
    "057": "Jackson County",
    "059": "Jefferson County",
    "061": "Kiowa County",
    "063": "Kit Carson County",
    "065": "Lake County",
    "067": "La Plata County",
    "069": "Larimer County",
    "071": "Las Animas County",
    "073": "Lincoln County",
    "075": "Logan County",
    "077": "Mesa County",
    "079": "Mineral County",
    "081": "Moffat County",
    "083": "Montezuma County",
    "085": "Montrose County",
    "087": "Morgan County",
    "089": "Otero County",
    "091": "Ouray County",
    "093": "Park County",
    "095": "Phillips County",
    "097": "Pitkin County",
    "099": "Prowers County"
  },
  "09": {
    "001": "Fairfield County",
    "003": "Hartford County",
    "005": "Litchfield County",
    "007": "Middlesex County",
    "009": "New Haven County",
    "011": "New London County",
    "013": "Tolland County",
    "015": "Windham County"
  }
}
},{}],10:[function(require,module,exports){
/*
 * Constants for various SAME message fields, as defined in 47 CFR 11.
 * Refs:
 * [47CFR11] http://www.gpo.gov/fdsys/pkg/CFR-2010-title47-vol1/pdf/CFR-2010-title47-vol1-part11.pdf
 * [ISO3166-2:US] https://www.iso.org/obp/ui/#iso:code:3166:US
 * [CENSUS] https://www.census.gov/geo/reference/codes/cou.html
 * [COUNTY] http://www2.census.gov/geo/docs/reference/codes/files/national_county.txt
 */
try {
  module.exports = {
    // Originator codes: [47CFR11] §11.31(d)
    // "...indicates who originally initiated the activation of the EAS."
    originator: {
      'EAS': 'Emergency Alert System participant',
      'CIV': 'Civil authorities',
      'WXR': 'National Weather Service',
      'PEP': 'Primary Entry Point System' // ([47CFR11] §11.14)
    },
    
    // Event type codes: [47CFR11] §11.31(e)
    // "...indicates the nature of the EAS activation."
    code: {
      'EAN': 'Emergency Action Notification',
      'EAT': 'Emergency Action Termination',
      'NIC': 'National Information Center',
      'NPT': 'National Periodic Test',
      'RMT': 'Required Monthly Test',
      'RWT': 'Required Weekly Test',
      'ADR': 'Administrative Message',
      'AVW': 'Avalanche Warning',
      'AVA': 'Avalanche Watch',
      'BZW': 'Blizzard Warning',
      'CAE': 'Child Abduction Emergency',
      'CDW': 'Civil Danger Warning',
      'CEM': 'Civil Emergency Message',
      'CFW': 'Coastal Flood Warning',
      'CFA': 'Coastal Flood Watch',
      'DSW': 'Dust Storm Warning',
      'EQW': 'Earthquake Warning',
      'EVI': 'Evacuation Immediate',
      'FRW': 'Fire Warning',
      'FFW': 'Flash Flood Warning',
      'FFA': 'Flash Flood Watch',
      'FFS': 'Flash Flood Statement',
      'FLW': 'Flood Warning',
      'FLA': 'Flood Watch',
      'FLS': 'Flood Statement',
      'HMW': 'Hazardous Materials Warning',
      'HWW': 'High Wind Warning',
      'HWA': 'High Wind Watch',
      'HUW': 'Hurricane Warning',
      'HUA': 'Hurricane Watch',
      'HLS': 'Hurricane Statement',
      'LEW': 'Law Enforcement Warning',
      'LAE': 'Local Area Emergency',
      'NMN': 'Network Message Notification',
      'TOE': '911 Telephone Outage Emergency',
      'NUW': 'Nuclear Power Plant Warning',
      'DMO': 'Practice/Demo Warning',
      'RHW': 'Radiological Hazard Warning',
      'SVR': 'Severe Thunderstorm Warning',
      'SVA': 'Severe Thunderstorm Watch',
      'SVS': 'Severe Weather Statement',
      'SPW': 'Shelter in Place Warning',
      'SMW': 'Special Marine Warning',
      'SPS': 'Special Weather Statement',
      'TOR': 'Tornado Warning',
      'TOA': 'Tornado Watch',
      'TRW': 'Tropical Storm Warning',
      'TRA': 'Tropical Storm Watch',
      'TSW': 'Tsunami Warning',
      'TSA': 'Tsunami Watch',
      'VOW': 'Volcano Warning',
      'WSW': 'Winter Storm Warning',
      'WSA': 'Winter Storm Watch'
    },

    // Region codes
    
    // [47CFR11] §11.31(f); retrieved from [COUNTY].
    stateCode: require('lib/fixtures/state.json'),

    // FIXME merge in the following "state" codes, not present in [COUNTY]:
    //   '57': 'Eastern North Pacific Ocean, and along U.S.  West Coast from Canadian border to Mexican border',
    //   '58': 'North Pacific Ocean near Alaska, and along Alas- ka coastline, including the Bering Sea and the Gulf of Alaska',
    //   '61': 'Central Pacific Ocean, including Hawaiian waters 59 South Central Pacific Ocean, including American Samoa waters',
    //   '65': 'Western Pacific Ocean, including Mariana Island waters',
    //   '73': 'Western North Atlantic Ocean, and along U.S.  East Coast, from Canadian border south to Currituck Beach Light, N.C',
    //   '75': 'Western North Atlantic Ocean, and along U.S.  East Coast, south of Currituck Beach Light, N.C., following the coastline into Gulf of Mexico to Bonita Beach, FL., including the Caribbean',
    //   '77': 'Gulf of Mexico, and along the U.S. Gulf Coast from the Mexican border to Bonita Beach, FL',
    //   '91': 'Lake Superior',
    //   '92': 'Lake Michigan',
    //   '93': 'Lake Huron',
    //   '94': 'Lake St. Clair',
    //   '96': 'Lake Erie',
    //   '97': 'Lake Ontario',
    //   '98': 'St. Lawrence River above St. Regis'

    // Included in [47CFR11] §11.31(f) by reference to "State EAS
    // Mapbook"; the following are retrieved from [COUNTY], and class
    // codes discarded.
    countyCode: require('lib/fixtures/county.json'),

    // For non-national events, the subdivision of the specified region,
    // as defined in [47CFR11] §11.31(c).
    subdiv: [0,       // entire region
             1, 2, 3, // NW, N,  NE
             4, 5, 6, // W,  Ct, E
             7, 8, 9] // SW, S,  SE
  };
} catch (e) {
  /* istanbul ignore next */
  throw new Error('Unable to load SAME fixtures: ' + e.message);
}

},{"lib/fixtures/county.json":9,"lib/fixtures/state.json":11}],11:[function(require,module,exports){
module.exports={
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "60": "AS",
  "66": "GU",
  "69": "MP",
  "72": "PR",
  "74": "UM",
  "78": "VI",
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT"
}
},{}],12:[function(require,module,exports){
/* jshint -W014 */

var SAMEValues = require('lib/fixtures/same');
var jsonQuery = require('json-query');
var xtype = require('xtypejs');

xtype.options.setNameScheme('compact');

function jq(obj, path) {
  return jsonQuery(path, {source: obj})
    .value;
}

function hasValidCountyCode(region) {
  var s = parseInt(region.stateCode, 10);
  var c = parseInt(region.countyCode, 10);

  // easy cases:
  if (s === 0 && c === 0) return true;  // 0 for both is allowed, as "whole country"
  if (s !== 0 && c === 0) return true;  // 0 for county is allowed, as "whole state"
  if (s === 0 && c !== 0) return false; // but 0 for state and nonzero county isn't

  // usual case: if the state is defined, and if the state contains
  // the given county code, it's valid
  return (typeof SAMEValues.countyCode[region.stateCode] !== 'undefined')
    && SAMEValues.countyCode[region.stateCode]
      .hasOwnProperty(region.countyCode);
}

function isValidLength(n) {
  var hr, mn;

  // hr = parseInt(n.slice(0, 2), 10);
  // mn = parseInt(n.slice(2, 4), 10);

  hr = Math.floor(n / 100);
  mn = n - (100 * hr);

  // timespec < 1 hour must be in 15-minute increment
  if (hr <= 1 && (mn % 15 !== 0)) {
    return false;
  }

  // otherwise, must be in 30-minute increment
  if (mn % 30 !== 0) {
    return false;
  }

  return true;
}

/**
 * Validate a SAME message object.
 * 
 * FIXME: support multiple regions (up to 31 in the standard).
 * 
 * @param {Object|null} message - Valid SAME message content to encode, or null to encode a SAME trailer (preamble + 'NNNN').
 * @param {string} message.originator - SAME message originator.
 * @param {string} message.code - SAME message type code.
 * @param {Object} message.region - SAME message region of applicability.
 * @param {string} message.region.stateCode - SAME message state code.
 * @param {string} message.region.countyCode - SAME message county code.
 * @param {string} message.region.subdiv - SAME message region subdivision code.
 * @param {string} message.length - SAME event length (delta time after start).
 * @param {Object} message.start - SAME event start time (UTC).
 * @param {string} message.start.day - SAME event start date (Julian day).
 * @param {string} message.start.hour - SAME event start hour (24-hour time).
 * @param {string} message.start.minute - SAME event start minute.
 * @param {string} message.sender - SAME event sender identifier.
 *
 * @returns {Array} An array of errors found in the passed message.
 */
module.exports = function(message) {
  var errors = [];
  var halt = false;

  var check = function(path, type) {
    return xtype.is(jq(message, path), type);
  };

  // early valid return if null (no further validation required)
  if (message === null) {
    return [];
  }

  // FIXME validate uppercase too

  var validators = [
    [check('.', '-obj0'),
     'message must be a non-empty object, or null',
     true],

    [check('.originator', 'str')
     && SAMEValues.originator.hasOwnProperty(message.originator),
     'message.originator must be a defined SAME originator code'],

    [check('.code', 'str')
     && SAMEValues.code.hasOwnProperty(message.code),
     'message.code must be a defined SAME event type code'],

    [check('.region', '-obj0'),
     'message.region must be a non-empty object'],

    [check('.region.stateCode', 'str')
     && (parseInt(message.region.stateCode) === 0
         || SAMEValues.stateCode.hasOwnProperty(message.region.stateCode)),
     'message.region.stateCode must be a defined SAME state code'],

    [check('.region.countyCode', 'str')
     && hasValidCountyCode(message.region),
     'message.region.countyCode must be a defined SAME county code'],

    [check('.region.subdiv', 'str')
     && SAMEValues.subdiv.hasOwnProperty(message.region.subdiv),
     'message.region.subdiv must be a defined SAME region subdivision value (try 0)'],

    [check('.length', 'int')
     && isValidLength(message.length),
     'message.length must be a valid SAME event length value'],
    
    [check('.start', '-obj0'),
     'message.start must be a non-empty object'],

    [check('.start.day', 'num+')
     && (message.start.day > 0 && message.start.day <= 366),
     'message.start.day must be a valid Julian date (1 <= n <= 366)'],

    [check('.start.hour', 'num')
     && (message.start.hour >= 0 && message.start.hour <= 23),
     'message.start.hour must be a valid hour (0 <= n <= 23)'],

    [check('.start.minute', 'num')
     && (message.start.minute >= 0 && message.start.minute <= 59),
     'message.start.minute must be a valid minute (0 <= n <= 59)'],

    [check('.sender', 'str') && message.sender.length === 8,
     'message.sender must be a valid SAME sender identifier']
  ];

  validators.forEach(function(val) {
    if (halt) return;

    if (! val[0]) {
      errors.push(val[1]);
      if (val[2]) {
        halt = true;
      }
    }
  });
  
  return errors;
};

},{"json-query":6,"lib/fixtures/same":10,"xtypejs":19}],13:[function(require,module,exports){
var Wav = require('lib/wav');
var SAMEValidator = require('lib/same-validator');
var SAME;

SAME = {};

/*
 * A collection of constants for use by the SAME encoder.
 */
SAME.constants = {
  preamble: '\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab\xab'
    + 'ZCZC',
  bits: {
    // frequency, length
    mark: [2083, 0.00192],
    space: [1563, 0.00192]
  }
};

SAME.validateMessage = SAMEValidator;

/**
 * Left-pad a string with zeroes to the given length.
 *
 * @param {number} str - The string to pad.
 * @param {number} len - The overall length of the resulting string.
 * @returns {string} The string, padded.
 */
function zeropad (str, len) {
  if (str.length >= len) {
    return str;
  }
  
  while (str.length < len) {
    str = '0' + str;
  }
  return str;
}

/**
 * Convert a SAME message object into an array of numeric ASCII code points.
 *
 * NOTE: This function relies on the JS runtime using a default string
 * encoding of ASCII or UTF8. If it doesn't, the SAME messages
 * generated will be invalid.
 *
 * NOTE: This function expects to receive a valid SAME object. If it
 * doesn't, all sorts of fun things can happen, up to and including
 * uncaught exceptions.
 *
 * @param {Object} message - A SAME message object.
 * @returns {Array<Number>} An array of ASCII code points.
 */
SAME.constructMessageByteArray = function(message) {
  var msgContent = [];
  
  if (message !== null) {
    // message header
    msgContent = [
      this.constants.preamble,
      '-',
      message.originator,
      '-',
      message.code,
      '-',
      zeropad(message.region.subdiv.toString(), 1),
      zeropad(message.region.stateCode.toString(), 2),
      zeropad(message.region.countyCode.toString(), 3),
      '+',
      zeropad(message.length.toString(), 4),
      '-',
      zeropad(message.start.day.toString(), 3),
      zeropad(message.start.hour.toString(), 2),
      zeropad(message.start.minute.toString(), 2),
      '-',
      message.sender
    ];
  } else {
    // message footer
    msgContent = [
      this.constants.preamble, 'NNNN'
    ];
  }

  return msgContent
    .join('')
    .split('')
    .map(function(c) {
      return c.charCodeAt(0);
    });
};

/**
 * Convert a SAME message byte array to a RIFF WAVE stream.
 *
 * @param {Array} byteArray - An array of ASCII code points suitable for conversion.
 * @returns {String} The message encoded as RIFF WAVE data.
 */
SAME.generateWaveData = function(byteArray) {
  var whichBit = null;
  var volume = 4096;
  var wav = new Wav({
    channels: 2,
    sampleRate: 44100,
    bitsPerSample: 16
  });
  var byteCache = {};
  var byteSpec = [];
  var thisByte = -1;
  var thisBit;
  
  for (var i = 0; i < byteArray.length; i++) {
    thisByte = byteArray[i];
    if (byteCache[thisByte]) {
      byteSpec = byteCache[thisByte];
    } else {
      byteSpec = [];
      for (var e = 0; e < 8; e++) {
        thisBit = ((thisByte & Math.pow(2, e)) !== 0 ? 'mark' : 'space');
        whichBit = SAME.constants.bits[thisBit];
        byteSpec.push([whichBit[0], whichBit[1], volume]);
      }
      byteCache[thisByte] = byteSpec;
    }

    byteSpec.forEach(function(bitSpec) {
      wav.append.apply(wav, bitSpec);
    });
  }

  return wav.render();
};

/**
 * Encode a correctly formed SAME message, specified as an object, into a .wav file.
 *
 * @param {Object} A SAME message object.
 * @returns {string} A fully rendered SAME message in RIFF WAVE format.
 */
SAME.encode = function(message) {
  var validationErrors = this.validateMessage(message);
  var msgBytes = [];
  
  if (validationErrors.length > 0) {
    throw new Error('Message failed to validate: '
                   + validationErrors.join('; '));
  }

  msgBytes = SAME.constructMessageByteArray(message);
  return SAME.generateWaveData(msgBytes);
};

module.exports = SAME;


},{"lib/same-validator":12,"lib/wav":15}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
var pack = require('lib/util').pack
  , xtype = require('xtypejs');

xtype.options.setNameScheme('compact');

/**
 * A subclass of Error specific to Wav class.
 *
 * @param {string} message - The message to include in the error.
 */
var WavError = function(message) {
  this.name = 'WavError';
  this.message = message || '';

};
WavError.prototype = Error.prototype;

/**
 * A class for generating .wav (RIFF WAVE) format files containing a series of sine wave tones.
 *
 * @param {Object} params - An object of parameters for the wave file.
 * @param {number} params.channels - The number of channels to generate. Must be an integer > 0.
 * @param {number} params.sampleRate - The number of samples per second to generate. Must be an integer > 0.
 * @param {number} params.bitsPerSample - The number of bits per sample to generate. Must be an integer > 0.
 */
var Wav = function(params) {
  var paramErrors = [];

  // Validate parameters
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new WavError('Wav constructor requires a "params" object (see documentation)');
  }

  if (! xtype.is(params.channels, 'int+')) {
    paramErrors.push('"channels" must be integer > 0');
  }

  if (! xtype.is(params.sampleRate, 'int+')) {
    paramErrors.push('"sampleRate" must be integer > 0');
  }

  if (! xtype.is(params.bitsPerSample, 'int+')) {
    paramErrors.push('"bitsPerSample" must be integer > 0');
  }

  if (paramErrors.length > 0) {
    throw new WavError('Invalid parameters to Wav constructor: ' + paramErrors.join('; '));
  }

  // Set up instance
  this.params = params;
  this.dataBuffer = [];
};

/**
 * Append a tone specification to the .wav object's data buffer.
 * @param {number} frequency - The frequency of the tone. Must be an integer (I think).
 * @param {number} length - The length, in (possibly fractional) seconds, of the tone.
 * @param {number} volume - The volume of the tone. Must be an integer between 0 and 32767 inclusive.
 */
Wav.prototype.append = function(frequency, length, volume) {
  var paramErrors = [];

  if (! xtype.is(frequency, 'int+')) {
    paramErrors.push('frequency must be integer > 0');
  }

  if (! xtype.is(length, 'num+')) {
    paramErrors.push('length must be real > 0');
  }

  if (! (xtype.is(volume, 'int+') && volume <= 32767)) {
    paramErrors.push('volume must be integer 0 <= i <= 32767');
  }

  if (paramErrors.length > 0) {
    throw new WavError('Invalid parameters to .append(): ' + paramErrors.join('; '));
  }

  this.dataBuffer.push({
    frequency: frequency,
    length: length,
    volume: volume
  });
};

/**
 * Render a tone specification into samples suitable for inclusion in wave file data.
 * Not intended to be called directly. Do so at your own risk.
 *
 * @param {Object} spec - A tone specification (see {@link Wav.prototype.append} for details).
 */
Wav.prototype.renderTone = function(spec) {
  var tone = {
    count: 0,
    samples: ''
  };

  for (var i = 0; i < this.params.sampleRate * spec.length; i++) {
    for (var c = 0; c < this.params.channels; c++) {
      var sample = spec.volume *
            Math.sin((2 * Math.PI) * (i / this.params.sampleRate) * spec.frequency);
      tone.samples += pack("v", sample);
      tone.count++;
    }
  }

  return tone;
};

/**
 * Render the object's data buffer into a complete RIFF WAVE file.
 * @returns {string} - A complete RIFF WAVE file, ready for writing into a file, a browser audio element, or whatever else you like.
 */
Wav.prototype.render = function() {
  var self = this
    , sampleCount = 0
    , sampleData = ''
    , formatChunk
    , dataChunk
    , wav;

  this.dataBuffer.forEach(function(sampleSpec) {
    var rendered = self.renderTone(sampleSpec);
    sampleCount += rendered.count;
    sampleData += rendered.samples;
  });

  formatChunk = [
    'fmt ',
    pack("V", 16),
    pack("v", 1),
    pack("v", this.params.channels),
    pack("V", this.params.sampleRate),
    pack("V", (this.params.sampleRate
               * this.params.channels
               * this.params.bitsPerSample
               / 8)),
    pack("v", (this.params.channels
               * this.params.bitsPerSample
               / 8)),
    pack("v", this.params.bitsPerSample)
  ].join('');

  dataChunk = [
    'data',
    pack('V', (sampleCount * this.params.channels * this.params.bitsPerSample / 8)),
    sampleData
  ].join('');

  wav = [
    'RIFF',
    pack('V', (4 + (8 + formatChunk.length) + (8 + dataChunk.length))),
    'WAVE',
    formatChunk,
    dataChunk
  ].join('');

  return wav;
};

Wav.Error = WavError;

module.exports = Wav;

},{"lib/util":14,"xtypejs":19}],16:[function(require,module,exports){
(function (global){
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lib/writers/browser.js":17,"lib/writers/node.js":18}],17:[function(require,module,exports){
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

},{"lib/util":14}],18:[function(require,module,exports){
var Buffer = require('buffer').Buffer
  , fs = require('fs');

module.exports = function(wavFile, target) {
  var buf = new Buffer(wavFile, 'binary')
    , out = fs.createWriteStream(target);
  out.write(buf);
  out.end();
};
},{"buffer":2,"fs":1}],19:[function(require,module,exports){
/** @license | xtypejs v0.4.2 | (c) 2015, Lucas Ononiwu | MIT license, xtype.js.org/license.txt
 */

/**
 * The MIT License (MIT)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
 
(function(root, undefined) {
    
    'use strict';

    /**
     * Creates new instance of the module with default setup, type and options,
     * and which can be configured and used independently of other instances.
     */
    function newModule() {
        var module = moduleFactory(root, undefined);
        module.newInstance = newModule;
        
        return module;
    }
    
    
    function moduleFactory(root, undefined) {
    
        var moduleExport;
        
        /*
         * -------------------------
         * MODULE VARIABLES AND DATA
         * -------------------------
         */
        
        var VERSION = '0.4.2',
            TYPE_DELIMITER_DEFAULT_PATTERN = '[|, ]',
            NAME_SCHEME_DEFAULT_OPTION_VALUE = 'default',
            OBJECT_CLASS_REGEX = /^\[object\s(.*)\]$/,
            MAX_REQUEST_TYPE_CACHE_SIZE = 250,
            
            Object = ({}).constructor || Object,
            objCreate = Object.create,
            objKeys = Object.keys,
            objToString = Object.prototype.toString,
            
            optionsModule = objCreate(null),
            
            /*
             * -----------
             * BASE TYPES 
             * -----------
             */
            
            NONE_TYPE           = 0,                // No type
            
            /*  Nothing types  */
            
            NULL                = (1 << 0),
            UNDEFINED           = (1 << 1),
            NAN                 = (1 << 2),
            
            /* Boolean */
            
            TRUE                = (1 << 3),
            FALSE               = (1 << 4),
            
            /*  String  */
            
            EMPTY_STRING        = (1 << 5),        // String with zero characters.
            WHITESPACE          = (1 << 6),        // String with one or more of only whitespace characters.
            SINGLE_CHAR_STRING  = (1 << 7),        // String with exactly one non-whitespace and zero or more whitespace characters.
            MULTI_CHAR_STRING   = (1 << 8),        // String with more than one non-whitespace and zero or more whitespace characters.
            
            /* Number */
            
            ZERO                = (1 << 9),
            POSITIVE_INTEGER    = (1 << 10), 
            POSITIVE_FLOAT      = (1 << 11), 
            POSITIVE_INFINITY   = (1 << 12), 
            NEGATIVE_INTEGER    = (1 << 13),
            NEGATIVE_FLOAT      = (1 << 14),
            NEGATIVE_INFINITY   = (1 << 15),
            
            /* Array */
            
            EMPTY_ARRAY         = (1 << 16),
            SINGLE_ELEM_ARRAY   = (1 << 17), 
            MULTI_ELEM_ARRAY    = (1 << 18),
            
            /* Object */
            
            EMPTY_OBJECT        = (1 << 19),
            SINGLE_PROP_OBJECT  = (1 << 20),
            MULTI_PROP_OBJECT   = (1 << 21),
            
            /*  ECMA types  */
            
            SYMBOL              = (1 << 22),
            FUNCTION            = (1 << 23), 
            DATE                = (1 << 24), 
            ERROR               = (1 << 25), 
            REGEXP              = (1 << 26),
            
            /*
             * --------------
             * DERIVED TYPES 
             * --------------
             */
            
            /*  Derived Simple types  */
            
            BOOLEAN             = (TRUE | FALSE), 
            STRING              = (EMPTY_STRING | WHITESPACE | SINGLE_CHAR_STRING | MULTI_CHAR_STRING), 
            NUMBER              = (POSITIVE_INTEGER | POSITIVE_FLOAT | POSITIVE_INFINITY | NEGATIVE_INTEGER | NEGATIVE_FLOAT | NEGATIVE_INFINITY | ZERO),
            ARRAY               = (EMPTY_ARRAY | SINGLE_ELEM_ARRAY | MULTI_ELEM_ARRAY),
            OBJECT              = (EMPTY_OBJECT | SINGLE_PROP_OBJECT | MULTI_PROP_OBJECT),
            
            /*  Other derived types  */
            
            BLANK_STRING        = (EMPTY_STRING | WHITESPACE),
            NON_EMPTY_STRING    = (WHITESPACE | SINGLE_CHAR_STRING | MULTI_CHAR_STRING),
            NON_BLANK_STRING    = (SINGLE_CHAR_STRING | MULTI_CHAR_STRING),
            
            FLOAT               = (POSITIVE_FLOAT | NEGATIVE_FLOAT),
            INTEGER             = (POSITIVE_INTEGER | NEGATIVE_INTEGER | ZERO),
            INFINITE_NUMBER     = (POSITIVE_INFINITY | NEGATIVE_INFINITY),
            NON_INFINITE_NUMBER = (INTEGER | FLOAT),
            POSITIVE_NUMBER     = (POSITIVE_INTEGER | POSITIVE_FLOAT | POSITIVE_INFINITY),
            NEGATIVE_NUMBER     = (NEGATIVE_INTEGER | NEGATIVE_FLOAT | NEGATIVE_INFINITY),
            NON_ZERO_NUMBER     = (POSITIVE_NUMBER | NEGATIVE_NUMBER),
            NON_NEGATIVE_NUMBER = (POSITIVE_NUMBER | ZERO),
            NON_POSITIVE_NUMBER = (NEGATIVE_NUMBER | ZERO),
            
            NON_EMPTY_OBJECT    = (SINGLE_PROP_OBJECT | MULTI_PROP_OBJECT),
            NON_EMPTY_ARRAY     = (SINGLE_ELEM_ARRAY | MULTI_ELEM_ARRAY),
            
            NOTHING             = (NULL | UNDEFINED),
            PRIMITIVE           = (STRING | NUMBER | BOOLEAN | SYMBOL),
            
            // Composite of all base types (effectively all derived and non-derived types)
            ANY_TYPE = (
                    NULL | UNDEFINED | NAN |
                    SYMBOL | FUNCTION | DATE | ERROR | REGEXP |
                    TRUE | FALSE |
                    EMPTY_STRING | WHITESPACE | SINGLE_CHAR_STRING | MULTI_CHAR_STRING |
                    ZERO | POSITIVE_INTEGER | POSITIVE_FLOAT | POSITIVE_INFINITY | NEGATIVE_INTEGER | NEGATIVE_FLOAT | NEGATIVE_INFINITY |
                    EMPTY_ARRAY | SINGLE_ELEM_ARRAY | MULTI_ELEM_ARRAY | 
                    EMPTY_OBJECT | SINGLE_PROP_OBJECT | MULTI_PROP_OBJECT),
            
            // Composite of all derived types (Internal)
            DERIVED_TYPE = (BOOLEAN | STRING | NUMBER | ARRAY | OBJECT);
        
        var TYPE_VALUE_MAPPING = {
                
                'null': NULL,
                'undefined': UNDEFINED,
                nan: NAN,
                
                'true': TRUE,
                'false': FALSE,
                
                string: STRING, 
                empty_string: EMPTY_STRING,
                whitespace: WHITESPACE,
                single_char_string: SINGLE_CHAR_STRING,
                multi_char_string: MULTI_CHAR_STRING,
                // Derived
                blank_string: BLANK_STRING,
                non_empty_string: NON_EMPTY_STRING,
                non_blank_string: NON_BLANK_STRING,
                
                number: NUMBER,
                zero: ZERO,
                positive_integer: POSITIVE_INTEGER, 
                positive_float: POSITIVE_FLOAT, 
                positive_infinity: POSITIVE_INFINITY, 
                negative_integer: NEGATIVE_INTEGER,
                negative_float: NEGATIVE_FLOAT,
                negative_infinity: NEGATIVE_INFINITY, 
                // Composite
                integer: INTEGER,
                float: FLOAT,
                infinite_number: INFINITE_NUMBER,
                positive_number: POSITIVE_NUMBER, 
                negative_number: NEGATIVE_NUMBER,
                non_infinite_number: NON_INFINITE_NUMBER,
                non_positive_number: NON_POSITIVE_NUMBER,
                non_negative_number: NON_NEGATIVE_NUMBER,
                non_zero_number: NON_ZERO_NUMBER,
                
                array: ARRAY, 
                empty_array: EMPTY_ARRAY, 
                single_elem_array: SINGLE_ELEM_ARRAY,
                multi_elem_array: MULTI_ELEM_ARRAY,
                non_empty_array: NON_EMPTY_ARRAY,
                
                object: OBJECT,
                empty_object: EMPTY_OBJECT,
                single_prop_object: SINGLE_PROP_OBJECT,
                multi_prop_object: MULTI_PROP_OBJECT,
                non_empty_object: NON_EMPTY_OBJECT,
                
                boolean: BOOLEAN, 
                symbol: SYMBOL,
                date: DATE, 
                error: ERROR, 
                regexp: REGEXP,             
                'function': FUNCTION, 
                
                nothing: NOTHING,            
                primitive: PRIMITIVE,
                any: ANY_TYPE,
                none: NONE_TYPE
        };
        
        var bundledNameSchemes = objCreate(null),
            compactNameMapping;
        
        /*
         * ----------------------------------
         * BEGIN: Bundled Compact Name Scheme
         * ----------------------------------
         * (Set $XTYPE_JS_BUNDLE_COMPACT_NAME_SCHEME$ = false in Gruntfile to unbundle).
         */
        if (typeof $XTYPE_JS_BUNDLE_COMPACT_NAME_SCHEME$ === 'undefined' || $XTYPE_JS_BUNDLE_COMPACT_NAME_SCHEME$) {
            compactNameMapping = {
                
                'null': 'null',
                'undefined': 'undef',
                nan: 'nan',
                
                string: 'str', 
                empty_string: 'str0',
                whitespace: 'str_',
                single_char_string: 'str1',
                multi_char_string: 'str2+',
                // ---
                blank_string: 'str0_',
                non_empty_string: '-str0',
                non_blank_string: '-str0_',
                
                boolean: 'bool', 
                'true': 'true',
                'false': 'false',
                
                number: 'num',
                positive_number: 'num+', 
                negative_number: 'num-',
                zero: 'num0',
                // ---
                non_positive_number: '-num+',
                non_negative_number: '-num-',
                non_zero_number: '-num0',
                // ---
                integer: 'int',
                positive_integer: 'int+', 
                negative_integer: 'int-', 
                // ---
                float: 'float',
                positive_float: 'float+', 
                negative_float: 'float-',
                // ---
                infinite_number: 'inf', 
                positive_infinity: 'inf+', 
                negative_infinity: 'inf-',
                non_infinite_number: '-inf',
                
                array: 'arr', 
                empty_array: 'arr0', 
                single_elem_array: 'arr1',
                multi_elem_array: 'arr2+',
                non_empty_array: '-arr0',
                
                object: 'obj', 
                empty_object: 'obj0',
                single_prop_object: 'obj1',
                multi_prop_object: 'obj2+',
                non_empty_object: '-obj0',
                
                symbol: 'symb',
                date: 'date', 
                error: 'err', 
                regexp: 'regex',
                'function': 'func',
                
                nothing: 'nil', 
                primitive: 'prim',
                any: 'any',
                none: 'none'
            };
            
            bundledNameSchemes.compact = compactNameMapping;
        }
        
        /*
         * ----------------------------------
         * END: Bundled Compact Name Scheme
         * ----------------------------------
         */
        
        
        var typeDelimiterRegExp = new RegExp(TYPE_DELIMITER_DEFAULT_PATTERN, 'g'),
            isAliasMode = false,
            
            /* Type list string memoization cache */
            typeListStringToTypeIdCache,
            typeListStringToTypeIdCacheSize,
            
            /* Various mappings */        
            objToStringToNameMapping = objCreate(null),
            nameToAliasMapping, 
            aliasToTypeMapping,
            typeToAliasMapping;
        
        /*
         * ----------------
         * MODULE FUNCTIONS
         * ---------------- 
         */
        
        function init(moduleExport) {
            ['Boolean', 'Number', 'String', 'Symbol', 'Function', 'Array', 'Date', 'RegExp', 'Object', 'Error']
            .forEach(function(objectType) {
                objToStringToNameMapping['[object ' + objectType + ']'] = objectType.toLowerCase();
            });
            
            objKeys(TYPE_VALUE_MAPPING).forEach(function(typeName) {
                defineType(typeName, moduleExport);
            });
            
            buildAliasMappings();
            
            Object.defineProperty(moduleExport, 'VERSION', {
                value: (/\s*{{[^}]*}}\s*/g.test(VERSION) ? 'unspecified' : VERSION),
                enumerable: true,
                writable: false,
                configurable: false
            });
        }
        
        function typeOf(item) {
            var typeName = (typeof item === 'object' || typeof item === 'function') ?  
                            (objToStringToNameMapping[objToString.call(item)] || 
                            objToString.call(item).match(OBJECT_CLASS_REGEX)[1].toLowerCase())
                    : typeof item;
            
            if (typeName === 'number' && isNaN(item)) {
                typeName = 'nan';
            }
            
            return (isAliasMode ? (nameToAliasMapping[typeName] || typeName) : typeName);
        }
        
        function type(item) {
            var typeName = (item === null) ? 'null'
                    : (typeof item === 'object' || typeof item === 'function') ?
                            (objToStringToNameMapping[objToString.call(item)] || 'object')
                    : typeof item;
            
            if (typeName === 'number' && isNaN(item)) {
                typeName = 'nan';
            }
            
            return (isAliasMode ? (nameToAliasMapping[typeName] || typeName) : typeName);
        }
        
        /**
         * Checks whether the specified item is of any of the specified types.
         */
        function isType(item, types) {
            var compositeType = (typeof types === 'number') ? (ANY_TYPE & types)
                    : (typeof types === 'string' && typeListStringToTypeIdCache[types] !== undefined) ?
                            typeListStringToTypeIdCache[types]
                    : (typeof types === 'function' && item instanceof types) ? types
                    : getCompositeType(types, item);
            
            return (typeof compositeType === 'function') ||     // Item is a specified instance type
                    !!(getBaseType(item, compositeType));
        }
    
        /**
         * Return the first of the types, if any, matches the type of the item.
         */
        function which(item, types) {
            types = (typeof types === 'string') ? types.split(typeDelimiterRegExp)
                    : (!Array.isArray(types) ? [types]
                    : types);
            
            var typeCount = types.length,
                typeIndex;
            
            for (typeIndex = 0; typeIndex < typeCount; typeIndex++) {
                if (isType(item, types[typeIndex])) {
                    return types[typeIndex];
                }
            }
            return typeToAliasMapping[NONE_TYPE];
        }
        
        /**
         * Returns the most specific available type for the specified item. 
         */
        function xtype(item) {
            return typeToAliasMapping[getBaseType(item)];
        }
    
        /**
         * Gets the derived type of the specified item.
         * @param eligibleTypesComposite The derived type 
         * composite whose member types filter the result.
         */
        function getBaseType(item, eligibleTypesComposite) {
            var itemSimpleType = (aliasToTypeMapping[type(item)] || NONE_TYPE);
            
            if ((itemSimpleType & DERIVED_TYPE) === 0) {
                // Not a derived type, so return eligible type immediately
                return (itemSimpleType & (eligibleTypesComposite !== undefined ? 
                        (ANY_TYPE & eligibleTypesComposite) : ANY_TYPE));
            }
            
            var derivedTypeComposite = (eligibleTypesComposite !== undefined ? 
                    (DERIVED_TYPE & eligibleTypesComposite) : DERIVED_TYPE);
            
            if (derivedTypeComposite === 0) {
                // No matching eligible derived type
                return 0;
            }
            
            var strLength,          // strings
                strTrimLength,
                arrElemCount,       // arrays
                objPropCount;       // objects
            
            // Determine base type from derived type
            switch (itemSimpleType) {
                
                case STRING: 
                    return ((strLength = item.length) && (strTrimLength = item.trim().length) && false) ? 0   // evaluate multi-use values only once
                        : ((EMPTY_STRING & derivedTypeComposite) && strLength === 0) ? EMPTY_STRING
                        : ((WHITESPACE & derivedTypeComposite) && strLength > 0 && strTrimLength === 0) ? WHITESPACE
                        : ((MULTI_CHAR_STRING & derivedTypeComposite) && strTrimLength > 1) ? MULTI_CHAR_STRING
                        : ((SINGLE_CHAR_STRING & derivedTypeComposite) && strTrimLength === 1) ? SINGLE_CHAR_STRING
                        : 0;
                
                case NUMBER:
                        // Use non-strict equality to handle primitive and boxed zero number
                    return ((ZERO & derivedTypeComposite) && item == 0) ? ZERO                  // jshint ignore:line                        
                        : ((NON_INFINITE_NUMBER & derivedTypeComposite) && isFinite(item)) ? (
                                ((INTEGER & derivedTypeComposite) && (item % 1) === 0) ? (
                                        ((POSITIVE_INTEGER & derivedTypeComposite) && item > 0) ? POSITIVE_INTEGER
                                        : ((NEGATIVE_INTEGER & derivedTypeComposite) && item < 0) ? NEGATIVE_INTEGER
                                        : 0)
                                : ((FLOAT & derivedTypeComposite) && (item % 1) !== 0) ? (
                                        ((POSITIVE_FLOAT & derivedTypeComposite) && item > 0) ? POSITIVE_FLOAT
                                        : ((NEGATIVE_FLOAT & derivedTypeComposite) && item < 0) ? NEGATIVE_FLOAT
                                        : 0)
                                : 0)
                        : ((INFINITE_NUMBER & derivedTypeComposite) && !isFinite(item)) ? (
                                ((POSITIVE_INFINITY & derivedTypeComposite) && item > 0) ? POSITIVE_INFINITY
                                : ((NEGATIVE_INFINITY & derivedTypeComposite) && item < 0) ? NEGATIVE_INFINITY
                                : 0)
                        : 0;
                
                case BOOLEAN:
                        // Use non-strict equality to handle primitive and boxed booleans
                    return ((TRUE & derivedTypeComposite) && (item == true)) ? TRUE             // jshint ignore:line
                        : ((FALSE & derivedTypeComposite) && (item == false)) ? FALSE           // jshint ignore:line
                        : 0;
                
                case ARRAY:
                    return ((arrElemCount = item.length) && false) ? 0   // evaluate multi-use values only once
                        : ((EMPTY_ARRAY & derivedTypeComposite) && arrElemCount === 0) ? EMPTY_ARRAY
                        : ((SINGLE_ELEM_ARRAY & derivedTypeComposite) && arrElemCount === 1) ? SINGLE_ELEM_ARRAY
                        : ((MULTI_ELEM_ARRAY & derivedTypeComposite) && arrElemCount > 1) ? MULTI_ELEM_ARRAY
                        : 0;
                
                case OBJECT:
                    return ((objPropCount = objKeys(item).length) && false) ? 0   // evaluate multi-use values only once
                        : ((EMPTY_OBJECT & derivedTypeComposite) && objPropCount === 0) ? EMPTY_OBJECT
                        : ((SINGLE_PROP_OBJECT & derivedTypeComposite) && objPropCount === 1) ? SINGLE_PROP_OBJECT
                        : ((MULTI_PROP_OBJECT & derivedTypeComposite) && objPropCount > 1) ? MULTI_PROP_OBJECT
                        : 0;
            }
            return 0;
        }
        
        /**
         * Gets the composite type consisting of the specified types.
         */
        function getCompositeType(types, item) {
            var typeString;
            
            if (typeof types === 'string') {    // uncached string
                typeString = types;
                types = types.split(typeDelimiterRegExp);
            } else if (!Array.isArray(types)) {
                return (typeof types === 'number') ? (ANY_TYPE & types)
                        : (typeof types === 'function' && item instanceof types) ? types
                        : 0;
            }
            
            var compositeType = 0,
                requestedType;
            
            for (var typeIndex = 0, typeCount = types.length; typeIndex < typeCount; typeIndex++) {
                requestedType = types[typeIndex];
                
                if (typeof requestedType === 'string') {
                    compositeType = (compositeType | (aliasToTypeMapping[requestedType] || 0));
                } else if (typeof requestedType === 'number') {
                    compositeType = (compositeType | (ANY_TYPE & requestedType));
                } else if (typeof requestedType === 'function' && (item instanceof requestedType)) {
                    return requestedType;
                }
            }
            
            if (typeString && (typeListStringToTypeIdCacheSize <= MAX_REQUEST_TYPE_CACHE_SIZE)) {
                typeListStringToTypeIdCache[typeString] = compositeType;
                typeListStringToTypeIdCacheSize++;
            }
            return compositeType;
        }
        
        function registerTypes (customTypes) {
            if (typeof customTypes !== 'object') {
                return;
            }
            var customTypeIds = [],
                existingCompactNames = [],
                customScheme = objCreate(null);        
            
            var customCompactNameScheme = (((arguments.length > 1) && (typeof arguments[1] === 'object')) ? arguments[1] : undefined);  // For deprecated second argument compact names obj. To be removed with next major release.
            
            if (compactNameMapping) {
                objKeys(compactNameMapping).forEach(function(typeName) {
                    existingCompactNames.push(compactNameMapping[typeName]);
                });
            }
            
            objKeys(customTypes).forEach(function(customTypeName) {
                var customTypeValue = customTypes[customTypeName],
                    customTypeId = (typeof customTypeValue === 'object' ? customTypeValue.typeId : customTypeValue),
                    compactName = (typeof customTypeValue === 'object' ? customTypeValue.compactName : undefined);
                
                compactName = (compactName || (customCompactNameScheme ? customCompactNameScheme[customTypeName] : undefined));  // For deprecated second argument compact names obj. To be removed with next major release.
                
                if (!/^([0-9a-z_]+)$/.test(customTypeName)) {
                    throw 'Type name must only contain lowercase alphanumeric characters and underscore';
                } else if ((typeof customTypeId !== 'number') || (customTypeId & ANY_TYPE) !== customTypeId) {
                    throw 'Custom type Id can only be derived using built-in types.';
                } else if (customTypeIds.indexOf(customTypeId) > -1 || (customTypeId in typeToAliasMapping)) {
                    throw 'Custom type Id "' + customTypeId + '" conflicts with new or existing type Id';
                } else if (customTypeName in TYPE_VALUE_MAPPING) {
                    throw 'Custom type name "' + customTypeName + '" conflicts with existing type name';
                }
                
                customTypeIds.push(customTypeId);
                
                var customType = objCreate(null);
                
                customType.typeId = customTypeId;
                
                if (compactNameMapping && (typeof compactName === 'string')) {
                    if (existingCompactNames.indexOf(compactName) > 0) {
                        throw 'Custom compact name "' + compactName + '" conflicts with new or existing name';
                    }
                    customType.compactName = compactName;
                    existingCompactNames.push(compactName);
                }
                customScheme[customTypeName] = customType;
            });
            
            objKeys(customScheme).forEach(function(customTypeName) {
                var customType = customScheme[customTypeName];
                
                TYPE_VALUE_MAPPING[customTypeName] = customType.typeId;
                
                if ('compactName' in customType) {
                    compactNameMapping[customTypeName] = customType.compactName;
                }
                defineType(customTypeName, moduleExport);
            });
            
            buildAliasMappings(nameToAliasMapping);
        }
        
        function registerNameScheme(schemeName, schemeAliases) {
            if (typeof schemeName !== 'string' || schemeName.trim().length === 0 || typeof schemeAliases !== 'object') {
                return;
            }        
            var trimSchemeName = schemeName.trim(),
                existingScheme = bundledNameSchemes[trimSchemeName],
                newScheme = objCreate(null);
            
            objKeys(schemeAliases).forEach(function(typeName) {
               newScheme[typeName] = schemeAliases[typeName];
            });
            
            bundledNameSchemes[trimSchemeName] = newScheme;        
            return existingScheme;
        }
        
        /*
         * -----------------
         * UTILITY FUNCTIONS
         * -----------------
         */
        
        /**
         * Builds an alias map using data in supplied value and alias mappings.
         */
        function buildAliasMappings(aliasMapping) {
            var typeAliasMapping = objCreate(null),
                aliasTypeMapping = objCreate(null),
                nameAliasMapping = objCreate(null),
                usedAliases = objCreate(null);
            
            objKeys(TYPE_VALUE_MAPPING).forEach(function(typeName) {
                var type = TYPE_VALUE_MAPPING[typeName];
                var aliasName = (aliasMapping ? aliasMapping[typeName] : typeName);
                aliasName = ((typeof aliasName === 'string' && aliasName.length > 0) ? aliasName : typeName);
                
                if (aliasName in usedAliases) {
                    throw new Error('Type name conflict: "' + aliasName + '" aliased to "' + 
                            typeName + '" and "' + usedAliases[aliasName] + '"');
                }
                typeAliasMapping[type] = aliasName;
                aliasTypeMapping[aliasName] = type;
                nameAliasMapping[typeName] = aliasName;
                
                usedAliases[aliasName] = typeName;
            });
            typeToAliasMapping = typeAliasMapping;
            aliasToTypeMapping = aliasTypeMapping;
            nameToAliasMapping = nameAliasMapping;
            
            isAliasMode = !!aliasMapping;        
            clearTypeListStringCache();
        }
        
        /**
         * Defines the typeId property and associated type check
         * and interface methods for the specified type.
         */
        function defineType(typeName, hostObj) {
            Object.defineProperty(hostObj, typeName.toUpperCase(), {
                value: TYPE_VALUE_MAPPING[typeName],
                enumerable: true,
                writable: false,
                configurable: false
            });
            
            var typeMethodName = getTypeMethodName(typeName);
            
            var typeCheckFunction = function(item) {
                return isType(item, TYPE_VALUE_MAPPING[typeName]);
            };
            
            hostObj[typeMethodName] = typeCheckFunction;
            
            hostObj.not = (hostObj.not || objCreate(null));
            hostObj.not[typeMethodName] = function(value) {
                return !typeCheckFunction(value);
            };
            
            hostObj.any = (hostObj.any || objCreate(null));
            hostObj.any[typeMethodName] = getInterfaceFunction(typeCheckFunction, true, undefined, true);
            
            hostObj.all = (hostObj.all || objCreate(null));
            hostObj.all[typeMethodName] = getInterfaceFunction(typeCheckFunction, undefined, true, false);
            
            hostObj.some = (hostObj.some || objCreate(null));
            hostObj.some[typeMethodName] = getInterfaceFunction(typeCheckFunction, true, true, true);
            
            hostObj.none = (hostObj.none || objCreate(null));
            hostObj.none[typeMethodName] = getInterfaceFunction(typeCheckFunction, true, undefined, false);
        }
        
        /**
         * Clears the memoization cache of type list strings used in requests.
         */
        function clearTypeListStringCache() {
            typeListStringToTypeIdCache = objCreate(null);
            typeListStringToTypeIdCacheSize = 0;
        }
        
        /**
         * Gets the name to be used for the type-matching 
         * method name for the specified type.
         */
        function getTypeMethodName(typeName) { 
            var capitalizedTypeName = typeName.toLowerCase().replace(/(^|_)(.)/g, function(match, camelPrefix, camelChar) {
                return camelChar.toUpperCase();
            });
            return 'is' + capitalizedTypeName;
        }
        
        /**
         * Creates an interface function using the specified parameters.
         */
        function getInterfaceFunction(delegateFunction, trueCondition, falseCondition, terminationResult) {
            return function(values) {
                values = (arguments.length > 1 ? Array.prototype.slice.call(arguments)
                        : Array.isArray(values) ? values
                        : [values]);
    
                var trueResult = false,
                    falseResult = false,
                    valueIndex;
                
                for (valueIndex = 0; valueIndex < values.length; valueIndex++) {
                    if (delegateFunction(values[valueIndex])) {
                        trueResult = true;
                    } else {
                        falseResult = true;
                    }
                    if ((trueCondition === undefined || trueResult === trueCondition) && 
                            (falseCondition === undefined || falseResult === falseCondition)) {
                        return terminationResult;
                    }
                }
                return !terminationResult;
            };
        }
        
        function capitalize(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }
        
        /*
         * ------------
         * UTIL METHODS
         * ------------
         */
        
        /**
         * Returns the associated type Id for the specified type name.
         */
        function nameToId(type) {
            return (typeof type === 'function' ? type                                       // instance type
                    : typeof type === 'string' ? (aliasToTypeMapping[type] || NONE_TYPE)    // type name
                    : NONE_TYPE);                                                           // invalid type
        }
        
        /**
         * Returns the associated name for the specified type Id.
         */
        function idToName(type) {
            return (typeof type === 'function' ? type
                    : typeof type === 'number' ? (typeToAliasMapping[type] || typeToAliasMapping[NONE_TYPE])
                    : typeToAliasMapping[NONE_TYPE]);
        }
        
        /**
         * Returns a list of the names of all types.
         */
        function typeNames() {
            return objKeys(aliasToTypeMapping);
        }
        
        /**
         * Returns a list of the type ids of all types.
         */
        function typeIds() {
            var typeIdList = [];
            
            objKeys(aliasToTypeMapping).forEach(function(alias) {
                typeIdList.push(aliasToTypeMapping[alias]);
            });
            return typeIdList;
        }
        
        /*
         * --------------
         * OPTIONS MODULE
         * --------------
         */
        
        optionsModule.setDelimiterPattern = function(delimiterPattern) {
            delimiterPattern = ((delimiterPattern === null || delimiterPattern === undefined || delimiterPattern === '') ? 
                    TYPE_DELIMITER_DEFAULT_PATTERN : delimiterPattern);
            
            if (typeof delimiterPattern !== 'string') {
                return;
            }
            delimiterPattern = ('[ ]*' + delimiterPattern + '[ ]*');
            
            if (delimiterPattern === typeDelimiterRegExp.source) {
                return;
            }
            
            typeDelimiterRegExp = new RegExp(delimiterPattern, 'g');
            clearTypeListStringCache();
        };
        
        optionsModule.setNameScheme = function(nameScheme) {
            if (nameScheme === undefined || nameScheme === NAME_SCHEME_DEFAULT_OPTION_VALUE) {
                buildAliasMappings();
                return;
            }
            if (typeof nameScheme === 'string' && (nameScheme in bundledNameSchemes)) {
                nameScheme = (bundledNameSchemes[nameScheme]);
            }
            if (typeof nameScheme === 'object') {
                buildAliasMappings(nameScheme);
            }
        };
        
        optionsModule.set = function(options) {
            if (typeof options !== 'object') {
                return;
            }
            objKeys(options).forEach(function(optionName) {
                var optionMethod = optionsModule['set' + capitalize(optionName)];
                
                if (typeof optionMethod === 'function') {
                    optionMethod(options[optionName]);
                }
            });
        };
        
        /*
         * ---------------------
         * MODULE SETUP / EXPORT
         * ---------------------
         */
        
        moduleExport = xtype;
        
        init(moduleExport);
        
        moduleExport.type = type;
        moduleExport.typeOf = typeOf;
        moduleExport.which = which;
        moduleExport.is = isType;
        
        moduleExport.typeIds = typeIds;
        moduleExport.typeNames = typeNames;
        moduleExport.nameToId = nameToId;
        moduleExport.idToName = idToName;
        
        moduleExport.options = optionsModule;
        moduleExport.registerTypes = registerTypes;
        moduleExport.registerNameScheme = registerNameScheme;
        
        moduleExport.setOptions = optionsModule.set;    // Deprecated. To be removed with next major release.
        
        return moduleExport;
    }
    
    
    /*
     * Export module
     */
    var LIB_NAME = 'xtype',
        moduleExport = newModule();
    
    
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = moduleExport;
        }
    } else if (typeof define === 'function' && define.amd) {
        define(function() {
            return moduleExport;
        });
    } else {
        moduleExport.noConflict = (function(previouslyDefinedValue) {
            return function() {
                root[LIB_NAME] = previouslyDefinedValue;
                delete moduleExport.noConflict;
                return moduleExport;
            };
        })(root[LIB_NAME]);
        
        root[LIB_NAME] = moduleExport;
    }
    
})(this);
},{}],20:[function(require,module,exports){
var obj = {
  // issue #2 and going forward
  Encoder: require('lib/same'),
  Writer: require('lib/writer'),
  Values: require('lib/fixtures/same')
};

// back compat for all my no users :)
obj.SAME = obj.Encoder;

module.exports = obj;

},{"lib/fixtures/same":10,"lib/same":13,"lib/writer":16}]},{},[20])(20)
});