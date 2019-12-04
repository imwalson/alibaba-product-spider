// Get the yargs resource
var yargs = require('yargs').argv;

/*
	yargs = {
		key1: value1
		key2: value2
	};
*/

function getArgPath() {
  return yargs['path'] || '';
}

function run() {
  var filePath = getArgPath();
  console.log(filePath);
}
run();

// node test3.js --path='./inputExcels/input-1.xlsx'