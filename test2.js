const xlsx = require('node-xlsx');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');

async function parseExcel(filePath) {
  let excelObj = xlsx.parse( path.join(__dirname, filePath)); // parses a file 
  //console.log(excelObj);
  console.log("excelObj.length = " + excelObj.length);
  let urls = []; // 产品 url 列表

  for (let ei = 0; ei < excelObj.length; ei++) {
    let sheet = excelObj[ei];
    let sheetName = sheet.name;
    let sheetData = sheet.data;
    console.log(sheetName);
    var rowCount = sheetData.length;
    for (let i = 1; i < rowCount; i++) {
      let rowData = sheetData[i];
      urls.push(rowData[0]);
    }
  }
  console.log("urls count = " + urls.length);
  console.log(urls);
  
}

// parseExcel('./inputExcels/input-1.xlsx');

async function exportExcel() {
  const data = [
    [100001007, 'sanitary-napkin']
  ];
  var buffer = xlsx.build([{name: "Sheet1", data: data}]); // Returns a buffer
  var random = Math.floor(Math.random()*10000+0);

  var uploadDir = './outputExcels/';
  var filePath = uploadDir + 'output-' + random + ".xlsx";

  fs.writeFile(filePath, buffer, 'binary',function(err){
    if(err){
      console.log(err);
    }
  });
}
exportExcel();