var test = require('tape');
var inside = require('../');

test('flat box', function (t) {
    var polygon = [ 1, 1, 1, 2, 2, 2, 2, 1 ];
    t.ok(inside([ 1.5, 1.5 ], polygon));
    t.ok(inside([ 1.2, 1.9 ], polygon));
    t.ok(!inside([ 0, 1.9 ], polygon));
    t.ok(!inside([ 1.5, 2 ], polygon));
    t.ok(!inside([ 1.5, 2.2 ], polygon));
    t.ok(!inside([ 3, 5 ], polygon));
    t.end();
});

test('flat flag', function (t) {
    var polygon = [ 1, 1, 10, 1, 5, 5, 10, 10, 1, 10 ];
    t.ok(inside([ 2, 5 ], polygon));
    t.ok(inside([ 3, 5 ], polygon));
    t.ok(inside([ 4, 5 ], polygon));
    t.ok(!inside([ 10, 5 ], polygon));
    t.ok(!inside([ 11, 5 ], polygon));
    t.ok(!inside([ 9, 5 ], polygon));
    t.end();
});
