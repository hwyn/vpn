import { isArray, isString, isBuffer, isNumber } from './tools';


export class BufferUtil {
  static concat(...arg: (string | Buffer)[]) {
    let countSize = 0;
    const concatBuffer = arg.map((linkBuffer: any, index: number) => {
      let _linkBuffer;
      if (isArray(linkBuffer)) {
        _linkBuffer = BufferUtil.concat.apply(undefined, linkBuffer);
      }
      _linkBuffer = isString(linkBuffer) ? Buffer.from(linkBuffer as string) : linkBuffer;
      countSize += _linkBuffer.length;
      return _linkBuffer;
    }) as Buffer[];
    return Buffer.concat(concatBuffer, countSize);
  }

  static writeGrounUInt(numbers: (number | bigint)[], byteSizes: (8 | 16 | 32 | 64)[], offset?: number) {
    const sum = byteSizes.reduce((sum: number, byteSize) => sum + byteSize, 0);
    const buffer = Buffer.alloc(sum);
    let offsetBuf = offset ? Buffer.alloc(offset) : Buffer.alloc(0);
    let cursor: number = 0;
    byteSizes.forEach((byteSize, index: number) => {
      switch (byteSize) {
        case 8: buffer.writeUInt8(numbers[index] as number, cursor); cursor++;break;
        case 16: buffer.writeUInt16BE(numbers[index] as number, cursor); cursor += 2;break;
        case 32: buffer.writeUInt32BE(numbers[index] as number, cursor); cursor += 4;break;
        case 64: buffer.writeBigInt64BE(numbers[index] as bigint, cursor); cursor += 8;break;
      }
    });
    return BufferUtil.concat(offsetBuf, buffer);
  }

  static writeUInt(number: number | bigint, byteSize: 8 | 16 | 32 | 64): Buffer {
    const buffer = Buffer.alloc(byteSize);
    switch (byteSize) {
      case 8: buffer.writeUInt8(number as number, 0);break;
      case 16: buffer.writeUInt16BE(number as number, 0);break;
      case 32: buffer.writeUInt32BE(number as number, 0);break;
      case 64: buffer.writeBigInt64BE(number as bigint, 0);break;
    }
    return buffer;
  }
}
