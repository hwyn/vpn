import { EventEmitter } from '../util/event-emitter';
import { BufferUtil } from '../util/buffer-util';
import { PACKAGE_MAX_SIZE , COMMUNICATION_EVENT  } from '../constant';

const SERIAL_SIZE = 8;
const LENGTH_SIZE = 32;

/**
 * ----------------------------------------
 *  serial | countSum | countCurrent | data
 * ----------------------------------------
 */
class PackageShard {
  constructor(private maxSize: number) {}

  private factorySplit(splitCount: number) {
    let currentCount = 1;
    return (data: Buffer): Buffer => {
      const title = BufferUtil.writeGrounUInt([currentCount++, splitCount, data.length], [8, 8, LENGTH_SIZE]);
      return BufferUtil.concat(title, data);
    };
  }

  private factoryUnSplit(buffer: Buffer) {
    let remainingBuffer = buffer;
    const titleLength = 8 + 8 + LENGTH_SIZE;
    const split = (data: Buffer) => {
      const [ title ] = BufferUtil.unConcat(data, [titleLength]);
      const [ currentCount, splitCount, length ] = BufferUtil.readGroupUInt(title, [8, 8, LENGTH_SIZE]);
      const packageSize = titleLength + (length as number);
      const packageBuffer = data.slice(titleLength, packageSize);
      return { 
        data: packageBuffer,
        currentCount: currentCount as number,
        splitCount: splitCount as number, 
        packageSize
      };
    };
    return () => {
      const splitArray = [];
      while(remainingBuffer.length > 0) {
        const obj = split(remainingBuffer);
        remainingBuffer = remainingBuffer.slice(obj.packageSize);
        splitArray.push(obj);
      }
      return splitArray;
    };
  }

  splitData(data: Buffer): Buffer[] {
    let splitCount = 1;
    let dataArray = [data];
    const dataLength = data.length;
    if (dataLength > this.maxSize) {
      const l = dataLength % this.maxSize;
      let splitData = data;
      dataArray = [];
      splitCount = (dataLength - l) / this.maxSize + (l === 0 ? 0 : 1);
      while(splitData.length > 0) {
        dataArray.push(splitData.slice(0, this.maxSize));
        splitData = splitData.slice(this.maxSize);
      }
    }
    return dataArray.map(this.factorySplit(splitCount));
  }

  unSplitData(buffer: Buffer) {
    return this.factoryUnSplit(buffer)();
  }
}

/**
 * -------------------------------------------------
 *  serialSize | lengthSize | serial | length | data
 * -------------------------------------------------
 */
export class PackageManage extends EventEmitter {
  private stickSerial: number = 0;
  private splitSerial: number = 0;
  private stickCacheBufferArray: Buffer[] = [];

  private splitCacheBuffer: Buffer = Buffer.alloc(0);
  private splitMap: Map<number, Buffer> = new Map();
  private splitCacheBufferArray: Buffer[] = [];
  private shard: PackageShard;
  private titleSize = SERIAL_SIZE + LENGTH_SIZE;
  private maxSize: number;

  private sendSt: any;
  constructor(maxSize?: number) {
    super();
    this.maxSize = maxSize || PACKAGE_MAX_SIZE;
    this.shard = new PackageShard(this.maxSize - this.titleSize - 100);
  }

  private packing(data: Buffer) {
    const serialBuffer = BufferUtil.concat(this.stickSerial.toString());
    const length = this.titleSize + serialBuffer.length + data.length;
    const titleBuffer = BufferUtil.writeGrounUInt([serialBuffer.length, length], [SERIAL_SIZE, LENGTH_SIZE]);
    return BufferUtil.concat(titleBuffer, serialBuffer, data);
  }

  private unpacking(buffer: Buffer): { serial: number, packageSize: number, packageBuffer: Buffer, data: Buffer } {
    const title = buffer.slice(0, this.titleSize);
    const [ serialSize, packageSize ] = BufferUtil.readGroupUInt(title, [SERIAL_SIZE, LENGTH_SIZE]);
    const unConcat = BufferUtil.unConcat(buffer, [ this.titleSize, serialSize ]);
    const serial = parseInt(unConcat[1].toString());
    const packageBuffer = buffer.slice(0, packageSize as number);
    const data = packageBuffer.slice(this.titleSize + (serialSize as number));
    return { serial, packageSize: packageSize as number, packageBuffer, data };
  }

  private sendData(data: Buffer) {
    const sendDate = this.packing(data);
    this.emitAsync('stick', sendDate);
    this.stickSerial++;
  }

  private splitMerge() {
    let splitBuffer = this.splitCacheBuffer;
    const size = SERIAL_SIZE + LENGTH_SIZE;
    while (splitBuffer.length > size) {
      const { serial, packageSize, packageBuffer, data } = this.unpacking(splitBuffer);
      if (packageSize > packageBuffer.length) {
        break;
      }
      this.splitMap.set(serial, data);
      splitBuffer = splitBuffer.slice(packageSize);
    }
    this.splitCacheBuffer = splitBuffer;
  }

  stick(data: Buffer) {
    let sendDate = Buffer.alloc(0);
    const remainingArray: any[] | Buffer[] = [];
    this.stickCacheBufferArray = [].concat(
      this.stickCacheBufferArray, 
      this.shard.splitData(data)
    );
    this.stickCacheBufferArray.forEach((buffer: Buffer) => {
      sendDate = BufferUtil.concat(sendDate, buffer);
      if (sendDate.length >= this.maxSize) {
        this.sendData(sendDate);
        remainingArray.splice(0, remainingArray.length);
      } else {
        remainingArray.push(buffer);
      }
    });
    this.stickCacheBufferArray = remainingArray;
  }

  split(buffer: Buffer, callback?: (data: Buffer) => void) {
    this.splitCacheBuffer = BufferUtil.concat(this.splitCacheBuffer, buffer);
    this.splitMerge();
    while(this.splitMap.has(this.splitSerial)) {
      this.splitCacheBufferArray = [].concat(
        this.splitCacheBufferArray, 
        this.shard.unSplitData(this.splitMap.get(this.splitSerial))
      );
      this.splitMap.delete(this.splitSerial);
      this.splitSerial++;
    }
    let cacheArray: any = [];
    let splitArray: any = [];
    this.splitCacheBufferArray.forEach((item: any) => {
      const { data, currentCount, splitCount } = item;
      splitArray.push(data);
      cacheArray.push(data);
      if (splitCount === currentCount) {
        const concatBufffer = BufferUtil.concat(...cacheArray);
        callback ? callback(concatBufffer) : null;
        this.emitAsync('split', concatBufffer);
        cacheArray = [];
        splitArray = [];
      }
    });
    this.splitCacheBufferArray = splitArray;
  }

  directlySend() {
    this.sendData(BufferUtil.concat(...this.stickCacheBufferArray));
  }
}