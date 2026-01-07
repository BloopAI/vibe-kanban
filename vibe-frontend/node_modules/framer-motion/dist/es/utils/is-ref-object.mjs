function isRefObject(ref) {
    return (ref &&
        typeof ref === "object" &&
        Object.prototype.hasOwnProperty.call(ref, "current"));
}

export { isRefObject };
//# sourceMappingURL=is-ref-object.mjs.map
