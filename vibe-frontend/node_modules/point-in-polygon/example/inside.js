var pointInPolygon = require('../');
var polygon = [ [ 1, 1 ], [ 1, 2 ], [ 2, 2 ], [ 2, 1 ] ];

console.log(pointInPolygon([ 1.5, 1.5 ], polygon)); // true
console.log(pointInPolygon([ 4.9, 1.2 ], polygon)); // false
console.log(pointInPolygon([ 1.8, 1.1 ], polygon)); // true
