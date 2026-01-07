import { jsx as G, jsxs as Ut, Fragment as ao } from "react/jsx-runtime";
import E, { createElement as $t } from "react";
import fo from "react-dom";
const ve = 0, At = 1, Jt = 2, zn = 4;
function un(t) {
  return () => t;
}
function mo(t) {
  t();
}
function se(t, e) {
  return (n) => t(e(n));
}
function an(t, e) {
  return () => t(e);
}
function po(t, e) {
  return (n) => t(e, n);
}
function Ae(t) {
  return t !== void 0;
}
function ho(...t) {
  return () => {
    t.map(mo);
  };
}
function Qt() {
}
function ye(t, e) {
  return e(t), t;
}
function go(t, e) {
  return e(t);
}
function tt(...t) {
  return t;
}
function Y(t, e) {
  return t(At, e);
}
function D(t, e) {
  t(ve, e);
}
function We(t) {
  t(Jt);
}
function rt(t) {
  return t(zn);
}
function F(t, e) {
  return Y(t, po(e, ve));
}
function Et(t, e) {
  const n = t(At, (o) => {
    n(), e(o);
  });
  return n;
}
function dn(t) {
  let e, n;
  return (o) => (r) => {
    e = r, n && clearTimeout(n), n = setTimeout(() => {
      o(e);
    }, t);
  };
}
function On(t, e) {
  return t === e;
}
function J(t = On) {
  let e;
  return (n) => (o) => {
    t(e, o) || (e = o, n(o));
  };
}
function P(t) {
  return (e) => (n) => {
    t(n) && e(n);
  };
}
function k(t) {
  return (e) => se(e, t);
}
function Ft(t) {
  return (e) => () => {
    e(t);
  };
}
function x(t, ...e) {
  const n = Io(...e);
  return ((o, r) => {
    switch (o) {
      case Jt:
        We(t);
        return;
      case At:
        return Y(t, n(r));
    }
  });
}
function Lt(t, e) {
  return (n) => (o) => {
    n(e = t(e, o));
  };
}
function Kt(t) {
  return (e) => (n) => {
    t > 0 ? t-- : e(n);
  };
}
function Gt(t) {
  let e = null, n;
  return (o) => (r) => {
    e = r, !n && (n = setTimeout(() => {
      n = void 0, o(e);
    }, t));
  };
}
function $(...t) {
  const e = new Array(t.length);
  let n = 0, o = null;
  const r = Math.pow(2, t.length) - 1;
  return t.forEach((s, i) => {
    const l = Math.pow(2, i);
    Y(s, (u) => {
      const d = n;
      n = n | l, e[i] = u, d !== r && n === r && o && (o(), o = null);
    });
  }), (s) => (i) => {
    const l = () => {
      s([i].concat(e));
    };
    n === r ? l() : o = l;
  };
}
function Io(...t) {
  return (e) => t.reduceRight(go, e);
}
function xo(t) {
  let e, n;
  const o = () => e == null ? void 0 : e();
  return function(r, s) {
    switch (r) {
      case At:
        return s ? n === s ? void 0 : (o(), n = s, e = Y(t, s), e) : (o(), Qt);
      case Jt:
        o(), n = null;
        return;
    }
  };
}
function C(t) {
  let e = t;
  const n = U();
  return ((o, r) => {
    switch (o) {
      case ve:
        e = r;
        break;
      case At: {
        r(e);
        break;
      }
      case zn:
        return e;
    }
    return n(o, r);
  });
}
function ht(t, e) {
  return ye(C(e), (n) => F(t, n));
}
function U() {
  const t = [];
  return ((e, n) => {
    switch (e) {
      case ve:
        t.slice().forEach((o) => {
          o(n);
        });
        return;
      case Jt:
        t.splice(0, t.length);
        return;
      case At:
        return t.push(n), () => {
          const o = t.indexOf(n);
          o > -1 && t.splice(o, 1);
        };
    }
  });
}
function bt(t) {
  return ye(U(), (e) => F(t, e));
}
function K(t, e = [], { singleton: n } = { singleton: !0 }) {
  return {
    constructor: t,
    dependencies: e,
    id: So(),
    singleton: n
  };
}
const So = () => Symbol();
function To(t) {
  const e = /* @__PURE__ */ new Map(), n = ({ constructor: o, dependencies: r, id: s, singleton: i }) => {
    if (i && e.has(s))
      return e.get(s);
    const l = o(r.map((u) => n(u)));
    return i && e.set(s, l), l;
  };
  return n(t);
}
function ut(...t) {
  const e = U(), n = new Array(t.length);
  let o = 0;
  const r = Math.pow(2, t.length) - 1;
  return t.forEach((s, i) => {
    const l = Math.pow(2, i);
    Y(s, (u) => {
      n[i] = u, o = o | l, o === r && D(e, n);
    });
  }), function(s, i) {
    switch (s) {
      case Jt: {
        We(e);
        return;
      }
      case At:
        return o === r && i(n), Y(e, i);
    }
  };
}
function V(t, e = On) {
  return x(t, J(e));
}
function Fe(...t) {
  return function(e, n) {
    switch (e) {
      case Jt:
        return;
      case At:
        return ho(...t.map((o) => Y(o, n)));
    }
  };
}
var Ct = /* @__PURE__ */ ((t) => (t[t.DEBUG = 0] = "DEBUG", t[t.INFO = 1] = "INFO", t[t.WARN = 2] = "WARN", t[t.ERROR = 3] = "ERROR", t))(Ct || {});
const Co = {
  0: "debug",
  3: "error",
  1: "log",
  2: "warn"
}, wo = () => typeof globalThis > "u" ? window : globalThis, Wt = K(
  () => {
    const t = C(
      3
      /* ERROR */
    );
    return {
      log: C((n, o, r = 1) => {
        var i;
        const s = (i = wo().VIRTUOSO_LOG_LEVEL) != null ? i : rt(t);
        r >= s && console[Co[r]](
          "%creact-virtuoso: %c%s %o",
          "color: #0253b3; font-weight: bold",
          "color: initial",
          n,
          o
        );
      }),
      logLevel: t
    };
  },
  [],
  { singleton: !0 }
);
function Vt(t, e, n) {
  return _e(t, e, n).callbackRef;
}
function _e(t, e, n) {
  const o = E.useRef(null);
  let r = (i) => {
  };
  const s = E.useMemo(() => typeof ResizeObserver < "u" ? new ResizeObserver((i) => {
    const l = () => {
      const u = i[0].target;
      u.offsetParent !== null && t(u);
    };
    n ? l() : requestAnimationFrame(l);
  }) : null, [t, n]);
  return r = (i) => {
    i && e ? (s == null || s.observe(i), o.current = i) : (o.current && (s == null || s.unobserve(o.current)), o.current = null);
  }, { callbackRef: r, ref: o };
}
function Fn(t, e, n, o, r, s, i, l, u) {
  const d = E.useCallback(
    (m) => {
      const S = vo(m.children, e, l ? "offsetWidth" : "offsetHeight", r);
      let h = m.parentElement;
      for (; !h.dataset.virtuosoScroller; )
        h = h.parentElement;
      const T = h.lastElementChild.dataset.viewportType === "window";
      let w;
      T && (w = h.ownerDocument.defaultView);
      const R = i ? l ? i.scrollLeft : i.scrollTop : T ? l ? w.scrollX || w.document.documentElement.scrollLeft : w.scrollY || w.document.documentElement.scrollTop : l ? h.scrollLeft : h.scrollTop, g = i ? l ? i.scrollWidth : i.scrollHeight : T ? l ? w.document.documentElement.scrollWidth : w.document.documentElement.scrollHeight : l ? h.scrollWidth : h.scrollHeight, f = i ? l ? i.offsetWidth : i.offsetHeight : T ? l ? w.innerWidth : w.innerHeight : l ? h.offsetWidth : h.offsetHeight;
      o({
        scrollHeight: g,
        scrollTop: Math.max(R, 0),
        viewportHeight: f
      }), s == null || s(
        l ? fn("column-gap", getComputedStyle(m).columnGap, r) : fn("row-gap", getComputedStyle(m).rowGap, r)
      ), S !== null && t(S);
    },
    [t, e, r, s, i, o, l]
  );
  return _e(d, n, u);
}
function vo(t, e, n, o) {
  const r = t.length;
  if (r === 0)
    return null;
  const s = [];
  for (let i = 0; i < r; i++) {
    const l = t.item(i);
    if (l.dataset.index === void 0)
      continue;
    const u = parseInt(l.dataset.index), d = parseFloat(l.dataset.knownSize), m = e(l, n);
    if (m === 0 && o("Zero-sized element, this should not happen", { child: l }, Ct.ERROR), m === d)
      continue;
    const S = s[s.length - 1];
    s.length === 0 || S.size !== m || S.endIndex !== u - 1 ? s.push({ endIndex: u, size: m, startIndex: u }) : s[s.length - 1].endIndex++;
  }
  return s;
}
function fn(t, e, n) {
  return e !== "normal" && !(e != null && e.endsWith("px")) && n(`${t} was not resolved to pixel value correctly`, e, Ct.WARN), e === "normal" ? 0 : parseInt(e != null ? e : "0", 10);
}
function Ne(t, e, n) {
  const o = E.useRef(null), r = E.useCallback(
    (u) => {
      if (!(u != null && u.offsetParent))
        return;
      const d = u.getBoundingClientRect(), m = d.width;
      let S, h;
      if (e) {
        const T = e.getBoundingClientRect(), w = d.top - T.top;
        h = T.height - Math.max(0, w), S = w + e.scrollTop;
      } else {
        const T = i.current.ownerDocument.defaultView;
        h = T.innerHeight - Math.max(0, d.top), S = d.top + T.scrollY;
      }
      o.current = {
        offsetTop: S,
        visibleHeight: h,
        visibleWidth: m
      }, t(o.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, e]
  ), { callbackRef: s, ref: i } = _e(r, !0, n), l = E.useCallback(() => {
    r(i.current);
  }, [r, i]);
  return E.useEffect(() => {
    var u;
    if (e) {
      e.addEventListener("scroll", l);
      const d = new ResizeObserver(() => {
        requestAnimationFrame(l);
      });
      return d.observe(e), () => {
        e.removeEventListener("scroll", l), d.unobserve(e);
      };
    } else {
      const d = (u = i.current) == null ? void 0 : u.ownerDocument.defaultView;
      return d == null || d.addEventListener("scroll", l), d == null || d.addEventListener("resize", l), () => {
        d == null || d.removeEventListener("scroll", l), d == null || d.removeEventListener("resize", l);
      };
    }
  }, [l, e, i]), s;
}
const It = K(
  () => {
    const t = U(), e = U(), n = C(0), o = U(), r = C(0), s = U(), i = U(), l = C(0), u = C(0), d = C(0), m = C(0), S = U(), h = U(), T = C(!1), w = C(!1), R = C(!1);
    return F(
      x(
        t,
        k(({ scrollTop: g }) => g)
      ),
      e
    ), F(
      x(
        t,
        k(({ scrollHeight: g }) => g)
      ),
      i
    ), F(e, r), {
      deviation: n,
      fixedFooterHeight: d,
      fixedHeaderHeight: u,
      footerHeight: m,
      headerHeight: l,
      horizontalDirection: w,
      scrollBy: h,
      // input
      scrollContainerState: t,
      scrollHeight: i,
      scrollingInProgress: T,
      // signals
      scrollTo: S,
      scrollTop: e,
      skipAnimationFrameInResizeObserver: R,
      smoothScrollTargetReached: o,
      // state
      statefulScrollTop: r,
      viewportHeight: s
    };
  },
  [],
  { singleton: !0 }
), ie = { lvl: 0 };
function Ln(t, e) {
  const n = t.length;
  if (n === 0)
    return [];
  let { index: o, value: r } = e(t[0]);
  const s = [];
  for (let i = 1; i < n; i++) {
    const { index: l, value: u } = e(t[i]);
    s.push({ end: l - 1, start: o, value: r }), o = l, r = u;
  }
  return s.push({ end: 1 / 0, start: o, value: r }), s;
}
function X(t) {
  return t === ie;
}
function le(t, e) {
  if (!X(t))
    return e === t.k ? t.v : e < t.k ? le(t.l, e) : le(t.r, e);
}
function kt(t, e, n = "k") {
  if (X(t))
    return [-1 / 0, void 0];
  if (Number(t[n]) === e)
    return [t.k, t.v];
  if (Number(t[n]) < e) {
    const o = kt(t.r, e, n);
    return o[0] === -1 / 0 ? [t.k, t.v] : o;
  }
  return kt(t.l, e, n);
}
function yt(t, e, n) {
  return X(t) ? Gn(e, n, 1) : e === t.k ? dt(t, { k: e, v: n }) : e < t.k ? mn(dt(t, { l: yt(t.l, e, n) })) : mn(dt(t, { r: yt(t.r, e, n) }));
}
function Zt() {
  return ie;
}
function Xt(t, e, n) {
  if (X(t))
    return [];
  const o = kt(t, e)[0];
  return yo(Ve(t, o, n));
}
function Le(t, e) {
  if (X(t)) return ie;
  const { k: n, l: o, r } = t;
  if (e === n) {
    if (X(o))
      return r;
    if (X(r))
      return o;
    {
      const [s, i] = Pn(o);
      return Se(dt(t, { k: s, l: Vn(o), v: i }));
    }
  } else return e < n ? Se(dt(t, { l: Le(o, e) })) : Se(dt(t, { r: Le(r, e) }));
}
function Dt(t) {
  return X(t) ? [] : [...Dt(t.l), { k: t.k, v: t.v }, ...Dt(t.r)];
}
function Ve(t, e, n) {
  if (X(t))
    return [];
  const { k: o, l: r, r: s, v: i } = t;
  let l = [];
  return o > e && (l = l.concat(Ve(r, e, n))), o >= e && o <= n && l.push({ k: o, v: i }), o <= n && (l = l.concat(Ve(s, e, n))), l;
}
function Se(t) {
  const { l: e, lvl: n, r: o } = t;
  if (o.lvl >= n - 1 && e.lvl >= n - 1)
    return t;
  if (n > o.lvl + 1) {
    if (Ee(e))
      return Mn(dt(t, { lvl: n - 1 }));
    if (!X(e) && !X(e.r))
      return dt(e.r, {
        l: dt(e, { r: e.r.l }),
        lvl: n,
        r: dt(t, {
          l: e.r.r,
          lvl: n - 1
        })
      });
    throw new Error("Unexpected empty nodes");
  } else {
    if (Ee(t))
      return Pe(dt(t, { lvl: n - 1 }));
    if (!X(o) && !X(o.l)) {
      const r = o.l, s = Ee(r) ? o.lvl - 1 : o.lvl;
      return dt(r, {
        l: dt(t, {
          lvl: n - 1,
          r: r.l
        }),
        lvl: r.lvl + 1,
        r: Pe(dt(o, { l: r.r, lvl: s }))
      });
    } else
      throw new Error("Unexpected empty nodes");
  }
}
function dt(t, e) {
  return Gn(
    e.k !== void 0 ? e.k : t.k,
    e.v !== void 0 ? e.v : t.v,
    e.lvl !== void 0 ? e.lvl : t.lvl,
    e.l !== void 0 ? e.l : t.l,
    e.r !== void 0 ? e.r : t.r
  );
}
function Vn(t) {
  return X(t.r) ? t.l : Se(dt(t, { r: Vn(t.r) }));
}
function Ee(t) {
  return X(t) || t.lvl > t.r.lvl;
}
function Pn(t) {
  return X(t.r) ? [t.k, t.v] : Pn(t.r);
}
function Gn(t, e, n, o = ie, r = ie) {
  return { k: t, l: o, lvl: n, r, v: e };
}
function mn(t) {
  return Pe(Mn(t));
}
function Mn(t) {
  const { l: e } = t;
  return !X(e) && e.lvl === t.lvl ? dt(e, { r: dt(t, { l: e.r }) }) : t;
}
function Pe(t) {
  const { lvl: e, r: n } = t;
  return !X(n) && !X(n.r) && n.lvl === e && n.r.lvl === e ? dt(n, { l: dt(t, { r: n.l }), lvl: e + 1 }) : t;
}
function yo(t) {
  return Ln(t, ({ k: e, v: n }) => ({ index: e, value: n }));
}
function An(t, e) {
  return !!(t && t.startIndex === e.startIndex && t.endIndex === e.endIndex);
}
function ce(t, e) {
  return !!(t && t[0] === e[0] && t[1] === e[1]);
}
const De = K(
  () => ({ recalcInProgress: C(!1) }),
  [],
  { singleton: !0 }
);
function Wn(t, e, n) {
  return t[Ce(t, e, n)];
}
function Ce(t, e, n, o = 0) {
  let r = t.length - 1;
  for (; o <= r; ) {
    const s = Math.floor((o + r) / 2), i = t[s], l = n(i, e);
    if (l === 0)
      return s;
    if (l === -1) {
      if (r - o < 2)
        return s - 1;
      r = s - 1;
    } else {
      if (r === o)
        return s;
      o = s + 1;
    }
  }
  throw new Error(`Failed binary finding record in array - ${t.join(",")}, searched for ${e}`);
}
function bo(t, e, n, o) {
  const r = Ce(t, e, o), s = Ce(t, n, o, r);
  return t.slice(r, s + 1);
}
function zt(t, e) {
  return Math.round(t.getBoundingClientRect()[e]);
}
function be(t) {
  return !X(t.groupOffsetTree);
}
function $e({ index: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function Ro() {
  return {
    groupIndices: [],
    groupOffsetTree: Zt(),
    lastIndex: 0,
    lastOffset: 0,
    lastSize: 0,
    offsetTree: [],
    sizeTree: Zt()
  };
}
function Ho(t, e) {
  let n = X(t) ? 0 : 1 / 0;
  for (const o of e) {
    const { endIndex: r, size: s, startIndex: i } = o;
    if (n = Math.min(n, i), X(t)) {
      t = yt(t, 0, s);
      continue;
    }
    const l = Xt(t, i - 1, r + 1);
    if (l.some(Lo(o)))
      continue;
    let u = !1, d = !1;
    for (const { end: m, start: S, value: h } of l)
      u ? (r >= S || s === h) && (t = Le(t, S)) : (d = h !== s, u = !0), m > r && r >= S && h !== s && (t = yt(t, r + 1, h));
    d && (t = yt(t, i, s));
  }
  return [t, n];
}
function Eo(t) {
  return typeof t.groupIndex < "u";
}
function Bo({ offset: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function ue(t, e, n) {
  if (e.length === 0)
    return 0;
  const { index: o, offset: r, size: s } = Wn(e, t, $e), i = t - o, l = s * i + (i - 1) * n + r;
  return l > 0 ? l + n : l;
}
function _n(t, e) {
  if (!be(e))
    return t;
  let n = 0;
  for (; e.groupIndices[n] <= t + n; )
    n++;
  return t + n;
}
function Nn(t, e, n) {
  if (Eo(t))
    return e.groupIndices[t.groupIndex] + 1;
  {
    const o = t.index === "LAST" ? n : t.index;
    let r = _n(o, e);
    return r = Math.max(0, r, Math.min(n, r)), r;
  }
}
function ko(t, e, n, o = 0) {
  return o > 0 && (e = Math.max(e, Wn(t, o, $e).offset)), Ln(bo(t, e, n, Bo), Fo);
}
function zo(t, [e, n, o, r]) {
  e.length > 0 && o("received item sizes", e, Ct.DEBUG);
  const s = t.sizeTree;
  let i = s, l = 0;
  if (n.length > 0 && X(s) && e.length === 2) {
    const h = e[0].size, T = e[1].size;
    i = n.reduce((w, R) => yt(yt(w, R, h), R + 1, T), i);
  } else
    [i, l] = Ho(i, e);
  if (i === s)
    return t;
  const { lastIndex: u, lastOffset: d, lastSize: m, offsetTree: S } = Ge(t.offsetTree, l, i, r);
  return {
    groupIndices: n,
    groupOffsetTree: n.reduce((h, T) => yt(h, T, ue(T, S, r)), Zt()),
    lastIndex: u,
    lastOffset: d,
    lastSize: m,
    offsetTree: S,
    sizeTree: i
  };
}
function Oo(t) {
  return Dt(t).map(({ k: e, v: n }, o, r) => {
    const s = r[o + 1];
    return { endIndex: s ? s.k - 1 : 1 / 0, size: n, startIndex: e };
  });
}
function pn(t, e) {
  let n = 0, o = 0;
  for (; n < t; )
    n += e[o + 1] - e[o] - 1, o++;
  return o - (n === t ? 0 : 1);
}
function Ge(t, e, n, o) {
  let r = t, s = 0, i = 0, l = 0, u = 0;
  if (e !== 0) {
    u = Ce(r, e - 1, $e), l = r[u].offset;
    const m = kt(n, e - 1);
    s = m[0], i = m[1], r.length && r[u].size === kt(n, e)[1] && (u -= 1), r = r.slice(0, u + 1);
  } else
    r = [];
  for (const { start: d, value: m } of Xt(n, e, 1 / 0)) {
    const S = d - s, h = S * i + l + S * o;
    r.push({
      index: d,
      offset: h,
      size: m
    }), s = d, l = h, i = m;
  }
  return {
    lastIndex: s,
    lastOffset: l,
    lastSize: i,
    offsetTree: r
  };
}
function Fo(t) {
  return { index: t.index, value: t };
}
function Lo(t) {
  const { endIndex: e, size: n, startIndex: o } = t;
  return (r) => r.start === o && (r.end === e || r.end === 1 / 0) && r.value === n;
}
const Vo = {
  offsetHeight: "height",
  offsetWidth: "width"
}, Pt = K(
  ([{ log: t }, { recalcInProgress: e }]) => {
    const n = U(), o = U(), r = ht(o, 0), s = U(), i = U(), l = C(0), u = C([]), d = C(void 0), m = C(void 0), S = C(void 0), h = C(void 0), T = C((c, p) => zt(c, Vo[p])), w = C(void 0), R = C(0), g = Ro(), f = ht(
      x(n, $(u, t, R), Lt(zo, g), J()),
      g
    ), a = ht(
      x(
        u,
        J(),
        Lt((c, p) => ({ current: p, prev: c.current }), {
          current: [],
          prev: []
        }),
        k(({ prev: c }) => c)
      ),
      []
    );
    F(
      x(
        u,
        P((c) => c.length > 0),
        $(f, R),
        k(([c, p, v]) => {
          const O = c.reduce((B, W, _) => yt(B, W, ue(W, p.offsetTree, v) || _), Zt());
          return {
            ...p,
            groupIndices: c,
            groupOffsetTree: O
          };
        })
      ),
      f
    ), F(
      x(
        o,
        $(f),
        P(([c, { lastIndex: p }]) => c < p),
        k(([c, { lastIndex: p, lastSize: v }]) => [
          {
            endIndex: p,
            size: v,
            startIndex: c
          }
        ])
      ),
      n
    ), F(d, m);
    const I = ht(
      x(
        d,
        k((c) => c === void 0)
      ),
      !0
    );
    F(
      x(
        m,
        P((c) => c !== void 0 && X(rt(f).sizeTree)),
        k((c) => {
          const p = rt(S), v = rt(u).length > 0;
          return p ? v ? [
            { endIndex: 0, size: p, startIndex: 0 },
            { endIndex: 1, size: c, startIndex: 1 }
          ] : [] : [{ endIndex: 0, size: c, startIndex: 0 }];
        })
      ),
      n
    ), F(
      x(
        h,
        P((c) => c !== void 0 && c.length > 0 && X(rt(f).sizeTree)),
        k((c) => {
          const p = [];
          let v = c[0], O = 0;
          for (let B = 1; B < c.length; B++) {
            const W = c[B];
            W !== v && (p.push({
              endIndex: B - 1,
              size: v,
              startIndex: O
            }), v = W, O = B);
          }
          return p.push({
            endIndex: c.length - 1,
            size: v,
            startIndex: O
          }), p;
        })
      ),
      n
    ), F(
      x(
        u,
        $(S, m),
        P(([, c, p]) => c !== void 0 && p !== void 0),
        k(([c, p, v]) => {
          const O = [];
          for (let B = 0; B < c.length; B++) {
            const W = c[B], _ = c[B + 1];
            O.push({
              startIndex: W,
              endIndex: W,
              size: p
            }), _ !== void 0 && O.push({
              startIndex: W + 1,
              endIndex: _ - 1,
              size: v
            });
          }
          return O;
        })
      ),
      n
    );
    const b = bt(
      x(
        n,
        $(f),
        Lt(
          ({ sizes: c }, [p, v]) => ({
            changed: v !== c,
            sizes: v
          }),
          { changed: !1, sizes: g }
        ),
        k((c) => c.changed)
      )
    );
    Y(
      x(
        l,
        Lt(
          (c, p) => ({ diff: c.prev - p, prev: p }),
          { diff: 0, prev: 0 }
        ),
        k((c) => c.diff)
      ),
      (c) => {
        const { groupIndices: p } = rt(f);
        if (c > 0)
          D(e, !0), D(s, c + pn(c, p));
        else if (c < 0) {
          const v = rt(a);
          v.length > 0 && (c -= pn(-c, v)), D(i, c);
        }
      }
    ), Y(x(l, $(t)), ([c, p]) => {
      c < 0 && p(
        "`firstItemIndex` prop should not be set to less than zero. If you don't know the total count, just use a very high value",
        { firstItemIndex: l },
        Ct.ERROR
      );
    });
    const y = bt(s);
    F(
      x(
        s,
        $(f),
        k(([c, p]) => {
          const v = p.groupIndices.length > 0, O = [], B = p.lastSize;
          if (v) {
            const W = le(p.sizeTree, 0);
            let _ = 0, j = 0;
            for (; _ < c; ) {
              const M = p.groupIndices[j], et = p.groupIndices.length === j + 1 ? 1 / 0 : p.groupIndices[j + 1] - M - 1;
              O.push({
                endIndex: M,
                size: W,
                startIndex: M
              }), O.push({
                endIndex: M + 1 + et - 1,
                size: B,
                startIndex: M + 1
              }), j++, _ += et + 1;
            }
            const L = Dt(p.sizeTree);
            return _ !== c && L.shift(), L.reduce(
              (M, { k: et, v: wt }) => {
                let ft = M.ranges;
                return M.prevSize !== 0 && (ft = [
                  ...M.ranges,
                  {
                    endIndex: et + c - 1,
                    size: M.prevSize,
                    startIndex: M.prevIndex
                  }
                ]), {
                  prevIndex: et + c,
                  prevSize: wt,
                  ranges: ft
                };
              },
              {
                prevIndex: c,
                prevSize: 0,
                ranges: O
              }
            ).ranges;
          }
          return Dt(p.sizeTree).reduce(
            (W, { k: _, v: j }) => ({
              prevIndex: _ + c,
              prevSize: j,
              ranges: [...W.ranges, { endIndex: _ + c - 1, size: W.prevSize, startIndex: W.prevIndex }]
            }),
            {
              prevIndex: 0,
              prevSize: B,
              ranges: []
            }
          ).ranges;
        })
      ),
      n
    );
    const z = bt(
      x(
        i,
        $(f, R),
        k(([c, { offsetTree: p }, v]) => {
          const O = -c;
          return ue(O, p, v);
        })
      )
    );
    return F(
      x(
        i,
        $(f, R),
        k(([c, p, v]) => {
          if (p.groupIndices.length > 0) {
            if (X(p.sizeTree))
              return p;
            let B = Zt();
            const W = rt(a);
            let _ = 0, j = 0, L = 0;
            for (; _ < -c; ) {
              L = W[j];
              const M = W[j + 1] - L - 1;
              j++, _ += M + 1;
            }
            if (B = Dt(p.sizeTree).reduce((M, { k: et, v: wt }) => yt(M, Math.max(0, et + c), wt), B), _ !== -c) {
              const M = le(p.sizeTree, L);
              B = yt(B, 0, M);
              const et = kt(p.sizeTree, -c + 1)[1];
              B = yt(B, 1, et);
            }
            return {
              ...p,
              sizeTree: B,
              ...Ge(p.offsetTree, 0, B, v)
            };
          } else {
            const B = Dt(p.sizeTree).reduce((W, { k: _, v: j }) => yt(W, Math.max(0, _ + c), j), Zt());
            return {
              ...p,
              sizeTree: B,
              ...Ge(p.offsetTree, 0, B, v)
            };
          }
        })
      ),
      f
    ), {
      beforeUnshiftWith: y,
      // input
      data: w,
      defaultItemSize: m,
      firstItemIndex: l,
      fixedItemSize: d,
      fixedGroupSize: S,
      gap: R,
      groupIndices: u,
      heightEstimates: h,
      itemSize: T,
      listRefresh: b,
      shiftWith: i,
      shiftWithOffset: z,
      sizeRanges: n,
      // output
      sizes: f,
      statefulTotalCount: r,
      totalCount: o,
      trackItemSizes: I,
      unshiftWith: s
    };
  },
  tt(Wt, De),
  { singleton: !0 }
);
function Po(t) {
  return t.reduce(
    (e, n) => (e.groupIndices.push(e.totalCount), e.totalCount += n + 1, e),
    {
      groupIndices: [],
      totalCount: 0
    }
  );
}
const Dn = K(
  ([{ groupIndices: t, sizes: e, totalCount: n }, { headerHeight: o, scrollTop: r }]) => {
    const s = U(), i = U(), l = bt(x(s, k(Po)));
    return F(
      x(
        l,
        k((u) => u.totalCount)
      ),
      n
    ), F(
      x(
        l,
        k((u) => u.groupIndices)
      ),
      t
    ), F(
      x(
        ut(r, e, o),
        P(([u, d]) => be(d)),
        k(([u, d, m]) => kt(d.groupOffsetTree, Math.max(u - m, 0), "v")[0]),
        J(),
        k((u) => [u])
      ),
      i
    ), { groupCounts: s, topItemsIndexes: i };
  },
  tt(Pt, It)
), _t = K(
  ([{ log: t }]) => {
    const e = C(!1), n = bt(
      x(
        e,
        P((o) => o),
        J()
      )
    );
    return Y(e, (o) => {
      o && rt(t)("props updated", {}, Ct.DEBUG);
    }), { didMount: n, propsReady: e };
  },
  tt(Wt),
  { singleton: !0 }
), Go = typeof document < "u" && "scrollBehavior" in document.documentElement.style;
function $n(t) {
  const e = typeof t == "number" ? { index: t } : t;
  return e.align || (e.align = "start"), (!e.behavior || !Go) && (e.behavior = "auto"), e.offset || (e.offset = 0), e;
}
const me = K(
  ([
    { gap: t, listRefresh: e, sizes: n, totalCount: o },
    {
      fixedFooterHeight: r,
      fixedHeaderHeight: s,
      footerHeight: i,
      headerHeight: l,
      scrollingInProgress: u,
      scrollTo: d,
      smoothScrollTargetReached: m,
      viewportHeight: S
    },
    { log: h }
  ]) => {
    const T = U(), w = U(), R = C(0);
    let g = null, f = null, a = null;
    function I() {
      g && (g(), g = null), a && (a(), a = null), f && (clearTimeout(f), f = null), D(u, !1);
    }
    return F(
      x(
        T,
        $(n, S, o, R, l, i, h),
        $(t, s, r),
        k(
          ([
            [b, y, z, c, p, v, O, B],
            W,
            _,
            j
          ]) => {
            const L = $n(b), { align: xt, behavior: M, offset: et } = L, wt = c - 1, ft = Nn(L, y, wt);
            let St = ue(ft, y.offsetTree, W) + v;
            xt === "end" ? (St += _ + kt(y.sizeTree, ft)[1] - z + j, ft === wt && (St += O)) : xt === "center" ? St += (_ + kt(y.sizeTree, ft)[1] - z + j) / 2 : St -= p, et && (St += et);
            const Mt = (pt) => {
              I(), pt ? (B("retrying to scroll to", { location: b }, Ct.DEBUG), D(T, b)) : (D(w, !0), B("list did not change, scroll successful", {}, Ct.DEBUG));
            };
            if (I(), M === "smooth") {
              let pt = !1;
              a = Y(e, (qt) => {
                pt = pt || qt;
              }), g = Et(m, () => {
                Mt(pt);
              });
            } else
              g = Et(x(e, Mo(150)), Mt);
            return f = setTimeout(() => {
              I();
            }, 1200), D(u, !0), B("scrolling from index to", { behavior: M, index: ft, top: St }, Ct.DEBUG), { behavior: M, top: St };
          }
        )
      ),
      d
    ), {
      scrollTargetReached: w,
      scrollToIndex: T,
      topListHeight: R
    };
  },
  tt(Pt, It, Wt),
  { singleton: !0 }
);
function Mo(t) {
  return (e) => {
    const n = setTimeout(() => {
      e(!1);
    }, t);
    return (o) => {
      o && (e(!0), clearTimeout(n));
    };
  };
}
function Ue(t, e) {
  t == 0 ? e() : requestAnimationFrame(() => {
    Ue(t - 1, e);
  });
}
function Ke(t, e) {
  const n = e - 1;
  return typeof t == "number" ? t : t.index === "LAST" ? n : t.index;
}
const pe = K(
  ([{ defaultItemSize: t, listRefresh: e, sizes: n }, { scrollTop: o }, { scrollTargetReached: r, scrollToIndex: s }, { didMount: i }]) => {
    const l = C(!0), u = C(0), d = C(!0);
    return F(
      x(
        i,
        $(u),
        P(([m, S]) => !!S),
        Ft(!1)
      ),
      l
    ), F(
      x(
        i,
        $(u),
        P(([m, S]) => !!S),
        Ft(!1)
      ),
      d
    ), Y(
      x(
        ut(e, i),
        $(l, n, t, d),
        P(([[, m], S, { sizeTree: h }, T, w]) => m && (!X(h) || Ae(T)) && !S && !w),
        $(u)
      ),
      ([, m]) => {
        Et(r, () => {
          D(d, !0);
        }), Ue(4, () => {
          Et(o, () => {
            D(l, !0);
          }), D(s, m);
        });
      }
    ), {
      initialItemFinalLocationReached: d,
      initialTopMostItemIndex: u,
      scrolledToInitialItem: l
    };
  },
  tt(Pt, It, me, _t),
  { singleton: !0 }
);
function Un(t, e) {
  return Math.abs(t - e) < 1.01;
}
const ae = "up", oe = "down", Ao = "none", Wo = {
  atBottom: !1,
  notAtBottomBecause: "NOT_SHOWING_LAST_ITEM",
  state: {
    offsetBottom: 0,
    scrollHeight: 0,
    scrollTop: 0,
    viewportHeight: 0
  }
}, _o = 0, he = K(([{ footerHeight: t, headerHeight: e, scrollBy: n, scrollContainerState: o, scrollTop: r, viewportHeight: s }]) => {
  const i = C(!1), l = C(!0), u = U(), d = U(), m = C(4), S = C(_o), h = ht(
    x(
      Fe(x(V(r), Kt(1), Ft(!0)), x(V(r), Kt(1), Ft(!1), dn(100))),
      J()
    ),
    !1
  ), T = ht(
    x(Fe(x(n, Ft(!0)), x(n, Ft(!1), dn(200))), J()),
    !1
  );
  F(
    x(
      ut(V(r), V(S)),
      k(([a, I]) => a <= I),
      J()
    ),
    l
  ), F(x(l, Gt(50)), d);
  const w = bt(
    x(
      ut(o, V(s), V(e), V(t), V(m)),
      Lt((a, [{ scrollHeight: I, scrollTop: b }, y, z, c, p]) => {
        const v = b + y - I > -p, O = {
          scrollHeight: I,
          scrollTop: b,
          viewportHeight: y
        };
        if (v) {
          let W, _;
          return b > a.state.scrollTop ? (W = "SCROLLED_DOWN", _ = a.state.scrollTop - b) : (W = "SIZE_DECREASED", _ = a.state.scrollTop - b || a.scrollTopDelta), {
            atBottom: !0,
            atBottomBecause: W,
            scrollTopDelta: _,
            state: O
          };
        }
        let B;
        return O.scrollHeight > a.state.scrollHeight ? B = "SIZE_INCREASED" : y < a.state.viewportHeight ? B = "VIEWPORT_HEIGHT_DECREASING" : b < a.state.scrollTop ? B = "SCROLLING_UPWARDS" : B = "NOT_FULLY_SCROLLED_TO_LAST_ITEM_BOTTOM", {
          atBottom: !1,
          notAtBottomBecause: B,
          state: O
        };
      }, Wo),
      J((a, I) => a && a.atBottom === I.atBottom)
    )
  ), R = ht(
    x(
      o,
      Lt(
        (a, { scrollHeight: I, scrollTop: b, viewportHeight: y }) => {
          if (Un(a.scrollHeight, I))
            return {
              changed: !1,
              jump: 0,
              scrollHeight: I,
              scrollTop: b
            };
          {
            const z = I - (b + y) < 1;
            return a.scrollTop !== b && z ? {
              changed: !0,
              jump: a.scrollTop - b,
              scrollHeight: I,
              scrollTop: b
            } : {
              changed: !0,
              jump: 0,
              scrollHeight: I,
              scrollTop: b
            };
          }
        },
        { changed: !1, jump: 0, scrollHeight: 0, scrollTop: 0 }
      ),
      P((a) => a.changed),
      k((a) => a.jump)
    ),
    0
  );
  F(
    x(
      w,
      k((a) => a.atBottom)
    ),
    i
  ), F(x(i, Gt(50)), u);
  const g = C(oe);
  F(
    x(
      o,
      k(({ scrollTop: a }) => a),
      J(),
      Lt(
        (a, I) => rt(T) ? { direction: a.direction, prevScrollTop: I } : { direction: I < a.prevScrollTop ? ae : oe, prevScrollTop: I },
        { direction: oe, prevScrollTop: 0 }
      ),
      k((a) => a.direction)
    ),
    g
  ), F(x(o, Gt(50), Ft(Ao)), g);
  const f = C(0);
  return F(
    x(
      h,
      P((a) => !a),
      Ft(0)
    ),
    f
  ), F(
    x(
      r,
      Gt(100),
      $(h),
      P(([a, I]) => I),
      Lt(([a, I], [b]) => [I, b], [0, 0]),
      k(([a, I]) => I - a)
    ),
    f
  ), {
    atBottomState: w,
    atBottomStateChange: u,
    atBottomThreshold: m,
    atTopStateChange: d,
    atTopThreshold: S,
    isAtBottom: i,
    isAtTop: l,
    isScrolling: h,
    lastJumpDueToItemResize: R,
    scrollDirection: g,
    scrollVelocity: f
  };
}, tt(It)), de = "top", fe = "bottom", hn = "none";
function gn(t, e, n) {
  return typeof t == "number" ? n === ae && e === de || n === oe && e === fe ? t : 0 : n === ae ? e === de ? t.main : t.reverse : e === fe ? t.main : t.reverse;
}
function In(t, e) {
  var n;
  return typeof t == "number" ? t : (n = t[e]) != null ? n : 0;
}
const je = K(
  ([{ deviation: t, fixedHeaderHeight: e, headerHeight: n, scrollTop: o, viewportHeight: r }]) => {
    const s = U(), i = C(0), l = C(0), u = C(0), d = ht(
      x(
        ut(
          V(o),
          V(r),
          V(n),
          V(s, ce),
          V(u),
          V(i),
          V(e),
          V(t),
          V(l)
        ),
        k(
          ([
            m,
            S,
            h,
            [T, w],
            R,
            g,
            f,
            a,
            I
          ]) => {
            const b = m - a, y = g + f, z = Math.max(h - b, 0);
            let c = hn;
            const p = In(I, de), v = In(I, fe);
            return T -= a, T += h + f, w += h + f, w -= a, T > m + y - p && (c = ae), w < m - z + S + v && (c = oe), c !== hn ? [
              Math.max(b - h - gn(R, de, c) - p, 0),
              b - z - f + S + gn(R, fe, c) + v
            ] : null;
          }
        ),
        P((m) => m != null),
        J(ce)
      ),
      [0, 0]
    );
    return {
      increaseViewportBy: l,
      // input
      listBoundary: s,
      overscan: u,
      topListHeight: i,
      // output
      visibleRange: d
    };
  },
  tt(It),
  { singleton: !0 }
);
function No(t, e, n) {
  if (be(e)) {
    const o = _n(t, e);
    return [
      { index: kt(e.groupOffsetTree, o)[0], offset: 0, size: 0 },
      { data: n == null ? void 0 : n[0], index: o, offset: 0, size: 0 }
    ];
  }
  return [{ data: n == null ? void 0 : n[0], index: t, offset: 0, size: 0 }];
}
const Be = {
  bottom: 0,
  firstItemIndex: 0,
  items: [],
  offsetBottom: 0,
  offsetTop: 0,
  top: 0,
  topItems: [],
  topListHeight: 0,
  totalCount: 0
};
function Te(t, e, n, o, r, s) {
  const { lastIndex: i, lastOffset: l, lastSize: u } = r;
  let d = 0, m = 0;
  if (t.length > 0) {
    d = t[0].offset;
    const R = t[t.length - 1];
    m = R.offset + R.size;
  }
  const S = n - i, h = l + S * u + (S - 1) * o, T = d, w = h - m;
  return {
    bottom: m,
    firstItemIndex: s,
    items: xn(t, r, s),
    offsetBottom: w,
    offsetTop: d,
    top: T,
    topItems: xn(e, r, s),
    topListHeight: e.reduce((R, g) => g.size + R, 0),
    totalCount: n
  };
}
function Kn(t, e, n, o, r, s) {
  let i = 0;
  if (n.groupIndices.length > 0)
    for (const m of n.groupIndices) {
      if (m - i >= t)
        break;
      i++;
    }
  const l = t + i, u = Ke(e, l), d = Array.from({ length: l }).map((m, S) => ({
    data: s[S + u],
    index: S + u,
    offset: 0,
    size: 0
  }));
  return Te(d, [], l, r, n, o);
}
function xn(t, e, n) {
  if (t.length === 0)
    return [];
  if (!be(e))
    return t.map((d) => ({ ...d, index: d.index + n, originalIndex: d.index }));
  const o = t[0].index, r = t[t.length - 1].index, s = [], i = Xt(e.groupOffsetTree, o, r);
  let l, u = 0;
  for (const d of t) {
    (!l || l.end < d.index) && (l = i.shift(), u = e.groupIndices.indexOf(l.start));
    let m;
    d.index === l.start ? m = {
      index: u,
      type: "group"
    } : m = {
      groupIndex: u,
      index: d.index - (u + 1) + n
    }, s.push({
      ...m,
      data: d.data,
      offset: d.offset,
      originalIndex: d.index,
      size: d.size
    });
  }
  return s;
}
function Sn(t, e) {
  var n;
  return t === void 0 ? 0 : typeof t == "number" ? t : (n = t[e]) != null ? n : 0;
}
const jt = K(
  ([
    { data: t, firstItemIndex: e, gap: n, sizes: o, totalCount: r },
    s,
    { listBoundary: i, topListHeight: l, visibleRange: u },
    { initialTopMostItemIndex: d, scrolledToInitialItem: m },
    { topListHeight: S },
    h,
    { didMount: T },
    { recalcInProgress: w }
  ]) => {
    const R = C([]), g = C(0), f = U(), a = C(0);
    F(s.topItemsIndexes, R);
    const I = ht(
      x(
        ut(
          T,
          w,
          V(u, ce),
          V(r),
          V(o),
          V(d),
          m,
          V(R),
          V(e),
          V(n),
          V(a),
          t
        ),
        P(([c, p, , v, , , , , , , , O]) => {
          const B = O && O.length !== v;
          return c && !p && !B;
        }),
        k(
          ([
            ,
            ,
            [c, p],
            v,
            O,
            B,
            W,
            _,
            j,
            L,
            xt,
            M
          ]) => {
            var q, at, gt, Tt;
            const et = O, { offsetTree: wt, sizeTree: ft } = et, St = rt(g);
            if (v === 0)
              return { ...Be, totalCount: v };
            if (c === 0 && p === 0)
              return St === 0 ? { ...Be, totalCount: v } : Kn(St, B, O, j, L, M || []);
            if (X(ft))
              return St > 0 ? null : Te(
                No(Ke(B, v), et, M),
                [],
                v,
                L,
                et,
                j
              );
            const Mt = [];
            if (_.length > 0) {
              const st = _[0], it = _[_.length - 1];
              let mt = 0;
              for (const lt of Xt(ft, st, it)) {
                const Z = lt.value, nt = Math.max(lt.start, st), vt = Math.min(lt.end, it);
                for (let ct = nt; ct <= vt; ct++)
                  Mt.push({ data: M == null ? void 0 : M[ct], index: ct, offset: mt, size: Z }), mt += Z;
              }
            }
            if (!W)
              return Te([], Mt, v, L, et, j);
            const pt = _.length > 0 ? _[_.length - 1] + 1 : 0, qt = ko(wt, c, p, pt);
            if (qt.length === 0)
              return null;
            const ee = v - 1, Ot = ye([], (st) => {
              for (const it of qt) {
                const mt = it.value;
                let lt = mt.offset, Z = it.start;
                const nt = mt.size;
                if (mt.offset < c) {
                  Z += Math.floor((c - mt.offset + L) / (nt + L));
                  const ct = Z - it.start;
                  lt += ct * nt + ct * L;
                }
                Z < pt && (lt += (pt - Z) * nt, Z = pt);
                const vt = Math.min(it.end, ee);
                for (let ct = Z; ct <= vt && !(lt >= p); ct++)
                  st.push({ data: M == null ? void 0 : M[ct], index: ct, offset: lt, size: nt }), lt += nt + L;
              }
            }), ne = Sn(xt, de), H = Sn(xt, fe);
            if (Ot.length > 0 && (ne > 0 || H > 0)) {
              const st = Ot[0], it = Ot[Ot.length - 1];
              if (ne > 0 && st.index > pt) {
                const mt = Math.min(ne, st.index - pt), lt = [];
                let Z = st.offset;
                for (let nt = st.index - 1; nt >= st.index - mt; nt--) {
                  const ct = (at = (q = Xt(ft, nt, nt)[0]) == null ? void 0 : q.value) != null ? at : st.size;
                  Z -= ct + L, lt.unshift({ data: M == null ? void 0 : M[nt], index: nt, offset: Z, size: ct });
                }
                Ot.unshift(...lt);
              }
              if (H > 0 && it.index < ee) {
                const mt = Math.min(H, ee - it.index);
                let lt = it.offset + it.size + L;
                for (let Z = it.index + 1; Z <= it.index + mt; Z++) {
                  const vt = (Tt = (gt = Xt(ft, Z, Z)[0]) == null ? void 0 : gt.value) != null ? Tt : it.size;
                  Ot.push({ data: M == null ? void 0 : M[Z], index: Z, offset: lt, size: vt }), lt += vt + L;
                }
              }
            }
            return Te(Ot, Mt, v, L, et, j);
          }
        ),
        //@ts-expect-error filter needs to be fixed
        P((c) => c !== null),
        J()
      ),
      Be
    );
    F(
      x(
        t,
        P(Ae),
        k((c) => c == null ? void 0 : c.length)
      ),
      r
    ), F(
      x(
        I,
        k((c) => c.topListHeight)
      ),
      S
    ), F(S, l), F(
      x(
        I,
        k((c) => [c.top, c.bottom])
      ),
      i
    ), F(
      x(
        I,
        k((c) => c.items)
      ),
      f
    );
    const b = bt(
      x(
        I,
        P(({ items: c }) => c.length > 0),
        $(r, t),
        P(([{ items: c }, p]) => c[c.length - 1].originalIndex === p - 1),
        k(([, c, p]) => [c - 1, p]),
        J(ce),
        k(([c]) => c)
      )
    ), y = bt(
      x(
        I,
        Gt(200),
        P(({ items: c, topItems: p }) => c.length > 0 && c[0].originalIndex === p.length),
        k(({ items: c }) => c[0].index),
        J()
      )
    ), z = bt(
      x(
        I,
        P(({ items: c }) => c.length > 0),
        k(({ items: c }) => {
          let p = 0, v = c.length - 1;
          for (; c[p].type === "group" && p < v; )
            p++;
          for (; c[v].type === "group" && v > p; )
            v--;
          return {
            endIndex: c[v].index,
            startIndex: c[p].index
          };
        }),
        J(An)
      )
    );
    return {
      endReached: b,
      initialItemCount: g,
      itemsRendered: f,
      listState: I,
      minOverscanItemCount: a,
      rangeChanged: z,
      startReached: y,
      topItemsIndexes: R,
      ...h
    };
  },
  tt(
    Pt,
    Dn,
    je,
    pe,
    me,
    he,
    _t,
    De
  ),
  { singleton: !0 }
), jn = K(
  ([{ fixedFooterHeight: t, fixedHeaderHeight: e, footerHeight: n, headerHeight: o }, { listState: r }]) => {
    const s = U(), i = ht(
      x(
        ut(n, t, o, e, r),
        k(([l, u, d, m, S]) => l + u + d + m + S.offsetBottom + S.bottom)
      ),
      0
    );
    return F(V(i), s), { totalListHeight: i, totalListHeightChanged: s };
  },
  tt(It, jt),
  { singleton: !0 }
), Do = K(
  ([{ viewportHeight: t }, { totalListHeight: e }]) => {
    const n = C(!1), o = ht(
      x(
        ut(n, t, e),
        P(([r]) => r),
        k(([, r, s]) => Math.max(0, r - s)),
        Gt(0),
        J()
      ),
      0
    );
    return { alignToBottom: n, paddingTopAddition: o };
  },
  tt(It, jn),
  { singleton: !0 }
), qn = K(() => ({
  context: C(null)
})), $o = ({
  itemBottom: t,
  itemTop: e,
  locationParams: { align: n, behavior: o, ...r },
  viewportBottom: s,
  viewportTop: i
}) => e < i ? { ...r, align: n != null ? n : "start", behavior: o } : t > s ? { ...r, align: n != null ? n : "end", behavior: o } : null, Yn = K(
  ([
    { gap: t, sizes: e, totalCount: n },
    { fixedFooterHeight: o, fixedHeaderHeight: r, headerHeight: s, scrollingInProgress: i, scrollTop: l, viewportHeight: u },
    { scrollToIndex: d }
  ]) => {
    const m = U();
    return F(
      x(
        m,
        $(e, u, n, s, r, o, l),
        $(t),
        k(([[S, h, T, w, R, g, f, a], I]) => {
          const { align: b, behavior: y, calculateViewLocation: z = $o, done: c, ...p } = S, v = Nn(S, h, w - 1), O = ue(v, h.offsetTree, I) + R + g, B = O + kt(h.sizeTree, v)[1], W = a + g, _ = a + T - f, j = z({
            itemBottom: B,
            itemTop: O,
            locationParams: { align: b, behavior: y, ...p },
            viewportBottom: _,
            viewportTop: W
          });
          return j ? c && Et(
            x(
              i,
              P((L) => !L),
              // skips the initial publish of false, and the cleanup call.
              // but if scrollingInProgress is true, we skip the initial publish.
              Kt(rt(i) ? 1 : 2)
            ),
            c
          ) : c == null || c(), j;
        }),
        P((S) => S !== null)
      ),
      d
    ), {
      scrollIntoView: m
    };
  },
  tt(Pt, It, me, jt, Wt),
  { singleton: !0 }
);
function Tn(t) {
  return t ? t === "smooth" ? "smooth" : "auto" : !1;
}
const Uo = (t, e) => typeof t == "function" ? Tn(t(e)) : e && Tn(t), Ko = K(
  ([
    { listRefresh: t, totalCount: e, fixedItemSize: n, data: o },
    { atBottomState: r, isAtBottom: s },
    { scrollToIndex: i },
    { scrolledToInitialItem: l },
    { didMount: u, propsReady: d },
    { log: m },
    { scrollingInProgress: S },
    { context: h },
    { scrollIntoView: T }
  ]) => {
    const w = C(!1), R = U();
    let g = null;
    function f(y) {
      D(i, {
        align: "end",
        behavior: y,
        index: "LAST"
      });
    }
    Y(
      x(
        ut(x(V(e), Kt(1)), u),
        $(V(w), s, l, S),
        k(([[y, z], c, p, v, O]) => {
          let B = z && v, W = "auto";
          return B && (W = Uo(c, p || O), B = B && !!W), { followOutputBehavior: W, shouldFollow: B, totalCount: y };
        }),
        P(({ shouldFollow: y }) => y)
      ),
      ({ followOutputBehavior: y, totalCount: z }) => {
        g && (g(), g = null), rt(n) ? requestAnimationFrame(() => {
          rt(m)("following output to ", { totalCount: z }, Ct.DEBUG), f(y);
        }) : g = Et(t, () => {
          rt(m)("following output to ", { totalCount: z }, Ct.DEBUG), f(y), g = null;
        });
      }
    );
    function a(y) {
      const z = Et(r, (c) => {
        y && !c.atBottom && c.notAtBottomBecause === "SIZE_INCREASED" && !g && (rt(m)("scrolling to bottom due to increased size", {}, Ct.DEBUG), f("auto"));
      });
      setTimeout(z, 100);
    }
    Y(
      x(
        ut(V(w), e, d),
        P(([y, , z]) => y && z),
        Lt(
          ({ value: y }, [, z]) => ({ refreshed: y === z, value: z }),
          { refreshed: !1, value: 0 }
        ),
        P(({ refreshed: y }) => y),
        $(w, e)
      ),
      ([, y]) => {
        rt(l) && a(y !== !1);
      }
    ), Y(R, () => {
      a(rt(w) !== !1);
    }), Y(ut(V(w), r), ([y, z]) => {
      y && !z.atBottom && z.notAtBottomBecause === "VIEWPORT_HEIGHT_DECREASING" && f("auto");
    });
    const I = C(null), b = U();
    return F(
      Fe(
        x(
          V(o),
          k((y) => {
            var z;
            return (z = y == null ? void 0 : y.length) != null ? z : 0;
          })
        ),
        x(V(e))
      ),
      b
    ), Y(
      x(
        ut(x(b, Kt(1)), u),
        $(V(I), l, S, h),
        k(([[y, z], c, p, v, O]) => z && p && (c == null ? void 0 : c({ context: O, totalCount: y, scrollingInProgress: v }))),
        P((y) => !!y),
        Gt(0)
      ),
      (y) => {
        g && (g(), g = null), rt(n) ? requestAnimationFrame(() => {
          rt(m)("scrolling into view", {}), D(T, y);
        }) : g = Et(t, () => {
          rt(m)("scrolling into view", {}), D(T, y), g = null;
        });
      }
    ), { autoscrollToBottom: R, followOutput: w, scrollIntoViewOnChange: I };
  },
  tt(
    Pt,
    he,
    me,
    pe,
    _t,
    Wt,
    It,
    qn,
    Yn
  )
), jo = K(
  ([{ data: t, firstItemIndex: e, gap: n, sizes: o }, { initialTopMostItemIndex: r }, { initialItemCount: s, listState: i }, { didMount: l }]) => (F(
    x(
      l,
      $(s),
      P(([, u]) => u !== 0),
      $(r, o, e, n, t),
      k(([[, u], d, m, S, h, T = []]) => Kn(u, d, m, S, h, T))
    ),
    i
  ), {}),
  tt(Pt, pe, jt, _t),
  { singleton: !0 }
), qo = K(
  ([{ didMount: t }, { scrollTo: e }, { listState: n }]) => {
    const o = C(0);
    return Y(
      x(
        t,
        $(o),
        P(([, r]) => r !== 0),
        k(([, r]) => ({ top: r }))
      ),
      (r) => {
        Et(
          x(
            n,
            Kt(1),
            P((s) => s.items.length > 1)
          ),
          () => {
            requestAnimationFrame(() => {
              D(e, r);
            });
          }
        );
      }
    ), {
      initialScrollTop: o
    };
  },
  tt(_t, It, jt),
  { singleton: !0 }
), Zn = K(
  ([{ scrollVelocity: t }]) => {
    const e = C(!1), n = U(), o = C(!1);
    return F(
      x(
        t,
        $(o, e, n),
        P(([r, s]) => !!s),
        k(([r, s, i, l]) => {
          const { enter: u, exit: d } = s;
          if (i) {
            if (d(r, l))
              return !1;
          } else if (u(r, l))
            return !0;
          return i;
        }),
        J()
      ),
      e
    ), Y(
      x(ut(e, t, n), $(o)),
      ([[r, s, i], l]) => {
        r && l && l.change && l.change(s, i);
      }
    ), { isSeeking: e, scrollSeekConfiguration: o, scrollSeekRangeChanged: n, scrollVelocity: t };
  },
  tt(he),
  { singleton: !0 }
), qe = K(([{ scrollContainerState: t, scrollTo: e }]) => {
  const n = U(), o = U(), r = U(), s = C(!1), i = C(void 0);
  return F(
    x(
      ut(n, o),
      k(([{ scrollHeight: l, scrollTop: u, viewportHeight: d }, { offsetTop: m }]) => ({
        scrollHeight: l,
        scrollTop: Math.max(0, u - m),
        viewportHeight: d
      }))
    ),
    t
  ), F(
    x(
      e,
      $(o),
      k(([l, { offsetTop: u }]) => ({
        ...l,
        top: l.top + u
      }))
    ),
    r
  ), {
    customScrollParent: i,
    // config
    useWindowScroll: s,
    // input
    windowScrollContainerState: n,
    // signals
    windowScrollTo: r,
    windowViewportRect: o
  };
}, tt(It)), Yo = K(
  ([
    { sizeRanges: t, sizes: e },
    { headerHeight: n, scrollTop: o },
    { initialTopMostItemIndex: r },
    { didMount: s },
    { useWindowScroll: i, windowScrollContainerState: l, windowViewportRect: u }
  ]) => {
    const d = U(), m = C(void 0), S = C(null), h = C(null);
    return F(l, S), F(u, h), Y(
      x(
        d,
        $(e, o, i, S, h, n)
      ),
      ([T, w, R, g, f, a, I]) => {
        const b = Oo(w.sizeTree);
        g && f !== null && a !== null && (R = f.scrollTop - a.offsetTop), R -= I, T({ ranges: b, scrollTop: R });
      }
    ), F(x(m, P(Ae), k(Zo)), r), F(
      x(
        s,
        $(m),
        P(([, T]) => T !== void 0),
        J(),
        k(([, T]) => T.ranges)
      ),
      t
    ), {
      getState: d,
      restoreStateFrom: m
    };
  },
  tt(Pt, It, pe, _t, qe)
);
function Zo(t) {
  return { align: "start", index: 0, offset: t.scrollTop };
}
const Xo = K(([{ topItemsIndexes: t }]) => {
  const e = C(0);
  return F(
    x(
      e,
      P((n) => n >= 0),
      k((n) => Array.from({ length: n }).map((o, r) => r))
    ),
    t
  ), { topItemCount: e };
}, tt(jt));
function Xn(t) {
  let e = !1, n;
  return (() => (e || (e = !0, n = t()), n));
}
const Jo = Xn(() => /iP(ad|od|hone)/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent)), Qo = K(
  ([
    { deviation: t, scrollBy: e, scrollingInProgress: n, scrollTop: o },
    { isAtBottom: r, isScrolling: s, lastJumpDueToItemResize: i, scrollDirection: l },
    { listState: u },
    { beforeUnshiftWith: d, gap: m, shiftWithOffset: S, sizes: h },
    { log: T },
    { recalcInProgress: w }
  ]) => {
    const R = bt(
      x(
        u,
        $(i),
        Lt(
          ([, f, a, I], [{ bottom: b, items: y, offsetBottom: z, totalCount: c }, p]) => {
            const v = b + z;
            let O = 0;
            return a === c && f.length > 0 && y.length > 0 && (y[0].originalIndex === 0 && f[0].originalIndex === 0 || (O = v - I, O !== 0 && (O += p))), [O, y, c, v];
          },
          [0, [], 0, 0]
        ),
        P(([f]) => f !== 0),
        $(o, l, n, r, T, w),
        P(([, f, a, I, , , b]) => !b && !I && f !== 0 && a === ae),
        k(([[f], , , , , a]) => (a("Upward scrolling compensation", { amount: f }, Ct.DEBUG), f))
      )
    );
    function g(f) {
      f > 0 ? (D(e, { behavior: "auto", top: -f }), D(t, 0)) : (D(t, 0), D(e, { behavior: "auto", top: -f }));
    }
    return Y(x(R, $(t, s)), ([f, a, I]) => {
      I && Jo() ? D(t, a - f) : g(-f);
    }), Y(
      x(
        ut(ht(s, !1), t, w),
        P(([f, a, I]) => !f && !I && a !== 0),
        k(([f, a]) => a),
        Gt(1)
      ),
      g
    ), F(
      x(
        S,
        k((f) => ({ top: -f }))
      ),
      e
    ), Y(
      x(
        d,
        $(h, m),
        k(([f, { groupIndices: a, lastSize: I, sizeTree: b }, y]) => {
          function z(c) {
            return c * (I + y);
          }
          if (a.length === 0)
            return z(f);
          {
            let c = 0;
            const p = le(b, 0);
            let v = 0, O = 0;
            for (; v < f; ) {
              v++, c += p;
              let B = a.length === O + 1 ? 1 / 0 : a[O + 1] - a[O] - 1;
              v + B > f && (c -= p, B = f - v + 1), v += B, c += z(B), O++;
            }
            return c;
          }
        })
      ),
      (f) => {
        D(t, f), requestAnimationFrame(() => {
          D(e, { top: f }), requestAnimationFrame(() => {
            D(t, 0), D(w, !1);
          });
        });
      }
    ), { deviation: t };
  },
  tt(It, he, jt, Pt, Wt, De)
), tr = K(
  ([
    t,
    e,
    n,
    o,
    r,
    s,
    i,
    l,
    u,
    d,
    m
  ]) => ({
    ...t,
    ...e,
    ...n,
    ...o,
    ...r,
    ...s,
    ...i,
    ...l,
    ...u,
    ...d,
    ...m
  }),
  tt(
    je,
    jo,
    _t,
    Zn,
    jn,
    qo,
    Do,
    qe,
    Yn,
    Wt,
    qn
  )
), Jn = K(
  ([
    {
      data: t,
      defaultItemSize: e,
      firstItemIndex: n,
      fixedItemSize: o,
      fixedGroupSize: r,
      gap: s,
      groupIndices: i,
      heightEstimates: l,
      itemSize: u,
      sizeRanges: d,
      sizes: m,
      statefulTotalCount: S,
      totalCount: h,
      trackItemSizes: T
    },
    { initialItemFinalLocationReached: w, initialTopMostItemIndex: R, scrolledToInitialItem: g },
    f,
    a,
    I,
    b,
    { scrollToIndex: y },
    z,
    { topItemCount: c },
    { groupCounts: p },
    v
  ]) => {
    const { listState: O, minOverscanItemCount: B, topItemsIndexes: W, rangeChanged: _, ...j } = b;
    return F(_, v.scrollSeekRangeChanged), F(
      x(
        v.windowViewportRect,
        k((L) => L.visibleHeight)
      ),
      f.viewportHeight
    ), {
      data: t,
      defaultItemHeight: e,
      firstItemIndex: n,
      fixedItemHeight: o,
      fixedGroupHeight: r,
      gap: s,
      groupCounts: p,
      heightEstimates: l,
      initialItemFinalLocationReached: w,
      initialTopMostItemIndex: R,
      scrolledToInitialItem: g,
      sizeRanges: d,
      topItemCount: c,
      topItemsIndexes: W,
      // input
      totalCount: h,
      ...I,
      groupIndices: i,
      itemSize: u,
      listState: O,
      minOverscanItemCount: B,
      scrollToIndex: y,
      // output
      statefulTotalCount: S,
      trackItemSizes: T,
      // exported from stateFlagsSystem
      rangeChanged: _,
      ...j,
      // the bag of IO from featureGroup1System
      ...v,
      ...f,
      sizes: m,
      ...a
    };
  },
  tt(
    Pt,
    pe,
    It,
    Yo,
    Ko,
    jt,
    me,
    Qo,
    Xo,
    Dn,
    tr
  )
);
function er(t, e) {
  const n = {}, o = {};
  let r = 0;
  const s = t.length;
  for (; r < s; )
    o[t[r]] = 1, r += 1;
  for (const i in e)
    Object.hasOwn(o, i) || (n[i] = e[i]);
  return n;
}
const Ie = typeof document < "u" ? E.useLayoutEffect : E.useEffect;
function Ye(t, e, n) {
  const o = Object.keys(e.required || {}), r = Object.keys(e.optional || {}), s = Object.keys(e.methods || {}), i = Object.keys(e.events || {}), l = E.createContext({});
  function u(f, a) {
    f.propsReady && D(f.propsReady, !1);
    for (const I of o) {
      const b = f[e.required[I]];
      D(b, a[I]);
    }
    for (const I of r)
      if (I in a) {
        const b = f[e.optional[I]];
        D(b, a[I]);
      }
    f.propsReady && D(f.propsReady, !0);
  }
  function d(f) {
    return s.reduce((a, I) => (a[I] = (b) => {
      const y = f[e.methods[I]];
      D(y, b);
    }, a), {});
  }
  function m(f) {
    return i.reduce((a, I) => (a[I] = xo(f[e.events[I]]), a), {});
  }
  const S = E.forwardRef((f, a) => {
    const { children: I, ...b } = f, [y] = E.useState(() => ye(To(t), (p) => {
      u(p, b);
    })), [z] = E.useState(an(m, y));
    Ie(() => {
      for (const p of i)
        p in b && Y(z[p], b[p]);
      return () => {
        Object.values(z).map(We);
      };
    }, [b, z, y]), Ie(() => {
      u(y, b);
    }), E.useImperativeHandle(a, un(d(y)));
    const c = n;
    return /* @__PURE__ */ G(l.Provider, { value: y, children: n ? /* @__PURE__ */ G(c, { ...er([...o, ...r, ...i], b), children: I }) : I });
  }), h = (f) => {
    const a = E.useContext(l);
    return E.useCallback(
      (I) => {
        D(a[f], I);
      },
      [a, f]
    );
  }, T = (f) => {
    const I = E.useContext(l)[f], b = E.useCallback(
      (y) => Y(I, y),
      [I]
    );
    return E.useSyncExternalStore(
      b,
      () => rt(I),
      () => rt(I)
    );
  }, w = (f) => {
    const I = E.useContext(l)[f], [b, y] = E.useState(an(rt, I));
    return Ie(
      () => Y(I, (z) => {
        z !== b && y(un(z));
      }),
      [I, b]
    ), b;
  }, R = E.version.startsWith("18") ? T : w;
  return {
    Component: S,
    useEmitter: (f, a) => {
      const b = E.useContext(l)[f];
      Ie(() => Y(b, a), [a, b]);
    },
    useEmitterValue: R,
    usePublisher: h
  };
}
const Re = E.createContext(void 0), Qn = E.createContext(void 0), to = typeof document < "u" ? E.useLayoutEffect : E.useEffect;
function ke(t) {
  return "self" in t;
}
function nr(t) {
  return "body" in t;
}
function eo(t, e, n, o = Qt, r, s) {
  const i = E.useRef(null), l = E.useRef(null), u = E.useRef(null), d = E.useCallback(
    (h) => {
      let T, w, R;
      const g = h.target;
      if (nr(g) || ke(g)) {
        const a = ke(g) ? g : g.defaultView;
        R = s ? a.scrollX : a.scrollY, T = s ? a.document.documentElement.scrollWidth : a.document.documentElement.scrollHeight, w = s ? a.innerWidth : a.innerHeight;
      } else
        R = s ? g.scrollLeft : g.scrollTop, T = s ? g.scrollWidth : g.scrollHeight, w = s ? g.offsetWidth : g.offsetHeight;
      const f = () => {
        t({
          scrollHeight: T,
          scrollTop: Math.max(R, 0),
          viewportHeight: w
        });
      };
      h.suppressFlushSync ? f() : fo.flushSync(f), l.current !== null && (R === l.current || R <= 0 || R === T - w) && (l.current = null, e(!0), u.current && (clearTimeout(u.current), u.current = null));
    },
    [t, e, s]
  );
  E.useEffect(() => {
    const h = r || i.current;
    return o(r || i.current), d({ suppressFlushSync: !0, target: h }), h.addEventListener("scroll", d, { passive: !0 }), () => {
      o(null), h.removeEventListener("scroll", d);
    };
  }, [i, d, n, o, r]);
  function m(h) {
    const T = i.current;
    if (!T || (s ? "offsetWidth" in T && T.offsetWidth === 0 : "offsetHeight" in T && T.offsetHeight === 0))
      return;
    const w = h.behavior === "smooth";
    let R, g, f;
    ke(T) ? (g = Math.max(
      zt(T.document.documentElement, s ? "width" : "height"),
      s ? T.document.documentElement.scrollWidth : T.document.documentElement.scrollHeight
    ), R = s ? T.innerWidth : T.innerHeight, f = s ? window.scrollX : window.scrollY) : (g = T[s ? "scrollWidth" : "scrollHeight"], R = zt(T, s ? "width" : "height"), f = T[s ? "scrollLeft" : "scrollTop"]);
    const a = g - R;
    if (h.top = Math.ceil(Math.max(Math.min(a, h.top), 0)), Un(R, g) || h.top === f) {
      t({ scrollHeight: g, scrollTop: f, viewportHeight: R }), w && e(!0);
      return;
    }
    w ? (l.current = h.top, u.current && clearTimeout(u.current), u.current = setTimeout(() => {
      u.current = null, l.current = null, e(!0);
    }, 1e3)) : l.current = null, s && (h = { behavior: h.behavior, left: h.top }), T.scrollTo(h);
  }
  function S(h) {
    s && (h = { behavior: h.behavior, left: h.top }), i.current.scrollBy(h);
  }
  return { scrollByCallback: S, scrollerRef: i, scrollToCallback: m };
}
const ze = "-webkit-sticky", Cn = "sticky", Ze = Xn(() => {
  if (typeof document > "u")
    return Cn;
  const t = document.createElement("div");
  return t.style.position = ze, t.style.position === ze ? ze : Cn;
});
function Xe(t) {
  return t;
}
const or = /* @__PURE__ */ K(() => {
  const t = C((l) => `Item ${l}`), e = C((l) => `Group ${l}`), n = C({}), o = C(Xe), r = C("div"), s = C(Qt), i = (l, u = null) => ht(
    x(
      n,
      k((d) => d[l]),
      J()
    ),
    u
  );
  return {
    components: n,
    computeItemKey: o,
    EmptyPlaceholder: i("EmptyPlaceholder"),
    FooterComponent: i("Footer"),
    GroupComponent: i("Group", "div"),
    groupContent: e,
    HeaderComponent: i("Header"),
    HeaderFooterTag: r,
    ItemComponent: i("Item", "div"),
    itemContent: t,
    ListComponent: i("List", "div"),
    ScrollerComponent: i("Scroller", "div"),
    scrollerRef: s,
    ScrollSeekPlaceholder: i("ScrollSeekPlaceholder"),
    TopItemListComponent: i("TopItemList")
  };
}), rr = /* @__PURE__ */ K(
  ([t, e]) => ({ ...t, ...e }),
  tt(Jn, or)
), sr = ({ height: t }) => /* @__PURE__ */ G("div", { style: { height: t } }), ir = { overflowAnchor: "none", position: Ze(), zIndex: 1 }, no = { overflowAnchor: "none" }, lr = { ...no, display: "inline-block", height: "100%" }, wn = /* @__PURE__ */ E.memo(function({ showTopList: e = !1 }) {
  const n = A("listState"), o = Rt("sizeRanges"), r = A("useWindowScroll"), s = A("customScrollParent"), i = Rt("windowScrollContainerState"), l = Rt("scrollContainerState"), u = s || r ? i : l, d = A("itemContent"), m = A("context"), S = A("groupContent"), h = A("trackItemSizes"), T = A("itemSize"), w = A("log"), R = Rt("gap"), g = A("horizontalDirection"), { callbackRef: f } = Fn(
    o,
    T,
    h,
    e ? Qt : u,
    w,
    R,
    s,
    g,
    A("skipAnimationFrameInResizeObserver")
  ), [a, I] = E.useState(0);
  tn("deviation", (L) => {
    a !== L && I(L);
  });
  const b = A("EmptyPlaceholder"), y = A("ScrollSeekPlaceholder") || sr, z = A("ListComponent"), c = A("ItemComponent"), p = A("GroupComponent"), v = A("computeItemKey"), O = A("isSeeking"), B = A("groupIndices").length > 0, W = A("alignToBottom"), _ = A("initialItemFinalLocationReached"), j = e ? {} : {
    boxSizing: "border-box",
    ...g ? {
      display: "inline-block",
      height: "100%",
      marginLeft: a !== 0 ? a : W ? "auto" : 0,
      paddingLeft: n.offsetTop,
      paddingRight: n.offsetBottom,
      whiteSpace: "nowrap"
    } : {
      marginTop: a !== 0 ? a : W ? "auto" : 0,
      paddingBottom: n.offsetBottom,
      paddingTop: n.offsetTop
    },
    ..._ ? {} : { visibility: "hidden" }
  };
  return !e && n.totalCount === 0 && b ? /* @__PURE__ */ G(b, { ...Q(b, m) }) : /* @__PURE__ */ G(
    z,
    {
      ...Q(z, m),
      "data-testid": e ? "virtuoso-top-item-list" : "virtuoso-item-list",
      ref: f,
      style: j,
      children: (e ? n.topItems : n.items).map((L) => {
        const xt = L.originalIndex, M = v(xt + n.firstItemIndex, L.data, m);
        return O ? /* @__PURE__ */ $t(
          y,
          {
            ...Q(y, m),
            height: L.size,
            index: L.index,
            key: M,
            type: L.type || "item",
            ...L.type === "group" ? {} : { groupIndex: L.groupIndex }
          }
        ) : L.type === "group" ? /* @__PURE__ */ $t(
          p,
          {
            ...Q(p, m),
            "data-index": xt,
            "data-item-index": L.index,
            "data-known-size": L.size,
            key: M,
            style: ir
          },
          S(L.index, m)
        ) : /* @__PURE__ */ $t(
          c,
          {
            ...Q(c, m),
            ...oo(c, L.data),
            "data-index": xt,
            "data-item-group-index": L.groupIndex,
            "data-item-index": L.index,
            "data-known-size": L.size,
            key: M,
            style: g ? lr : no
          },
          B ? d(L.index, L.groupIndex, L.data, m) : d(L.index, L.data, m)
        );
      })
    }
  );
}), cr = {
  height: "100%",
  outline: "none",
  overflowY: "auto",
  position: "relative",
  WebkitOverflowScrolling: "touch"
}, ur = {
  outline: "none",
  overflowX: "auto",
  position: "relative"
}, te = (t) => ({
  height: "100%",
  position: "absolute",
  top: 0,
  width: "100%",
  ...t ? { display: "flex", flexDirection: "column" } : {}
}), ar = {
  position: Ze(),
  top: 0,
  width: "100%",
  zIndex: 1
};
function Q(t, e) {
  if (typeof t != "string")
    return { context: e };
}
function oo(t, e) {
  return { item: typeof t == "string" ? void 0 : e };
}
const dr = /* @__PURE__ */ E.memo(function() {
  const e = A("HeaderComponent"), n = Rt("headerHeight"), o = A("HeaderFooterTag"), r = Vt(
    E.useMemo(
      () => (i) => {
        n(zt(i, "height"));
      },
      [n]
    ),
    !0,
    A("skipAnimationFrameInResizeObserver")
  ), s = A("context");
  return e ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...Q(e, s) }) }) : null;
}), fr = /* @__PURE__ */ E.memo(function() {
  const e = A("FooterComponent"), n = Rt("footerHeight"), o = A("HeaderFooterTag"), r = Vt(
    E.useMemo(
      () => (i) => {
        n(zt(i, "height"));
      },
      [n]
    ),
    !0,
    A("skipAnimationFrameInResizeObserver")
  ), s = A("context");
  return e ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...Q(e, s) }) }) : null;
});
function Je({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...u }) {
    const d = n("scrollContainerState"), m = e("ScrollerComponent"), S = n("smoothScrollTargetReached"), h = e("scrollerRef"), T = e("horizontalDirection") || !1, { scrollByCallback: w, scrollerRef: R, scrollToCallback: g } = eo(
      d,
      S,
      m,
      h,
      void 0,
      T
    );
    return t("scrollTo", g), t("scrollBy", w), /* @__PURE__ */ G(
      m,
      {
        "data-testid": "virtuoso-scroller",
        "data-virtuoso-scroller": !0,
        ref: R,
        style: { ...T ? ur : cr, ...i },
        tabIndex: 0,
        ...u,
        ...Q(m, l),
        children: s
      }
    );
  });
}
function Qe({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...u }) {
    const d = n("windowScrollContainerState"), m = e("ScrollerComponent"), S = n("smoothScrollTargetReached"), h = e("totalListHeight"), T = e("deviation"), w = e("customScrollParent"), R = E.useRef(null), g = e("scrollerRef"), { scrollByCallback: f, scrollerRef: a, scrollToCallback: I } = eo(
      d,
      S,
      m,
      g,
      w
    );
    return to(() => {
      var b;
      return a.current = w || ((b = R.current) == null ? void 0 : b.ownerDocument.defaultView), () => {
        a.current = null;
      };
    }, [a, w]), t("windowScrollTo", I), t("scrollBy", f), /* @__PURE__ */ G(
      m,
      {
        ref: R,
        "data-virtuoso-scroller": !0,
        style: { position: "relative", ...i, ...h !== 0 ? { height: h + T } : {} },
        ...u,
        ...Q(m, l),
        children: s
      }
    );
  });
}
const mr = ({ children: t }) => {
  const e = E.useContext(Re), n = Rt("viewportHeight"), o = Rt("fixedItemHeight"), r = A("alignToBottom"), s = A("horizontalDirection"), i = E.useMemo(
    () => se(n, (u) => zt(u, s ? "width" : "height")),
    [n, s]
  ), l = Vt(i, !0, A("skipAnimationFrameInResizeObserver"));
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "element", ref: l, style: te(r), children: t });
}, pr = ({ children: t }) => {
  const e = E.useContext(Re), n = Rt("windowViewportRect"), o = Rt("fixedItemHeight"), r = A("customScrollParent"), s = Ne(
    n,
    r,
    A("skipAnimationFrameInResizeObserver")
  ), i = A("alignToBottom");
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "window", ref: s, style: te(i), children: t });
}, hr = ({ children: t }) => {
  const e = A("TopItemListComponent") || "div", n = A("headerHeight"), o = { ...ar, marginTop: `${n}px` }, r = A("context");
  return /* @__PURE__ */ G(e, { style: o, ...Q(e, r), children: t });
}, gr = /* @__PURE__ */ E.memo(function(e) {
  const n = A("useWindowScroll"), o = A("topItemsIndexes").length > 0, r = A("customScrollParent"), s = A("context");
  return /* @__PURE__ */ Ut(r || n ? xr : Ir, { ...e, context: s, children: [
    o && /* @__PURE__ */ G(hr, { children: /* @__PURE__ */ G(wn, { showTopList: !0 }) }),
    /* @__PURE__ */ Ut(r || n ? pr : mr, { children: [
      /* @__PURE__ */ G(dr, {}),
      /* @__PURE__ */ G(wn, {}),
      /* @__PURE__ */ G(fr, {})
    ] })
  ] });
}), {
  Component: ro,
  useEmitter: tn,
  useEmitterValue: A,
  usePublisher: Rt
} = /* @__PURE__ */ Ye(
  rr,
  {
    required: {},
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      scrollIntoViewOnChange: "scrollIntoViewOnChange",
      itemContent: "itemContent",
      groupContent: "groupContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      groupCounts: "groupCounts",
      topItemCount: "topItemCount",
      firstItemIndex: "firstItemIndex",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      heightEstimates: "heightEstimates",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "HeaderFooterTag",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      horizontalDirection: "horizontalDirection",
      skipAnimationFrameInResizeObserver: "skipAnimationFrameInResizeObserver"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      autoscrollToBottom: "autoscrollToBottom",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  gr
), Ir = /* @__PURE__ */ Je({ useEmitter: tn, useEmitterValue: A, usePublisher: Rt }), xr = /* @__PURE__ */ Qe({ useEmitter: tn, useEmitterValue: A, usePublisher: Rt }), Yr = ro, Zr = ro, Sr = /* @__PURE__ */ K(() => {
  const t = C((d) => /* @__PURE__ */ Ut("td", { children: [
    "Item $",
    d
  ] })), e = C(null), n = C((d) => /* @__PURE__ */ Ut("td", { colSpan: 1e3, children: [
    "Group ",
    d
  ] })), o = C(null), r = C(null), s = C({}), i = C(Xe), l = C(Qt), u = (d, m = null) => ht(
    x(
      s,
      k((S) => S[d]),
      J()
    ),
    m
  );
  return {
    components: s,
    computeItemKey: i,
    context: e,
    EmptyPlaceholder: u("EmptyPlaceholder"),
    FillerRow: u("FillerRow"),
    fixedFooterContent: r,
    fixedHeaderContent: o,
    itemContent: t,
    groupContent: n,
    ScrollerComponent: u("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: u("ScrollSeekPlaceholder"),
    TableBodyComponent: u("TableBody", "tbody"),
    TableComponent: u("Table", "table"),
    TableFooterComponent: u("TableFoot", "tfoot"),
    TableHeadComponent: u("TableHead", "thead"),
    TableRowComponent: u("TableRow", "tr"),
    GroupComponent: u("Group", "tr")
  };
}), Tr = /* @__PURE__ */ K(
  ([t, e]) => ({ ...t, ...e }),
  tt(Jn, Sr)
), Cr = ({ height: t }) => /* @__PURE__ */ G("tr", { children: /* @__PURE__ */ G("td", { style: { height: t } }) }), wr = ({ height: t }) => /* @__PURE__ */ G("tr", { children: /* @__PURE__ */ G("td", { style: { border: 0, height: t, padding: 0 } }) }), vr = { overflowAnchor: "none" }, vn = { position: Ze(), zIndex: 2, overflowAnchor: "none" }, yn = /* @__PURE__ */ E.memo(function({ showTopList: e = !1 }) {
  const n = N("listState"), o = N("computeItemKey"), r = N("firstItemIndex"), s = N("context"), i = N("isSeeking"), l = N("fixedHeaderHeight"), u = N("groupIndices").length > 0, d = N("itemContent"), m = N("groupContent"), S = N("ScrollSeekPlaceholder") || Cr, h = N("GroupComponent"), T = N("TableRowComponent"), w = (e ? n.topItems : []).reduce((g, f, a) => (a === 0 ? g.push(f.size) : g.push(g[a - 1] + f.size), g), []), R = (e ? n.topItems : n.items).map((g) => {
    const f = g.originalIndex, a = o(f + r, g.data, s), I = e ? f === 0 ? 0 : w[f - 1] : 0;
    return i ? /* @__PURE__ */ $t(
      S,
      {
        ...Q(S, s),
        height: g.size,
        index: g.index,
        key: a,
        type: g.type || "item"
      }
    ) : g.type === "group" ? /* @__PURE__ */ $t(
      h,
      {
        ...Q(h, s),
        "data-index": f,
        "data-item-index": g.index,
        "data-known-size": g.size,
        key: a,
        style: {
          ...vn,
          top: l
        }
      },
      m(g.index, s)
    ) : /* @__PURE__ */ $t(
      T,
      {
        ...Q(T, s),
        ...oo(T, g.data),
        "data-index": f,
        "data-item-index": g.index,
        "data-known-size": g.size,
        "data-item-group-index": g.groupIndex,
        key: a,
        style: e ? { ...vn, top: l + I } : vr
      },
      u ? d(g.index, g.groupIndex, g.data, s) : d(g.index, g.data, s)
    );
  });
  return /* @__PURE__ */ G(ao, { children: R });
}), yr = /* @__PURE__ */ E.memo(function() {
  const e = N("listState"), n = N("topItemsIndexes").length > 0, o = Bt("sizeRanges"), r = N("useWindowScroll"), s = N("customScrollParent"), i = Bt("windowScrollContainerState"), l = Bt("scrollContainerState"), u = s || r ? i : l, d = N("trackItemSizes"), m = N("itemSize"), S = N("log"), { callbackRef: h, ref: T } = Fn(
    o,
    m,
    d,
    u,
    S,
    void 0,
    s,
    !1,
    N("skipAnimationFrameInResizeObserver")
  ), [w, R] = E.useState(0);
  en("deviation", (B) => {
    w !== B && (T.current.style.marginTop = `${B}px`, R(B));
  });
  const g = N("EmptyPlaceholder"), f = N("FillerRow") || wr, a = N("TableBodyComponent"), I = N("paddingTopAddition"), b = N("statefulTotalCount"), y = N("context");
  if (b === 0 && g)
    return /* @__PURE__ */ G(g, { ...Q(g, y) });
  const z = (n ? e.topItems : []).reduce((B, W) => B + W.size, 0), c = e.offsetTop + I + w - z, p = e.offsetBottom, v = c > 0 ? /* @__PURE__ */ G(f, { context: y, height: c }, "padding-top") : null, O = p > 0 ? /* @__PURE__ */ G(f, { context: y, height: p }, "padding-bottom") : null;
  return /* @__PURE__ */ Ut(a, { "data-testid": "virtuoso-item-list", ref: h, ...Q(a, y), children: [
    v,
    n && /* @__PURE__ */ G(yn, { showTopList: !0 }),
    /* @__PURE__ */ G(yn, {}),
    O
  ] });
}), br = ({ children: t }) => {
  const e = E.useContext(Re), n = Bt("viewportHeight"), o = Bt("fixedItemHeight"), r = Vt(
    E.useMemo(() => se(n, (s) => zt(s, "height")), [n]),
    !0,
    N("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "element", ref: r, style: te(!1), children: t });
}, Rr = ({ children: t }) => {
  const e = E.useContext(Re), n = Bt("windowViewportRect"), o = Bt("fixedItemHeight"), r = N("customScrollParent"), s = Ne(
    n,
    r,
    N("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { "data-viewport-type": "window", ref: s, style: te(!1), children: t });
}, Hr = /* @__PURE__ */ E.memo(function(e) {
  const n = N("useWindowScroll"), o = N("customScrollParent"), r = Bt("fixedHeaderHeight"), s = Bt("fixedFooterHeight"), i = N("fixedHeaderContent"), l = N("fixedFooterContent"), u = N("context"), d = Vt(
    E.useMemo(() => se(r, (a) => zt(a, "height")), [r]),
    !0,
    N("skipAnimationFrameInResizeObserver")
  ), m = Vt(
    E.useMemo(() => se(s, (a) => zt(a, "height")), [s]),
    !0,
    N("skipAnimationFrameInResizeObserver")
  ), S = o || n ? Br : Er, h = o || n ? Rr : br, T = N("TableComponent"), w = N("TableHeadComponent"), R = N("TableFooterComponent"), g = i ? /* @__PURE__ */ G(
    w,
    {
      ref: d,
      style: { position: "sticky", top: 0, zIndex: 2 },
      ...Q(w, u),
      children: i()
    },
    "TableHead"
  ) : null, f = l ? /* @__PURE__ */ G(
    R,
    {
      ref: m,
      style: { bottom: 0, position: "sticky", zIndex: 1 },
      ...Q(R, u),
      children: l()
    },
    "TableFoot"
  ) : null;
  return /* @__PURE__ */ G(S, { ...e, ...Q(S, u), children: /* @__PURE__ */ G(h, { children: /* @__PURE__ */ Ut(T, { style: { borderSpacing: 0, overflowAnchor: "none" }, ...Q(T, u), children: [
    g,
    /* @__PURE__ */ G(yr, {}, "TableBody"),
    f
  ] }) }) });
}), {
  Component: so,
  useEmitter: en,
  useEmitterValue: N,
  usePublisher: Bt
} = /* @__PURE__ */ Ye(
  Tr,
  {
    required: {},
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      firstItemIndex: "firstItemIndex",
      itemContent: "itemContent",
      groupContent: "groupContent",
      fixedHeaderContent: "fixedHeaderContent",
      fixedFooterContent: "fixedFooterContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      topItemCount: "topItemCount",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      groupCounts: "groupCounts",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  Hr
), Er = /* @__PURE__ */ Je({ useEmitter: en, useEmitterValue: N, usePublisher: Bt }), Br = /* @__PURE__ */ Qe({ useEmitter: en, useEmitterValue: N, usePublisher: Bt }), Xr = so, Jr = so, bn = {
  bottom: 0,
  itemHeight: 0,
  items: [],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
}, kr = {
  bottom: 0,
  itemHeight: 0,
  items: [{ index: 0 }],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
}, { ceil: Rn, floor: we, max: re, min: Oe, round: Hn } = Math;
function En(t, e, n) {
  return Array.from({ length: e - t + 1 }).map((o, r) => ({ data: n === null ? null : n[r + t], index: r + t }));
}
function zr(t) {
  return {
    ...kr,
    items: t
  };
}
function xe(t, e) {
  return t && t.width === e.width && t.height === e.height;
}
function Or(t, e) {
  return t && t.column === e.column && t.row === e.row;
}
const Fr = /* @__PURE__ */ K(
  ([
    { increaseViewportBy: t, listBoundary: e, overscan: n, visibleRange: o },
    { footerHeight: r, headerHeight: s, scrollBy: i, scrollContainerState: l, scrollTo: u, scrollTop: d, smoothScrollTargetReached: m, viewportHeight: S },
    h,
    T,
    { didMount: w, propsReady: R },
    { customScrollParent: g, useWindowScroll: f, windowScrollContainerState: a, windowScrollTo: I, windowViewportRect: b },
    y
  ]) => {
    const z = C(0), c = C(0), p = C(bn), v = C({ height: 0, width: 0 }), O = C({ height: 0, width: 0 }), B = U(), W = U(), _ = C(0), j = C(null), L = C({ column: 0, row: 0 }), xt = U(), M = U(), et = C(!1), wt = C(0), ft = C(!0), St = C(!1), Mt = C(!1);
    Y(
      x(
        w,
        $(wt),
        P(([H, q]) => !!q)
      ),
      () => {
        D(ft, !1);
      }
    ), Y(
      x(
        ut(w, ft, O, v, wt, St),
        P(([H, q, at, gt, , Tt]) => H && !q && at.height !== 0 && gt.height !== 0 && !Tt)
      ),
      ([, , , , H]) => {
        D(St, !0), Ue(1, () => {
          D(B, H);
        }), Et(x(d), () => {
          D(e, [0, 0]), D(ft, !0);
        });
      }
    ), F(
      x(
        M,
        P((H) => H != null && H.scrollTop > 0),
        Ft(0)
      ),
      c
    ), Y(
      x(
        w,
        $(M),
        P(([, H]) => H != null)
      ),
      ([, H]) => {
        H && (D(v, H.viewport), D(O, H.item), D(L, H.gap), H.scrollTop > 0 && (D(et, !0), Et(x(d, Kt(1)), (q) => {
          D(et, !1);
        }), D(u, { top: H.scrollTop })));
      }
    ), F(
      x(
        v,
        k(({ height: H }) => H)
      ),
      S
    ), F(
      x(
        ut(
          V(v, xe),
          V(O, xe),
          V(L, (H, q) => H && H.column === q.column && H.row === q.row),
          V(d)
        ),
        k(([H, q, at, gt]) => ({
          gap: at,
          item: q,
          scrollTop: gt,
          viewport: H
        }))
      ),
      xt
    ), F(
      x(
        ut(
          V(z),
          o,
          V(L, Or),
          V(O, xe),
          V(v, xe),
          V(j),
          V(c),
          V(et),
          V(ft),
          V(wt)
        ),
        P(([, , , , , , , H]) => !H),
        k(
          ([
            H,
            [q, at],
            gt,
            Tt,
            st,
            it,
            mt,
            ,
            lt,
            Z
          ]) => {
            const { column: nt, row: vt } = gt, { height: ct, width: He } = Tt, { width: nn } = st;
            if (mt === 0 && (H === 0 || nn === 0))
              return bn;
            if (He === 0) {
              const cn = Ke(Z, H), uo = cn + Math.max(mt - 1, 0);
              return zr(En(cn, uo, it));
            }
            const ge = io(nn, He, nt);
            let Yt, Nt;
            lt ? q === 0 && at === 0 && mt > 0 ? (Yt = 0, Nt = mt - 1) : (Yt = ge * we((q + vt) / (ct + vt)), Nt = ge * Rn((at + vt) / (ct + vt)) - 1, Nt = Oe(H - 1, re(Nt, ge - 1)), Yt = Oe(Nt, re(0, Yt))) : (Yt = 0, Nt = -1);
            const on = En(Yt, Nt, it), { bottom: rn, top: sn } = Bn(st, gt, Tt, on), ln = Rn(H / ge), co = ln * ct + (ln - 1) * vt - rn;
            return { bottom: rn, itemHeight: ct, items: on, itemWidth: He, offsetBottom: co, offsetTop: sn, top: sn };
          }
        )
      ),
      p
    ), F(
      x(
        j,
        P((H) => H !== null),
        k((H) => H.length)
      ),
      z
    ), F(
      x(
        ut(v, O, p, L),
        P(([H, q, { items: at }]) => at.length > 0 && q.height !== 0 && H.height !== 0),
        k(([H, q, { items: at }, gt]) => {
          const { bottom: Tt, top: st } = Bn(H, gt, q, at);
          return [st, Tt];
        }),
        J(ce)
      ),
      e
    );
    const pt = C(!1);
    F(
      x(
        d,
        $(pt),
        k(([H, q]) => q || H !== 0)
      ),
      pt
    );
    const qt = bt(
      x(
        ut(p, z),
        P(([{ items: H }]) => H.length > 0),
        $(pt),
        P(([[H, q], at]) => {
          const Tt = H.items[H.items.length - 1].index === q - 1;
          return (at || H.bottom > 0 && H.itemHeight > 0 && H.offsetBottom === 0 && H.items.length === q) && Tt;
        }),
        k(([[, H]]) => H - 1),
        J()
      )
    ), ee = bt(
      x(
        V(p),
        P(({ items: H }) => H.length > 0 && H[0].index === 0),
        Ft(0),
        J()
      )
    ), Ot = bt(
      x(
        V(p),
        $(et),
        P(([{ items: H }, q]) => H.length > 0 && !q),
        k(([{ items: H }]) => ({
          endIndex: H[H.length - 1].index,
          startIndex: H[0].index
        })),
        J(An),
        Gt(0)
      )
    );
    F(Ot, T.scrollSeekRangeChanged), F(
      x(
        B,
        $(v, O, z, L),
        k(([H, q, at, gt, Tt]) => {
          const st = $n(H), { align: it, behavior: mt, offset: lt } = st;
          let Z = st.index;
          Z === "LAST" && (Z = gt - 1), Z = re(0, Z, Oe(gt - 1, Z));
          let nt = Me(q, Tt, at, Z);
          return it === "end" ? nt = Hn(nt - q.height + at.height) : it === "center" && (nt = Hn(nt - q.height / 2 + at.height / 2)), lt && (nt += lt), { behavior: mt, top: nt };
        })
      ),
      u
    );
    const ne = ht(
      x(
        p,
        k((H) => H.offsetBottom + H.bottom)
      ),
      0
    );
    return F(
      x(
        b,
        k((H) => ({ height: H.visibleHeight, width: H.visibleWidth }))
      ),
      v
    ), {
      customScrollParent: g,
      // input
      data: j,
      deviation: _,
      footerHeight: r,
      gap: L,
      headerHeight: s,
      increaseViewportBy: t,
      initialItemCount: c,
      itemDimensions: O,
      overscan: n,
      restoreStateFrom: M,
      scrollBy: i,
      scrollContainerState: l,
      scrollHeight: W,
      scrollTo: u,
      scrollToIndex: B,
      scrollTop: d,
      smoothScrollTargetReached: m,
      totalCount: z,
      useWindowScroll: f,
      viewportDimensions: v,
      windowScrollContainerState: a,
      windowScrollTo: I,
      windowViewportRect: b,
      ...T,
      // output
      gridState: p,
      horizontalDirection: Mt,
      initialTopMostItemIndex: wt,
      totalListHeight: ne,
      ...h,
      endReached: qt,
      propsReady: R,
      rangeChanged: Ot,
      startReached: ee,
      stateChanged: xt,
      stateRestoreInProgress: et,
      ...y
    };
  },
  tt(je, It, he, Zn, _t, qe, Wt)
);
function io(t, e, n) {
  return re(1, we((t + n) / (we(e) + n)));
}
function Bn(t, e, n, o) {
  const { height: r } = n;
  if (r === void 0 || o.length === 0)
    return { bottom: 0, top: 0 };
  const s = Me(t, e, n, o[0].index);
  return { bottom: Me(t, e, n, o[o.length - 1].index) + r, top: s };
}
function Me(t, e, n, o) {
  const r = io(t.width, n.width, e.column), s = we(o / r), i = s * n.height + re(0, s - 1) * e.row;
  return i > 0 ? i + e.row : i;
}
const Lr = /* @__PURE__ */ K(() => {
  const t = C((S) => `Item ${S}`), e = C({}), n = C(null), o = C("virtuoso-grid-item"), r = C("virtuoso-grid-list"), s = C(Xe), i = C("div"), l = C(Qt), u = (S, h = null) => ht(
    x(
      e,
      k((T) => T[S]),
      J()
    ),
    h
  ), d = C(!1), m = C(!1);
  return F(V(m), d), {
    components: e,
    computeItemKey: s,
    context: n,
    FooterComponent: u("Footer"),
    HeaderComponent: u("Header"),
    headerFooterTag: i,
    itemClassName: o,
    ItemComponent: u("Item", "div"),
    itemContent: t,
    listClassName: r,
    ListComponent: u("List", "div"),
    readyStateChanged: d,
    reportReadyState: m,
    ScrollerComponent: u("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: u("ScrollSeekPlaceholder", "div")
  };
}), Vr = /* @__PURE__ */ K(
  ([t, e]) => ({ ...t, ...e }),
  tt(Fr, Lr)
), Pr = /* @__PURE__ */ E.memo(function() {
  const e = ot("gridState"), n = ot("listClassName"), o = ot("itemClassName"), r = ot("itemContent"), s = ot("computeItemKey"), i = ot("isSeeking"), l = Ht("scrollHeight"), u = ot("ItemComponent"), d = ot("ListComponent"), m = ot("ScrollSeekPlaceholder"), S = ot("context"), h = Ht("itemDimensions"), T = Ht("gap"), w = ot("log"), R = ot("stateRestoreInProgress"), g = Ht("reportReadyState"), f = Vt(
    E.useMemo(
      () => (a) => {
        const I = a.parentElement.parentElement.scrollHeight;
        l(I);
        const b = a.firstChild;
        if (b) {
          const { height: y, width: z } = b.getBoundingClientRect();
          h({ height: y, width: z });
        }
        T({
          column: kn("column-gap", getComputedStyle(a).columnGap, w),
          row: kn("row-gap", getComputedStyle(a).rowGap, w)
        });
      },
      [l, h, T, w]
    ),
    !0,
    !1
  );
  return to(() => {
    e.itemHeight > 0 && e.itemWidth > 0 && g(!0);
  }, [e]), R ? null : /* @__PURE__ */ G(
    d,
    {
      className: n,
      ref: f,
      ...Q(d, S),
      "data-testid": "virtuoso-item-list",
      style: { paddingBottom: e.offsetBottom, paddingTop: e.offsetTop },
      children: e.items.map((a) => {
        const I = s(a.index, a.data, S);
        return i ? /* @__PURE__ */ G(
          m,
          {
            ...Q(m, S),
            height: e.itemHeight,
            index: a.index,
            width: e.itemWidth
          },
          I
        ) : /* @__PURE__ */ $t(
          u,
          {
            ...Q(u, S),
            className: o,
            "data-index": a.index,
            key: I
          },
          r(a.index, a.data, S)
        );
      })
    }
  );
}), Gr = E.memo(function() {
  const e = ot("HeaderComponent"), n = Ht("headerHeight"), o = ot("headerFooterTag"), r = Vt(
    E.useMemo(
      () => (i) => {
        n(zt(i, "height"));
      },
      [n]
    ),
    !0,
    !1
  ), s = ot("context");
  return e ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...Q(e, s) }) }) : null;
}), Mr = E.memo(function() {
  const e = ot("FooterComponent"), n = Ht("footerHeight"), o = ot("headerFooterTag"), r = Vt(
    E.useMemo(
      () => (i) => {
        n(zt(i, "height"));
      },
      [n]
    ),
    !0,
    !1
  ), s = ot("context");
  return e ? /* @__PURE__ */ G(o, { ref: r, children: /* @__PURE__ */ G(e, { ...Q(e, s) }) }) : null;
}), Ar = ({ children: t }) => {
  const e = E.useContext(Qn), n = Ht("itemDimensions"), o = Ht("viewportDimensions"), r = Vt(
    E.useMemo(
      () => (s) => {
        o(s.getBoundingClientRect());
      },
      [o]
    ),
    !0,
    !1
  );
  return E.useEffect(() => {
    e && (o({ height: e.viewportHeight, width: e.viewportWidth }), n({ height: e.itemHeight, width: e.itemWidth }));
  }, [e, o, n]), /* @__PURE__ */ G("div", { ref: r, style: te(!1), children: t });
}, Wr = ({ children: t }) => {
  const e = E.useContext(Qn), n = Ht("windowViewportRect"), o = Ht("itemDimensions"), r = ot("customScrollParent"), s = Ne(n, r, !1);
  return E.useEffect(() => {
    e && (o({ height: e.itemHeight, width: e.itemWidth }), n({ offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: e.viewportWidth }));
  }, [e, n, o]), /* @__PURE__ */ G("div", { ref: s, style: te(!1), children: t });
}, _r = /* @__PURE__ */ E.memo(function({ ...e }) {
  const n = ot("useWindowScroll"), o = ot("customScrollParent"), r = o || n ? $r : Dr, s = o || n ? Wr : Ar, i = ot("context");
  return /* @__PURE__ */ G(r, { ...e, ...Q(r, i), children: /* @__PURE__ */ Ut(s, { children: [
    /* @__PURE__ */ G(Gr, {}),
    /* @__PURE__ */ G(Pr, {}),
    /* @__PURE__ */ G(Mr, {})
  ] }) });
}), {
  Component: Nr,
  useEmitter: lo,
  useEmitterValue: ot,
  usePublisher: Ht
} = /* @__PURE__ */ Ye(
  Vr,
  {
    optional: {
      context: "context",
      totalCount: "totalCount",
      overscan: "overscan",
      itemContent: "itemContent",
      components: "components",
      computeItemKey: "computeItemKey",
      data: "data",
      initialItemCount: "initialItemCount",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "headerFooterTag",
      listClassName: "listClassName",
      itemClassName: "itemClassName",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      restoreStateFrom: "restoreStateFrom",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      increaseViewportBy: "increaseViewportBy"
    },
    methods: {
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      scrollToIndex: "scrollToIndex"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      stateChanged: "stateChanged",
      readyStateChanged: "readyStateChanged"
    }
  },
  _r
), Dr = /* @__PURE__ */ Je({ useEmitter: lo, useEmitterValue: ot, usePublisher: Ht }), $r = /* @__PURE__ */ Qe({ useEmitter: lo, useEmitterValue: ot, usePublisher: Ht });
function kn(t, e, n) {
  return e !== "normal" && !(e != null && e.endsWith("px")) && n(`${t} was not resolved to pixel value correctly`, e, Ct.WARN), e === "normal" ? 0 : parseInt(e != null ? e : "0", 10);
}
const Qr = Nr;
export {
  Jr as GroupedTableVirtuoso,
  Zr as GroupedVirtuoso,
  Ct as LogLevel,
  Xr as TableVirtuoso,
  Yr as Virtuoso,
  Qr as VirtuosoGrid,
  Qn as VirtuosoGridMockContext,
  Re as VirtuosoMockContext
};
