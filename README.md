# same-encoder: Isomorphic SAME header and footer encoding

<a href="https://travis-ci.org/aaron-em/same-encoder"><img src="https://api.travis-ci.org/aaron-em/same-encoder.png" /></a>
<a href="https://npmjs.com/package/same-encoder"><img src="https://img.shields.io/npm/v/same-encoder.png" /></a>
<a href="http://bower.io/search/?q%3Dsame-encoder"><img src="https://img.shields.io/bower/v/same-encoder.png" /></a>

# What?

Wikipedia: "[Specific Area Message Encoding](https://en.wikipedia.org/wiki/Specific_Area_Message_Encoding) is the protocol used to encode the [Emergency Alert System](https://en.wikipedia.org/wiki/Emergency_Alert_System) (EAS) and [NOAA Weather Radio](https://en.wikipedia.org/wiki/NOAA_Weather_Radio_All_Hazards) (NWR) in the U.S. and [Weatheradio Canada](https://en.wikipedia.org/wiki/Weatheradio_Canada) in Canada."

In EAS and NWR transmissions, SAME-encoded data is presented as a pair of AFSK data bursts, one a message header encoding the essentials of the alert, the other a message footer which indicates only the end of the transmission. This library encodes EAS header and footer message bursts as LPCM audio data in a RIFF WAVE container. Also provided are output modules for Node.js (emitting a .wav file) and browser environments (emitting an <audio> element).

