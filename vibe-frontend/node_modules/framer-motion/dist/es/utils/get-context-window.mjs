// Fixes https://github.com/motiondivision/motion/issues/2270
const getContextWindow = ({ current }) => {
    return current ? current.ownerDocument.defaultView : null;
};

export { getContextWindow };
//# sourceMappingURL=get-context-window.mjs.map
