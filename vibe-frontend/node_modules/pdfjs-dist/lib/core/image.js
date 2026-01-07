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
exports.PDFImage = void 0;
var _util = require("../shared/util.js");
var _image_utils = require("../shared/image_utils.js");
var _base_stream = require("./base_stream.js");
var _colorspace = require("./colorspace.js");
var _decode_stream = require("./decode_stream.js");
var _jpeg_stream = require("./jpeg_stream.js");
var _jpx = require("./jpx.js");
var _primitives = require("./primitives.js");
function decodeAndClamp(value, addend, coefficient, max) {
  value = addend + value * coefficient;
  if (value < 0) {
    value = 0;
  } else if (value > max) {
    value = max;
  }
  return value;
}
function resizeImageMask(src, bpc, w1, h1, w2, h2) {
  const length = w2 * h2;
  let dest;
  if (bpc <= 8) {
    dest = new Uint8Array(length);
  } else if (bpc <= 16) {
    dest = new Uint16Array(length);
  } else {
    dest = new Uint32Array(length);
  }
  const xRatio = w1 / w2;
  const yRatio = h1 / h2;
  let i,
    j,
    py,
    newIndex = 0,
    oldIndex;
  const xScaled = new Uint16Array(w2);
  const w1Scanline = w1;
  for (i = 0; i < w2; i++) {
    xScaled[i] = Math.floor(i * xRatio);
  }
  for (i = 0; i < h2; i++) {
    py = Math.floor(i * yRatio) * w1Scanline;
    for (j = 0; j < w2; j++) {
      oldIndex = py + xScaled[j];
      dest[newIndex++] = src[oldIndex];
    }
  }
  return dest;
}
class PDFImage {
  constructor({
    xref,
    res,
    image,
    isInline = false,
    smask = null,
    mask = null,
    isMask = false,
    pdfFunctionFactory,
    localColorSpaceCache
  }) {
    this.image = image;
    const dict = image.dict;
    const filter = dict.get("F", "Filter");
    let filterName;
    if (filter instanceof _primitives.Name) {
      filterName = filter.name;
    } else if (Array.isArray(filter)) {
      const filterZero = xref.fetchIfRef(filter[0]);
      if (filterZero instanceof _primitives.Name) {
        filterName = filterZero.name;
      }
    }
    switch (filterName) {
      case "JPXDecode":
        const jpxImage = new _jpx.JpxImage();
        jpxImage.parseImageProperties(image.stream);
        image.stream.reset();
        image.width = jpxImage.width;
        image.height = jpxImage.height;
        image.bitsPerComponent = jpxImage.bitsPerComponent;
        image.numComps = jpxImage.componentsCount;
        break;
      case "JBIG2Decode":
        image.bitsPerComponent = 1;
        image.numComps = 1;
        break;
    }
    let width = dict.get("W", "Width");
    let height = dict.get("H", "Height");
    if (Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0 && (image.width !== width || image.height !== height)) {
      (0, _util.warn)("PDFImage - using the Width/Height of the image data, " + "rather than the image dictionary.");
      width = image.width;
      height = image.height;
    }
    if (width < 1 || height < 1) {
      throw new _util.FormatError(`Invalid image width: ${width} or height: ${height}`);
    }
    this.width = width;
    this.height = height;
    this.interpolate = dict.get("I", "Interpolate");
    this.imageMask = dict.get("IM", "ImageMask") || false;
    this.matte = dict.get("Matte") || false;
    let bitsPerComponent = image.bitsPerComponent;
    if (!bitsPerComponent) {
      bitsPerComponent = dict.get("BPC", "BitsPerComponent");
      if (!bitsPerComponent) {
        if (this.imageMask) {
          bitsPerComponent = 1;
        } else {
          throw new _util.FormatError(`Bits per component missing in image: ${this.imageMask}`);
        }
      }
    }
    this.bpc = bitsPerComponent;
    if (!this.imageMask) {
      let colorSpace = dict.getRaw("CS") || dict.getRaw("ColorSpace");
      if (!colorSpace) {
        (0, _util.info)("JPX images (which do not require color spaces)");
        switch (image.numComps) {
          case 1:
            colorSpace = _primitives.Name.get("DeviceGray");
            break;
          case 3:
            colorSpace = _primitives.Name.get("DeviceRGB");
            break;
          case 4:
            colorSpace = _primitives.Name.get("DeviceCMYK");
            break;
          default:
            throw new Error(`JPX images with ${image.numComps} color components not supported.`);
        }
      }
      this.colorSpace = _colorspace.ColorSpace.parse({
        cs: colorSpace,
        xref,
        resources: isInline ? res : null,
        pdfFunctionFactory,
        localColorSpaceCache
      });
      this.numComps = this.colorSpace.numComps;
    }
    this.decode = dict.getArray("D", "Decode");
    this.needsDecode = false;
    if (this.decode && (this.colorSpace && !this.colorSpace.isDefaultDecode(this.decode, bitsPerComponent) || isMask && !_colorspace.ColorSpace.isDefaultDecode(this.decode, 1))) {
      this.needsDecode = true;
      const max = (1 << bitsPerComponent) - 1;
      this.decodeCoefficients = [];
      this.decodeAddends = [];
      const isIndexed = this.colorSpace && this.colorSpace.name === "Indexed";
      for (let i = 0, j = 0; i < this.decode.length; i += 2, ++j) {
        const dmin = this.decode[i];
        const dmax = this.decode[i + 1];
        this.decodeCoefficients[j] = isIndexed ? (dmax - dmin) / max : dmax - dmin;
        this.decodeAddends[j] = isIndexed ? dmin : max * dmin;
      }
    }
    if (smask) {
      this.smask = new PDFImage({
        xref,
        res,
        image: smask,
        isInline,
        pdfFunctionFactory,
        localColorSpaceCache
      });
    } else if (mask) {
      if (mask instanceof _base_stream.BaseStream) {
        const maskDict = mask.dict,
          imageMask = maskDict.get("IM", "ImageMask");
        if (!imageMask) {
          (0, _util.warn)("Ignoring /Mask in image without /ImageMask.");
        } else {
          this.mask = new PDFImage({
            xref,
            res,
            image: mask,
            isInline,
            isMask: true,
            pdfFunctionFactory,
            localColorSpaceCache
          });
        }
      } else {
        this.mask = mask;
      }
    }
  }
  static async buildImage({
    xref,
    res,
    image,
    isInline = false,
    pdfFunctionFactory,
    localColorSpaceCache
  }) {
    const imageData = image;
    let smaskData = null;
    let maskData = null;
    const smask = image.dict.get("SMask");
    const mask = image.dict.get("Mask");
    if (smask) {
      if (smask instanceof _base_stream.BaseStream) {
        smaskData = smask;
      } else {
        (0, _util.warn)("Unsupported /SMask format.");
      }
    } else if (mask) {
      if (mask instanceof _base_stream.BaseStream || Array.isArray(mask)) {
        maskData = mask;
      } else {
        (0, _util.warn)("Unsupported /Mask format.");
      }
    }
    return new PDFImage({
      xref,
      res,
      image: imageData,
      isInline,
      smask: smaskData,
      mask: maskData,
      pdfFunctionFactory,
      localColorSpaceCache
    });
  }
  static createRawMask({
    imgArray,
    width,
    height,
    imageIsFromDecodeStream,
    inverseDecode,
    interpolate
  }) {
    const computedLength = (width + 7 >> 3) * height;
    const actualLength = imgArray.byteLength;
    const haveFullData = computedLength === actualLength;
    let data, i;
    if (imageIsFromDecodeStream && (!inverseDecode || haveFullData)) {
      data = imgArray;
    } else if (!inverseDecode) {
      data = new Uint8Array(imgArray);
    } else {
      data = new Uint8Array(computedLength);
      data.set(imgArray);
      data.fill(0xff, actualLength);
    }
    if (inverseDecode) {
      for (i = 0; i < actualLength; i++) {
        data[i] ^= 0xff;
      }
    }
    return {
      data,
      width,
      height,
      interpolate
    };
  }
  static createMask({
    imgArray,
    width,
    height,
    imageIsFromDecodeStream,
    inverseDecode,
    interpolate,
    isOffscreenCanvasSupported = true
  }) {
    const isSingleOpaquePixel = width === 1 && height === 1 && inverseDecode === (imgArray.length === 0 || !!(imgArray[0] & 128));
    if (isSingleOpaquePixel) {
      return {
        isSingleOpaquePixel
      };
    }
    if (isOffscreenCanvasSupported && _util.FeatureTest.isOffscreenCanvasSupported) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      const imgData = ctx.createImageData(width, height);
      (0, _image_utils.applyMaskImageData)({
        src: imgArray,
        dest: imgData.data,
        width,
        height,
        inverseDecode
      });
      ctx.putImageData(imgData, 0, 0);
      const bitmap = canvas.transferToImageBitmap();
      return {
        data: null,
        width,
        height,
        interpolate,
        bitmap
      };
    }
    return this.createRawMask({
      imgArray,
      width,
      height,
      inverseDecode,
      imageIsFromDecodeStream,
      interpolate
    });
  }
  get drawWidth() {
    return Math.max(this.width, this.smask && this.smask.width || 0, this.mask && this.mask.width || 0);
  }
  get drawHeight() {
    return Math.max(this.height, this.smask && this.smask.height || 0, this.mask && this.mask.height || 0);
  }
  decodeBuffer(buffer) {
    const bpc = this.bpc;
    const numComps = this.numComps;
    const decodeAddends = this.decodeAddends;
    const decodeCoefficients = this.decodeCoefficients;
    const max = (1 << bpc) - 1;
    let i, ii;
    if (bpc === 1) {
      for (i = 0, ii = buffer.length; i < ii; i++) {
        buffer[i] = +!buffer[i];
      }
      return;
    }
    let index = 0;
    for (i = 0, ii = this.width * this.height; i < ii; i++) {
      for (let j = 0; j < numComps; j++) {
        buffer[index] = decodeAndClamp(buffer[index], decodeAddends[j], decodeCoefficients[j], max);
        index++;
      }
    }
  }
  getComponents(buffer) {
    const bpc = this.bpc;
    if (bpc === 8) {
      return buffer;
    }
    const width = this.width;
    const height = this.height;
    const numComps = this.numComps;
    const length = width * height * numComps;
    let bufferPos = 0;
    let output;
    if (bpc <= 8) {
      output = new Uint8Array(length);
    } else if (bpc <= 16) {
      output = new Uint16Array(length);
    } else {
      output = new Uint32Array(length);
    }
    const rowComps = width * numComps;
    const max = (1 << bpc) - 1;
    let i = 0,
      ii,
      buf;
    if (bpc === 1) {
      let mask, loop1End, loop2End;
      for (let j = 0; j < height; j++) {
        loop1End = i + (rowComps & ~7);
        loop2End = i + rowComps;
        while (i < loop1End) {
          buf = buffer[bufferPos++];
          output[i] = buf >> 7 & 1;
          output[i + 1] = buf >> 6 & 1;
          output[i + 2] = buf >> 5 & 1;
          output[i + 3] = buf >> 4 & 1;
          output[i + 4] = buf >> 3 & 1;
          output[i + 5] = buf >> 2 & 1;
          output[i + 6] = buf >> 1 & 1;
          output[i + 7] = buf & 1;
          i += 8;
        }
        if (i < loop2End) {
          buf = buffer[bufferPos++];
          mask = 128;
          while (i < loop2End) {
            output[i++] = +!!(buf & mask);
            mask >>= 1;
          }
        }
      }
    } else {
      let bits = 0;
      buf = 0;
      for (i = 0, ii = length; i < ii; ++i) {
        if (i % rowComps === 0) {
          buf = 0;
          bits = 0;
        }
        while (bits < bpc) {
          buf = buf << 8 | buffer[bufferPos++];
          bits += 8;
        }
        const remainingBits = bits - bpc;
        let value = buf >> remainingBits;
        if (value < 0) {
          value = 0;
        } else if (value > max) {
          value = max;
        }
        output[i] = value;
        buf &= (1 << remainingBits) - 1;
        bits = remainingBits;
      }
    }
    return output;
  }
  fillOpacity(rgbaBuf, width, height, actualHeight, image) {
    const smask = this.smask;
    const mask = this.mask;
    let alphaBuf, sw, sh, i, ii, j;
    if (smask) {
      sw = smask.width;
      sh = smask.height;
      alphaBuf = new Uint8ClampedArray(sw * sh);
      smask.fillGrayBuffer(alphaBuf);
      if (sw !== width || sh !== height) {
        alphaBuf = resizeImageMask(alphaBuf, smask.bpc, sw, sh, width, height);
      }
    } else if (mask) {
      if (mask instanceof PDFImage) {
        sw = mask.width;
        sh = mask.height;
        alphaBuf = new Uint8ClampedArray(sw * sh);
        mask.numComps = 1;
        mask.fillGrayBuffer(alphaBuf);
        for (i = 0, ii = sw * sh; i < ii; ++i) {
          alphaBuf[i] = 255 - alphaBuf[i];
        }
        if (sw !== width || sh !== height) {
          alphaBuf = resizeImageMask(alphaBuf, mask.bpc, sw, sh, width, height);
        }
      } else if (Array.isArray(mask)) {
        alphaBuf = new Uint8ClampedArray(width * height);
        const numComps = this.numComps;
        for (i = 0, ii = width * height; i < ii; ++i) {
          let opacity = 0;
          const imageOffset = i * numComps;
          for (j = 0; j < numComps; ++j) {
            const color = image[imageOffset + j];
            const maskOffset = j * 2;
            if (color < mask[maskOffset] || color > mask[maskOffset + 1]) {
              opacity = 255;
              break;
            }
          }
          alphaBuf[i] = opacity;
        }
      } else {
        throw new _util.FormatError("Unknown mask format.");
      }
    }
    if (alphaBuf) {
      for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
        rgbaBuf[j] = alphaBuf[i];
      }
    } else {
      for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
        rgbaBuf[j] = 255;
      }
    }
  }
  undoPreblend(buffer, width, height) {
    const matte = this.smask && this.smask.matte;
    if (!matte) {
      return;
    }
    const matteRgb = this.colorSpace.getRgb(matte, 0);
    const matteR = matteRgb[0];
    const matteG = matteRgb[1];
    const matteB = matteRgb[2];
    const length = width * height * 4;
    for (let i = 0; i < length; i += 4) {
      const alpha = buffer[i + 3];
      if (alpha === 0) {
        buffer[i] = 255;
        buffer[i + 1] = 255;
        buffer[i + 2] = 255;
        continue;
      }
      const k = 255 / alpha;
      buffer[i] = (buffer[i] - matteR) * k + matteR;
      buffer[i + 1] = (buffer[i + 1] - matteG) * k + matteG;
      buffer[i + 2] = (buffer[i + 2] - matteB) * k + matteB;
    }
  }
  createImageData(forceRGBA = false) {
    const drawWidth = this.drawWidth;
    const drawHeight = this.drawHeight;
    const imgData = {
      width: drawWidth,
      height: drawHeight,
      interpolate: this.interpolate,
      kind: 0,
      data: null
    };
    const numComps = this.numComps;
    const originalWidth = this.width;
    const originalHeight = this.height;
    const bpc = this.bpc;
    const rowBytes = originalWidth * numComps * bpc + 7 >> 3;
    if (!forceRGBA) {
      let kind;
      if (this.colorSpace.name === "DeviceGray" && bpc === 1) {
        kind = _util.ImageKind.GRAYSCALE_1BPP;
      } else if (this.colorSpace.name === "DeviceRGB" && bpc === 8 && !this.needsDecode) {
        kind = _util.ImageKind.RGB_24BPP;
      }
      if (kind && !this.smask && !this.mask && drawWidth === originalWidth && drawHeight === originalHeight) {
        imgData.kind = kind;
        imgData.data = this.getImageBytes(originalHeight * rowBytes, {});
        if (this.needsDecode) {
          (0, _util.assert)(kind === _util.ImageKind.GRAYSCALE_1BPP, "PDFImage.createImageData: The image must be grayscale.");
          const buffer = imgData.data;
          for (let i = 0, ii = buffer.length; i < ii; i++) {
            buffer[i] ^= 0xff;
          }
        }
        return imgData;
      }
      if (this.image instanceof _jpeg_stream.JpegStream && !this.smask && !this.mask) {
        let imageLength = originalHeight * rowBytes;
        switch (this.colorSpace.name) {
          case "DeviceGray":
            imageLength *= 3;
          case "DeviceRGB":
          case "DeviceCMYK":
            imgData.kind = _util.ImageKind.RGB_24BPP;
            imgData.data = this.getImageBytes(imageLength, {
              drawWidth,
              drawHeight,
              forceRGB: true
            });
            return imgData;
        }
      }
    }
    const imgArray = this.getImageBytes(originalHeight * rowBytes, {
      internal: true
    });
    const actualHeight = 0 | imgArray.length / rowBytes * drawHeight / originalHeight;
    const comps = this.getComponents(imgArray);
    let alpha01, maybeUndoPreblend;
    if (!forceRGBA && !this.smask && !this.mask) {
      imgData.kind = _util.ImageKind.RGB_24BPP;
      imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 3);
      alpha01 = 0;
      maybeUndoPreblend = false;
    } else {
      imgData.kind = _util.ImageKind.RGBA_32BPP;
      imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 4);
      alpha01 = 1;
      maybeUndoPreblend = true;
      this.fillOpacity(imgData.data, drawWidth, drawHeight, actualHeight, comps);
    }
    if (this.needsDecode) {
      this.decodeBuffer(comps);
    }
    this.colorSpace.fillRgb(imgData.data, originalWidth, originalHeight, drawWidth, drawHeight, actualHeight, bpc, comps, alpha01);
    if (maybeUndoPreblend) {
      this.undoPreblend(imgData.data, drawWidth, actualHeight);
    }
    return imgData;
  }
  fillGrayBuffer(buffer) {
    const numComps = this.numComps;
    if (numComps !== 1) {
      throw new _util.FormatError(`Reading gray scale from a color image: ${numComps}`);
    }
    const width = this.width;
    const height = this.height;
    const bpc = this.bpc;
    const rowBytes = width * numComps * bpc + 7 >> 3;
    const imgArray = this.getImageBytes(height * rowBytes, {
      internal: true
    });
    const comps = this.getComponents(imgArray);
    let i, length;
    if (bpc === 1) {
      length = width * height;
      if (this.needsDecode) {
        for (i = 0; i < length; ++i) {
          buffer[i] = comps[i] - 1 & 255;
        }
      } else {
        for (i = 0; i < length; ++i) {
          buffer[i] = -comps[i] & 255;
        }
      }
      return;
    }
    if (this.needsDecode) {
      this.decodeBuffer(comps);
    }
    length = width * height;
    const scale = 255 / ((1 << bpc) - 1);
    for (i = 0; i < length; ++i) {
      buffer[i] = scale * comps[i];
    }
  }
  getImageBytes(length, {
    drawWidth,
    drawHeight,
    forceRGB = false,
    internal = false
  }) {
    this.image.reset();
    this.image.drawWidth = drawWidth || this.width;
    this.image.drawHeight = drawHeight || this.height;
    this.image.forceRGB = !!forceRGB;
    const imageBytes = this.image.getBytes(length);
    if (internal || this.image instanceof _decode_stream.DecodeStream) {
      return imageBytes;
    }
    (0, _util.assert)(imageBytes instanceof Uint8Array, 'PDFImage.getImageBytes: Unsupported "imageBytes" type.');
    return new Uint8Array(imageBytes);
  }
}
exports.PDFImage = PDFImage;