import { EventEmitter } from '../util/event-emitter';
import { BufferUtil } from '../util/buffer-util';

const SERIAL_SIZE = 8;
const LENGTH_SIZE = 32;
const MAX_PACKAGE_SIZE: number = Math.pow(2, 16);

/**
 * ----------------------------------------
 *  serial | countSum | countCurrent | data
 * ----------------------------------------
 */
class PackageShard {
  constructor(private maxSize: number) {}

  private factorySplit(splitCount: number) {
    let currentCount = 0;
    return (data: Buffer): Buffer => {
      const title = BufferUtil.writeGrounUInt([currentCount, splitCount, data.length], [8, 8, LENGTH_SIZE]);
      return BufferUtil.concat(title, data);
    };
  }

  private factoryUnSplit(buffer: Buffer) {
    let remainingBuffer = buffer;
    const titleLength = 8 + 8 + LENGTH_SIZE;
    const split = (data: Buffer) => {
      const [ title ] = BufferUtil.unConcat(data, [titleLength]);
      const [ currentCount, splitCount, length ] = BufferUtil.readGroupUInt(title, [8, 8, LENGTH_SIZE]);
      const packageBuffer = data.slice(titleLength, length as number - titleLength);
      return { 
        data: packageBuffer,
        currentCount: currentCount as number,
        splitCount: splitCount as number, 
        packageSize: titleLength + (length as number)
      };
    };
    return () => {
      const splitArray = [];
      while(remainingBuffer.length > 0) {
        const obj = split(remainingBuffer);
        remainingBuffer = remainingBuffer.slice(obj.packageSize);
        splitArray.push(obj);
      }
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
      while(splitData.length) {
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
class PackageManage extends EventEmitter {
  private stickSerial: number = 0;
  private splitSerial: number = 0;
  private stickCacheBufferArray: Buffer[] = [];

  private splitCacheBuffer: Buffer = Buffer.alloc(0);
  private splitMap: Map<number, Buffer> = new Map();
  private splitCacheBufferArray: Buffer[] = [];
  private shard: PackageShard;
  private titleSize = SERIAL_SIZE + LENGTH_SIZE;
  constructor(private maxSize: number) {
    super();
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

  stick(data: Buffer) {
    let sendDate = Buffer.alloc(0);
    const remainingArray = [];
    this.stickCacheBufferArray = [].concat(
      this.stickCacheBufferArray, 
      this.shard.splitData(data)
    );
    this.stickCacheBufferArray.forEach((buffer: Buffer) => {
      sendDate = BufferUtil.concat(sendDate, buffer);
      if (sendDate.length >= this.maxSize) {
        sendDate = this.packing(sendDate);
        this.emitSync('stick', sendDate);
        remainingArray.splice(0, remainingArray.length);
        this.stickSerial++;
      } else {
        remainingArray.push(buffer);
      }
    });
    this.stickCacheBufferArray = remainingArray;
  }

  split(buffer: Buffer) {
    const splitBuffer = BufferUtil.concat(this.splitCacheBuffer, buffer);
    const { serial, packageSize, packageBuffer, data } = this.unpacking(splitBuffer);
    if (packageBuffer.length < packageSize) {
      return ;
    }
    this.splitCacheBuffer = splitBuffer.slice(0, packageSize);
    this.splitMap.set(serial, data);

    while(this.splitMap.has(this.splitSerial)) {
      this.splitCacheBufferArray = [].concat(
        this.splitCacheBufferArray, 
        this.shard.unSplitData(this.splitMap.get(this.splitSerial))
      );
      this.splitMap.delete(this.splitSerial);
      this.splitSerial++;
    }
    console.log(this.splitCacheBufferArray);
  }
}