Want a taste? [Here](https://aaron-m.com/2017/07/08/same-encoder-example).

# Why?

EAS, and its predecessor the Emergency Broadcast System, have a small and slightly creepy place in the hearts of a lot of North Americans. Many of us remember, as small children, being frightened by the alien-sounding tones of an EBS test message as broadcast over television or radio; the deliberately unpleasant [attention tone](https://upload.wikimedia.org/wikipedia/commons/1/1d/Emergency_Alert_System_Attention_Signal_20s.ogg), in particular, scared the willies out of a lot of us, back when we were kids.

Probably for this very reason, fake EAS messages have a small but thriving place in audiovisual media. You tend to find them in "end of the world" or disaster shows, where they lend verisimilitude and tension, and there seems also to be an enduring subculture around [mock EAS/EBS messages](https://www.youtube.com/results?search_query%3Demergency%2Bbroadcast%2Bsystem).

Running across some of those mock messages on Youtube refreshed my childhood memories of EBS messages on TV, and I thought it'd be interesting to look at them with the benefit of more years. In doing so, I found the SAME protocol to be surprisingly simple, and implementing an encoder for it seemed like a diverting exercise, so I did that. Making it isomorphic also seemed like fun, so I did that too.

(Eventually, I plan to combine this encoder with [a speech synthesizer](http://www.masswerk.at/mespeak/) to produce a tool that can turn a text specification into a complete audio EAS message. Watch this space for updates.)

# How?

## Quick start

For the server side, this is an NPM package; for the client, it's a Bower package, too. Install it with the appropriate tool for the environment where you plan to use it.

In the [examples/](https://github.com/aaron-em/same-encoder/tree/master/examples/) directory, you'll find minimal examples for both server (Node.js) and client (browser) environments. They should be enough to get you up and running at a "hello world!" level. You can run these examples via Grunt: `grunt demo:server` will produce a file named `output.wav` in your current directory, and `grunt demo:client` will spin up a demo server at <http://localhost:3000/> with a minimal example of client-side library usage.

For more details, read on.

## Server side usage

As far as code goes, there's nothing to it that isn't in [the server-side example](https://github.com/aaron-em/same-encoder/blob/master/examples/server.js). See below for details of acceptable message formats.

## Client side usage, Bower style

Install the library with

    bower install same-encoder

and reference it in your HTML, client-side bundling/minificaton tools, etc. For example:

    <script src="bower_components/same-encoder/bundle/SAME.js"></script>

The client bundle exposes the same interface as the server-side package, and will work with whatever module loader you're using &#x2013; or none, in which case it'll hang itself off `window.SAME`.

## Client side usage, retro style

If you want to use this library in the browser, but don't want to deal with Bower, that's fine too. Just drop the contents of the [bundle/](https://github.com/aaron-em/same-encoder/tree/master/bundle/) directory into your site, then pull them in with `<script>` tags like usual; they'll hang themselves off the `window` global. (Take a look at [the client-side example](https://github.com/aaron-em/same-encoder/blob/master/examples/client/index.html) for a clue on how to use them when they're referenced this way.)

## Message format

Here's an example of what a SAME message looks like, in the format which the encoder expects to receive:

    {
      originator: 'PEP',
      sender: 'WHITEHSE',
      code: 'EAN',
      region: {
        // note that these are strings
        subdiv: '0',
        stateCode: '00',
        countyCode: '000'
      },
      // note that these are numbers
      length: 600,  // message applicability period (NOT event length!) as HHMM
      start: {      // message applicability period begins:
        day: 123,   // on this Julian day
        hour: 5,    // at this UTC hour
        minute: 30  // and this UTC minute
      }
    };

### Format details

The SAME protocol is defined in [the United States Code of Federal Regulations, Title 17, Volume 1, Part 11, Section 31](http://www.gpo.gov/fdsys/pkg/CFR-2010-title47-vol1/pdf/CFR-2010-title47-vol1-part11.pdf), and the message format is defined beginning with paragraph C. Very surprisingly given its provenance, I found it quite clear, concise, and unambiguous with regard to the protocol requirements; it doesn't quite read as readily as a good RFC, but it's far better than a bad one.

You are *strongly encouraged* to read §11.31 yourself, in order to gain an understanding of the message format details; the encoder library includes a validator which will do a lot to keep you from producing invalid SAME headers, but it's not quite perfect (see the "Bugs" section, below).

In lieu of (or in addition to) §11.31, you can take a look at the contents of [lib/fixtures](https://github.com/aaron-em/same-encoder/tree/master/lib/fixtures), in which are defined all the acceptable values for most of the message fields.

You're also encouraged, if somewhat less strongly, to take a quick pass through Part 11 in general, to get a better idea of how the EAS infrastructure works and what the `originator` values mean. If you just want to generate plausible-sounding beeps and boops, then you don't need to know any of that, but if you want those beeps and boops to encode plausible message data, it's worth a look.

### Validation

All the fields listed in [lib/fixtures/same.js](https://github.com/aaron-em/same-encoder/blob/master/lib/fixtures/same.js) will be checked against the values enumerated there.

The state and county code values will be checked to confirm that the given state contains the given county. Also, passing a county code without a state code will fail validation.

(Note that both state and county codes can be given as 0, which is treated as "all" &#x2013; i.e. a state code of 0 means all states in the US, and a county code of 0 means all counties in the given state. Giving a state code of 0 requires also giving a county code of 0.)

The `length` field has some special constraints:
-   It may be 0, which tells the receiver to purge the message immediately (treat it as no longer active).
-   If less than or equal to one hour, it must be given as a 15-minute increment (i.e. 0015, 0030, 0045, 0100).
-   If over one hour, it must be given as a 30-minute increment (i.e. 0130, 0200, &#x2026;)

The `sender` field will be checked for length of exactly 8 characters.

Validation errors, if they occur, will be collected and emitted as a single exception.

## Encoder and writers

Calling `SAME.encode(message)` (with a valid message object; see below) returns a string of raw binary LPCM audio data in a RIFF WAVE container, ready to be written directly into a valid `.wav` file or base64-encoded for use in a browser.

The writers provided with this library are essentially convenience wrappers around both those capabilities. When `lib/writer.js` is loaded, it looks at the environment to find out whether it's running in Node or the browser, and loads the appropriate writer module accordingly. (If it can't determine the environment, it throws.)

If you don't want to use a convenience writer, you can just take the return value of `SAME.encode` and use it directly. In Node, you'll want to be careful of character encoding issues that might mangle the data; see [lib/writers/node.js](https://github.com/aaron-em/same-encoder/blob/master/lib/writers/node.js) for an example of how to handle the raw binary data safely.

# Development

### The writer interface

A writer function has the following signature:

    function writer(wavFile, target)

`wavFile` is raw data as returned from `SAME.encode`.

`target` is some sort of reference to where the writer should produce output. Its interpretation is totally dependent on the specific writer in use.

### The provided writers

**[The Node writer](https://github.com/aaron-em/same-encoder/blob/master/lib/writers/node.js)** produces a .wav file. Its `target` value is a valid file path. **Use caution!** It does no sanity checking, and will blithely overwrite an existing file.

**[The browser writer](https://github.com/aaron-em/same-encoder/blob/master/lib/writers/browser.js)** produces an HTML5 <audio> element whose content source is a data: URI containing the base64-encoded audio data. Its `target` value is a CSS selector, suitable for passing to `document.querySelector()`, identifying the element to which the writer should append its player.

### Writing your own writer

Add it to [lib/writers/](https://github.com/aaron-em/same-encoder/tree/master/lib/writers), in a file which exports a single function implementing the interface described above. 

Extend [lib/writer.js](https://github.com/aaron-em/same-encoder/blob/master/lib/writer.js) to load your new writer in the environment where it should be used.

Then you can call your new writer via `sameEncoder.Writer.write`, just as you would one of the stock writers.

### Testing

There's a pretty complete unit test suite included. Run it with `grunt test`; run a coverage report with `grunt cover`.

Pull requests containing code not covered by unit tests will be rejected with no consideration beyond advice to add test coverage.

There are as yet no functional tests; as yet, I haven't been able to find a software SAME decoder which doesn't need to be plugged into a radio to work. When I find such a creature that takes a stream of raw audio data and spits out an ASCII string, I'll be able to write functional tests against it, but right now it's sort of low priority.

### Bundling

Once you've made your changes and added tests to cover them, don't forget to update the browser bundles with `grunt browserify`.

# Et cetera

In the `etc/` directory are scripts to regenerate the fixtures used by the library and by its test suite. You shouldn't have to run them any more often than the EAS protocol definition changes, and I don't think that happens too often.
