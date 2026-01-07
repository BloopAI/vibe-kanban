import { Cell as u, Signal as E, map as d, filter as v, withLatestFrom as S, scan as le, debounceTime as Ee, mapTo as _, throttleTime as on, delayWithMicrotask as Qe, onNext as En, Action as sn, useCellValue as C, useRealm as Ce, Realm as Do, RealmContext as Vo, useCellValues as Oo, usePublisher as Ho } from "@virtuoso.dev/gurx";
import h, { useEffect as yn, useLayoutEffect as No } from "react";
import { jsx as $, jsxs as $n } from "react/jsx-runtime";
function Me(e, t) {
  const n = u(e, (o) => {
    o.link(t(o), n);
  });
  return n;
}
const _e = { lvl: 0 };
function wn(e, t, n, o = _e, i = _e) {
  return { k: e, l: o, lvl: n, r: i, v: t };
}
function T(e) {
  return e === _e;
}
function Ae() {
  return _e;
}
function zt(e, t) {
  if (T(e)) return _e;
  const { k: n, l: o, r: i } = e;
  if (t === n) {
    if (T(o))
      return i;
    if (T(i))
      return o;
    const [s, l] = Ln(o);
    return bt(A(e, { k: s, l: Rn(o), v: l }));
  }
  return t < n ? bt(A(e, { l: zt(o, t) })) : bt(A(e, { r: zt(i, t) }));
}
function he(e, t, n = "k") {
  if (T(e))
    return [Number.NEGATIVE_INFINITY, void 0];
  if (e[n] === t)
    return [e.k, e.v];
  if (e[n] < t) {
    const o = he(e.r, t, n);
    return o[0] === Number.NEGATIVE_INFINITY ? [e.k, e.v] : o;
  }
  return he(e.l, t, n);
}
function P(e, t, n) {
  return T(e) ? wn(t, n, 1) : t === e.k ? A(e, { k: t, v: n }) : t < e.k ? In(A(e, { l: P(e.l, t, n) })) : In(A(e, { r: P(e.r, t, n) }));
}
function Yt(e, t, n) {
  if (T(e))
    return [];
  const { k: o, v: i, l: s, r: l } = e;
  let r = [];
  return o > t && (r = r.concat(Yt(s, t, n))), o >= t && o <= n && r.push({ k: o, v: i }), o <= n && (r = r.concat(Yt(l, t, n))), r;
}
function Bo(e, t, n, o) {
  if (T(e))
    return _e;
  let i = Ae();
  for (const { k: s, v: l } of de(e))
    s > t && s <= n ? i = P(i, ...o(s, l)) : i = P(i, s, l);
  return i;
}
function Fo(e, t, n) {
  let o = Ae(), i = -1;
  for (const { start: s, end: l, value: r } of _o(e))
    s < t ? (o = P(o, s, r), i = r) : s > t + n ? o = P(o, s - n, r) : l >= t + n && i !== r && (o = P(o, t, r));
  return o;
}
function de(e) {
  return T(e) ? [] : [...de(e.l), { k: e.k, v: e.v }, ...de(e.r)];
}
function Ln(e) {
  return T(e.r) ? [e.k, e.v] : Ln(e.r);
}
function Rn(e) {
  return T(e.r) ? e.l : bt(A(e, { r: Rn(e.r) }));
}
function A(e, t) {
  return wn(t.k ?? e.k, t.v ?? e.v, t.lvl ?? e.lvl, t.l ?? e.l, t.r ?? e.r);
}
function _t(e) {
  return T(e) || e.lvl > e.r.lvl;
}
function In(e) {
  return jt(Dn(e));
}
function bt(e) {
  const { l: t, r: n, lvl: o } = e;
  if (n.lvl >= o - 1 && t.lvl >= o - 1)
    return e;
  if (o > n.lvl + 1) {
    if (_t(t))
      return Dn(A(e, { lvl: o - 1 }));
    if (!T(t) && !T(t.r))
      return A(t.r, {
        l: A(t, { r: t.r.l }),
        lvl: o,
        r: A(e, {
          l: t.r.r,
          lvl: o - 1
        })
      });
    throw new Error("Unexpected empty nodes");
  }
  if (_t(e))
    return jt(A(e, { lvl: o - 1 }));
  if (!T(n) && !T(n.l)) {
    const i = n.l, s = _t(i) ? n.lvl - 1 : n.lvl;
    return A(i, {
      l: A(e, {
        lvl: o - 1,
        r: i.l
      }),
      lvl: i.lvl + 1,
      r: jt(A(n, { l: i.r, lvl: s }))
    });
  }
  throw new Error("Unexpected empty nodes");
}
function _o(e) {
  return An(de(e));
}
function Cn(e, t, n) {
  if (T(e))
    return [];
  const o = he(e, t)[0];
  return An(Yt(e, o, n));
}
function Mn(e, t) {
  const n = e.length;
  if (n === 0)
    return [];
  let { index: o, value: i } = t(e[0]);
  const s = [];
  for (let l = 1; l < n; l++) {
    const { index: r, value: a } = t(e[l]);
    s.push({ end: r - 1, start: o, value: i }), o = r, i = a;
  }
  return s.push({ end: Number.POSITIVE_INFINITY, start: o, value: i }), s;
}
function An(e) {
  return Mn(e, ({ k: t, v: n }) => ({ index: t, value: n }));
}
function jt(e) {
  const { r: t, lvl: n } = e;
  return !T(t) && !T(t.r) && t.lvl === n && t.r.lvl === n ? A(t, { l: A(e, { r: t.l }), lvl: n + 1 }) : e;
}
function Dn(e) {
  const { l: t } = e;
  return !T(t) && t.lvl === e.lvl ? A(t, { r: A(e, { l: t.r }) }) : e;
}
function $t(e, t, n, o = 0) {
  let i = e.length - 1;
  for (; o <= i; ) {
    const s = Math.floor((o + i) / 2), l = e[s], r = n(l, t);
    if (r === 0)
      return s;
    if (r === -1) {
      if (i - o < 2)
        return s - 1;
      i = s - 1;
    } else {
      if (i === o)
        return s;
      o = s + 1;
    }
  }
  throw new Error(`Failed binary finding record in array - ${e.join(",")}, searched for ${t}`);
}
function Vn(e, t, n) {
  return e[$t(e, t, n)];
}
function Po(e, t, n, o) {
  const i = $t(e, t, o), s = $t(e, n, o, i);
  return e.slice(i, s + 1);
}
function ln({ index: e }, t) {
  return t === e ? 0 : t < e ? -1 : 1;
}
function Wo({ offset: e }, t) {
  return t === e ? 0 : t < e ? -1 : 1;
}
function zo(e) {
  return { index: e.index, value: e };
}
function Yo(e, t, n, o = 0) {
  return o > 0 && (t = Math.max(t, Vn(e, o, ln).offset)), t = Math.max(0, t), Mn(Po(e, t, n, Wo), zo);
}
const Pe = [[], 0, 0, 0];
function jo(e, [t, n]) {
  let o = 0, i = 0, s = 0, l = 0;
  if (n !== 0) {
    l = $t(e, n - 1, ln), s = e[l].offset;
    const a = he(t, n - 1);
    o = a[0], i = a[1], e.length && e[l].height === he(t, n)[1] && (l -= 1), e = e.slice(0, l + 1);
  } else
    e = [];
  for (const { start: r, value: a } of Cn(t, n, Number.POSITIVE_INFINITY)) {
    const c = (r - o) * i + s;
    e.push({ height: a, index: r, offset: c }), o = r, s = c, i = a;
  }
  return [e, i, s, o];
}
function Ko(e) {
  const { size: t, startIndex: n, endIndex: o } = e;
  return (i) => i.start === n && (i.end === o || i.end === Number.POSITIVE_INFINITY) && i.value === t;
}
function qo(e, t) {
  let n = T(e) ? 0 : Number.POSITIVE_INFINITY;
  for (const o of t) {
    const { size: i, startIndex: s, endIndex: l } = o;
    if (n = Math.min(n, s), T(e)) {
      e = P(e, 0, i);
      continue;
    }
    const r = Cn(e, s - 1, l + 1);
    if (r.some(Ko(o)))
      continue;
    let a = !1, c = !1;
    for (const { start: p, end: g, value: b } of r)
      a ? (l >= p || i === b) && (e = zt(e, p)) : (c = b !== i, a = !0), g > l && l >= p && b !== i && (e = P(e, l + 1, b));
    c && (e = P(e, s, i));
  }
  return [e, n];
}
const ot = [Ae(), 0];
function Uo(e, [t, n]) {
  if (n.length > 0 && T(e) && t.length === 2) {
    const o = t[0].size, i = t[1].size;
    return [
      n.reduce((s, l) => P(P(s, l, o), l + 1, i), Ae()),
      0
    ];
  }
  return qo(e, t);
}
const fe = E();
u([]);
u([]);
u(0);
u(null);
u(Number.NaN);
const ye = u(!1), Q = u(ot, (e) => {
  e.link(
    e.pipe(
      fe,
      v((t) => t.length > 0),
      S(ee),
      d(([t, n]) => Uo(n, [t, []]))
    ),
    Q
  );
}), ee = u(ot[0], (e) => {
  e.link(
    e.pipe(
      Q,
      d(([t]) => t)
    ),
    ee
  );
}), On = u(ot[1], (e) => {
  e.link(
    e.pipe(
      Q,
      d(([, t]) => t)
    ),
    On
  );
}), $e = u(Pe[1]), te = u(Pe[0]), Je = u(Pe, (e) => {
  e.link(
    e.pipe(
      ee,
      S(On),
      le(([t], [n, o]) => jo(t, [n, o]), Pe)
    ),
    Je
  ), e.link(
    e.pipe(
      Je,
      d(([, t]) => t)
    ),
    $e
  ), e.link(
    e.pipe(
      Je,
      d(([t]) => t)
    ),
    te
  );
}), Hn = u(Pe[2], (e) => {
  e.link(
    e.pipe(
      Je,
      d(([, , t]) => t)
    ),
    Hn
  );
}), Nn = u(Pe[3], (e) => {
  e.link(
    e.pipe(
      Je,
      d(([, , , t]) => t)
    ),
    Nn
  );
}), Ke = u(0, (e) => {
  e.link(
    e.pipe(
      e.combine(De, Nn, Hn, $e),
      d(([t, n, o, i]) => o + (t - n) * i)
    ),
    Ke
  );
});
function Bn(e, t) {
  if (t.length === 0)
    return [0, 0];
  const { offset: n, index: o, height: i } = Vn(t, e, ln);
  return [i * (e - o) + n, i];
}
function we(e, t) {
  return Bn(e, t)[0];
}
function Fn(e, t) {
  return Math.abs(e - t) < 1.01;
}
function _n() {
  return typeof navigator > "u" ? !1 : /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1 || /iP(ad|od|hone)/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent);
}
function Go(e) {
  return !e;
}
function Zo(e) {
  return e === 1 ? 1 : 1 - 2 ** (-10 * e);
}
function Mt(e = 1) {
  return (t, n) => {
    const o = n.signalInstance();
    return n.sub(t, (i) => {
      let s = e;
      function l() {
        s > 0 ? (s--, requestAnimationFrame(l)) : n.pub(o, i);
      }
      l();
    }), o;
  };
}
const Kt = "up", Pt = "down", Jo = "none", Xo = {
  atBottom: !1,
  notAtBottomBecause: "NOT_SHOWING_LAST_ITEM",
  state: {
    offsetBottom: 0,
    scrollTop: 0,
    viewportHeight: 0,
    viewportWidth: 0,
    scrollHeight: 0
  }
}, Qo = 0, ei = 4;
function vn(e) {
  return (t, n) => {
    const o = n.signalInstance();
    return n.sub(t, (i) => {
      e > 0 ? e-- : n.pub(o, i);
    }), o;
  };
}
u(!1);
const Pn = u(!0);
E();
const xe = u(!1), ti = E((e) => {
  e.link(e.pipe(Pn, on(50)), ti);
}), Wn = u(ei), ni = u(Qo, (e) => {
  e.link(
    e.pipe(
      e.combine(L, ni),
      d(([t, n]) => t <= n)
    ),
    Pn
  );
}), et = u(!1, (e) => {
  e.link(e.pipe(L, vn(1), _(!0)), et), e.link(e.pipe(L, vn(1), _(!1), Ee(100)), et);
}), qt = u(!1, (e) => {
  e.link(e.pipe(q, _(!0)), qt), e.link(e.pipe(q, _(!1), Ee(200)), qt);
}), rn = u(!1), It = u(
  null,
  (e) => {
    e.link(
      e.pipe(
        e.combine(
          V,
          L,
          U,
          Et,
          Wn,
          Ct,
          Dt,
          ee
        ),
        v(([, , , , , , , t]) => !T(t)),
        le((t, [n, o, i, s, l, r]) => {
          const c = o + i - n + r > -l, p = {
            viewportWidth: s,
            viewportHeight: i,
            scrollTop: o,
            scrollHeight: n,
            listMarginTop: r
          };
          if (c) {
            let b, I;
            return o > t.state.scrollTop ? (b = "SCROLLED_DOWN", I = t.state.scrollTop - o) : (b = n === i ? "LIST_TOO_SHORT" : "SIZE_DECREASED", I = t.state.scrollTop - o || t.scrollTopDelta), {
              atBottom: !0,
              state: p,
              atBottomBecause: b,
              scrollTopDelta: I
            };
          }
          let g;
          return i < t.state.viewportHeight ? g = "VIEWPORT_HEIGHT_DECREASING" : s < t.state.viewportWidth ? g = "VIEWPORT_WIDTH_DECREASING" : o < t.state.scrollTop ? g = "SCROLLING_UPWARDS" : p.scrollHeight > t.state.scrollHeight || p.listMarginTop < t.state.listMarginTop ? t.atBottom ? g = "SIZE_INCREASED" : g = t.notAtBottomBecause : t.atBottom ? g = "NOT_FULLY_SCROLLED_TO_LAST_ITEM_BOTTOM" : g = t.notAtBottomBecause, {
            atBottom: !1,
            notAtBottomBecause: g,
            state: p
          };
        }, Xo)
      ),
      It
    ), e.link(
      e.pipe(
        It,
        le(
          ({ prev: t }, n) => {
            const o = !!(t && n && t.atBottom && !n.atBottom && n.notAtBottomBecause === "SIZE_INCREASED");
            return {
              prev: n,
              shouldScroll: o
            };
          },
          { prev: null, shouldScroll: !1 }
        ),
        d(({ shouldScroll: t }) => t)
      ),
      rn
    ), e.sub(
      e.pipe(
        U,
        S(It, hn, tt),
        v(([, , t, n]) => !t && !n),
        le(
          (t, [n, o]) => {
            let i = 0;
            return t.viewportHeight > n && o && !o.atBottom && o.notAtBottomBecause === "VIEWPORT_HEIGHT_DECREASING" && (i = t.viewportHeight - n), { viewportHeight: n, delta: i };
          },
          { viewportHeight: 0, delta: 0 }
        )
      ),
      (t) => {
        t.delta && e.pub(q, t.delta);
      }
    );
  },
  (e, t) => !e || e.atBottom !== (t == null ? void 0 : t.atBottom) ? !1 : !e.atBottom && !t.atBottom ? e.notAtBottomBecause === t.notAtBottomBecause : !0
), zn = u(0, (e) => {
  e.link(
    e.pipe(
      e.combine(L, V, U),
      le(
        (t, [n, o, i]) => {
          if (!Fn(t.scrollHeight, o)) {
            const s = o - (n + i) < 1;
            return t.scrollTop !== n && s ? {
              scrollHeight: o,
              scrollTop: n,
              jump: t.scrollTop - n,
              changed: !0
            } : {
              scrollHeight: o,
              scrollTop: n,
              jump: 0,
              changed: !0
            };
          }
          return {
            scrollTop: n,
            scrollHeight: o,
            jump: 0,
            changed: !1
          };
        },
        { scrollHeight: 0, jump: 0, scrollTop: 0, changed: !1 }
      ),
      v((t) => t.changed),
      d((t) => t.jump)
    ),
    zn
  );
}), wt = u(Pt, (e) => {
  e.link(
    e.pipe(
      L,
      le(
        (t, n) => {
          if (n < 0)
            return { direction: Kt, prevScrollTop: 0 };
          if (e.getValue(qt))
            return { direction: t.direction, prevScrollTop: n };
          const i = n === t.prevScrollTop && n === 0;
          return {
            direction: n < t.prevScrollTop || i ? Kt : Pt,
            prevScrollTop: n
          };
        },
        { direction: Pt, prevScrollTop: 0 }
      ),
      d((t) => t.direction)
    ),
    wt
  ), e.link(e.pipe(L, Ee(100), _(Jo)), wt);
}), kn = u(0, (e) => {
  e.link(e.pipe(et, v(Go), _(0)), kn), e.link(
    e.pipe(
      L,
      on(100),
      S(et),
      v(([, t]) => !!t),
      le(([, t], [n]) => [t, n], [0, 0]),
      d(([t, n]) => n - t)
    ),
    kn
  );
});
function un(e, t) {
  if (typeof e == "number")
    return {
      index: e,
      offset: 0,
      behavior: "auto",
      align: "start-no-overflow"
    };
  const n = {
    index: Number.NaN,
    align: e.align ?? "start-no-overflow",
    behavior: e.behavior ?? "auto",
    offset: e.offset ?? 0
  };
  return e.index === "LAST" ? n.index = t : e.index < 0 ? n.index = t + e.index : n.index = e.index, n;
}
function Yn({
  location: e,
  sizeTree: t,
  offsetTree: n,
  totalHeight: o,
  totalCount: i,
  viewportHeight: s,
  headerHeight: l,
  stickyHeaderHeight: r,
  stickyFooterHeight: a
}) {
  const { align: c, behavior: p, offset: g, index: b } = un(e, i - 1);
  function I() {
    const y = he(t, b)[1];
    if (y === void 0)
      throw new Error(`Item at index ${b} not found`);
    return y;
  }
  s -= r + a;
  let f = we(b, n) + l - r;
  c === "end" ? f = f - s + I() : c === "center" && (f = f - s / 2 + I() / 2), g && (f += g);
  let m = 0;
  return c === "start" && (m = Math.max(0, Math.min(f - (o - s)))), f = Math.max(0, f), { top: f, behavior: p, align: c, forceBottomSpace: m };
}
const Ze = u(null), oi = u(!1), Xe = u(!0), Ut = E((e) => {
  e.link(
    e.pipe(
      Ut,
      d(() => !0)
    ),
    Xe
  ), e.link(
    e.pipe(
      Ut,
      d(() => null)
    ),
    Ze
  );
}), jn = E((e) => {
  e.link(
    e.pipe(
      jn,
      S(De, te, ct),
      d(([t, n, o, i]) => {
        let { align: s, behavior: l, offset: r, index: a } = un(t, n - 1);
        const c = typeof t != "number" ? t.done : void 0, [p, g] = Bn(a, o);
        return p < -i.listOffset ? ((typeof t == "number" || t.align === void 0) && (s = "start-no-overflow"), { index: a, align: s, behavior: l, offset: r, done: c }) : p + g > -i.listOffset + i.visibleListHeight ? ((typeof t == "number" || t.align === void 0) && (s = "end"), { index: a, align: s, behavior: l, offset: r, done: c }) : null;
      }),
      v((t) => t !== null)
    ),
    // @ts-expect-error contra variance
    X
  );
}), X = E((e) => {
  const t = e.pipe(
    X,
    S(
      ee,
      te,
      De,
      U,
      ut,
      qe,
      rt,
      Ke
    ),
    d(
      ([n, o, i, s, l, r, a, c, p]) => {
        try {
          return Yn({
            location: n,
            totalHeight: p,
            sizeTree: o,
            offsetTree: i,
            totalCount: s,
            viewportHeight: l,
            headerHeight: r,
            stickyHeaderHeight: a,
            stickyFooterHeight: c
          });
        } catch {
          return null;
        }
      }
    ),
    v((n) => n !== null)
  );
  e.link(X, Ze), e.link(t, Re), e.link(
    e.pipe(
      X,
      v((n) => typeof n != "number" && n.index === "LAST"),
      _(!0)
    ),
    xe
  ), e.link(e.pipe(t, _(!1)), Xe), e.link(e.pipe(t, _(!1)), oi), e.link(
    e.pipe(
      ee,
      // wait for the list to render with the specified sizeTree, so that enough space is available to scroll by
      Ee(0),
      S(Xe, Ze),
      v(([, n, o]) => !n && o !== null),
      d(([, , n]) => n)
    ),
    X
  ), e.sub(e.pipe(st, Ee(10)), () => {
    const n = e.getValue(Ze);
    n !== null && typeof n != "number" && n.done !== void 0 && n.done(), e.pubIn({
      [Ze]: null,
      [Xe]: !0
    });
  }), e.link(
    e.pipe(
      yt,
      // wait for the list to render with the specified scrollOffset, so that enough space is available to scroll by
      Qe(),
      v((n) => n !== 0)
    ),
    q
  ), e.link(
    e.pipe(
      yt,
      En(L),
      d(() => 0)
    ),
    yt
  );
}), Te = u(null), We = u(
  null,
  (e) => {
    e.link(
      e.pipe(
        We,
        v((n) => n !== null)
      ),
      Te
    );
    const t = e.pipe(
      e.combine(We, ee),
      S(Te),
      v(([[n, o], i]) => n !== null && !T(o) && i !== null),
      d(([[n]]) => n)
    );
    e.link(e.pipe(t, Qe()), X), e.link(
      e.pipe(
        t,
        En(
          e.pipe(
            Xe,
            v((n) => n)
          )
        ),
        _(null)
        // unset the location after the scroll completes
      ),
      Te
    );
  },
  !1
);
function ii(e, t) {
  var l, r;
  const n = t.slice();
  let o = 0;
  const i = [];
  for (const { k: a, v: c } of de(e)) {
    for (; n.length && n[0] < a; )
      n.shift(), o++;
    const p = Math.max(0, a - o), g = ((l = i.at(-1)) == null ? void 0 : l.k) ?? -1;
    p === g ? (((r = i.at(-2)) == null ? void 0 : r.v) ?? -1) === c ? i.pop() : i[i.length - 1].v = c : i.push({ k: p, v: c });
  }
  let s = Ae();
  for (const { k: a, v: c } of i)
    s = P(s, a, c);
  return s;
}
const De = u(0), ze = u(null), k = u(null, (e) => {
  e.link(
    e.pipe(
      k,
      v((t) => t !== null),
      d((t) => t.length)
    ),
    De
  );
}), vt = u(null);
function Sn(e, t, n) {
  function o() {
    e.pubIn({
      [K]: 0,
      [Qt]: 0,
      [vt]: null,
      [Ye]: !1,
      [Jt]: !1,
      [xt]: null
    });
  }
  e.pubIn({
    [Jt]: !0,
    [q]: t,
    [Qt]: t
  }), n ? requestAnimationFrame(o) : o();
}
const se = E((e) => {
  e.link(
    e.pipe(
      se,
      S($e),
      d(([t, n]) => -(n * t.length))
    ),
    K
  ), e.link(e.pipe(se, _(!0)), Ye), e.link(e.pipe(se, Qe()), vt), e.sub(
    e.pipe(
      te,
      S(vt),
      v(([, t]) => t !== null),
      d(([t, n]) => {
        if (n === null)
          throw new Error("Unexpected null items");
        return we(n.length, t);
      })
    ),
    (t) => {
      Sn(e, t, !1);
    }
  ), e.sub(
    e.pipe(
      se,
      Mt(2),
      S(te, vt),
      v(([, , t]) => t !== null),
      d(([t, n]) => we(t.length, n))
    ),
    (t) => {
      Sn(e, t, !0);
    }
  ), e.changeWith(k, se, (t, n) => t ? [...n, ...t] : n.slice()), e.link(
    e.pipe(
      se,
      S(ee, $e),
      d(([t, n, o]) => {
        const i = t.length, s = o;
        return de(n).reduce(
          (r, { k: a, v: c }) => ({
            ranges: [...r.ranges, { startIndex: r.prevIndex, endIndex: a + i - 1, size: r.prevSize }],
            prevIndex: a + i,
            prevSize: c
          }),
          {
            ranges: [],
            prevIndex: 0,
            prevSize: s
          }
        ).ranges;
      })
    ),
    fe
  );
}), it = E((e) => {
  const t = e.pipe(
    it,
    S(ct, cn, ze, ee),
    v(([, , , , o]) => !T(o)),
    d(([{ data: o, scrollToBottom: i }, s, l, r]) => {
      if (i === !1 || i === void 0)
        return null;
      let a = "auto";
      const c = s.isAtBottom;
      if (typeof i == "function") {
        const p = i({ data: o, scrollLocation: s, scrollInProgress: l, context: r, atBottom: c });
        if (!p)
          return null;
        if (typeof p == "object")
          return p;
        if (typeof p == "number")
          return { index: p, align: "end", behavior: "auto" };
        a = p;
      } else {
        if (!c)
          return null;
        a = i;
      }
      return a === !0 && (a = "auto"), { index: "LAST", align: "end", behavior: a };
    })
  );
  e.link(
    e.pipe(
      t,
      v((o) => o !== null),
      d(() => !0)
    ),
    xe
  ), e.link(
    e.pipe(
      st,
      S(xe),
      v(([o, i]) => i),
      d(() => !1)
    ),
    xe
  );
  const n = e.pipe(
    fn,
    S(xe),
    v(([o, i]) => o === "up" && i)
  );
  e.link(
    e.pipe(
      n,
      d(() => !1)
    ),
    xe
  ), e.link(e.pipe(n, _(!0)), Ut), e.link(
    e.pipe(
      t,
      v((o) => o !== null),
      Ee(20)
    ),
    X
  );
}), Lt = E((e) => {
  e.changeWith(k, Lt, (t, n) => t ? [...t, ...n.data] : n.data.slice()), e.link(Lt, it);
}), kt = E((e) => {
  e.changeWith(k, kt, (t, n) => t ? [...t.slice(0, n.offset), ...n.data, ...t.slice(n.offset)] : n.data.slice()), e.changeWith(Q, kt, ([t], n) => {
    const i = he(t, n.offset, "k")[0], s = n.data.length;
    return [Bo(t, i, Number.POSITIVE_INFINITY, (r, a) => [r + s, a]), i];
  }), e.link(kt, it);
}), Gt = E((e) => {
  e.changeWith(k, Gt, (t, { offset: n, count: o }) => t ? t.slice(0, n).concat(t.slice(n + o)) : []), e.changeWith(Q, Gt, ([t], { offset: n, count: o }) => [Fo(t, n, o), n]);
}), Wt = u(null), Fe = E((e) => {
  e.sub(
    e.pipe(
      Fe,
      S(k),
      v(([{ purgeItemSizes: t }, n]) => !!t || n === null || n.length === 0)
    ),
    ([t, n]) => {
      n === null || n.length === 0 ? e.pubIn({
        ...t.initialLocation ? { [We]: t.initialLocation } : {},
        [k]: t.data.slice()
      }) : e.pubIn({
        ...t.initialLocation ? { [We]: t.initialLocation } : {},
        [Q]: ot,
        [Ve]: Be,
        [Wt]: t.data.slice()
      });
    }
  ), e.sub(
    e.pipe(
      to,
      S(Wt),
      Mt(),
      v(([, t]) => t !== null)
    ),
    ([, t]) => {
      e.pubIn({
        [k]: t,
        [Wt]: null
      });
    }
  ), e.link(
    e.pipe(
      Fe,
      v(({ purgeItemSizes: t }) => !t),
      S($e),
      v(([, t]) => t > 0),
      d(([{ data: t }, n]) => [
        {
          size: n,
          startIndex: t.length,
          endIndex: Number.POSITIVE_INFINITY
        }
      ])
    ),
    fe
  ), e.sub(
    e.pipe(
      Fe,
      v(({ purgeItemSizes: t }) => !t)
    ),
    ({ data: t, initialLocation: n, suppressItemMeasure: o }) => {
      requestAnimationFrame(() => {
        o || e.pub(eo), requestAnimationFrame(() => {
          n && e.pubIn({
            [X]: n
          });
        });
      }), e.pubIn({
        [k]: t.slice()
      });
    }
  );
}), St = E((e) => {
  e.link(
    e.pipe(
      St,
      S(te),
      d(([t, n]) => -we(t, n))
    ),
    q
  ), e.changeWith(k, e.pipe(St, Qe()), (t, n) => t ? t.slice(n) : []), e.changeWith(Q, e.pipe(St, Qe()), ([t], n) => [de(t).reduce((i, { k: s, v: l }) => P(i, Math.max(0, s - n), l), Ae()), 0]);
}), xn = E((e) => {
  e.changeWith(k, xn, (t, n) => t ? t.slice(0, t.length - n) : []), e.link(
    e.pipe(
      xn,
      S(De, $e),
      d(([, t, n]) => [
        {
          size: n,
          startIndex: t,
          endIndex: Number.POSITIVE_INFINITY
        }
      ])
    ),
    fe
  );
}), Kn = E((e) => {
  const t = e.pipe(
    Kn,
    S(k),
    d(([n, o]) => {
      if (!o) return [];
      const i = [];
      return o.forEach((s, l) => {
        n(s, l) && i.push(l);
      }), i;
    })
  );
  e.changeWith(k, t, (n, o) => n ? n.filter((i, s) => !o.includes(s)) : []), e.changeWith(Q, t, ([n], o) => [ii(n, o), 0]);
}), xt = u(null), Ne = E((e) => {
  e.changeWith(k, Ne, (t, { mapper: n }) => t ? t.map(n) : []), e.link(
    e.pipe(
      Ne,
      v(({ anchorItemIndex: t }) => t !== void 0),
      _(!0)
    ),
    Ye
  ), e.link(
    e.pipe(
      Ne,
      v(({ anchorItemIndex: t }) => t !== void 0),
      S(te),
      d(([{ anchorItemIndex: t }, n]) => {
        const o = t;
        return {
          oldOffset: we(o, n),
          index: o
        };
      })
    ),
    xt
  ), e.sub(
    e.pipe(
      te,
      S(xt),
      v(([, t]) => t !== null),
      d(([t, n]) => we(n.index, t) - n.oldOffset)
    ),
    (t) => {
      e.pubIn({
        [Ye]: !1,
        [xt]: null,
        [q]: t
      });
    }
  ), e.link(
    e.pipe(
      Ne,
      Mt(3),
      S(rn),
      v(([{ autoscrollToBottomBehavior: t }, n]) => n && !!t),
      d(([{ autoscrollToBottomBehavior: t }]) => typeof t == "object" ? t.location() : { index: "LAST", align: "end", behavior: t }),
      v((t) => !!t)
    ),
    X
  );
}), Zt = E((e) => {
  e.changeWith(k, Zt, (t, { newData: n }) => n), e.link(
    e.pipe(
      Zt,
      Mt(3),
      S(rn),
      v(([{ autoscrollToBottomBehavior: t }, n]) => n && !!t),
      d(([{ autoscrollToBottomBehavior: t }]) => typeof t == "object" ? t.location() : { index: "LAST", align: "end", behavior: t }),
      v((t) => !!t)
    ),
    X
  );
});
function si(e, t) {
  return [
    {
      data: t == null ? void 0 : t[e],
      prevData: (t == null ? void 0 : t[e - 1]) ?? null,
      nextData: (t == null ? void 0 : t[e + 1]) ?? null,
      height: 0,
      index: e,
      offset: 0,
      type: "flat"
    }
  ];
}
const li = [], Be = {
  items: li,
  listBottom: 0,
  listTop: 0,
  offsetTree: [],
  paddingBottom: 0,
  paddingTop: 0,
  totalCount: 0,
  totalHeight: 0,
  deviationDelta: 0,
  visibleListHeight: 0,
  data: null
}, Jt = u(!1), Ve = u(Be, (e) => {
  e.link(
    e.pipe(
      e.combine(
        ri,
        Jn,
        ee,
        te,
        De,
        Ke,
        k,
        yt,
        We,
        Te,
        lt,
        qe,
        rt,
        K,
        Jt,
        ye,
        J
      ),
      v((t) => {
        const n = t.at(-1), o = t.at(-2), i = t.at(-3);
        return !o && !n && !i;
      }),
      le(
        (t, [
          n,
          o,
          i,
          s,
          l,
          r,
          a,
          c,
          p,
          g,
          b,
          I,
          f,
          m
        ]) => {
          var Ie;
          if ((a == null ? void 0 : a.length) === 0)
            return Be;
          if (T(i)) {
            let oe = 0;
            return p !== null && (oe = un(p, l - 1).index), { ...Be, items: si(oe, a), offsetTree: s, totalCount: l, data: a };
          }
          let y = 0;
          g !== null && n === 0 && (y = Yn({
            totalHeight: r,
            location: g,
            sizeTree: i,
            offsetTree: s,
            totalCount: l,
            viewportHeight: e.getValue(U),
            headerHeight: e.getValue(ut),
            stickyHeaderHeight: I,
            stickyFooterHeight: f
          }).top ?? 0);
          let G = 0;
          e.getValue(L) !== 0 && !e.getValue(At) && e.getValue(wt) === Kt && t.totalCount === l && t.items.length > 0 && (G = r - t.totalHeight, G !== 0 && (G += e.getValue(zn)));
          const Z = e.getValue(Un), Y = Math.min(
            Math.max(
              n + y + c - m - b + G - Z,
              0
            ),
            r - o
          ), me = Y + o + Z * 2;
          if (t.offsetTree === s && t.totalCount === l && t.data === a && Y >= t.listTop && me <= t.listBottom)
            return t;
          const ne = [], Ue = l - 1, be = 0, W = Yo(s, Y, me, be);
          let F = 0, M = 0, j = !1;
          for (const oe of W) {
            const {
              value: { offset: ve, height: ke }
            } = oe;
            let ie = oe.start;
            F = ve, ve < Y && (ie += Math.floor((Y - ve) / ke), F += (ie - oe.start) * ke), ie < be && (F += (be - ie) * ke, ie = be);
            const Ht = Math.min(oe.end, Ue);
            for (let ue = ie; ue <= Ht && !(F >= me); ue++) {
              const at = {
                data: a == null ? void 0 : a[ue],
                prevData: (a == null ? void 0 : a[ue - 1]) ?? null,
                nextData: (a == null ? void 0 : a[ue + 1]) ?? null,
                height: ke,
                index: ue,
                offset: F,
                type: "flat"
              };
              j || (j = !0, M = F), ne.push(at), F += ke;
            }
          }
          ne.length === 0 && (M = F = 0);
          const R = r - F, re = ((Ie = ne[0]) == null ? void 0 : Ie.offset) || 0;
          return {
            items: ne,
            listBottom: F,
            listTop: M,
            offsetTree: s,
            paddingBottom: R,
            paddingTop: re,
            totalCount: l,
            totalHeight: r,
            data: a,
            deviationDelta: G,
            visibleListHeight: o
          };
        },
        Be
      )
    ),
    Ve
  );
}), Rt = Me([], (e) => e.pipe(
  e.combine(Ve, L),
  d(([t, n]) => {
    const o = t.items.slice();
    for (; o.length > 0 && o[0].offset + o[0].height < n; )
      o.shift();
    return o.map((i) => i.data);
  })
)), J = u(!1), Ye = u(!1), Tt = E((e) => {
  e.link(
    e.pipe(
      Ve,
      d((t) => t.deviationDelta),
      v((t) => t !== 0)
    ),
    Tt
  ), _n() ? (e.sub(e.pipe(Tt, S(K, L)), ([t, n]) => {
    e.pub(K, n - t);
  }), e.sub(
    e.pipe(e.combine(L, K, ye, Ye)),
    ([t, n, o, i]) => {
      o || i || (n > 0 && t < n ? (e.pub(J, !0), e.pub(Re, { top: 0, behavior: "instant" }), setTimeout(() => {
        e.pubIn({
          [J]: !1,
          [K]: 0
        });
      })) : n < 0 && t <= 0 && (e.pubIn({
        [J]: !0,
        [K]: 0
      }), setTimeout(() => {
        e.pub(Re, { top: 0, behavior: "instant" }), e.pub(J, !1);
      })));
    }
  ), e.sub(
    e.pipe(
      e.combine(et, K, J, ye, Ye),
      v(
        ([t, n, o, i, s]) => !t && n !== 0 && !o && !i && !s
      ),
      on(100)
    ),
    ([, t]) => {
      e.pub(J, !0), t < 0 ? requestAnimationFrame(() => {
        e.pub(q, -t), e.pub(K, 0), requestAnimationFrame(() => {
          e.pub(J, !1);
        });
      }) : requestAnimationFrame(() => {
        e.pub(q, -t), e.pub(K, 0), requestAnimationFrame(() => {
          e.pub(J, !1);
        });
      });
    }
  )) : e.link(Tt, q);
}), At = E(), cn = u(!1), st = E((e) => {
  e.link(e.pipe(st, _(!1)), At);
}, !1), L = u(0), U = u(0), Et = u(0), V = u(0), ri = L, yt = u(0), qe = u(0), lt = u(0), rt = u(0), an = u(0), Le = u(null), qn = sn(), Un = u(0), Gn = u(!1), ui = Zo, ci = 50, ut = Me(0, (e) => e.pipe(
  e.combine(qe, lt),
  d(([t, n]) => t + n)
)), Zn = Me(0, (e) => e.pipe(
  e.combine(rt, an),
  d(([t, n]) => t + n)
)), ai = Me(0, (e) => e.pipe(
  e.combine(qe, lt, L),
  d(([t, n, o]) => t + Math.max(n - o, 0))
)), pi = Me(0, (e) => e.pipe(
  e.combine(rt, an, L, U, V),
  d(([t, n, o, i, s]) => {
    o = Math.min(o, s - i);
    const l = Math.max(n - (s - (o + i)), 0);
    return t + l;
  })
)), Jn = Me(0, (e) => e.pipe(
  e.combine(U, ai, pi),
  d(([t, n, o]) => Math.max(0, t - n - o))
)), Dt = u(0), Xn = u(0, (e) => {
  e.link(
    e.pipe(
      e.combine(Xn, Ke, U, ut, qe),
      d(([t, n, o, i, s]) => t === 0 ? 0 : Math.max(0, Math.min(t - (n + i + s - o))))
    ),
    Dt
  );
}), Re = E((e) => {
  e.link(
    e.pipe(
      Re,
      d((t) => t.align === "start" ? t.top ?? 0 : 0)
    ),
    Xn
  ), e.link(
    e.pipe(
      Re,
      S(L),
      v(([t, n]) => t.top !== n),
      _(!0)
    ),
    At
  );
}), pn = E((e) => {
  e.link(
    e.pipe(
      Re,
      S(nt),
      d(([t, n]) => ("top" in t && typeof t.top < "u" && (t = { ...t, top: t.top + n }), t))
    ),
    pn
  );
}), ct = Me(
  {
    listOffset: 0,
    visibleListHeight: 0,
    scrollHeight: 0,
    bottomOffset: 0,
    isAtBottom: !1
  },
  (e) => e.pipe(
    e.combine(
      L,
      ut,
      Zn,
      lt,
      Jn,
      V,
      Dt,
      ye,
      Te,
      J,
      xe
    ),
    v(([, , , , , , , t, n, o]) => !t && n === null && !o),
    d(
      ([
        t,
        n,
        o,
        i,
        s,
        l,
        r,
        a,
        c,
        p,
        g
      ]) => {
        const b = e.getValue(Wn), I = l - n - o, f = -t + i, m = I + Math.min(0, f) - s - r;
        return {
          scrollHeight: I,
          listOffset: f,
          visibleListHeight: s,
          bottomOffset: m,
          isAtBottom: g || m <= b
        };
      }
    )
  )
), Xt = E((e) => {
  e.link(
    e.pipe(
      L,
      Ee(0),
      S(ct, Te, ye),
      v(([, t, n, o]) => t.scrollHeight > 0 && n == null && !o),
      d(([, t]) => t)
    ),
    Xt
  );
}), q = E(), K = u(0), Qt = u(0), Ct = u(0), Qn = u(""), fn = E(), eo = sn(), to = sn(), hn = u(!1), tt = u(null);
u(0);
const nt = u(0, (e) => {
  e.link(
    e.pipe(
      e.combine(je, ge, nt),
      d(([t, n, o]) => t - Math.max(0, o - n))
    ),
    U
  );
}), ge = u(0, (e) => {
  e.link(
    e.pipe(
      e.combine(ge, nt),
      d(([t, n]) => Math.max(0, t - n))
    ),
    L
  );
}), je = u(0);
function no(e) {
  return {
    data: {
      prepend: (t) => {
        e.pub(se, t);
      },
      append: (t, n) => {
        e.pub(Lt, {
          data: t,
          scrollToBottom: n
        });
      },
      replace: (t, n) => {
        e.pub(Fe, {
          ...n,
          data: t
        });
      },
      map: (t, n) => {
        e.pub(Ne, {
          mapper: t,
          autoscrollToBottomBehavior: n
        });
      },
      mapWithAnchor: (t, n) => {
        e.pub(Ne, {
          mapper: t,
          anchorItemIndex: n
        });
      },
      findAndDelete: (t) => {
        e.pub(Kn, t);
      },
      findIndex: (t) => e.getValue(k).findIndex(t),
      find: (t) => e.getValue(k).find(t),
      insert: (t, n, o) => {
        e.pub(kt, {
          data: t,
          offset: n,
          scrollToBottom: o
        });
      },
      deleteRange: (t, n) => {
        e.pub(Gt, {
          offset: t,
          count: n
        });
      },
      batch: (t, n) => {
        e.pub(ye, !0), t(), e.pub(ye, !1), e.pub(it, { data: [], scrollToBottom: n });
      },
      get: () => e.getValue(k).slice(),
      getCurrentlyRendered: () => e.getValue(Rt),
      removeFromStart: (t) => {
        e.pub(St, t);
      }
    },
    scrollToItem: (t) => {
      e.pub(X, t);
    },
    scrollIntoView: (t) => {
      e.pub(jn, t);
    },
    scrollerElement: () => e.getValue(Le),
    getScrollLocation() {
      return e.getValue(ct);
    },
    cancelSmoothScroll() {
      e.pub(qn);
    },
    height: (t) => {
      var i;
      const n = ((i = e.getValue(k)) == null ? void 0 : i.indexOf(t)) ?? -1;
      if (n === -1)
        return 0;
      const o = e.getValue(ee);
      return he(o, n)[1] ?? 0;
    }
  };
}
function Yi() {
  return C(ct);
}
function ji() {
  return C(Rt);
}
function Ki() {
  const e = Ce();
  return h.useMemo(() => no(e), [e]);
}
const qi = {
  prepend: "prepend",
  removeFromStart: "remove-from-start",
  removeFromEnd: "remove-from-end"
}, oo = u(null), io = u(null), so = u(null), lo = u(null), ro = u(null), uo = u("div"), fi = {
  position: "sticky",
  top: 0,
  zIndex: 1
}, gt = {
  overflowAnchor: "none"
}, hi = {
  position: "sticky",
  bottom: 0
}, co = h.forwardRef((e, t) => /* @__PURE__ */ $("div", { style: { zIndex: 1 }, ...e, ref: t })), ao = h.forwardRef((e, t) => /* @__PURE__ */ $("div", { ...e, ref: t })), po = h.forwardRef(
  ({ style: e, ...t }, n) => /* @__PURE__ */ $("div", { ...t, style: { ...fi, ...e }, ref: n })
), fo = h.forwardRef(
  ({ style: e, ...t }, n) => /* @__PURE__ */ $("div", { ...t, style: { ...hi, ...e }, ref: n })
), ho = u(co), go = u(po), mo = u(ao), bo = u(fo), Io = ({ index: e }) => /* @__PURE__ */ $n("div", { children: [
  "Item ",
  e
] }), vo = ({ index: e }) => e, en = u(Io), ko = u(vo), tn = (e) => e, So = u(tn), xo = u(
  null,
  (e) => {
    e.sub(
      e.pipe(xo, S(k, So, te, Q)),
      ([t, n, o, i, s]) => {
        if (t === void 0)
          return;
        if (!t || !t.data || !t.data.length) {
          e.pubIn({
            [k]: [],
            [Q]: ot,
            [Ve]: Be
          });
          return;
        }
        const l = t.data, r = t.scrollModifier;
        if (r === "prepend") {
          if (n === null || !n.length) {
            e.pub(k, l);
            return;
          }
          const a = n[0], c = l.findIndex((b) => o(b) === o(a)), p = c === -1 ? l : l.slice(0, c), g = c === -1 ? [] : l.slice(c);
          e.pubIn({
            [k]: g
          }), e.pubIn({
            [se]: p
          });
          return;
        }
        if (r === "remove-from-start") {
          const a = l[0], c = (n == null ? void 0 : n.findIndex((g) => o(g) === o(a))) ?? -1;
          if (c === -1) {
            e.pub(k, l);
            return;
          }
          const p = we(c, i);
          e.pub(q, -p), queueMicrotask(() => {
            e.pub(k, l);
            const g = de(s[0]).reduce((b, { k: I, v: f }) => P(b, Math.max(0, I - c), f), Ae());
            e.pub(Q, [g, 0]);
          });
          return;
        }
        if (r === "remove-from-end") {
          e.pub(k, l), e.pub(fe, [
            {
              size: e.getValue($e),
              startIndex: l.length,
              endIndex: Number.POSITIVE_INFINITY
            }
          ]);
          return;
        }
        if ((r == null ? void 0 : r.type) === "item-location") {
          l !== n && e.pubIn({
            [Fe]: {
              data: l,
              initialLocation: r.location,
              purgeItemSizes: r.purgeItemSizes
            }
          });
          return;
        }
        if ((r == null ? void 0 : r.type) === "auto-scroll-to-bottom") {
          e.pubIn({
            [k]: l,
            [it]: {
              data: l,
              scrollToBottom: r.autoScroll
            }
          });
          return;
        }
        if ((r == null ? void 0 : r.type) === "items-change") {
          e.pub(Zt, {
            newData: l,
            autoscrollToBottomBehavior: r.behavior
          });
          return;
        }
        e.pub(k, l);
      }
    );
  },
  (e, t) => e ? e.data === (t == null ? void 0 : t.data) : !1
), di = ({ item: e, ItemContent: t, mount: n, unmount: o }) => {
  const i = C(ze), s = h.useRef(null), l = h.useCallback(
    (r) => {
      r ? (s.current = r, n(r)) : s.current && (o(s.current), s.current = null);
    },
    [n, o]
  );
  return /* @__PURE__ */ $(
    "div",
    {
      ref: l,
      "data-index": e.index,
      "data-known-size": e.height,
      style: {
        overflowAnchor: "none",
        position: "absolute",
        width: "100%",
        top: e.offset
      },
      children: /* @__PURE__ */ $(t, { index: e.index, prevData: e.prevData, nextData: e.nextData, data: e.data, context: i })
    }
  );
}, gi = h.memo(di, (e, t) => {
  const n = e.item, o = t.item;
  return n.index === o.index && n.height === o.height && n.offset === o.offset && n.data === o.data && n.prevData === o.prevData && n.nextData === o.nextData && e.ItemContent === t.ItemContent;
}), nn = u("top", (e) => {
  e.link(
    e.pipe(
      e.combine(nn, Ke, U, ut, Zn),
      v(([t]) => t === "bottom" || t === "bottom-smooth"),
      d(([, t, n, o, i]) => Math.max(0, n - t - o - i))
    ),
    Ct
  ), e.link(
    e.pipe(
      e.combine(Ct, nn),
      v(([, t]) => t === "bottom-smooth"),
      le(
        (t, [n]) => [t[1], n],
        [0, 0]
      ),
      d(([t, n]) => t > 0 && n > 0 ? "margin-top 0.2s ease-out" : "")
    ),
    Qn
  );
});
function mt(e) {
  const t = h.useRef(null);
  return [h.useCallback(
    (o) => {
      o ? (t.current = o, e == null || e.observe(o, { box: "border-box" })) : t.current && (e == null || e.unobserve(t.current), t.current = null);
    },
    [e]
  ), t];
}
function mi(e, t) {
  return Math.abs(e - t) < 0.5;
}
function bi(e, t, n) {
  const o = Ce(), i = h.useRef(null), s = h.useRef(null), l = h.useCallback(() => {
    i.current && (cancelAnimationFrame(i.current), i.current = null, s.current = null);
  }, []);
  h.useEffect(() => o.sub(fn, (c) => {
    c !== s.current && l();
  }), [o, l]), h.useEffect(() => o.sub(qn, l), [o, l]);
  const r = h.useCallback(
    (c, p, g) => {
      var y;
      i.current && l();
      const b = ((y = e.current) == null ? void 0 : y.scrollTop) ?? 0;
      s.current = b < c ? "down" : "up";
      let I = 0, f = 0;
      function m() {
        var Z, Y;
        const G = b + (c - b) * p(I);
        (Z = e.current) == null || Z.scrollTo({ top: G, behavior: "instant" }), I += 1 / g, f += 1, f < g ? i.current = requestAnimationFrame(m) : ((Y = e.current) == null || Y.scrollTo({ top: c, behavior: "instant" }), i.current = null, s.current = null);
      }
      m();
    },
    [e, l]
  );
  return h.useCallback(
    (c) => {
      var I, f;
      const p = e.current;
      if (!p || c.top === void 0)
        return;
      const g = p.scrollHeight - p.clientHeight, b = Math.max(0, Math.min(c.top, g));
      if (mi(b, p.scrollTop) || p.scrollHeight <= p.clientHeight) {
        requestAnimationFrame(() => {
          var m;
          o.pub(st, (m = e.current) == null ? void 0 : m.scrollTop);
        });
        return;
      }
      if (n.current = b, o.pub(cn, !0), c.forceBottomSpace !== void 0 && t.current && (t.current.style.paddingBottom = `${c.forceBottomSpace}px`), c.behavior === "smooth")
        r(b ?? 0, ui, ci);
      else if (c.behavior === "auto" || c.behavior === "instant" || c.behavior === void 0)
        l(), (I = e.current) == null || I.scrollTo(c);
      else {
        const { easing: m, animationFrameCount: y } = c.behavior(((f = e.current) == null ? void 0 : f.scrollTop) ?? 0, b ?? 0);
        r(b ?? 0, m, y);
      }
    },
    [o, r, t, e, n, l]
  );
}
function Ii(e) {
  return vi(Si(xi(ki(e), 8 * e.length))).toLowerCase();
}
function vi(e) {
  for (var t, n = "0123456789ABCDEF", o = "", i = 0; i < e.length; i++)
    t = e.charCodeAt(i), o += n.charAt(t >>> 4 & 15) + n.charAt(15 & t);
  return o;
}
function ki(e) {
  for (var t = Array(e.length >> 2), n = 0; n < t.length; n++) t[n] = 0;
  for (n = 0; n < 8 * e.length; n += 8) t[n >> 5] |= (255 & e.charCodeAt(n / 8)) << n % 32;
  return t;
}
function Si(e) {
  for (var t = "", n = 0; n < 32 * e.length; n += 8) t += String.fromCharCode(e[n >> 5] >>> n % 32 & 255);
  return t;
}
function xi(e, t) {
  e[t >> 5] |= 128 << t % 32, e[14 + (t + 64 >>> 9 << 4)] = t;
  for (var n = 1732584193, o = -271733879, i = -1732584194, s = 271733878, l = 0; l < e.length; l += 16) {
    const r = n, a = o, c = i, p = s;
    o = B(
      o = B(
        o = B(
          o = B(
            o = N(
              o = N(
                o = N(
                  o = N(
                    o = H(
                      o = H(
                        o = H(
                          o = H(
                            o = O(
                              o = O(
                                o = O(
                                  o = O(
                                    o,
                                    i = O(
                                      i,
                                      s = O(s, n = O(n, o, i, s, e[l + 0], 7, -680876936), o, i, e[l + 1], 12, -389564586),
                                      n,
                                      o,
                                      e[l + 2],
                                      17,
                                      606105819
                                    ),
                                    s,
                                    n,
                                    e[l + 3],
                                    22,
                                    -1044525330
                                  ),
                                  i = O(
                                    i,
                                    s = O(s, n = O(n, o, i, s, e[l + 4], 7, -176418897), o, i, e[l + 5], 12, 1200080426),
                                    n,
                                    o,
                                    e[l + 6],
                                    17,
                                    -1473231341
                                  ),
                                  s,
                                  n,
                                  e[l + 7],
                                  22,
                                  -45705983
                                ),
                                i = O(
                                  i,
                                  s = O(s, n = O(n, o, i, s, e[l + 8], 7, 1770035416), o, i, e[l + 9], 12, -1958414417),
                                  n,
                                  o,
                                  e[l + 10],
                                  17,
                                  -42063
                                ),
                                s,
                                n,
                                e[l + 11],
                                22,
                                -1990404162
                              ),
                              i = O(
                                i,
                                s = O(s, n = O(n, o, i, s, e[l + 12], 7, 1804603682), o, i, e[l + 13], 12, -40341101),
                                n,
                                o,
                                e[l + 14],
                                17,
                                -1502002290
                              ),
                              s,
                              n,
                              e[l + 15],
                              22,
                              1236535329
                            ),
                            i = H(
                              i,
                              s = H(s, n = H(n, o, i, s, e[l + 1], 5, -165796510), o, i, e[l + 6], 9, -1069501632),
                              n,
                              o,
                              e[l + 11],
                              14,
                              643717713
                            ),
                            s,
                            n,
                            e[l + 0],
                            20,
                            -373897302
                          ),
                          i = H(
                            i,
                            s = H(s, n = H(n, o, i, s, e[l + 5], 5, -701558691), o, i, e[l + 10], 9, 38016083),
                            n,
                            o,
                            e[l + 15],
                            14,
                            -660478335
                          ),
                          s,
                          n,
                          e[l + 4],
                          20,
                          -405537848
                        ),
                        i = H(
                          i,
                          s = H(s, n = H(n, o, i, s, e[l + 9], 5, 568446438), o, i, e[l + 14], 9, -1019803690),
                          n,
                          o,
                          e[l + 3],
                          14,
                          -187363961
                        ),
                        s,
                        n,
                        e[l + 8],
                        20,
                        1163531501
                      ),
                      i = H(
                        i,
                        s = H(s, n = H(n, o, i, s, e[l + 13], 5, -1444681467), o, i, e[l + 2], 9, -51403784),
                        n,
                        o,
                        e[l + 7],
                        14,
                        1735328473
                      ),
                      s,
                      n,
                      e[l + 12],
                      20,
                      -1926607734
                    ),
                    i = N(
                      i,
                      s = N(s, n = N(n, o, i, s, e[l + 5], 4, -378558), o, i, e[l + 8], 11, -2022574463),
                      n,
                      o,
                      e[l + 11],
                      16,
                      1839030562
                    ),
                    s,
                    n,
                    e[l + 14],
                    23,
                    -35309556
                  ),
                  i = N(
                    i,
                    s = N(s, n = N(n, o, i, s, e[l + 1], 4, -1530992060), o, i, e[l + 4], 11, 1272893353),
                    n,
                    o,
                    e[l + 7],
                    16,
                    -155497632
                  ),
                  s,
                  n,
                  e[l + 10],
                  23,
                  -1094730640
                ),
                i = N(
                  i,
                  s = N(s, n = N(n, o, i, s, e[l + 13], 4, 681279174), o, i, e[l + 0], 11, -358537222),
                  n,
                  o,
                  e[l + 3],
                  16,
                  -722521979
                ),
                s,
                n,
                e[l + 6],
                23,
                76029189
              ),
              i = N(
                i,
                s = N(s, n = N(n, o, i, s, e[l + 9], 4, -640364487), o, i, e[l + 12], 11, -421815835),
                n,
                o,
                e[l + 15],
                16,
                530742520
              ),
              s,
              n,
              e[l + 2],
              23,
              -995338651
            ),
            i = B(
              i,
              s = B(s, n = B(n, o, i, s, e[l + 0], 6, -198630844), o, i, e[l + 7], 10, 1126891415),
              n,
              o,
              e[l + 14],
              15,
              -1416354905
            ),
            s,
            n,
            e[l + 5],
            21,
            -57434055
          ),
          i = B(
            i,
            s = B(s, n = B(n, o, i, s, e[l + 12], 6, 1700485571), o, i, e[l + 3], 10, -1894986606),
            n,
            o,
            e[l + 10],
            15,
            -1051523
          ),
          s,
          n,
          e[l + 1],
          21,
          -2054922799
        ),
        i = B(
          i,
          s = B(s, n = B(n, o, i, s, e[l + 8], 6, 1873313359), o, i, e[l + 15], 10, -30611744),
          n,
          o,
          e[l + 6],
          15,
          -1560198380
        ),
        s,
        n,
        e[l + 13],
        21,
        1309151649
      ),
      i = B(
        i,
        s = B(s, n = B(n, o, i, s, e[l + 4], 6, -145523070), o, i, e[l + 11], 10, -1120210379),
        n,
        o,
        e[l + 2],
        15,
        718787259
      ),
      s,
      n,
      e[l + 9],
      21,
      -343485551
    ), n = pe(n, r), o = pe(o, a), i = pe(i, c), s = pe(s, p);
  }
  return [n, o, i, s];
}
function Vt(e, t, n, o, i, s) {
  return pe(Ti(pe(pe(t, e), pe(o, s)), i), n);
}
function O(e, t, n, o, i, s, l) {
  return Vt(t & n | ~t & o, e, t, i, s, l);
}
function H(e, t, n, o, i, s, l) {
  return Vt(t & o | n & ~o, e, t, i, s, l);
}
function N(e, t, n, o, i, s, l) {
  return Vt(t ^ n ^ o, e, t, i, s, l);
}
function B(e, t, n, o, i, s, l) {
  return Vt(n ^ (t | ~o), e, t, i, s, l);
}
function pe(e, t) {
  const n = (65535 & e) + (65535 & t);
  return (e >> 16) + (t >> 16) + (n >> 16) << 16 | 65535 & n;
}
function Ti(e, t) {
  return e << t | e >>> 32 - t;
}
const To = Symbol("INVALID_KEY");
function Ei(e) {
  const t = e.slice(0, 32), n = e.slice(32), o = atob(n);
  if (t !== Ii(n))
    return To;
  const [i, s] = o.split(";"), l = i.slice(2), r = new Date(Number(s.slice(2)));
  return { orderNumber: l, expiryDate: r };
}
const yi = {
  valid: !1,
  consoleMessage: "The VirtuosoMessageList license wrapper component is missing. Enclose the VirtuosoMessageList with VirtuosoMessageListLicense and add your key at the lisenceKey property.",
  watermarkMessage: "The VirtuosoMessageList license wrapper component is missing. Enclose the VirtuosoMessageList with VirtuosoMessageListLicense and add your key at the lisenceKey property."
}, $i = {
  valid: !1,
  consoleMessage: "Your VirtuosoMessageListLicense is missing a license key. Purchase one from https://virtuoso.dev/pricing/",
  watermarkMessage: "Your VirtuosoMessageListLicense is missing a license key. Purchase one from https://virtuoso.dev/pricing/"
}, wi = {
  valid: !1,
  consoleMessage: "Your VirtuosoMessageListLicense component is missing a license key - this component will not work if deployed in production. Purchase a key from https://virtuoso.dev/pricing/ before you deploy to production."
}, Eo = {
  valid: !0
}, Li = {
  valid: !1,
  consoleMessage: "Your Virtuoso Message List license key is invalid. Ensure that you have copy-pasted the key from the purchase email correctly.",
  watermarkMessage: "Your Virtuoso Message List license key is invalid"
}, Ri = {
  valid: !1,
  consoleMessage: "Your annual license key to use Virtuoso Message List in non-production environments has expired. You can still use it in production. To keep using it in development, purchase a new key from https://virtuoso.dev/pricing/",
  watermarkMessage: "Your annual license key to use Virtuoso Message List in non-production environments has expired. You can still use it in production. To keep using it in development, purchase a new key from https://virtuoso.dev/pricing/"
}, Ci = {
  valid: !1,
  consoleMessage: "You have installed a version of `@virtuoso.dev/message-list` that is newer than the period of your license key. Either downgrade to a supported version, or purchase a new license from https://virtuoso.dev/pricing/",
  watermarkMessage: "You have installed a version of `@virtuoso.dev/message-list` that is newer than the period of your license key. Either downgrade to a supported version, or purchase a new license from https://virtuoso.dev/pricing/"
}, Mi = Eo, Ai = /^(?:127\.0\.0\.1|localhost|0\.0\.0\.0|.+\.local)$/, Di = ["virtuoso.dev", "csb.app", "codesandbox.io"];
function Vi({ licenseKey: e, now: t, hostname: n, packageTimestamp: o }) {
  const i = n.match(Ai), s = Di.some((r) => n.endsWith(r));
  if (!e)
    return s ? Mi : i ? wi : $i;
  const l = Ei(e);
  if (l === To)
    return Li;
  if (l.expiryDate.getTime() < t.getTime()) {
    if (i)
      return Ri;
    if (l.expiryDate.getTime() < o)
      return Ci;
  }
  return Eo;
}
const yo = h.createContext(yi);
function Ui({ licenseKey: e, children: t }) {
  const n = Vi({
    licenseKey: e,
    hostname: typeof window < "u" ? window.location.hostname : "localhost",
    now: /* @__PURE__ */ new Date(),
    packageTimestamp: 1766318635275
  });
  return /* @__PURE__ */ $(yo.Provider, { value: n, children: t });
}
const Ot = h.createContext(void 0);
let Tn = !1;
const Oi = h.forwardRef(
  ({
    initialData: e = [],
    computeItemKey: t = vo,
    context: n = null,
    initialLocation: o = null,
    shortSizeAlign: i = "top",
    onScroll: s,
    onRenderedDataChange: l,
    ItemContent: r = Io,
    Header: a = null,
    StickyHeader: c = null,
    Footer: p = null,
    StickyFooter: g = null,
    EmptyPlaceholder: b = null,
    HeaderWrapper: I = co,
    StickyHeaderWrapper: f = po,
    FooterWrapper: m = ao,
    StickyFooterWrapper: y = fo,
    useWindowScroll: G = !1,
    customScrollParent: Z = null,
    ScrollElement: Y = "div",
    increaseViewportBy: me = 0,
    data: ne,
    enforceStickyFooterAtBottom: Ue = !1,
    itemIdentity: be = tn,
    ...W
  }, F) => {
    const M = h.useMemo(() => {
      const R = new Do();
      return R.register(Ve), R.register(At), R.register(wt), R.register(Tt), R.register(It), R.register(Lt), R.register(se), R.register(Fe), R.pubIn({
        [k]: e.slice(),
        [So]: tn,
        [ze]: n,
        [ko]: t,
        [We]: o,
        [en]: r,
        [oo]: a,
        [so]: p,
        [io]: c,
        [lo]: g,
        [ro]: b,
        [uo]: Y,
        [bo]: y,
        [go]: f,
        [mo]: m,
        [ho]: I,
        [nn]: i,
        [hn]: G,
        [tt]: Z,
        [Un]: me,
        [Gn]: Ue
      }), R.singletonSub(Xt, s), R.singletonSub(Rt, l), R;
    }, []);
    h.useImperativeHandle(F, () => no(M), [M]), h.useEffect(() => {
      M.pubIn({
        [ze]: n,
        [en]: r,
        [tt]: Z,
        [xo]: ne
      }), M.singletonSub(Xt, s), M.singletonSub(Rt, l);
    }, [n, r, Z, s, l, M, ne]);
    const j = h.useContext(yo);
    return h.useEffect(() => {
      j.consoleMessage && (Tn || (Tn = !0, console.warn(j.consoleMessage)));
    }, [j]), h.useEffect(() => {
      const R = (re) => {
        var Ie;
        (Ie = re.message) != null && Ie.includes("ResizeObserver loop") && (re.preventDefault(), re.stopPropagation(), re.stopImmediatePropagation());
      };
      return window.addEventListener("error", R, { capture: !0 }), () => {
        window.removeEventListener("error", R);
      };
    }, []), typeof window < "u" && j.watermarkMessage ? /* @__PURE__ */ $(
      "div",
      {
        style: {
          color: "red",
          pointerEvents: "none"
        },
        children: j.watermarkMessage
      }
    ) : /* @__PURE__ */ $(Vo.Provider, { value: M, children: /* @__PURE__ */ $(Hi, { ...W }) });
  }
);
Oi.displayName = "VirtuosoMessageList";
const Hi = ({ style: e, ...t }) => {
  const n = Ce(), o = h.useContext(Ot), [
    i,
    s,
    l,
    r,
    a,
    c,
    p,
    g,
    b,
    I,
    f
  ] = Oo(
    oo,
    io,
    ho,
    go,
    so,
    lo,
    mo,
    bo,
    en,
    ro,
    tt
  ), [m] = h.useState(() => {
    if (typeof window < "u" && typeof ResizeObserver > "u")
      throw new Error("ResizeObserver not found. Please ensure that you have a polyfill installed.");
    if (!(typeof ResizeObserver > "u"))
      return new ResizeObserver((x) => {
        var ht, He, Ge, mn;
        const Se = x.length, z = [];
        let w = {};
        for (let Nt = 0; Nt < Se; Nt++) {
          const ce = x[Nt], D = ce.target;
          if (D === ne.current) {
            w = {
              ...w,
              [lt]: ce.contentRect.height,
              [V]: (ht = W.current) == null ? void 0 : ht.scrollHeight
            };
            continue;
          }
          if (D === be.current) {
            w = {
              ...w,
              [qe]: ce.contentRect.height,
              [V]: (He = W.current) == null ? void 0 : He.scrollHeight
            };
            continue;
          }
          if (D === G.current) {
            w = {
              ...w,
              [an]: ce.contentRect.height,
              [V]: (Ge = W.current) == null ? void 0 : Ge.scrollHeight
            };
            continue;
          }
          if (D === Y.current) {
            w = {
              ...w,
              [rt]: ce.contentRect.height,
              [V]: (mn = W.current) == null ? void 0 : mn.scrollHeight
            };
            continue;
          }
          if (D === W.current) {
            w = {
              ...w,
              [L]: D.scrollTop,
              [V]: D.scrollHeight,
              [U]: ce.contentRect.height,
              [Et]: D.clientWidth
            };
            continue;
          }
          if (D === M.current) {
            W.current && (w = {
              ...w,
              [V]: W.current.scrollHeight
            });
            continue;
          }
          if (D === F.current) {
            const ae = D.ownerDocument.defaultView;
            ae !== null && (w = {
              ...w,
              [V]: ce.contentRect.height,
              [ge]: ae.scrollY,
              [je]: ae.innerHeight,
              [nt]: D.getBoundingClientRect().top + ae.scrollY,
              [Et]: D.clientWidth
            });
            continue;
          }
          if (D === f || D === j.current) {
            const ae = R.current, dt = j.current;
            ae && dt && (w = {
              ...w,
              [V]: dt.getBoundingClientRect().height,
              [ge]: ae.scrollTop,
              [je]: ae.clientHeight,
              [nt]: dt.offsetTop,
              [Et]: dt.clientWidth
            });
            continue;
          }
          if (D.dataset.index === void 0)
            continue;
          const Bt = Number.parseInt(D.dataset.index), Ao = Number.parseFloat(D.dataset.knownSize ?? ""), Ft = ce.contentRect.height;
          if (Ft === Ao)
            continue;
          const bn = z[z.length - 1];
          z.length === 0 || bn.size !== Ft || bn.endIndex !== Bt - 1 ? z.push({ endIndex: Bt, size: Ft, startIndex: Bt }) : z[z.length - 1].endIndex++;
        }
        z.length > 0 && (w = {
          ...w,
          [fe]: z
        }), n.pubIn(w);
      });
  }), [y, G] = mt(m), [Z, Y] = mt(m), [me, ne] = mt(m), [Ue, be] = mt(m), W = h.useRef(null), F = h.useRef(null), M = h.useRef(null), j = h.useRef(null), R = h.useRef(null);
  yn(() => {
    R.current = f;
  }, [f]);
  const re = h.useCallback(
    (x) => {
      if (o) {
        const Se = Number.parseInt(x.dataset.index ?? "");
        n.pub(fe, [
          {
            startIndex: Se,
            endIndex: Se,
            size: o.itemHeight
          }
        ]);
      }
      m == null || m.observe(x);
    },
    [m, n, o]
  ), Ie = h.useCallback(
    (x) => {
      m == null || m.unobserve(x);
    },
    [m]
  ), oe = h.useCallback(
    (x) => {
      x ? (M.current = x, m == null || m.observe(x, { box: "border-box" })) : M.current && (m == null || m.unobserve(M.current), M.current = null);
    },
    [m]
  ), { items: ve, visibleListHeight: ke } = C(Ve), ie = h.useCallback(() => {
    var Se;
    const x = [];
    for (const z of ((Se = M.current) == null ? void 0 : Se.children) ?? []) {
      if (z.dataset.index === void 0)
        continue;
      const w = Number.parseInt(z.dataset.index), ht = Number.parseFloat(z.dataset.knownSize ?? ""), He = z.getBoundingClientRect().height;
      if (He === ht)
        continue;
      const Ge = x[x.length - 1];
      x.length === 0 || Ge.size !== He || Ge.endIndex !== w - 1 ? x.push({ endIndex: w, size: He, startIndex: w }) : x[x.length - 1].endIndex++;
    }
    n.pub(fe, x);
  }, [n]);
  h.useLayoutEffect(() => n.sub(eo, ie), [ie, n]);
  const Ht = C(K), ue = C(Qt), at = C(Ct), $o = C(Dt), wo = C(Qn), Oe = C(ze), Lo = C(ko), pt = C(De), Ro = C(Ke), Co = C(hn), ft = C(Te), Mo = C(Gn);
  return h.useLayoutEffect(() => {
    ve.length === 0 && n.pub(to);
  }, [ve, n]), h.useLayoutEffect(() => {
    var x;
    pt > 0 && ft === null && I !== null && n.pub(V, (x = W.current) == null ? void 0 : x.scrollHeight);
  }, [n, pt, ft, I]), /* @__PURE__ */ $n(
    f ? Fi : Co ? Bi : Ni,
    {
      ...t,
      observer: m,
      scrollerRef: W,
      customScrollParentWrapperRef: j,
      listRef: M,
      style: e,
      windowScrollWrapperRef: F,
      children: [
        (pt === 0 || ft) && I ? /* @__PURE__ */ $(I, { context: Oe }) : null,
        s && /* @__PURE__ */ $(r, { ref: Ue, style: gt, children: /* @__PURE__ */ $(s, { context: Oe }) }),
        i && /* @__PURE__ */ $(l, { ref: me, style: gt, children: /* @__PURE__ */ $(i, { context: Oe }) }),
        pt > 0 ? /* @__PURE__ */ $(
          "div",
          {
            ref: oe,
            "data-testid": "virtuoso-list",
            style: {
              boxSizing: "content-box",
              height: Ro,
              paddingBottom: $o,
              overflowAnchor: "none",
              marginTop: at,
              transition: wo,
              position: "relative",
              transform: `translateY(${Ht + ue}px)`,
              ...Mo ? { minHeight: ke - at } : {},
              visibility: ft ? "hidden" : "visible"
            },
            children: ve.map((x) => /* @__PURE__ */ $(
              gi,
              {
                mount: re,
                unmount: Ie,
                item: x,
                ItemContent: b
              },
              Lo({ index: x.index, data: x.data, context: Oe })
            ))
          }
        ) : null,
        a && /* @__PURE__ */ $(p, { ref: y, style: gt, children: /* @__PURE__ */ $(a, { context: Oe }) }),
        c && /* @__PURE__ */ $(g, { ref: Z, style: gt, children: /* @__PURE__ */ $(c, { context: Oe }) })
      ]
    }
  );
}, Ni = ({
  customScrollParentWrapperRef: e,
  windowScrollWrapperRef: t,
  observer: n,
  children: o,
  listRef: i,
  scrollerRef: s,
  style: l,
  ...r
}) => {
  const a = Ce(), c = h.useContext(Ot), p = C(uo), { onScroll: g, onWheel: b } = dn({
    listRef: i,
    scrollTopCell$: L,
    scrollToSignal$: Re,
    scrollableRef: s
  }), I = h.useCallback(
    (y) => {
      y ? (a.pub(Le, y), s.current = y, y.addEventListener("scroll", g), y.addEventListener("wheel", b), c && a.pubIn({
        [U]: c.viewportHeight,
        [V]: c.viewportHeight,
        [L]: 0
      }), n == null || n.observe(y, { box: "border-box" })) : s.current && (s.current.removeEventListener("scroll", g), s.current.removeEventListener("wheel", b), a.pub(Le, null), n == null || n.unobserve(s.current), s.current = null);
    },
    [n, a, g, b, c, s]
  );
  gn(() => {
    var y;
    return (y = s.current) == null ? void 0 : y.scrollHeight;
  });
  const f = C(J), m = C(ze);
  return /* @__PURE__ */ $(
    p,
    {
      ...r,
      ref: I,
      "data-testid": "virtuoso-scroller",
      style: {
        overflowY: f ? "hidden" : "scroll",
        boxSizing: "border-box",
        ...l
      },
      ...p === "div" ? {} : { context: m },
      children: o
    }
  );
}, Bi = ({
  observer: e,
  children: t,
  windowScrollWrapperRef: n,
  customScrollParentWrapperRef: o,
  listRef: i,
  ...s
}) => {
  const l = h.useRef(null), r = Ce(), a = h.useContext(Ot), { onScroll: c, onWheel: p } = dn({
    listRef: i,
    scrollTopCell$: ge,
    scrollToSignal$: pn,
    scrollableRef: l
  }), g = h.useCallback(() => {
    var f;
    const I = l.current;
    I !== null && r.pub(je, (f = I.ownerDocument.defaultView) == null ? void 0 : f.innerHeight);
  }, [r]), b = h.useCallback(
    (I) => {
      if (I) {
        r.pub(Le, I), n.current = I;
        const f = I.ownerDocument.defaultView;
        f && (f.addEventListener("scroll", c), f.addEventListener("wheel", p), f.addEventListener("resize", g), a && r.pubIn({
          [je]: f == null ? void 0 : f.innerHeight,
          [V]: I.getBoundingClientRect().height,
          [ge]: 0
        }), l.current = I.ownerDocument.documentElement), e == null || e.observe(I, { box: "border-box" });
      } else {
        if (n.current) {
          const f = n.current.ownerDocument.defaultView;
          f && (f.removeEventListener("scroll", c), f.removeEventListener("wheel", p), f.removeEventListener("resize", g)), r.pub(Le, null), e == null || e.unobserve(n.current), n.current = null;
        }
        l.current = null;
      }
    },
    [e, r, c, p, g, a, n]
  );
  return gn(() => {
    var I;
    return (I = n.current) == null ? void 0 : I.getBoundingClientRect().height;
  }), /* @__PURE__ */ $("div", { ref: b, ...s, children: t });
}, Fi = ({
  scrollerRef: e,
  windowScrollWrapperRef: t,
  children: n,
  listRef: o,
  customScrollParentWrapperRef: i,
  observer: s,
  ...l
}) => {
  const r = Ce(), a = h.useContext(Ot), c = C(tt), p = h.useRef(c);
  yn(() => {
    p.current = c;
  }, [c]);
  const { onWheel: g, onScroll: b } = dn({
    listRef: o,
    scrollTopCell$: ge,
    scrollToSignal$: pn,
    scrollableRef: p
  }), I = h.useCallback(
    (f) => {
      if (f) {
        const m = p.current;
        r.pub(Le, m), i.current = f, m && (m.addEventListener("scroll", b), m.addEventListener("wheel", g), a && r.pubIn({
          [je]: m.clientHeight,
          [V]: f.getBoundingClientRect().height,
          [ge]: 0
        }), s == null || s.observe(m, { box: "border-box" })), s == null || s.observe(f, { box: "border-box" });
      } else {
        const m = p.current;
        m && (m.removeEventListener("scroll", b), m.removeEventListener("wheel", g), r.pub(Le, null), s == null || s.unobserve(m)), i.current && (s == null || s.unobserve(i.current)), i.current = null;
      }
    },
    [s, r, b, g, a, i]
  );
  return gn(() => {
    var f;
    return (f = i.current) == null ? void 0 : f.getBoundingClientRect().height;
  }), /* @__PURE__ */ $("div", { ref: I, ...l, children: n });
};
function dn({ scrollToSignal$: e, scrollableRef: t, listRef: n, scrollTopCell$: o }) {
  const i = Ce(), s = h.useRef(null), l = bi(t, n, s), r = h.useCallback(
    (p) => {
      t.current && (t.current.scrollTop += p);
    },
    [t]
  ), a = h.useCallback(() => {
    const p = t.current;
    if (p !== null && (i.pub(o, p.scrollTop), s.current !== null)) {
      const g = p.scrollHeight - p.clientHeight;
      Fn(p.scrollTop, Math.min(g, s.current)) && (s.current = null, i.pub(cn, !1), i.pub(st, p.scrollTop));
    }
  }, [i, t, o]), c = h.useCallback(
    (p) => {
      i.pub(fn, p.deltaY > 0 ? "down" : "up");
    },
    [i]
  );
  return h.useLayoutEffect(() => i.sub(e, l), [l, i, e]), h.useLayoutEffect(() => i.sub(q, r), [r, i]), {
    onScroll: a,
    onWheel: c
  };
}
function gn(e) {
  const t = Ho(V);
  No(() => {
    if (!_n())
      return;
    const n = setInterval(() => {
      t(e() ?? 0);
    }, 1e3);
    return () => {
      clearInterval(n);
    };
  }, [t, e]);
}
export {
  qi as ScrollModifierOption,
  Oi as VirtuosoMessageList,
  Ui as VirtuosoMessageListLicense,
  Ot as VirtuosoMessageListTestingContext,
  ji as useCurrentlyRenderedData,
  Yi as useVirtuosoLocation,
  Ki as useVirtuosoMethods
};
