
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./accessibility.cjs.production.min.js')
} else {
  module.exports = require('./accessibility.cjs.development.js')
}
