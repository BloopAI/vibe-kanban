var pointInPolygonFlat = require('./flat.js')
var pointInPolygonNested = require('./nested.js')

module.exports = function pointInPolygon (point, vs, start, end) {
    if (vs.length > 0 && Array.isArray(vs[0])) {
        return pointInPolygonNested(point, vs, start, end);
    } else {
        return pointInPolygonFlat(point, vs, start, end);
    }
}
module.exports.nested = pointInPolygonNested
module.exports.flat = pointInPolygonFlat
