"use strict";

if (process.env.NODE_ENV === "production") {
  module.exports = require("./dist/cjs/index.production");
} else {
  module.exports = require("./dist/cjs/index.development");
}
