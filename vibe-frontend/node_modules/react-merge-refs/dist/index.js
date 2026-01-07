
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./react-merge-refs.cjs.production.min.js')
} else {
  module.exports = require('./react-merge-refs.cjs.development.js')
}
