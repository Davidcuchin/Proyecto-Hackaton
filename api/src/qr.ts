import { deflateSync, crc32 } from "node:zlib";

// QR Model 2, versión 2-L. Capacidad fija suficiente para los códigos IMP de 24 bytes.
const size = 25;
const dataWords = 34;
const parityWords = 10;

function multiply(a: number, b: number) {
  let product = 0;
  for (let bit = 7; bit >= 0; bit--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    if ((b >>> bit) & 1) product ^= a;
  }
  return product;
}

function codeWords(text: string) {
  const bits: number[] = [];
  function append(value: number, length: number) {
    for (let bit = length - 1; bit >= 0; bit--) bits.push((value >>> bit) & 1);
  }
  const bytes = Buffer.from(text);
  if (bytes.length > 32) throw new RangeError("El texto excede la capacidad del QR 2-L.");
  append(4, 4);
  append(bytes.length, 8);
  for (const byte of bytes) append(byte, 8);
  append(0, 4);
  while (bits.length < dataWords * 8) append((bits.length / 8 - bytes.length - 2) % 2 === 0 ? 0xec : 0x11, 8);
  const words = Buffer.alloc(dataWords);
  bits.forEach((bit, index) => { words[index >>> 3] |= bit << (7 - (index % 8)); });

  const divisor = new Uint8Array(parityWords);
  divisor[parityWords - 1] = 1;
  for (let root = 1, index = 0; index < parityWords; index++, root = multiply(root, 2)) {
    for (let term = 0; term < parityWords; term++) {
      divisor[term] = multiply(divisor[term], root) ^ (divisor[term + 1] ?? 0);
    }
  }
  const parity = new Uint8Array(parityWords);
  for (const word of words) {
    const factor = word ^ parity[0];
    parity.copyWithin(0, 1);
    parity[parityWords - 1] = 0;
    for (let term = 0; term < parityWords; term++) parity[term] ^= multiply(divisor[term], factor);
  }
  return Buffer.concat([words, parity]);
}

function matrix(text: string) {
  const words = codeWords(text);
  const modules: (boolean | undefined)[][] = Array.from({ length: size }, () => Array(size));
  const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [x, y] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (modules[y + dy] && x + dx >= 0 && x + dx < size) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          set(x + dx, y + dy, distance !== 2 && distance !== 4);
        }
      }
    }
  }
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) set(18 + dx, 18 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  // Formato BCH para corrección L, máscara 0.
  const formatBit = (position: number) => ((0x77c4 >>> position) & 1) === 1;
  for (let i = 0; i < 6; i++) set(8, i, formatBit(i));
  set(8, 7, formatBit(6));
  set(8, 8, formatBit(7));
  set(7, 8, formatBit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, formatBit(i));
  set(8, size - 8, true);

  let bit = 0;
  for (let x = size - 1; x >= 1; x -= 2) {
    if (x === 6) x--;
    for (let row = 0; row < size; row++) {
      const y = ((x + 1) & 2) === 0 ? size - 1 - row : row;
      for (let offset = 0; offset < 2; offset++) {
        const column = x - offset;
        if (modules[y][column] !== undefined) continue;
        const dark = (((words[bit >>> 3] ?? 0) >>> (7 - bit % 8)) & 1) === 1;
        set(column, y, dark !== ((column + y) % 2 === 0));
        bit++;
      }
    }
  }
  return modules;
}

function pngChunk(name: string, value: Buffer) {
  const content = Buffer.concat([Buffer.from(name), value]);
  const length = Buffer.alloc(4);
  const check = Buffer.alloc(4);
  length.writeUInt32BE(value.length);
  check.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, check]);
}

export function qrPng(text: string) {
  const scale = 5;
  const margin = 4;
  const length = (size + margin * 2) * scale;
  const modules = matrix(text);
  const image = Buffer.alloc((length + 1) * length, 255);
  for (let y = 0; y < length; y++) {
    image[y * (length + 1)] = 0;
    for (let x = 0; x < length; x++) {
      if (modules[Math.floor(y / scale) - margin]?.[Math.floor(x / scale) - margin]) {
        image[y * (length + 1) + x + 1] = 0;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(length);
  header.writeUInt32BE(length, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(image)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
