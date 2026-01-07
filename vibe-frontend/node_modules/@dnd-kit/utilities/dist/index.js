
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./utilities.cjs.production.min.js')
} else {
  module.exports = require('./utilities.cjs.development.js')
}
