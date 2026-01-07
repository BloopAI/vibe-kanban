var test = require('tape');
var pointInPolygon = require('../');

test('flat box with offsets', function (t) {
    var polygon = [ 100, 101, 102, 1, 1, 1, 2, 2, 2, 2, 1, 500, 501, 502, 503 ];
    t.ok(pointInPolygon([ 1.5, 1.5 ], polygon, 3, 11));
    t.ok(pointInPolygon([ 1.2, 1.9 ], polygon, 3, 11));
    t.ok(!pointInPolygon([ 0, 1.9 ], polygon, 3, 11));
    t.ok(!pointInPolygon([ 1.5, 2 ], polygon, 3, 11));
    t.ok(!pointInPolygon([ 1.5, 2.2 ], polygon, 3, 11));
    t.ok(!pointInPolygon([ 3, 5 ], polygon, 3, 11));
    t.end();
});

test('flat flag with offsets', function (t) {
    var polygon = [ 101, 102, 1, 1, 10, 1, 5, 5, 10, 10, 1, 10, 500 ];
    t.ok(pointInPolygon([ 2, 5 ], polygon, 2, 12));
    t.ok(pointInPolygon([ 3, 5 ], polygon, 2, 12));
    t.ok(pointInPolygon([ 4, 5 ], polygon, 2, 12));
    t.ok(!pointInPolygon([ 10, 5 ], polygon, 2, 12));
    t.ok(!pointInPolygon([ 11, 5 ], polygon, 2, 12));
    t.ok(!pointInPolygon([ 9, 5 ], polygon, 2, 12));
    t.end();
});
