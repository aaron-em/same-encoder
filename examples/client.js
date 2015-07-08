var express = require('express')
  , app = express();

app.use(express['static']('examples/client/'));
app.listen(3000, function() {
  console.log('SAME encoder dev server listening on http://localhost:3000/');
});
