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
        command: 'browserify index.js -s SAME -o bundle/SAME.js'
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

  grunt.registerTask('browserify', 'Bundle the library for browsers',
                     ['shell:browserify']);
  
  grunt.registerTask('demo:client', 'Run the client-side demo server',
                     ['browserify', 'shell:clientDemo']);
  grunt.registerTask('demo:server', 'Run the server-side demo',
                     ['shell:serverDemo']);

  grunt.registerTask('test', 'Run unit tests',
                     ['shell:testUnit']);
  grunt.registerTask('cover', 'Run unit tests + coverage report',
                     ['mocha_istanbul:coverage']);
};
