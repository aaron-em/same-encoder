var fs = require('fs');
var csv = require('csv');
var request = require('request');
var source = 'http://www2.census.gov/geo/docs/reference/codes/files/national_county.txt';
var stateJson = 'lib/fixtures/state.json';
var countyJson = 'lib/fixtures/county.json';

console.log('Fetching ' + source);
request({
  method: 'GET',
  uri: source
}, function(error, response, body) {
  var counties = {};
  var states = {};
  var parser = csv.parse();
  
  if (error) {
    console.log('Error requesting source: ' + error.message);
    process.exit(1);
  } else if (response.statusCode < 200 || response.statusCode > 299) {
    console.log('HTTP mishap requesting source: status ' + response.statusCode);
    process.exit(1);
  } else {
    parser.on('readable', function() {
      var row;
      while( (row = parser.read()) ) {
        if (typeof states[row[1]] === 'undefined') {
          states[row[1]] = row[0];
        }
        
        counties[row[1]] = counties[row[1]] || {};
        counties[row[1]][row[2]] = row[3];
      }
    });

    parser.on('end', function() {
      fs.writeFileSync(stateJson,
                      JSON.stringify(states, false, 2));
      fs.writeFileSync(countyJson,
                      JSON.stringify(counties, false, 2));
    });

    parser.write(body);
    parser.end();
  }
});
