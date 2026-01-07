module.exports = function getNearestAncestor(node, type) {
  let temp = node.parent;
  while (temp) {
    if (temp.type === type) {
      return temp;
    }
    temp = temp.parent;
  }
  return temp;
};
