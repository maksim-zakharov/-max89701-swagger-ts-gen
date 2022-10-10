#! /usr/bin/env node

const genV3 = require("./generators/generateSwaggerV3");
const genV2 = require("./generators/generateSwaggerV2");

const versionIndex = process.argv.indexOf("-v") + 1;
const version = process.argv[versionIndex];

if (!versionIndex || version === "3") {
  genV3();
} else {
  genV2();
}
