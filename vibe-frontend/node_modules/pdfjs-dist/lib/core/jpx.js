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
exports.JpxImage = void 0;
var _util = require("../shared/util.js");
var _core_utils = require("./core_utils.js");
var _arithmetic_decoder = require("./arithmetic_decoder.js");
class JpxError extends _util.BaseException {
  constructor(msg) {
    super(`JPX error: ${msg}`, "JpxError");
  }
}
const SubbandsGainLog2 = {
  LL: 0,
  LH: 1,
  HL: 1,
  HH: 2
};
class JpxImage {
  constructor() {
    this.failOnCorruptedImage = false;
  }
  parse(data) {
    const head = (0, _core_utils.readUint16)(data, 0);
    if (head === 0xff4f) {
      this.parseCodestream(data, 0, data.length);
      return;
    }
    const length = data.length;
    let position = 0;
    while (position < length) {
      let headerSize = 8;
      let lbox = (0, _core_utils.readUint32)(data, position);
      const tbox = (0, _core_utils.readUint32)(data, position + 4);
      position += headerSize;
      if (lbox === 1) {
        lbox = (0, _core_utils.readUint32)(data, position) * 4294967296 + (0, _core_utils.readUint32)(data, position + 4);
        position += 8;
        headerSize += 8;
      }
      if (lbox === 0) {
        lbox = length - position + headerSize;
      }
      if (lbox < headerSize) {
        throw new JpxError("Invalid box field size");
      }
      const dataLength = lbox - headerSize;
      let jumpDataLength = true;
      switch (tbox) {
        case 0x6a703268:
          jumpDataLength = false;
          break;
        case 0x636f6c72:
          const method = data[position];
          if (method === 1) {
            const colorspace = (0, _core_utils.readUint32)(data, position + 3);
            switch (colorspace) {
              case 16:
              case 17:
              case 18:
                break;
              default:
                (0, _util.warn)("Unknown colorspace " + colorspace);
                break;
            }
          } else if (method === 2) {
            (0, _util.info)("ICC profile not supported");
          }
          break;
        case 0x6a703263:
          this.parseCodestream(data, position, position + dataLength);
          break;
        case 0x6a502020:
          if ((0, _core_utils.readUint32)(data, position) !== 0x0d0a870a) {
            (0, _util.warn)("Invalid JP2 signature");
          }
          break;
        case 0x6a501a1a:
        case 0x66747970:
        case 0x72726571:
        case 0x72657320:
        case 0x69686472:
          break;
        default:
          const headerType = String.fromCharCode(tbox >> 24 & 0xff, tbox >> 16 & 0xff, tbox >> 8 & 0xff, tbox & 0xff);
          (0, _util.warn)(`Unsupported header type ${tbox} (${headerType}).`);
          break;
      }
      if (jumpDataLength) {
        position += dataLength;
      }
    }
  }
  parseImageProperties(stream) {
    let newByte = stream.getByte();
    while (newByte >= 0) {
      const oldByte = newByte;
      newByte = stream.getByte();
      const code = oldByte << 8 | newByte;
      if (code === 0xff51) {
        stream.skip(4);
        const Xsiz = stream.getInt32() >>> 0;
        const Ysiz = stream.getInt32() >>> 0;
        const XOsiz = stream.getInt32() >>> 0;
        const YOsiz = stream.getInt32() >>> 0;
        stream.skip(16);
        const Csiz = stream.getUint16();
        this.width = Xsiz - XOsiz;
        this.height = Ysiz - YOsiz;
        this.componentsCount = Csiz;
        this.bitsPerComponent = 8;
        return;
      }
    }
    throw new JpxError("No size marker found in JPX stream");
  }
  parseCodestream(data, start, end) {
    const context = {};
    let doNotRecover = false;
    try {
      let position = start;
      while (position + 1 < end) {
        const code = (0, _core_utils.readUint16)(data, position);
        position += 2;
        let length = 0,
          j,
          sqcd,
          spqcds,
          spqcdSize,
          scalarExpounded,
          tile;
        switch (code) {
          case 0xff4f:
            context.mainHeader = true;
            break;
          case 0xffd9:
            break;
          case 0xff51:
            length = (0, _core_utils.readUint16)(data, position);
            const siz = {};
            siz.Xsiz = (0, _core_utils.readUint32)(data, position + 4);
            siz.Ysiz = (0, _core_utils.readUint32)(data, position + 8);
            siz.XOsiz = (0, _core_utils.readUint32)(data, position + 12);
            siz.YOsiz = (0, _core_utils.readUint32)(data, position + 16);
            siz.XTsiz = (0, _core_utils.readUint32)(data, position + 20);
            siz.YTsiz = (0, _core_utils.readUint32)(data, position + 24);
            siz.XTOsiz = (0, _core_utils.readUint32)(data, position + 28);
            siz.YTOsiz = (0, _core_utils.readUint32)(data, position + 32);
            const componentsCount = (0, _core_utils.readUint16)(data, position + 36);
            siz.Csiz = componentsCount;
            const components = [];
            j = position + 38;
            for (let i = 0; i < componentsCount; i++) {
              const component = {
                precision: (data[j] & 0x7f) + 1,
                isSigned: !!(data[j] & 0x80),
                XRsiz: data[j + 1],
                YRsiz: data[j + 2]
              };
              j += 3;
              calculateComponentDimensions(component, siz);
              components.push(component);
            }
            context.SIZ = siz;
            context.components = components;
            calculateTileGrids(context, components);
            context.QCC = [];
            context.COC = [];
            break;
          case 0xff5c:
            length = (0, _core_utils.readUint16)(data, position);
            const qcd = {};
            j = position + 2;
            sqcd = data[j++];
            switch (sqcd & 0x1f) {
              case 0:
                spqcdSize = 8;
                scalarExpounded = true;
                break;
              case 1:
                spqcdSize = 16;
                scalarExpounded = false;
                break;
              case 2:
                spqcdSize = 16;
                scalarExpounded = true;
                break;
              default:
                throw new Error("Invalid SQcd value " + sqcd);
            }
            qcd.noQuantization = spqcdSize === 8;
            qcd.scalarExpounded = scalarExpounded;
            qcd.guardBits = sqcd >> 5;
            spqcds = [];
            while (j < length + position) {
              const spqcd = {};
              if (spqcdSize === 8) {
                spqcd.epsilon = data[j++] >> 3;
                spqcd.mu = 0;
              } else {
                spqcd.epsilon = data[j] >> 3;
                spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                j += 2;
              }
              spqcds.push(spqcd);
            }
            qcd.SPqcds = spqcds;
            if (context.mainHeader) {
              context.QCD = qcd;
            } else {
              context.currentTile.QCD = qcd;
              context.currentTile.QCC = [];
            }
            break;
          case 0xff5d:
            length = (0, _core_utils.readUint16)(data, position);
            const qcc = {};
            j = position + 2;
            let cqcc;
            if (context.SIZ.Csiz < 257) {
              cqcc = data[j++];
            } else {
              cqcc = (0, _core_utils.readUint16)(data, j);
              j += 2;
            }
            sqcd = data[j++];
            switch (sqcd & 0x1f) {
              case 0:
                spqcdSize = 8;
                scalarExpounded = true;
                break;
              case 1:
                spqcdSize = 16;
                scalarExpounded = false;
                break;
              case 2:
                spqcdSize = 16;
                scalarExpounded = true;
                break;
              default:
                throw new Error("Invalid SQcd value " + sqcd);
            }
            qcc.noQuantization = spqcdSize === 8;
            qcc.scalarExpounded = scalarExpounded;
            qcc.guardBits = sqcd >> 5;
            spqcds = [];
            while (j < length + position) {
              const spqcd = {};
              if (spqcdSize === 8) {
                spqcd.epsilon = data[j++] >> 3;
                spqcd.mu = 0;
              } else {
                spqcd.epsilon = data[j] >> 3;
                spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                j += 2;
              }
              spqcds.push(spqcd);
            }
            qcc.SPqcds = spqcds;
            if (context.mainHeader) {
              context.QCC[cqcc] = qcc;
            } else {
              context.currentTile.QCC[cqcc] = qcc;
            }
            break;
          case 0xff52:
            length = (0, _core_utils.readUint16)(data, position);
            const cod = {};
            j = position + 2;
            const scod = data[j++];
            cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
            cod.sopMarkerUsed = !!(scod & 2);
            cod.ephMarkerUsed = !!(scod & 4);
            cod.progressionOrder = data[j++];
            cod.layersCount = (0, _core_utils.readUint16)(data, j);
            j += 2;
            cod.multipleComponentTransform = data[j++];
            cod.decompositionLevelsCount = data[j++];
            cod.xcb = (data[j++] & 0xf) + 2;
            cod.ycb = (data[j++] & 0xf) + 2;
            const blockStyle = data[j++];
            cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
            cod.resetContextProbabilities = !!(blockStyle & 2);
            cod.terminationOnEachCodingPass = !!(blockStyle & 4);
            cod.verticallyStripe = !!(blockStyle & 8);
            cod.predictableTermination = !!(blockStyle & 16);
            cod.segmentationSymbolUsed = !!(blockStyle & 32);
            cod.reversibleTransformation = data[j++];
            if (cod.entropyCoderWithCustomPrecincts) {
              const precinctsSizes = [];
              while (j < length + position) {
                const precinctsSize = data[j++];
                precinctsSizes.push({
                  PPx: precinctsSize & 0xf,
                  PPy: precinctsSize >> 4
                });
              }
              cod.precinctsSizes = precinctsSizes;
            }
            const unsupported = [];
            if (cod.selectiveArithmeticCodingBypass) {
              unsupported.push("selectiveArithmeticCodingBypass");
            }
            if (cod.terminationOnEachCodingPass) {
              unsupported.push("terminationOnEachCodingPass");
            }
            if (cod.verticallyStripe) {
              unsupported.push("verticallyStripe");
            }
            if (cod.predictableTermination) {
              unsupported.push("predictableTermination");
            }
            if (unsupported.length > 0) {
              doNotRecover = true;
              (0, _util.warn)(`JPX: Unsupported COD options (${unsupported.join(", ")}).`);
            }
            if (context.mainHeader) {
              context.COD = cod;
            } else {
              context.currentTile.COD = cod;
              context.currentTile.COC = [];
            }
            break;
          case 0xff90:
            length = (0, _core_utils.readUint16)(data, position);
            tile = {};
            tile.index = (0, _core_utils.readUint16)(data, position + 2);
            tile.length = (0, _core_utils.readUint32)(data, position + 4);
            tile.dataEnd = tile.length + position - 2;
            tile.partIndex = data[position + 8];
            tile.partsCount = data[position + 9];
            context.mainHeader = false;
            if (tile.partIndex === 0) {
              tile.COD = context.COD;
              tile.COC = context.COC.slice(0);
              tile.QCD = context.QCD;
              tile.QCC = context.QCC.slice(0);
            }
            context.currentTile = tile;
            break;
          case 0xff93:
            tile = context.currentTile;
            if (tile.partIndex === 0) {
              initializeTile(context, tile.index);
              buildPackets(context);
            }
            length = tile.dataEnd - position;
            parseTilePackets(context, data, position, length);
            break;
          case 0xff53:
            (0, _util.warn)("JPX: Codestream code 0xFF53 (COC) is not implemented.");
          case 0xff55:
          case 0xff57:
          case 0xff58:
          case 0xff64:
            length = (0, _core_utils.readUint16)(data, position);
            break;
          default:
            throw new Error("Unknown codestream code: " + code.toString(16));
        }
        position += length;
      }
    } catch (e) {
      if (doNotRecover || this.failOnCorruptedImage) {
        throw new JpxError(e.message);
      } else {
        (0, _util.warn)(`JPX: Trying to recover from: "${e.message}".`);
      }
    }
    this.tiles = transformComponents(context);
    this.width = context.SIZ.Xsiz - context.SIZ.XOsiz;
    this.height = context.SIZ.Ysiz - context.SIZ.YOsiz;
    this.componentsCount = context.SIZ.Csiz;
  }
}
exports.JpxImage = JpxImage;
function calculateComponentDimensions(component, siz) {
  component.x0 = Math.ceil(siz.XOsiz / component.XRsiz);
  component.x1 = Math.ceil(siz.Xsiz / component.XRsiz);
  component.y0 = Math.ceil(siz.YOsiz / component.YRsiz);
  component.y1 = Math.ceil(siz.Ysiz / component.YRsiz);
  component.width = component.x1 - component.x0;
  component.height = component.y1 - component.y0;
}
function calculateTileGrids(context, components) {
  const siz = context.SIZ;
  const tiles = [];
  let tile;
  const numXtiles = Math.ceil((siz.Xsiz - siz.XTOsiz) / siz.XTsiz);
  const numYtiles = Math.ceil((siz.Ysiz - siz.YTOsiz) / siz.YTsiz);
  for (let q = 0; q < numYtiles; q++) {
    for (let p = 0; p < numXtiles; p++) {
      tile = {};
      tile.tx0 = Math.max(siz.XTOsiz + p * siz.XTsiz, siz.XOsiz);
      tile.ty0 = Math.max(siz.YTOsiz + q * siz.YTsiz, siz.YOsiz);
      tile.tx1 = Math.min(siz.XTOsiz + (p + 1) * siz.XTsiz, siz.Xsiz);
      tile.ty1 = Math.min(siz.YTOsiz + (q + 1) * siz.YTsiz, siz.Ysiz);
      tile.width = tile.tx1 - tile.tx0;
      tile.height = tile.ty1 - tile.ty0;
      tile.components = [];
      tiles.push(tile);
    }
  }
  context.tiles = tiles;
  const componentsCount = siz.Csiz;
  for (let i = 0, ii = componentsCount; i < ii; i++) {
    const component = components[i];
    for (let j = 0, jj = tiles.length; j < jj; j++) {
      const tileComponent = {};
      tile = tiles[j];
      tileComponent.tcx0 = Math.ceil(tile.tx0 / component.XRsiz);
      tileComponent.tcy0 = Math.ceil(tile.ty0 / component.YRsiz);
      tileComponent.tcx1 = Math.ceil(tile.tx1 / component.XRsiz);
      tileComponent.tcy1 = Math.ceil(tile.ty1 / component.YRsiz);
      tileComponent.width = tileComponent.tcx1 - tileComponent.tcx0;
      tileComponent.height = tileComponent.tcy1 - tileComponent.tcy0;
      tile.components[i] = tileComponent;
    }
  }
}
function getBlocksDimensions(context, component, r) {
  const codOrCoc = component.codingStyleParameters;
  const result = {};
  if (!codOrCoc.entropyCoderWithCustomPrecincts) {
    result.PPx = 15;
    result.PPy = 15;
  } else {
    result.PPx = codOrCoc.precinctsSizes[r].PPx;
    result.PPy = codOrCoc.precinctsSizes[r].PPy;
  }
  result.xcb_ = r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) : Math.min(codOrCoc.xcb, result.PPx);
  result.ycb_ = r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) : Math.min(codOrCoc.ycb, result.PPy);
  return result;
}
function buildPrecincts(context, resolution, dimensions) {
  const precinctWidth = 1 << dimensions.PPx;
  const precinctHeight = 1 << dimensions.PPy;
  const isZeroRes = resolution.resLevel === 0;
  const precinctWidthInSubband = 1 << dimensions.PPx + (isZeroRes ? 0 : -1);
  const precinctHeightInSubband = 1 << dimensions.PPy + (isZeroRes ? 0 : -1);
  const numprecinctswide = resolution.trx1 > resolution.trx0 ? Math.ceil(resolution.trx1 / precinctWidth) - Math.floor(resolution.trx0 / precinctWidth) : 0;
  const numprecinctshigh = resolution.try1 > resolution.try0 ? Math.ceil(resolution.try1 / precinctHeight) - Math.floor(resolution.try0 / precinctHeight) : 0;
  const numprecincts = numprecinctswide * numprecinctshigh;
  resolution.precinctParameters = {
    precinctWidth,
    precinctHeight,
    numprecinctswide,
    numprecinctshigh,
    numprecincts,
    precinctWidthInSubband,
    precinctHeightInSubband
  };
}
function buildCodeblocks(context, subband, dimensions) {
  const xcb_ = dimensions.xcb_;
  const ycb_ = dimensions.ycb_;
  const codeblockWidth = 1 << xcb_;
  const codeblockHeight = 1 << ycb_;
  const cbx0 = subband.tbx0 >> xcb_;
  const cby0 = subband.tby0 >> ycb_;
  const cbx1 = subband.tbx1 + codeblockWidth - 1 >> xcb_;
  const cby1 = subband.tby1 + codeblockHeight - 1 >> ycb_;
  const precinctParameters = subband.resolution.precinctParameters;
  const codeblocks = [];
  const precincts = [];
  let i, j, codeblock, precinctNumber;
  for (j = cby0; j < cby1; j++) {
    for (i = cbx0; i < cbx1; i++) {
      codeblock = {
        cbx: i,
        cby: j,
        tbx0: codeblockWidth * i,
        tby0: codeblockHeight * j,
        tbx1: codeblockWidth * (i + 1),
        tby1: codeblockHeight * (j + 1)
      };
      codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
      codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
      codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
      codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);
      const pi = Math.floor((codeblock.tbx0_ - subband.tbx0) / precinctParameters.precinctWidthInSubband);
      const pj = Math.floor((codeblock.tby0_ - subband.tby0) / precinctParameters.precinctHeightInSubband);
      precinctNumber = pi + pj * precinctParameters.numprecinctswide;
      codeblock.precinctNumber = precinctNumber;
      codeblock.subbandType = subband.type;
      codeblock.Lblock = 3;
      if (codeblock.tbx1_ <= codeblock.tbx0_ || codeblock.tby1_ <= codeblock.tby0_) {
        continue;
      }
      codeblocks.push(codeblock);
      let precinct = precincts[precinctNumber];
      if (precinct !== undefined) {
        if (i < precinct.cbxMin) {
          precinct.cbxMin = i;
        } else if (i > precinct.cbxMax) {
          precinct.cbxMax = i;
        }
        if (j < precinct.cbyMin) {
          precinct.cbxMin = j;
        } else if (j > precinct.cbyMax) {
          precinct.cbyMax = j;
        }
      } else {
        precincts[precinctNumber] = precinct = {
          cbxMin: i,
          cbyMin: j,
          cbxMax: i,
          cbyMax: j
        };
      }
      codeblock.precinct = precinct;
    }
  }
  subband.codeblockParameters = {
    codeblockWidth: xcb_,
    codeblockHeight: ycb_,
    numcodeblockwide: cbx1 - cbx0 + 1,
    numcodeblockhigh: cby1 - cby0 + 1
  };
  subband.codeblocks = codeblocks;
  subband.precincts = precincts;
}
function createPacket(resolution, precinctNumber, layerNumber) {
  const precinctCodeblocks = [];
  const subbands = resolution.subbands;
  for (let i = 0, ii = subbands.length; i < ii; i++) {
    const subband = subbands[i];
    const codeblocks = subband.codeblocks;
    for (let j = 0, jj = codeblocks.length; j < jj; j++) {
      const codeblock = codeblocks[j];
      if (codeblock.precinctNumber !== precinctNumber) {
        continue;
      }
      precinctCodeblocks.push(codeblock);
    }
  }
  return {
    layerNumber,
    codeblocks: precinctCodeblocks
  };
}
function LayerResolutionComponentPositionIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let maxDecompositionLevelsCount = 0;
  for (let q = 0; q < componentsCount; q++) {
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
  }
  let l = 0,
    r = 0,
    i = 0,
    k = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; l < layersCount; l++) {
      for (; r <= maxDecompositionLevelsCount; r++) {
        for (; i < componentsCount; i++) {
          const component = tile.components[i];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          for (; k < numprecincts;) {
            const packet = createPacket(resolution, k, l);
            k++;
            return packet;
          }
          k = 0;
        }
        i = 0;
      }
      r = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ResolutionLayerComponentPositionIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let maxDecompositionLevelsCount = 0;
  for (let q = 0; q < componentsCount; q++) {
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
  }
  let r = 0,
    l = 0,
    i = 0,
    k = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; r <= maxDecompositionLevelsCount; r++) {
      for (; l < layersCount; l++) {
        for (; i < componentsCount; i++) {
          const component = tile.components[i];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          for (; k < numprecincts;) {
            const packet = createPacket(resolution, k, l);
            k++;
            return packet;
          }
          k = 0;
        }
        i = 0;
      }
      l = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ResolutionPositionComponentLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  let l, r, c, p;
  let maxDecompositionLevelsCount = 0;
  for (c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, component.codingStyleParameters.decompositionLevelsCount);
  }
  const maxNumPrecinctsInLevel = new Int32Array(maxDecompositionLevelsCount + 1);
  for (r = 0; r <= maxDecompositionLevelsCount; ++r) {
    let maxNumPrecincts = 0;
    for (c = 0; c < componentsCount; ++c) {
      const resolutions = tile.components[c].resolutions;
      if (r < resolutions.length) {
        maxNumPrecincts = Math.max(maxNumPrecincts, resolutions[r].precinctParameters.numprecincts);
      }
    }
    maxNumPrecinctsInLevel[r] = maxNumPrecincts;
  }
  l = 0;
  r = 0;
  c = 0;
  p = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; r <= maxDecompositionLevelsCount; r++) {
      for (; p < maxNumPrecinctsInLevel[r]; p++) {
        for (; c < componentsCount; c++) {
          const component = tile.components[c];
          if (r > component.codingStyleParameters.decompositionLevelsCount) {
            continue;
          }
          const resolution = component.resolutions[r];
          const numprecincts = resolution.precinctParameters.numprecincts;
          if (p >= numprecincts) {
            continue;
          }
          for (; l < layersCount;) {
            const packet = createPacket(resolution, p, l);
            l++;
            return packet;
          }
          l = 0;
        }
        c = 0;
      }
      p = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function PositionComponentResolutionLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  const precinctsSizes = getPrecinctSizesInImageScale(tile);
  const precinctsIterationSizes = precinctsSizes;
  let l = 0,
    r = 0,
    c = 0,
    px = 0,
    py = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; py < precinctsIterationSizes.maxNumHigh; py++) {
      for (; px < precinctsIterationSizes.maxNumWide; px++) {
        for (; c < componentsCount; c++) {
          const component = tile.components[c];
          const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
          for (; r <= decompositionLevelsCount; r++) {
            const resolution = component.resolutions[r];
            const sizeInImageScale = precinctsSizes.components[c].resolutions[r];
            const k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
            if (k === null) {
              continue;
            }
            for (; l < layersCount;) {
              const packet = createPacket(resolution, k, l);
              l++;
              return packet;
            }
            l = 0;
          }
          r = 0;
        }
        c = 0;
      }
      px = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function ComponentPositionResolutionLayerIterator(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const layersCount = tile.codingStyleDefaultParameters.layersCount;
  const componentsCount = siz.Csiz;
  const precinctsSizes = getPrecinctSizesInImageScale(tile);
  let l = 0,
    r = 0,
    c = 0,
    px = 0,
    py = 0;
  this.nextPacket = function JpxImage_nextPacket() {
    for (; c < componentsCount; ++c) {
      const component = tile.components[c];
      const precinctsIterationSizes = precinctsSizes.components[c];
      const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
      for (; py < precinctsIterationSizes.maxNumHigh; py++) {
        for (; px < precinctsIterationSizes.maxNumWide; px++) {
          for (; r <= decompositionLevelsCount; r++) {
            const resolution = component.resolutions[r];
            const sizeInImageScale = precinctsIterationSizes.resolutions[r];
            const k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
            if (k === null) {
              continue;
            }
            for (; l < layersCount;) {
              const packet = createPacket(resolution, k, l);
              l++;
              return packet;
            }
            l = 0;
          }
          r = 0;
        }
        px = 0;
      }
      py = 0;
    }
    throw new JpxError("Out of packets");
  };
}
function getPrecinctIndexIfExist(pxIndex, pyIndex, sizeInImageScale, precinctIterationSizes, resolution) {
  const posX = pxIndex * precinctIterationSizes.minWidth;
  const posY = pyIndex * precinctIterationSizes.minHeight;
  if (posX % sizeInImageScale.width !== 0 || posY % sizeInImageScale.height !== 0) {
    return null;
  }
  const startPrecinctRowIndex = posY / sizeInImageScale.width * resolution.precinctParameters.numprecinctswide;
  return posX / sizeInImageScale.height + startPrecinctRowIndex;
}
function getPrecinctSizesInImageScale(tile) {
  const componentsCount = tile.components.length;
  let minWidth = Number.MAX_VALUE;
  let minHeight = Number.MAX_VALUE;
  let maxNumWide = 0;
  let maxNumHigh = 0;
  const sizePerComponent = new Array(componentsCount);
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
    const sizePerResolution = new Array(decompositionLevelsCount + 1);
    let minWidthCurrentComponent = Number.MAX_VALUE;
    let minHeightCurrentComponent = Number.MAX_VALUE;
    let maxNumWideCurrentComponent = 0;
    let maxNumHighCurrentComponent = 0;
    let scale = 1;
    for (let r = decompositionLevelsCount; r >= 0; --r) {
      const resolution = component.resolutions[r];
      const widthCurrentResolution = scale * resolution.precinctParameters.precinctWidth;
      const heightCurrentResolution = scale * resolution.precinctParameters.precinctHeight;
      minWidthCurrentComponent = Math.min(minWidthCurrentComponent, widthCurrentResolution);
      minHeightCurrentComponent = Math.min(minHeightCurrentComponent, heightCurrentResolution);
      maxNumWideCurrentComponent = Math.max(maxNumWideCurrentComponent, resolution.precinctParameters.numprecinctswide);
      maxNumHighCurrentComponent = Math.max(maxNumHighCurrentComponent, resolution.precinctParameters.numprecinctshigh);
      sizePerResolution[r] = {
        width: widthCurrentResolution,
        height: heightCurrentResolution
      };
      scale <<= 1;
    }
    minWidth = Math.min(minWidth, minWidthCurrentComponent);
    minHeight = Math.min(minHeight, minHeightCurrentComponent);
    maxNumWide = Math.max(maxNumWide, maxNumWideCurrentComponent);
    maxNumHigh = Math.max(maxNumHigh, maxNumHighCurrentComponent);
    sizePerComponent[c] = {
      resolutions: sizePerResolution,
      minWidth: minWidthCurrentComponent,
      minHeight: minHeightCurrentComponent,
      maxNumWide: maxNumWideCurrentComponent,
      maxNumHigh: maxNumHighCurrentComponent
    };
  }
  return {
    components: sizePerComponent,
    minWidth,
    minHeight,
    maxNumWide,
    maxNumHigh
  };
}
function buildPackets(context) {
  const siz = context.SIZ;
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const componentsCount = siz.Csiz;
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
    const resolutions = [];
    const subbands = [];
    for (let r = 0; r <= decompositionLevelsCount; r++) {
      const blocksDimensions = getBlocksDimensions(context, component, r);
      const resolution = {};
      const scale = 1 << decompositionLevelsCount - r;
      resolution.trx0 = Math.ceil(component.tcx0 / scale);
      resolution.try0 = Math.ceil(component.tcy0 / scale);
      resolution.trx1 = Math.ceil(component.tcx1 / scale);
      resolution.try1 = Math.ceil(component.tcy1 / scale);
      resolution.resLevel = r;
      buildPrecincts(context, resolution, blocksDimensions);
      resolutions.push(resolution);
      let subband;
      if (r === 0) {
        subband = {};
        subband.type = "LL";
        subband.tbx0 = Math.ceil(component.tcx0 / scale);
        subband.tby0 = Math.ceil(component.tcy0 / scale);
        subband.tbx1 = Math.ceil(component.tcx1 / scale);
        subband.tby1 = Math.ceil(component.tcy1 / scale);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolution.subbands = [subband];
      } else {
        const bscale = 1 << decompositionLevelsCount - r + 1;
        const resolutionSubbands = [];
        subband = {};
        subband.type = "HL";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
        subband.tby0 = Math.ceil(component.tcy0 / bscale);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
        subband.tby1 = Math.ceil(component.tcy1 / bscale);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        subband = {};
        subband.type = "LH";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale);
        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale);
        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        subband = {};
        subband.type = "HH";
        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
        subband.resolution = resolution;
        buildCodeblocks(context, subband, blocksDimensions);
        subbands.push(subband);
        resolutionSubbands.push(subband);
        resolution.subbands = resolutionSubbands;
      }
    }
    component.resolutions = resolutions;
    component.subbands = subbands;
  }
  const progressionOrder = tile.codingStyleDefaultParameters.progressionOrder;
  switch (progressionOrder) {
    case 0:
      tile.packetsIterator = new LayerResolutionComponentPositionIterator(context);
      break;
    case 1:
      tile.packetsIterator = new ResolutionLayerComponentPositionIterator(context);
      break;
    case 2:
      tile.packetsIterator = new ResolutionPositionComponentLayerIterator(context);
      break;
    case 3:
      tile.packetsIterator = new PositionComponentResolutionLayerIterator(context);
      break;
    case 4:
      tile.packetsIterator = new ComponentPositionResolutionLayerIterator(context);
      break;
    default:
      throw new JpxError(`Unsupported progression order ${progressionOrder}`);
  }
}
function parseTilePackets(context, data, offset, dataLength) {
  let position = 0;
  let buffer,
    bufferSize = 0,
    skipNextBit = false;
  function readBits(count) {
    while (bufferSize < count) {
      const b = data[offset + position];
      position++;
      if (skipNextBit) {
        buffer = buffer << 7 | b;
        bufferSize += 7;
        skipNextBit = false;
      } else {
        buffer = buffer << 8 | b;
        bufferSize += 8;
      }
      if (b === 0xff) {
        skipNextBit = true;
      }
    }
    bufferSize -= count;
    return buffer >>> bufferSize & (1 << count) - 1;
  }
  function skipMarkerIfEqual(value) {
    if (data[offset + position - 1] === 0xff && data[offset + position] === value) {
      skipBytes(1);
      return true;
    } else if (data[offset + position] === 0xff && data[offset + position + 1] === value) {
      skipBytes(2);
      return true;
    }
    return false;
  }
  function skipBytes(count) {
    position += count;
  }
  function alignToByte() {
    bufferSize = 0;
    if (skipNextBit) {
      position++;
      skipNextBit = false;
    }
  }
  function readCodingpasses() {
    if (readBits(1) === 0) {
      return 1;
    }
    if (readBits(1) === 0) {
      return 2;
    }
    let value = readBits(2);
    if (value < 3) {
      return value + 3;
    }
    value = readBits(5);
    if (value < 31) {
      return value + 6;
    }
    value = readBits(7);
    return value + 37;
  }
  const tileIndex = context.currentTile.index;
  const tile = context.tiles[tileIndex];
  const sopMarkerUsed = context.COD.sopMarkerUsed;
  const ephMarkerUsed = context.COD.ephMarkerUsed;
  const packetsIterator = tile.packetsIterator;
  while (position < dataLength) {
    alignToByte();
    if (sopMarkerUsed && skipMarkerIfEqual(0x91)) {
      skipBytes(4);
    }
    const packet = packetsIterator.nextPacket();
    if (!readBits(1)) {
      continue;
    }
    const layerNumber = packet.layerNumber,
      queue = [];
    let codeblock;
    for (let i = 0, ii = packet.codeblocks.length; i < ii; i++) {
      codeblock = packet.codeblocks[i];
      let precinct = codeblock.precinct;
      const codeblockColumn = codeblock.cbx - precinct.cbxMin;
      const codeblockRow = codeblock.cby - precinct.cbyMin;
      let codeblockIncluded = false;
      let firstTimeInclusion = false;
      let valueReady, zeroBitPlanesTree;
      if (codeblock.included !== undefined) {
        codeblockIncluded = !!readBits(1);
      } else {
        precinct = codeblock.precinct;
        let inclusionTree;
        if (precinct.inclusionTree !== undefined) {
          inclusionTree = precinct.inclusionTree;
        } else {
          const width = precinct.cbxMax - precinct.cbxMin + 1;
          const height = precinct.cbyMax - precinct.cbyMin + 1;
          inclusionTree = new InclusionTree(width, height, layerNumber);
          zeroBitPlanesTree = new TagTree(width, height);
          precinct.inclusionTree = inclusionTree;
          precinct.zeroBitPlanesTree = zeroBitPlanesTree;
          for (let l = 0; l < layerNumber; l++) {
            if (readBits(1) !== 0) {
              throw new JpxError("Invalid tag tree");
            }
          }
        }
        if (inclusionTree.reset(codeblockColumn, codeblockRow, layerNumber)) {
          while (true) {
            if (readBits(1)) {
              valueReady = !inclusionTree.nextLevel();
              if (valueReady) {
                codeblock.included = true;
                codeblockIncluded = firstTimeInclusion = true;
                break;
              }
            } else {
              inclusionTree.incrementValue(layerNumber);
              break;
            }
          }
        }
      }
      if (!codeblockIncluded) {
        continue;
      }
      if (firstTimeInclusion) {
        zeroBitPlanesTree = precinct.zeroBitPlanesTree;
        zeroBitPlanesTree.reset(codeblockColumn, codeblockRow);
        while (true) {
          if (readBits(1)) {
            valueReady = !zeroBitPlanesTree.nextLevel();
            if (valueReady) {
              break;
            }
          } else {
            zeroBitPlanesTree.incrementValue();
          }
        }
        codeblock.zeroBitPlanes = zeroBitPlanesTree.value;
      }
      const codingpasses = readCodingpasses();
      while (readBits(1)) {
        codeblock.Lblock++;
      }
      const codingpassesLog2 = (0, _core_utils.log2)(codingpasses);
      const bits = (codingpasses < 1 << codingpassesLog2 ? codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
      const codedDataLength = readBits(bits);
      queue.push({
        codeblock,
        codingpasses,
        dataLength: codedDataLength
      });
    }
    alignToByte();
    if (ephMarkerUsed) {
      skipMarkerIfEqual(0x92);
    }
    while (queue.length > 0) {
      const packetItem = queue.shift();
      codeblock = packetItem.codeblock;
      if (codeblock.data === undefined) {
        codeblock.data = [];
      }
      codeblock.data.push({
        data,
        start: offset + position,
        end: offset + position + packetItem.dataLength,
        codingpasses: packetItem.codingpasses
      });
      position += packetItem.dataLength;
    }
  }
  return position;
}
function copyCoefficients(coefficients, levelWidth, levelHeight, subband, delta, mb, reversible, segmentationSymbolUsed, resetContextProbabilities) {
  const x0 = subband.tbx0;
  const y0 = subband.tby0;
  const width = subband.tbx1 - subband.tbx0;
  const codeblocks = subband.codeblocks;
  const right = subband.type.charAt(0) === "H" ? 1 : 0;
  const bottom = subband.type.charAt(1) === "H" ? levelWidth : 0;
  for (let i = 0, ii = codeblocks.length; i < ii; ++i) {
    const codeblock = codeblocks[i];
    const blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
    const blockHeight = codeblock.tby1_ - codeblock.tby0_;
    if (blockWidth === 0 || blockHeight === 0) {
      continue;
    }
    if (codeblock.data === undefined) {
      continue;
    }
    const bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType, codeblock.zeroBitPlanes, mb);
    let currentCodingpassType = 2;
    const data = codeblock.data;
    let totalLength = 0,
      codingpasses = 0;
    let j, jj, dataItem;
    for (j = 0, jj = data.length; j < jj; j++) {
      dataItem = data[j];
      totalLength += dataItem.end - dataItem.start;
      codingpasses += dataItem.codingpasses;
    }
    const encodedData = new Uint8Array(totalLength);
    let position = 0;
    for (j = 0, jj = data.length; j < jj; j++) {
      dataItem = data[j];
      const chunk = dataItem.data.subarray(dataItem.start, dataItem.end);
      encodedData.set(chunk, position);
      position += chunk.length;
    }
    const decoder = new _arithmetic_decoder.ArithmeticDecoder(encodedData, 0, totalLength);
    bitModel.setDecoder(decoder);
    for (j = 0; j < codingpasses; j++) {
      switch (currentCodingpassType) {
        case 0:
          bitModel.runSignificancePropagationPass();
          break;
        case 1:
          bitModel.runMagnitudeRefinementPass();
          break;
        case 2:
          bitModel.runCleanupPass();
          if (segmentationSymbolUsed) {
            bitModel.checkSegmentationSymbol();
          }
          break;
      }
      if (resetContextProbabilities) {
        bitModel.reset();
      }
      currentCodingpassType = (currentCodingpassType + 1) % 3;
    }
    let offset = codeblock.tbx0_ - x0 + (codeblock.tby0_ - y0) * width;
    const sign = bitModel.coefficentsSign;
    const magnitude = bitModel.coefficentsMagnitude;
    const bitsDecoded = bitModel.bitsDecoded;
    const magnitudeCorrection = reversible ? 0 : 0.5;
    let k, n, nb;
    position = 0;
    const interleave = subband.type !== "LL";
    for (j = 0; j < blockHeight; j++) {
      const row = offset / width | 0;
      const levelOffset = 2 * row * (levelWidth - width) + right + bottom;
      for (k = 0; k < blockWidth; k++) {
        n = magnitude[position];
        if (n !== 0) {
          n = (n + magnitudeCorrection) * delta;
          if (sign[position] !== 0) {
            n = -n;
          }
          nb = bitsDecoded[position];
          const pos = interleave ? levelOffset + (offset << 1) : offset;
          if (reversible && nb >= mb) {
            coefficients[pos] = n;
          } else {
            coefficients[pos] = n * (1 << mb - nb);
          }
        }
        offset++;
        position++;
      }
      offset += width - blockWidth;
    }
  }
}
function transformTile(context, tile, c) {
  const component = tile.components[c];
  const codingStyleParameters = component.codingStyleParameters;
  const quantizationParameters = component.quantizationParameters;
  const decompositionLevelsCount = codingStyleParameters.decompositionLevelsCount;
  const spqcds = quantizationParameters.SPqcds;
  const scalarExpounded = quantizationParameters.scalarExpounded;
  const guardBits = quantizationParameters.guardBits;
  const segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
  const resetContextProbabilities = codingStyleParameters.resetContextProbabilities;
  const precision = context.components[c].precision;
  const reversible = codingStyleParameters.reversibleTransformation;
  const transform = reversible ? new ReversibleTransform() : new IrreversibleTransform();
  const subbandCoefficients = [];
  let b = 0;
  for (let i = 0; i <= decompositionLevelsCount; i++) {
    const resolution = component.resolutions[i];
    const width = resolution.trx1 - resolution.trx0;
    const height = resolution.try1 - resolution.try0;
    const coefficients = new Float32Array(width * height);
    for (let j = 0, jj = resolution.subbands.length; j < jj; j++) {
      let mu, epsilon;
      if (!scalarExpounded) {
        mu = spqcds[0].mu;
        epsilon = spqcds[0].epsilon + (i > 0 ? 1 - i : 0);
      } else {
        mu = spqcds[b].mu;
        epsilon = spqcds[b].epsilon;
        b++;
      }
      const subband = resolution.subbands[j];
      const gainLog2 = SubbandsGainLog2[subband.type];
      const delta = reversible ? 1 : 2 ** (precision + gainLog2 - epsilon) * (1 + mu / 2048);
      const mb = guardBits + epsilon - 1;
      copyCoefficients(coefficients, width, height, subband, delta, mb, reversible, segmentationSymbolUsed, resetContextProbabilities);
    }
    subbandCoefficients.push({
      width,
      height,
      items: coefficients
    });
  }
  const result = transform.calculate(subbandCoefficients, component.tcx0, component.tcy0);
  return {
    left: component.tcx0,
    top: component.tcy0,
    width: result.width,
    height: result.height,
    items: result.items
  };
}
function transformComponents(context) {
  const siz = context.SIZ;
  const components = context.components;
  const componentsCount = siz.Csiz;
  const resultImages = [];
  for (let i = 0, ii = context.tiles.length; i < ii; i++) {
    const tile = context.tiles[i];
    const transformedTiles = [];
    for (let c = 0; c < componentsCount; c++) {
      transformedTiles[c] = transformTile(context, tile, c);
    }
    const tile0 = transformedTiles[0];
    const out = new Uint8ClampedArray(tile0.items.length * componentsCount);
    const result = {
      left: tile0.left,
      top: tile0.top,
      width: tile0.width,
      height: tile0.height,
      items: out
    };
    let shift, offset;
    let pos = 0,
      j,
      jj,
      y0,
      y1,
      y2;
    if (tile.codingStyleDefaultParameters.multipleComponentTransform) {
      const fourComponents = componentsCount === 4;
      const y0items = transformedTiles[0].items;
      const y1items = transformedTiles[1].items;
      const y2items = transformedTiles[2].items;
      const y3items = fourComponents ? transformedTiles[3].items : null;
      shift = components[0].precision - 8;
      offset = (128 << shift) + 0.5;
      const component0 = tile.components[0];
      const alpha01 = componentsCount - 3;
      jj = y0items.length;
      if (!component0.codingStyleParameters.reversibleTransformation) {
        for (j = 0; j < jj; j++, pos += alpha01) {
          y0 = y0items[j] + offset;
          y1 = y1items[j];
          y2 = y2items[j];
          out[pos++] = y0 + 1.402 * y2 >> shift;
          out[pos++] = y0 - 0.34413 * y1 - 0.71414 * y2 >> shift;
          out[pos++] = y0 + 1.772 * y1 >> shift;
        }
      } else {
        for (j = 0; j < jj; j++, pos += alpha01) {
          y0 = y0items[j] + offset;
          y1 = y1items[j];
          y2 = y2items[j];
          const g = y0 - (y2 + y1 >> 2);
          out[pos++] = g + y2 >> shift;
          out[pos++] = g >> shift;
          out[pos++] = g + y1 >> shift;
        }
      }
      if (fourComponents) {
        for (j = 0, pos = 3; j < jj; j++, pos += 4) {
          out[pos] = y3items[j] + offset >> shift;
        }
      }
    } else {
      for (let c = 0; c < componentsCount; c++) {
        const items = transformedTiles[c].items;
        shift = components[c].precision - 8;
        offset = (128 << shift) + 0.5;
        for (pos = c, j = 0, jj = items.length; j < jj; j++) {
          out[pos] = items[j] + offset >> shift;
          pos += componentsCount;
        }
      }
    }
    resultImages.push(result);
  }
  return resultImages;
}
function initializeTile(context, tileIndex) {
  const siz = context.SIZ;
  const componentsCount = siz.Csiz;
  const tile = context.tiles[tileIndex];
  for (let c = 0; c < componentsCount; c++) {
    const component = tile.components[c];
    const qcdOrQcc = context.currentTile.QCC[c] !== undefined ? context.currentTile.QCC[c] : context.currentTile.QCD;
    component.quantizationParameters = qcdOrQcc;
    const codOrCoc = context.currentTile.COC[c] !== undefined ? context.currentTile.COC[c] : context.currentTile.COD;
    component.codingStyleParameters = codOrCoc;
  }
  tile.codingStyleDefaultParameters = context.currentTile.COD;
}
class TagTree {
  constructor(width, height) {
    const levelsLength = (0, _core_utils.log2)(Math.max(width, height)) + 1;
    this.levels = [];
    for (let i = 0; i < levelsLength; i++) {
      const level = {
        width,
        height,
        items: []
      };
      this.levels.push(level);
      width = Math.ceil(width / 2);
      height = Math.ceil(height / 2);
    }
  }
  reset(i, j) {
    let currentLevel = 0,
      value = 0,
      level;
    while (currentLevel < this.levels.length) {
      level = this.levels[currentLevel];
      const index = i + j * level.width;
      if (level.items[index] !== undefined) {
        value = level.items[index];
        break;
      }
      level.index = index;
      i >>= 1;
      j >>= 1;
      currentLevel++;
    }
    currentLevel--;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    this.currentLevel = currentLevel;
    delete this.value;
  }
  incrementValue() {
    const level = this.levels[this.currentLevel];
    level.items[level.index]++;
  }
  nextLevel() {
    let currentLevel = this.currentLevel;
    let level = this.levels[currentLevel];
    const value = level.items[level.index];
    currentLevel--;
    if (currentLevel < 0) {
      this.value = value;
      return false;
    }
    this.currentLevel = currentLevel;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    return true;
  }
}
class InclusionTree {
  constructor(width, height, defaultValue) {
    const levelsLength = (0, _core_utils.log2)(Math.max(width, height)) + 1;
    this.levels = [];
    for (let i = 0; i < levelsLength; i++) {
      const items = new Uint8Array(width * height);
      for (let j = 0, jj = items.length; j < jj; j++) {
        items[j] = defaultValue;
      }
      const level = {
        width,
        height,
        items
      };
      this.levels.push(level);
      width = Math.ceil(width / 2);
      height = Math.ceil(height / 2);
    }
  }
  reset(i, j, stopValue) {
    let currentLevel = 0;
    while (currentLevel < this.levels.length) {
      const level = this.levels[currentLevel];
      const index = i + j * level.width;
      level.index = index;
      const value = level.items[index];
      if (value === 0xff) {
        break;
      }
      if (value > stopValue) {
        this.currentLevel = currentLevel;
        this.propagateValues();
        return false;
      }
      i >>= 1;
      j >>= 1;
      currentLevel++;
    }
    this.currentLevel = currentLevel - 1;
    return true;
  }
  incrementValue(stopValue) {
    const level = this.levels[this.currentLevel];
    level.items[level.index] = stopValue + 1;
    this.propagateValues();
  }
  propagateValues() {
    let levelIndex = this.currentLevel;
    let level = this.levels[levelIndex];
    const currentValue = level.items[level.index];
    while (--levelIndex >= 0) {
      level = this.levels[levelIndex];
      level.items[level.index] = currentValue;
    }
  }
  nextLevel() {
    let currentLevel = this.currentLevel;
    let level = this.levels[currentLevel];
    const value = level.items[level.index];
    level.items[level.index] = 0xff;
    currentLevel--;
    if (currentLevel < 0) {
      return false;
    }
    this.currentLevel = currentLevel;
    level = this.levels[currentLevel];
    level.items[level.index] = value;
    return true;
  }
}
const BitModel = function BitModelClosure() {
  const UNIFORM_CONTEXT = 17;
  const RUNLENGTH_CONTEXT = 18;
  const LLAndLHContextsLabel = new Uint8Array([0, 5, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 1, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8]);
  const HLContextLabel = new Uint8Array([0, 3, 4, 0, 5, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8]);
  const HHContextLabel = new Uint8Array([0, 1, 2, 0, 1, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 5, 5, 0, 5, 5, 5, 0, 0, 0, 0, 0, 6, 7, 7, 0, 7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8]);
  class BitModel {
    constructor(width, height, subband, zeroBitPlanes, mb) {
      this.width = width;
      this.height = height;
      let contextLabelTable;
      if (subband === "HH") {
        contextLabelTable = HHContextLabel;
      } else if (subband === "HL") {
        contextLabelTable = HLContextLabel;
      } else {
        contextLabelTable = LLAndLHContextsLabel;
      }
      this.contextLabelTable = contextLabelTable;
      const coefficientCount = width * height;
      this.neighborsSignificance = new Uint8Array(coefficientCount);
      this.coefficentsSign = new Uint8Array(coefficientCount);
      let coefficentsMagnitude;
      if (mb > 14) {
        coefficentsMagnitude = new Uint32Array(coefficientCount);
      } else if (mb > 6) {
        coefficentsMagnitude = new Uint16Array(coefficientCount);
      } else {
        coefficentsMagnitude = new Uint8Array(coefficientCount);
      }
      this.coefficentsMagnitude = coefficentsMagnitude;
      this.processingFlags = new Uint8Array(coefficientCount);
      const bitsDecoded = new Uint8Array(coefficientCount);
      if (zeroBitPlanes !== 0) {
        for (let i = 0; i < coefficientCount; i++) {
          bitsDecoded[i] = zeroBitPlanes;
        }
      }
      this.bitsDecoded = bitsDecoded;
      this.reset();
    }
    setDecoder(decoder) {
      this.decoder = decoder;
    }
    reset() {
      this.contexts = new Int8Array(19);
      this.contexts[0] = 4 << 1 | 0;
      this.contexts[UNIFORM_CONTEXT] = 46 << 1 | 0;
      this.contexts[RUNLENGTH_CONTEXT] = 3 << 1 | 0;
    }
    setNeighborsSignificance(row, column, index) {
      const neighborsSignificance = this.neighborsSignificance;
      const width = this.width,
        height = this.height;
      const left = column > 0;
      const right = column + 1 < width;
      let i;
      if (row > 0) {
        i = index - width;
        if (left) {
          neighborsSignificance[i - 1] += 0x10;
        }
        if (right) {
          neighborsSignificance[i + 1] += 0x10;
        }
        neighborsSignificance[i] += 0x04;
      }
      if (row + 1 < height) {
        i = index + width;
        if (left) {
          neighborsSignificance[i - 1] += 0x10;
        }
        if (right) {
          neighborsSignificance[i + 1] += 0x10;
        }
        neighborsSignificance[i] += 0x04;
      }
      if (left) {
        neighborsSignificance[index - 1] += 0x01;
      }
      if (right) {
        neighborsSignificance[index + 1] += 0x01;
      }
      neighborsSignificance[index] |= 0x80;
    }
    runSignificancePropagationPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      const neighborsSignificance = this.neighborsSignificance;
      const processingFlags = this.processingFlags;
      const contexts = this.contexts;
      const labels = this.contextLabelTable;
      const bitsDecoded = this.bitsDecoded;
      const processedInverseMask = ~1;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      for (let i0 = 0; i0 < height; i0 += 4) {
        for (let j = 0; j < width; j++) {
          let index = i0 * width + j;
          for (let i1 = 0; i1 < 4; i1++, index += width) {
            const i = i0 + i1;
            if (i >= height) {
              break;
            }
            processingFlags[index] &= processedInverseMask;
            if (coefficentsMagnitude[index] || !neighborsSignificance[index]) {
              continue;
            }
            const contextLabel = labels[neighborsSignificance[index]];
            const decision = decoder.readBit(contexts, contextLabel);
            if (decision) {
              const sign = this.decodeSignBit(i, j, index);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j, index);
              processingFlags[index] |= firstMagnitudeBitMask;
            }
            bitsDecoded[index]++;
            processingFlags[index] |= processedMask;
          }
        }
      }
    }
    decodeSignBit(row, column, index) {
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      let contribution, sign0, sign1, significance1;
      let contextLabel, decoded;
      significance1 = column > 0 && coefficentsMagnitude[index - 1] !== 0;
      if (column + 1 < width && coefficentsMagnitude[index + 1] !== 0) {
        sign1 = coefficentsSign[index + 1];
        if (significance1) {
          sign0 = coefficentsSign[index - 1];
          contribution = 1 - sign1 - sign0;
        } else {
          contribution = 1 - sign1 - sign1;
        }
      } else if (significance1) {
        sign0 = coefficentsSign[index - 1];
        contribution = 1 - sign0 - sign0;
      } else {
        contribution = 0;
      }
      const horizontalContribution = 3 * contribution;
      significance1 = row > 0 && coefficentsMagnitude[index - width] !== 0;
      if (row + 1 < height && coefficentsMagnitude[index + width] !== 0) {
        sign1 = coefficentsSign[index + width];
        if (significance1) {
          sign0 = coefficentsSign[index - width];
          contribution = 1 - sign1 - sign0 + horizontalContribution;
        } else {
          contribution = 1 - sign1 - sign1 + horizontalContribution;
        }
      } else if (significance1) {
        sign0 = coefficentsSign[index - width];
        contribution = 1 - sign0 - sign0 + horizontalContribution;
      } else {
        contribution = horizontalContribution;
      }
      if (contribution >= 0) {
        contextLabel = 9 + contribution;
        decoded = this.decoder.readBit(this.contexts, contextLabel);
      } else {
        contextLabel = 9 - contribution;
        decoded = this.decoder.readBit(this.contexts, contextLabel) ^ 1;
      }
      return decoded;
    }
    runMagnitudeRefinementPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const neighborsSignificance = this.neighborsSignificance;
      const contexts = this.contexts;
      const bitsDecoded = this.bitsDecoded;
      const processingFlags = this.processingFlags;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      const length = width * height;
      const width4 = width * 4;
      for (let index0 = 0, indexNext; index0 < length; index0 = indexNext) {
        indexNext = Math.min(length, index0 + width4);
        for (let j = 0; j < width; j++) {
          for (let index = index0 + j; index < indexNext; index += width) {
            if (!coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
              continue;
            }
            let contextLabel = 16;
            if ((processingFlags[index] & firstMagnitudeBitMask) !== 0) {
              processingFlags[index] ^= firstMagnitudeBitMask;
              const significance = neighborsSignificance[index] & 127;
              contextLabel = significance === 0 ? 15 : 14;
            }
            const bit = decoder.readBit(contexts, contextLabel);
            coefficentsMagnitude[index] = coefficentsMagnitude[index] << 1 | bit;
            bitsDecoded[index]++;
            processingFlags[index] |= processedMask;
          }
        }
      }
    }
    runCleanupPass() {
      const decoder = this.decoder;
      const width = this.width,
        height = this.height;
      const neighborsSignificance = this.neighborsSignificance;
      const coefficentsMagnitude = this.coefficentsMagnitude;
      const coefficentsSign = this.coefficentsSign;
      const contexts = this.contexts;
      const labels = this.contextLabelTable;
      const bitsDecoded = this.bitsDecoded;
      const processingFlags = this.processingFlags;
      const processedMask = 1;
      const firstMagnitudeBitMask = 2;
      const oneRowDown = width;
      const twoRowsDown = width * 2;
      const threeRowsDown = width * 3;
      let iNext;
      for (let i0 = 0; i0 < height; i0 = iNext) {
        iNext = Math.min(i0 + 4, height);
        const indexBase = i0 * width;
        const checkAllEmpty = i0 + 3 < height;
        for (let j = 0; j < width; j++) {
          const index0 = indexBase + j;
          const allEmpty = checkAllEmpty && processingFlags[index0] === 0 && processingFlags[index0 + oneRowDown] === 0 && processingFlags[index0 + twoRowsDown] === 0 && processingFlags[index0 + threeRowsDown] === 0 && neighborsSignificance[index0] === 0 && neighborsSignificance[index0 + oneRowDown] === 0 && neighborsSignificance[index0 + twoRowsDown] === 0 && neighborsSignificance[index0 + threeRowsDown] === 0;
          let i1 = 0,
            index = index0;
          let i = i0,
            sign;
          if (allEmpty) {
            const hasSignificantCoefficent = decoder.readBit(contexts, RUNLENGTH_CONTEXT);
            if (!hasSignificantCoefficent) {
              bitsDecoded[index0]++;
              bitsDecoded[index0 + oneRowDown]++;
              bitsDecoded[index0 + twoRowsDown]++;
              bitsDecoded[index0 + threeRowsDown]++;
              continue;
            }
            i1 = decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
            if (i1 !== 0) {
              i = i0 + i1;
              index += i1 * width;
            }
            sign = this.decodeSignBit(i, j, index);
            coefficentsSign[index] = sign;
            coefficentsMagnitude[index] = 1;
            this.setNeighborsSignificance(i, j, index);
            processingFlags[index] |= firstMagnitudeBitMask;
            index = index0;
            for (let i2 = i0; i2 <= i; i2++, index += width) {
              bitsDecoded[index]++;
            }
            i1++;
          }
          for (i = i0 + i1; i < iNext; i++, index += width) {
            if (coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
              continue;
            }
            const contextLabel = labels[neighborsSignificance[index]];
            const decision = decoder.readBit(contexts, contextLabel);
            if (decision === 1) {
              sign = this.decodeSignBit(i, j, index);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j, index);
              processingFlags[index] |= firstMagnitudeBitMask;
            }
            bitsDecoded[index]++;
          }
        }
      }
    }
    checkSegmentationSymbol() {
      const decoder = this.decoder;
      const contexts = this.contexts;
      const symbol = decoder.readBit(contexts, UNIFORM_CONTEXT) << 3 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 2 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
      if (symbol !== 0xa) {
        throw new JpxError("Invalid segmentation symbol");
      }
    }
  }
  return BitModel;
}();
class Transform {
  constructor() {
    if (this.constructor === Transform) {
      (0, _util.unreachable)("Cannot initialize Transform.");
    }
  }
  calculate(subbands, u0, v0) {
    let ll = subbands[0];
    for (let i = 1, ii = subbands.length; i < ii; i++) {
      ll = this.iterate(ll, subbands[i], u0, v0);
    }
    return ll;
  }
  extend(buffer, offset, size) {
    let i1 = offset - 1,
      j1 = offset + 1;
    let i2 = offset + size - 2,
      j2 = offset + size;
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1--] = buffer[j1++];
    buffer[j2++] = buffer[i2--];
    buffer[i1] = buffer[j1];
    buffer[j2] = buffer[i2];
  }
  filter(x, offset, length) {
    (0, _util.unreachable)("Abstract method `filter` called");
  }
  iterate(ll, hl_lh_hh, u0, v0) {
    const llWidth = ll.width,
      llHeight = ll.height;
    let llItems = ll.items;
    const width = hl_lh_hh.width;
    const height = hl_lh_hh.height;
    const items = hl_lh_hh.items;
    let i, j, k, l, u, v;
    for (k = 0, i = 0; i < llHeight; i++) {
      l = i * 2 * width;
      for (j = 0; j < llWidth; j++, k++, l += 2) {
        items[l] = llItems[k];
      }
    }
    llItems = ll.items = null;
    const bufferPadding = 4;
    const rowBuffer = new Float32Array(width + 2 * bufferPadding);
    if (width === 1) {
      if ((u0 & 1) !== 0) {
        for (v = 0, k = 0; v < height; v++, k += width) {
          items[k] *= 0.5;
        }
      }
    } else {
      for (v = 0, k = 0; v < height; v++, k += width) {
        rowBuffer.set(items.subarray(k, k + width), bufferPadding);
        this.extend(rowBuffer, bufferPadding, width);
        this.filter(rowBuffer, bufferPadding, width);
        items.set(rowBuffer.subarray(bufferPadding, bufferPadding + width), k);
      }
    }
    let numBuffers = 16;
    const colBuffers = [];
    for (i = 0; i < numBuffers; i++) {
      colBuffers.push(new Float32Array(height + 2 * bufferPadding));
    }
    let b,
      currentBuffer = 0;
    ll = bufferPadding + height;
    if (height === 1) {
      if ((v0 & 1) !== 0) {
        for (u = 0; u < width; u++) {
          items[u] *= 0.5;
        }
      }
    } else {
      for (u = 0; u < width; u++) {
        if (currentBuffer === 0) {
          numBuffers = Math.min(width - u, numBuffers);
          for (k = u, l = bufferPadding; l < ll; k += width, l++) {
            for (b = 0; b < numBuffers; b++) {
              colBuffers[b][l] = items[k + b];
            }
          }
          currentBuffer = numBuffers;
        }
        currentBuffer--;
        const buffer = colBuffers[currentBuffer];
        this.extend(buffer, bufferPadding, height);
        this.filter(buffer, bufferPadding, height);
        if (currentBuffer === 0) {
          k = u - numBuffers + 1;
          for (l = bufferPadding; l < ll; k += width, l++) {
            for (b = 0; b < numBuffers; b++) {
              items[k + b] = colBuffers[b][l];
            }
          }
        }
      }
    }
    return {
      width,
      height,
      items
    };
  }
}
class IrreversibleTransform extends Transform {
  filter(x, offset, length) {
    const len = length >> 1;
    offset |= 0;
    let j, n, current, next;
    const alpha = -1.586134342059924;
    const beta = -0.052980118572961;
    const gamma = 0.882911075530934;
    const delta = 0.443506852043971;
    const K = 1.230174104914001;
    const K_ = 1 / K;
    j = offset - 3;
    for (n = len + 4; n--; j += 2) {
      x[j] *= K_;
    }
    j = offset - 2;
    current = delta * x[j - 1];
    for (n = len + 3; n--; j += 2) {
      next = delta * x[j + 1];
      x[j] = K * x[j] - current - next;
      if (n--) {
        j += 2;
        current = delta * x[j + 1];
        x[j] = K * x[j] - current - next;
      } else {
        break;
      }
    }
    j = offset - 1;
    current = gamma * x[j - 1];
    for (n = len + 2; n--; j += 2) {
      next = gamma * x[j + 1];
      x[j] -= current + next;
      if (n--) {
        j += 2;
        current = gamma * x[j + 1];
        x[j] -= current + next;
      } else {
        break;
      }
    }
    j = offset;
    current = beta * x[j - 1];
    for (n = len + 1; n--; j += 2) {
      next = beta * x[j + 1];
      x[j] -= current + next;
      if (n--) {
        j += 2;
        current = beta * x[j + 1];
        x[j] -= current + next;
      } else {
        break;
      }
    }
    if (len !== 0) {
      j = offset + 1;
      current = alpha * x[j - 1];
      for (n = len; n--; j += 2) {
        next = alpha * x[j + 1];
        x[j] -= current + next;
        if (n--) {
          j += 2;
          current = alpha * x[j + 1];
          x[j] -= current + next;
        } else {
          break;
        }
      }
    }
  }
}
class ReversibleTransform extends Transform {
  filter(x, offset, length) {
    const len = length >> 1;
    offset |= 0;
    let j, n;
    for (j = offset, n = len + 1; n--; j += 2) {
      x[j] -= x[j - 1] + x[j + 1] + 2 >> 2;
    }
    for (j = offset + 1, n = len; n--; j += 2) {
      x[j] += x[j - 1] + x[j + 1] >> 1;
    }
  }
}