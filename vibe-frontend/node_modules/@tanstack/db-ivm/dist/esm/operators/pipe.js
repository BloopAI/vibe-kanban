function pipe(...operators) {
  return (stream) => {
    return stream.pipe(...operators);
  };
}
export {
  pipe
};
//# sourceMappingURL=pipe.js.map
