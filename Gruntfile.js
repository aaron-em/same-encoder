var grunt = require('grunt');

module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-mocha-istanbul');
  
  grunt.initConfig({
    shell: {
      serverDemo: {
        command: 'node examples/server.js'
      },

      clientDemo: {
        command: 'node examples/client.js'
      },

      testUnit: {
        command: 'node_modules/.bin/mocha test/unit/*.spec.js test/unit/**/*.spec.js'
      },

      browserify: {
        command: [
          'browserify lib/same.js -s SAME -o bundle/SAME.js',
          'browserify lib/fixtures/same.js -s SAMEValues -o bundle/SAMEValues.js',
          'browserify lib/writer.js -s Writer -o bundle/Writer.js'
        ].join('&')
      }
    },

    mocha_istanbul: {
      coverage: {
        src: 'test/unit',
        options: {
          coverageFolder: 'test/reports/',
          mask: '*.spec.js'
        }
      }
    }
  });

  grunt.registerTask('browserify', ['shell:browserify']);
  
  grunt.registerTask('demo:client',
                     ['browserify', 'shell:clientDemo']);

  grunt.registerTask('demo:server',
                     ['shell:serverDemo']);

  grunt.registerTask('test', ['shell:testUnit']);
  grunt.registerTask('cover', ['mocha_istanbul:coverage']);
};
