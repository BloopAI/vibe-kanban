/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2023 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.incrementalUpdate = incrementalUpdate;
exports.writeDict = writeDict;
exports.writeObject = writeObject;
var _util = require("../shared/util.js");
var _primitives = require("./primitives.js");
var _core_utils = require("./core_utils.js");
var _xml_parser = require("./xml_parser.js");
var _base_stream = require("./base_stream.js");
var _crypto = require("./crypto.js");
function writeObject(ref, obj, buffer, transform) {
  buffer.push(`${ref.num} ${ref.gen} obj\n`);
  if (obj instanceof _primitives.Dict) {
    writeDict(obj, buffer, transform);
  } else if (obj instanceof _base_stream.BaseStream) {
    writeStream(obj, buffer, transform);
  }
  buffer.push("\nendobj\n");
}
function writeDict(dict, buffer, transform) {
  buffer.push("<<");
  for (const key of dict.getKeys()) {
    buffer.push(` /${(0, _core_utils.escapePDFName)(key)} `);
    writeValue(dict.getRaw(key), buffer, transform);
  }
  buffer.push(">>");
}
function writeStream(stream, buffer, transform) {
  let string = stream.getString();
  if (transform !== null) {
    string = transform.encryptString(string);
  }
  stream.dict.set("Length", string.length);
  writeDict(stream.dict, buffer, transform);
  buffer.push(" stream\n", string, "\nendstream");
}
function writeArray(array, buffer, transform) {
  buffer.push("[");
  let first = true;
  for (const val of array) {
    if (!first) {
      buffer.push(" ");
    } else {
      first = false;
    }
    writeValue(val, buffer, transform);
  }
  buffer.push("]");
}
function writeValue(value, buffer, transform) {
  if (value instanceof _primitives.Name) {
    buffer.push(`/${(0, _core_utils.escapePDFName)(value.name)}`);
  } else if (value instanceof _primitives.Ref) {
    buffer.push(`${value.num} ${value.gen} R`);
  } else if (Array.isArray(value)) {
    writeArray(value, buffer, transform);
  } else if (typeof value === "string") {
    if (transform !== null) {
      value = transform.encryptString(value);
    }
    buffer.push(`(${(0, _core_utils.escapeString)(value)})`);
  } else if (typeof value === "number") {
    buffer.push((0, _core_utils.numberToString)(value));
  } else if (typeof value === "boolean") {
    buffer.push(value.toString());
  } else if (value instanceof _primitives.Dict) {
    writeDict(value, buffer, transform);
  } else if (value instanceof _base_stream.BaseStream) {
    writeStream(value, buffer, transform);
  } else if (value === null) {
    buffer.push("null");
  } else {
    (0, _util.warn)(`Unhandled value in writer: ${typeof value}, please file a bug.`);
  }
}
function writeInt(number, size, offset, buffer) {
  for (let i = size + offset - 1; i > offset - 1; i--) {
    buffer[i] = number & 0xff;
    number >>= 8;
  }
  return offset + size;
}
function writeString(string, offset, buffer) {
  for (let i = 0, len = string.length; i < len; i++) {
    buffer[offset + i] = string.charCodeAt(i) & 0xff;
  }
}
function computeMD5(filesize, xrefInfo) {
  const time = Math.floor(Date.now() / 1000);
  const filename = xrefInfo.filename || "";
  const md5Buffer = [time.toString(), filename, filesize.toString()];
  let md5BufferLen = md5Buffer.reduce((a, str) => a + str.length, 0);
  for (const value of Object.values(xrefInfo.info)) {
    md5Buffer.push(value);
    md5BufferLen += value.length;
  }
  const array = new Uint8Array(md5BufferLen);
  let offset = 0;
  for (const str of md5Buffer) {
    writeString(str, offset, array);
    offset += str.length;
  }
  return (0, _util.bytesToString)((0, _crypto.calculateMD5)(array));
}
function writeXFADataForAcroform(str, newRefs) {
  const xml = new _xml_parser.SimpleXMLParser({
    hasAttributes: true
  }).parseFromString(str);
  for (const {
    xfa
  } of newRefs) {
    if (!xfa) {
      continue;
    }
    const {
      path,
      value
    } = xfa;
    if (!path) {
      continue;
    }
    const nodePath = (0, _core_utils.parseXFAPath)(path);
    let node = xml.documentElement.searchNode(nodePath, 0);
    if (!node && nodePath.length > 1) {
      node = xml.documentElement.searchNode([nodePath.at(-1)], 0);
    }
    if (node) {
      if (Array.isArray(value)) {
        node.childNodes = value.map(val => new _xml_parser.SimpleDOMNode("value", val));
      } else {
        node.childNodes = [new _xml_parser.SimpleDOMNode("#text", value)];
      }
    } else {
      (0, _util.warn)(`Node not found for path: ${path}`);
    }
  }
  const buffer = [];
  xml.documentElement.dump(buffer);
  return buffer.join("");
}
function updateAcroform({
  xref,
  acroForm,
  acroFormRef,
  hasXfa,
  hasXfaDatasetsEntry,
  xfaDatasetsRef,
  needAppearances,
  newRefs
}) {
  if (hasXfa && !hasXfaDatasetsEntry && !xfaDatasetsRef) {
    (0, _util.warn)("XFA - Cannot save it");
  }
  if (!needAppearances && (!hasXfa || !xfaDatasetsRef)) {
    return;
  }
  const dict = new _primitives.Dict(xref);
  for (const key of acroForm.getKeys()) {
    dict.set(key, acroForm.getRaw(key));
  }
  if (hasXfa && !hasXfaDatasetsEntry) {
    const newXfa = acroForm.get("XFA").slice();
    newXfa.splice(2, 0, "datasets");
    newXfa.splice(3, 0, xfaDatasetsRef);
    dict.set("XFA", newXfa);
  }
  if (needAppearances) {
    dict.set("NeedAppearances", true);
  }
  const encrypt = xref.encrypt;
  let transform = null;
  if (encrypt) {
    transform = encrypt.createCipherTransform(acroFormRef.num, acroFormRef.gen);
  }
  const buffer = [];
  writeObject(acroFormRef, dict, buffer, transform);
  newRefs.push({
    ref: acroFormRef,
    data: buffer.join("")
  });
}
function updateXFA({
  xfaData,
  xfaDatasetsRef,
  newRefs,
  xref
}) {
  if (xfaData === null) {
    const datasets = xref.fetchIfRef(xfaDatasetsRef);
    xfaData = writeXFADataForAcroform(datasets.getString(), newRefs);
  }
  const encrypt = xref.encrypt;
  if (encrypt) {
    const transform = encrypt.createCipherTransform(xfaDatasetsRef.num, xfaDatasetsRef.gen);
    xfaData = transform.encryptString(xfaData);
  }
  const data = `${xfaDatasetsRef.num} ${xfaDatasetsRef.gen} obj\n` + `<< /Type /EmbeddedFile /Length ${xfaData.length}>>\nstream\n` + xfaData + "\nendstream\nendobj\n";
  newRefs.push({
    ref: xfaDatasetsRef,
    data
  });
}
function incrementalUpdate({
  originalData,
  xrefInfo,
  newRefs,
  xref = null,
  hasXfa = false,
  xfaDatasetsRef = null,
  hasXfaDatasetsEntry = false,
  needAppearances,
  acroFormRef = null,
  acroForm = null,
  xfaData = null
}) {
  updateAcroform({
    xref,
    acroForm,
    acroFormRef,
    hasXfa,
    hasXfaDatasetsEntry,
    xfaDatasetsRef,
    needAppearances,
    newRefs
  });
  if (hasXfa) {
    updateXFA({
      xfaData,
      xfaDatasetsRef,
      newRefs,
      xref
    });
  }
  const newXref = new _primitives.Dict(null);
  const refForXrefTable = xrefInfo.newRef;
  let buffer, baseOffset;
  const lastByte = originalData.at(-1);
  if (lastByte === 0x0a || lastByte === 0x0d) {
    buffer = [];
    baseOffset = originalData.length;
  } else {
    buffer = ["\n"];
    baseOffset = originalData.length + 1;
  }
  newXref.set("Size", refForXrefTable.num + 1);
  newXref.set("Prev", xrefInfo.startXRef);
  newXref.set("Type", _primitives.Name.get("XRef"));
  if (xrefInfo.rootRef !== null) {
    newXref.set("Root", xrefInfo.rootRef);
  }
  if (xrefInfo.infoRef !== null) {
    newXref.set("Info", xrefInfo.infoRef);
  }
  if (xrefInfo.encryptRef !== null) {
    newXref.set("Encrypt", xrefInfo.encryptRef);
  }
  newRefs.push({
    ref: refForXrefTable,
    data: ""
  });
  newRefs = newRefs.sort((a, b) => {
    return a.ref.num - b.ref.num;
  });
  const xrefTableData = [[0, 1, 0xffff]];
  const indexes = [0, 1];
  let maxOffset = 0;
  for (const {
    ref,
    data
  } of newRefs) {
    maxOffset = Math.max(maxOffset, baseOffset);
    xrefTableData.push([1, baseOffset, Math.min(ref.gen, 0xffff)]);
    baseOffset += data.length;
    indexes.push(ref.num, 1);
    buffer.push(data);
  }
  newXref.set("Index", indexes);
  if (Array.isArray(xrefInfo.fileIds) && xrefInfo.fileIds.length > 0) {
    const md5 = computeMD5(baseOffset, xrefInfo);
    newXref.set("ID", [xrefInfo.fileIds[0], md5]);
  }
  const offsetSize = Math.ceil(Math.log2(maxOffset) / 8);
  const sizes = [1, offsetSize, 2];
  const structSize = sizes[0] + sizes[1] + sizes[2];
  const tableLength = structSize * xrefTableData.length;
  newXref.set("W", sizes);
  newXref.set("Length", tableLength);
  buffer.push(`${refForXrefTable.num} ${refForXrefTable.gen} obj\n`);
  writeDict(newXref, buffer, null);
  buffer.push(" stream\n");
  const bufferLen = buffer.reduce((a, str) => a + str.length, 0);
  const footer = `\nendstream\nendobj\nstartxref\n${baseOffset}\n%%EOF\n`;
  const array = new Uint8Array(originalData.length + bufferLen + tableLength + footer.length);
  array.set(originalData);
  let offset = originalData.length;
  for (const str of buffer) {
    writeString(str, offset, array);
    offset += str.length;
  }
  for (const [type, objOffset, gen] of xrefTableData) {
    offset = writeInt(type, sizes[0], offset, array);
    offset = writeInt(objOffset, sizes[1], offset, array);
    offset = writeInt(gen, sizes[2], offset, array);
  }
  writeString(footer, offset, array);
  return array;
}