# point-in-polygon

Determine if a point is inside of a polygon.

This module casts a semi-infinite ray from the inquiry point and counts intersections,
based on
[this algorithm](https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html).

If you need a numerically robust solution and are willing to trade some performance for it,
use [robust-point-in-polygon](https://github.com/mikolalysenko/robust-point-in-polygon).

# example

``` js
var pointInPolygon = require('point-in-polygon');
var polygon = [ [ 1, 1 ], [ 1, 2 ], [ 2, 2 ], [ 2, 1 ] ];

console.log(pointInPolygon([ 1.5, 1.5 ], polygon)); // true
console.log(pointInPolygon([ 4.9, 1.2 ], polygon)); // false
console.log(pointInPolygon([ 1.8, 1.1 ], polygon)); // true
```

# methods

``` js
var pointInPolygon = require('point-in-polygon')
var pointInPolygonFlat = require('point-in-polygon/flat')
var pointInPolygonNested = require('point-in-polygon/nested')
```

## pointInPolygon(point, polygon, start=0, end=polygon.length)

Return whether `point` is contained in `polygon`.

* `point` should be a 2-item array of coordinates
* `polygon` should be an array of 2-item arrays of coordinates or a flat array of coordinates
* `start` is an offset into `polygon`. default `0`
* `end` is an offset into `polygon`. default `polygon.length`

The flat or nested is detected automatically. Or you can use the specific methods if you want to
skip the check.

# install

```
npm install point-in-polygon
```

# license

MIT
