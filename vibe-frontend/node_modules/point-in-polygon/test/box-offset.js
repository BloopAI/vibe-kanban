var test = require('tape');
var inside = require('../');

test('nested box with offsets', function (t) {
    var polygon = [ [100,101],[102,103], [ 1, 1 ], [ 1, 2 ], [ 2, 2 ], [ 2, 1 ], [200,201] ];
    t.ok(inside([ 1.5, 1.5 ], polygon, 2, 6));
    t.ok(inside([ 1.2, 1.9 ], polygon, 2, 6));
    t.ok(!inside([ 0, 1.9 ], polygon, 2, 6));
    t.ok(!inside([ 1.5, 2 ], polygon, 2, 6));
    t.ok(!inside([ 1.5, 2.2 ], polygon, 2, 6));
    t.ok(!inside([ 3, 5 ], polygon, 2, 6));
    t.end();
});

test('nested flag with offsets', function (t) {
    var polygon = [ [100,101], [ 1, 1 ], [ 10, 1 ], [ 5, 5 ], [ 10, 10 ], [ 1, 10 ] ];
    t.ok(inside([ 2, 5 ], polygon, 1));
    t.ok(inside([ 3, 5 ], polygon, 1));
    t.ok(inside([ 4, 5 ], polygon, 1));
    t.ok(!inside([ 10, 5 ], polygon, 1));
    t.ok(!inside([ 11, 5 ], polygon, 1));
    t.ok(!inside([ 9, 5 ], polygon, 1));
    t.end();
});
