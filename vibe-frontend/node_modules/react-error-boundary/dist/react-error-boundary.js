"use client";
import { createContext as l, Component as y, createElement as d, useContext as f, useState as p, useMemo as E, forwardRef as B } from "react";
const h = l(null), c = {
  didCatch: !1,
  error: null
};
class m extends y {
  constructor(t) {
    super(t), this.resetErrorBoundary = this.resetErrorBoundary.bind(this), this.state = c;
  }
  static getDerivedStateFromError(t) {
    return { didCatch: !0, error: t };
  }
  resetErrorBoundary(...t) {
    const { error: e } = this.state;
    e !== null && (this.props.onReset?.({
      args: t,
      reason: "imperative-api"
    }), this.setState(c));
  }
  componentDidCatch(t, e) {
    this.props.onError?.(t, e);
  }
  componentDidUpdate(t, e) {
    const { didCatch: o } = this.state, { resetKeys: n } = this.props;
    o && e.error !== null && C(t.resetKeys, n) && (this.props.onReset?.({
      next: n,
      prev: t.resetKeys,
      reason: "keys"
    }), this.setState(c));
  }
  render() {
    const { children: t, fallbackRender: e, FallbackComponent: o, fallback: n } = this.props, { didCatch: s, error: a } = this.state;
    let i = t;
    if (s) {
      const u = {
        error: a,
        resetErrorBoundary: this.resetErrorBoundary
      };
      if (typeof e == "function")
        i = e(u);
      else if (o)
        i = d(o, u);
      else if (n !== void 0)
        i = n;
      else
        throw a;
    }
    return d(
      h.Provider,
      {
        value: {
          didCatch: s,
          error: a,
          resetErrorBoundary: this.resetErrorBoundary
        }
      },
      i
    );
  }
}
function C(r = [], t = []) {
  return r.length !== t.length || r.some((e, o) => !Object.is(e, t[o]));
}
function x(r) {
  return r !== null && typeof r == "object" && "didCatch" in r && typeof r.didCatch == "boolean" && "error" in r && "resetErrorBoundary" in r && typeof r.resetErrorBoundary == "function";
}
function w(r) {
  if (!x(r))
    throw new Error("ErrorBoundaryContext not found");
}
function S() {
  const r = f(h);
  w(r);
  const { error: t, resetErrorBoundary: e } = r, [o, n] = p({
    error: null,
    hasError: !1
  }), s = E(
    () => ({
      error: t,
      resetBoundary: () => {
        e(), n({ error: null, hasError: !1 });
      },
      showBoundary: (a) => n({
        error: a,
        hasError: !0
      })
    }),
    [t, e]
  );
  if (o.hasError)
    throw o.error;
  return s;
}
function k(r, t) {
  const e = B(
    (n, s) => d(
      m,
      t,
      d(r, { ...n, ref: s })
    )
  ), o = r.displayName || r.name || "Unknown";
  return e.displayName = `withErrorBoundary(${o})`, e;
}
export {
  m as ErrorBoundary,
  h as ErrorBoundaryContext,
  S as useErrorBoundary,
  k as withErrorBoundary
};
//# sourceMappingURL=react-error-boundary.js.map
