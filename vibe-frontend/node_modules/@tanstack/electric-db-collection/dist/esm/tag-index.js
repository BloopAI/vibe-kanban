const TAG_WILDCARD = `_`;
function getValue(tag, position) {
  if (position >= tag.length) {
    throw new Error(`Position out of bounds`);
  }
  return tag[position];
}
function getPositionalValue(pattern) {
  return pattern;
}
function getTagLength(tag) {
  return tag.length;
}
function tagMatchesPattern(tag, pattern) {
  const { pos, value } = getPositionalValue(pattern);
  const tagValue = getValue(tag, pos);
  return tagValue === value || tagValue === TAG_WILDCARD;
}
function addTagToIndex(tag, rowId, index, tagLength) {
  for (let i = 0; i < tagLength; i++) {
    const value = getValue(tag, i);
    if (value !== TAG_WILDCARD) {
      const positionIndex = index[i];
      if (!positionIndex.has(value)) {
        positionIndex.set(value, /* @__PURE__ */ new Set());
      }
      const tags = positionIndex.get(value);
      tags.add(rowId);
    }
  }
}
function removeTagFromIndex(tag, rowId, index, tagLength) {
  for (let i = 0; i < tagLength; i++) {
    const value = getValue(tag, i);
    if (value !== TAG_WILDCARD) {
      const positionIndex = index[i];
      if (positionIndex) {
        const rowSet = positionIndex.get(value);
        if (rowSet) {
          rowSet.delete(rowId);
          if (rowSet.size === 0) {
            positionIndex.delete(value);
          }
        }
      }
    }
  }
}
function findRowsMatchingPattern(pattern, index) {
  const { pos, value } = getPositionalValue(pattern);
  const positionIndex = index[pos];
  const rowSet = positionIndex?.get(value);
  return rowSet ?? /* @__PURE__ */ new Set();
}
function isMoveOutMessage(message) {
  return message.headers.event === `move-out`;
}
export {
  addTagToIndex,
  findRowsMatchingPattern,
  getTagLength,
  getValue,
  isMoveOutMessage,
  removeTagFromIndex,
  tagMatchesPattern
};
//# sourceMappingURL=tag-index.js.map
