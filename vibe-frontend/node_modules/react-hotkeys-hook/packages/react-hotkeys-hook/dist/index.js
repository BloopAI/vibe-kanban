import { createContext as T, useContext as M, useState as A, useCallback as w, useRef as S, useLayoutEffect as z, useEffect as J } from "react";
import { jsx as b } from "react/jsx-runtime";
const j = ["shift", "alt", "meta", "mod", "ctrl", "control"], Q = {
  esc: "escape",
  return: "enter",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  AltLeft: "alt",
  AltRight: "alt",
  MetaLeft: "meta",
  MetaRight: "meta",
  OSLeft: "meta",
  OSRight: "meta",
  ControlLeft: "ctrl",
  ControlRight: "ctrl"
};
function K(e) {
  return (Q[e.trim()] || e.trim()).toLowerCase().replace(/key|digit|numpad/, "");
}
function D(e) {
  return j.includes(e);
}
function H(e, r = ",") {
  return e.toLowerCase().split(r);
}
function P(e, r = "+", o = ">", i = !1, u) {
  let n = [], c = !1;
  e = e.trim(), e.includes(o) ? (c = !0, n = e.toLocaleLowerCase().split(o).map((f) => K(f))) : n = e.toLocaleLowerCase().split(r).map((f) => K(f));
  const y = {
    alt: n.includes("alt"),
    ctrl: n.includes("ctrl") || n.includes("control"),
    shift: n.includes("shift"),
    meta: n.includes("meta"),
    mod: n.includes("mod"),
    useKey: i
  }, d = n.filter((f) => !j.includes(f));
  return {
    ...y,
    keys: d,
    description: u,
    isSequence: c,
    hotkey: e
  };
}
typeof document < "u" && (document.addEventListener("keydown", (e) => {
  e.code !== void 0 && I([K(e.code)]);
}), document.addEventListener("keyup", (e) => {
  e.code !== void 0 && _([K(e.code)]);
})), typeof window < "u" && (window.addEventListener("blur", () => {
  L.clear();
}), window.addEventListener("contextmenu", () => {
  setTimeout(() => {
    L.clear();
  }, 0);
}));
const L = /* @__PURE__ */ new Set();
function R(e) {
  return Array.isArray(e);
}
function U(e, r = ",") {
  return (R(e) ? e : e.split(r)).every((i) => L.has(i.trim().toLowerCase()));
}
function I(e) {
  const r = Array.isArray(e) ? e : [e];
  L.has("meta") && L.forEach((o) => !D(o) && L.delete(o.toLowerCase())), r.forEach((o) => L.add(o.toLowerCase()));
}
function _(e) {
  const r = Array.isArray(e) ? e : [e];
  e === "meta" ? L.clear() : r.forEach((o) => L.delete(o.toLowerCase()));
}
function V(e, r, o) {
  (typeof o == "function" && o(e, r) || o === !0) && e.preventDefault();
}
function X(e, r, o) {
  return typeof o == "function" ? o(e, r) : o === !0 || o === void 0;
}
const Y = [
  "input",
  "textarea",
  "select",
  "searchbox",
  "slider",
  "spinbutton",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "textbox"
];
function Z(e) {
  return F(e, Y);
}
function F(e, r = !1) {
  const { target: o, composed: i } = e;
  let u, n;
  return ee(o) && i ? (u = e.composedPath()[0] && e.composedPath()[0].tagName, n = e.composedPath()[0] && e.composedPath()[0].role) : (u = o && o.tagName, n = o && o.role), R(r) ? !!(u && r && r.some((c) => c.toLowerCase() === u.toLowerCase() || c === n)) : !!(u && r && r);
}
function ee(e) {
  return !!e.tagName && !e.tagName.startsWith("-") && e.tagName.includes("-");
}
function te(e, r) {
  return e.length === 0 && r ? (console.warn(
    'A hotkey has the "scopes" option set, however no active scopes were found. If you want to use the global scopes feature, you need to wrap your app in a <HotkeysProvider>'
  ), !0) : r ? e.some((o) => r.includes(o)) || e.includes("*") : !0;
}
const re = (e, r, o = !1) => {
  const { alt: i, meta: u, mod: n, shift: c, ctrl: y, keys: d, useKey: f } = r, { code: p, key: t, ctrlKey: a, metaKey: l, shiftKey: g, altKey: k } = e, m = K(p);
  if (f && d?.length === 1 && d.includes(t))
    return !0;
  if (!d?.includes(m) && !["ctrl", "control", "unknown", "meta", "alt", "shift", "os"].includes(m))
    return !1;
  if (!o) {
    if (i !== k && m !== "alt" || c !== g && m !== "shift")
      return !1;
    if (n) {
      if (!l && !a)
        return !1;
    } else if (u !== l && m !== "meta" && m !== "os" || y !== a && m !== "ctrl" && m !== "control")
      return !1;
  }
  return d && d.length === 1 && d.includes(m) ? !0 : d ? U(d) : !d;
}, $ = T(void 0), oe = () => M($);
function ne({ addHotkey: e, removeHotkey: r, children: o }) {
  return /* @__PURE__ */ b($.Provider, { value: { addHotkey: e, removeHotkey: r }, children: o });
}
function x(e, r) {
  return e && r && typeof e == "object" && typeof r == "object" ? Object.keys(e).length === Object.keys(r).length && // @ts-expect-error TS7053
  Object.keys(e).reduce((o, i) => o && x(e[i], r[i]), !0) : e === r;
}
const W = T({
  hotkeys: [],
  activeScopes: [],
  // This array has to be empty instead of containing '*' as default, to check if the provider is set or not
  toggleScope: () => {
  },
  enableScope: () => {
  },
  disableScope: () => {
  }
}), se = () => M(W), de = ({ initiallyActiveScopes: e = ["*"], children: r }) => {
  const [o, i] = A(e), [u, n] = A([]), c = w((t) => {
    i((a) => a.includes("*") ? [t] : Array.from(/* @__PURE__ */ new Set([...a, t])));
  }, []), y = w((t) => {
    i((a) => a.filter((l) => l !== t));
  }, []), d = w((t) => {
    i((a) => a.includes(t) ? a.filter((l) => l !== t) : a.includes("*") ? [t] : Array.from(/* @__PURE__ */ new Set([...a, t])));
  }, []), f = w((t) => {
    n((a) => [...a, t]);
  }, []), p = w((t) => {
    n((a) => a.filter((l) => !x(l, t)));
  }, []);
  return /* @__PURE__ */ b(
    W.Provider,
    {
      value: { activeScopes: o, hotkeys: u, enableScope: c, disableScope: y, toggleScope: d },
      children: /* @__PURE__ */ b(ne, { addHotkey: f, removeHotkey: p, children: r })
    }
  );
};
function ie(e) {
  const r = S(void 0);
  return x(r.current, e) || (r.current = e), r.current;
}
const N = (e) => {
  e.stopPropagation(), e.preventDefault(), e.stopImmediatePropagation();
}, ue = typeof window < "u" ? z : J;
function fe(e, r, o, i) {
  const u = S(null), n = S(!1), c = Array.isArray(o) ? Array.isArray(i) ? void 0 : i : o, y = R(e) ? e.join(c?.delimiter) : e, d = Array.isArray(o) ? o : Array.isArray(i) ? i : void 0, f = w(r, d ?? []), p = S(f);
  d ? p.current = f : p.current = r;
  const t = ie(c), { activeScopes: a } = se(), l = oe();
  return ue(() => {
    if (t?.enabled === !1 || !te(a, t?.scopes))
      return;
    let g = [], k;
    const m = (s, B = !1) => {
      if (!(Z(s) && !F(s, t?.enableOnFormTags))) {
        if (u.current !== null) {
          const v = u.current.getRootNode();
          if ((v instanceof Document || v instanceof ShadowRoot) && v.activeElement !== u.current && !u.current.contains(v.activeElement)) {
            N(s);
            return;
          }
        }
        s.target?.isContentEditable && !t?.enableOnContentEditable || H(y, t?.delimiter).forEach((v) => {
          if (v.includes(t?.splitKey ?? "+") && v.includes(t?.sequenceSplitKey ?? ">")) {
            console.warn(
              `Hotkey ${v} contains both ${t?.splitKey ?? "+"} and ${t?.sequenceSplitKey ?? ">"} which is not supported.`
            );
            return;
          }
          const h = P(
            v,
            t?.splitKey,
            t?.sequenceSplitKey,
            t?.useKey,
            t?.description
          );
          if (h.isSequence) {
            k = setTimeout(() => {
              g = [];
            }, t?.sequenceTimeoutMs ?? 1e3);
            const C = h.useKey ? s.key : K(s.code);
            if (D(C.toLowerCase()))
              return;
            g.push(C);
            const G = h.keys?.[g.length - 1];
            if (C !== G) {
              g = [], k && clearTimeout(k);
              return;
            }
            g.length === h.keys?.length && (p.current(s, h), k && clearTimeout(k), g = []);
          } else if (re(s, h, t?.ignoreModifiers) || h.keys?.includes("*")) {
            if (t?.ignoreEventWhen?.(s) || B && n.current)
              return;
            if (V(s, h, t?.preventDefault), !X(s, h, t?.enabled)) {
              N(s);
              return;
            }
            p.current(s, h), B || (n.current = !0);
          }
        });
      }
    }, O = (s) => {
      s.code !== void 0 && (I(K(s.code)), (t?.keydown === void 0 && t?.keyup !== !0 || t?.keydown) && m(s));
    }, q = (s) => {
      s.code !== void 0 && (_(K(s.code)), n.current = !1, t?.keyup && m(s, !0));
    }, E = u.current || c?.document || document;
    return E.addEventListener("keyup", q, c?.eventListenerOptions), E.addEventListener("keydown", O, c?.eventListenerOptions), l && H(y, t?.delimiter).forEach(
      (s) => l.addHotkey(
        P(
          s,
          t?.splitKey,
          t?.sequenceSplitKey,
          t?.useKey,
          t?.description
        )
      )
    ), () => {
      E.removeEventListener("keyup", q, c?.eventListenerOptions), E.removeEventListener("keydown", O, c?.eventListenerOptions), l && H(y, t?.delimiter).forEach(
        (s) => l.removeHotkey(
          P(
            s,
            t?.splitKey,
            t?.sequenceSplitKey,
            t?.useKey,
            t?.description
          )
        )
      ), g = [], k && clearTimeout(k);
    };
  }, [y, t, a]), u;
}
function le(e = !1) {
  const [r, o] = A(/* @__PURE__ */ new Set()), [i, u] = A(!1), n = w(
    (f) => {
      f.code !== void 0 && (f.preventDefault(), f.stopPropagation(), o((p) => {
        const t = new Set(p);
        return t.add(K(e ? f.key : f.code)), t;
      }));
    },
    [e]
  ), c = w(() => {
    typeof document < "u" && (document.removeEventListener("keydown", n), u(!1));
  }, [n]), y = w(() => {
    o(/* @__PURE__ */ new Set()), typeof document < "u" && (c(), document.addEventListener("keydown", n), u(!0));
  }, [n, c]), d = w(() => {
    o(/* @__PURE__ */ new Set());
  }, []);
  return [r, { start: y, stop: c, resetKeys: d, isRecording: i }];
}
export {
  de as HotkeysProvider,
  U as isHotkeyPressed,
  fe as useHotkeys,
  se as useHotkeysContext,
  le as useRecordHotkeys
};
