import { EventEmitter } from '../util/event-emitter';
import { BufferUtil } from '../util/buffer-util';
import { PACKAGE_MAX_SIZE } from '../constant';

const SERIAL_SIZE = 8;
const LENGTH_SIZE = 32;
const DATE = 0;
const END = 1;
const ERROR = 2;
const CLOSE = 3;

/**
 * ----------------------------------------
 *  serial | countCurrent | data
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
    const split = (_buffer: Buffer) => {
      const [ title ] = BufferUtil.unConcat(_buffer, [titleLength]);
      const [ currentCount, splitCount, length ] = BufferUtil.readGroupUInt(title, [8, 8, LENGTH_SIZE]) as number[];
      const packageSize = titleLength + length;
      const packageBuffer = _buffer.slice(titleLength, packageSize);
      return { 
        data: packageBuffer,
        currentCount: currentCount,
        splitCount: splitCount, 
        packageSize
      };
    };
    return () => {
      const splitArray = [];
      while(remainingBuffer.length > 0) {
        const obj = split(remainingBuffer);
        remainingBuffer = remainingBuffer.slice(obj.packageSize);
        if (obj.data.length > 0) {
          splitArray.push(obj);
        }
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
  private timeout: number = 1000;
  private clearTimeout: any;

  private endable: boolean = false;
  private isNotEnd: boolean = true;
  constructor(maxSize?: number) {
    super();
    this.maxSize = maxSize || PACKAGE_MAX_SIZE;
    this.shard = new PackageShard(this.maxSize - this.titleSize - 100);
    this.once('_close', () => this.emitAsync('close'));
  }

  private factoryTimout() {
    let si = setTimeout(() => this.emitAsync('timeout'), this.timeout);
    this.clearTimeout = () => {
      this.clearTimeout = null;
      clearTimeout(si);
    }
  }

  /**
   * 写入发送数据类型
   * @param type 类型
   * @param data Buffer
   */
  private writePaackageType(type: number, data: Buffer) {
    const typeBuffer = Buffer.alloc(8);
    typeBuffer.writeUInt8(type << 6, 0);
    return Buffer.concat([typeBuffer.slice(0, 2), data], 2 + data.length);
  }

  /**
   * 解析收到数据类型
   * @param buffer Buffer
   */
  private readPackageType(buffer: Buffer): { type: number, data: Buffer } {
    const typeBuffer = Buffer.alloc(8);
    const data = buffer.slice(2);
    typeBuffer[0] = buffer[0];
    typeBuffer[1] = buffer[1];
    const type = typeBuffer.readUInt8(0) >> 6;
    return { type, data };
  }

  /**
   * 发送出去的数据添加标志信息
   * @param data Buffer
   */
  private packing(data: Buffer) {
    const serialBuffer = BufferUtil.concat(this.stickSerial.toString());
    const length = this.titleSize + serialBuffer.length + data.length;
    const titleBuffer = BufferUtil.writeGrounUInt([serialBuffer.length, length], [SERIAL_SIZE, LENGTH_SIZE]);
    this.stickSerial++;
    return BufferUtil.concat(titleBuffer, serialBuffer, data);
  }

  /**
   * 接收到到信息解析标志信息
   * @param buffer Buffer
   */
  private unpacking(buffer: Buffer): { serial: number, packageSize: number, packageBuffer: Buffer, data: Buffer } {
    const title = buffer.slice(0, this.titleSize);
    const [ serialSize, packageSize ] = BufferUtil.readGroupUInt(title, [SERIAL_SIZE, LENGTH_SIZE]) as number[];
    const unConcat = BufferUtil.unConcat(buffer, [ this.titleSize, serialSize ]);
    const serial = parseInt(unConcat[1].toString());
    const packageBuffer = buffer.slice(0, packageSize);
    const data = packageBuffer.slice(this.titleSize + serialSize);
    return { serial, packageSize: packageSize, packageBuffer, data };
  }

  private eventSwitch(type: number) {
    this.isNotEnd = false;
    switch(type) {
      case CLOSE: this.endable ? null : this.emitAsync('end'); break;
      case END: this.emitAsync('end'); break;
      case ERROR: this.emitAsync('error'); break;
    }
  }

  private send(data: Buffer) {
    const sendDate = this.packing(data);
    this.emitAsync('send', sendDate);
    
  }

  private splitMerge(buffer: Buffer) {
    let splitBuffer = BufferUtil.concat(this.splitCacheBuffer, buffer);
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

  private getEventBuffer(type: number) {
    const bufferArray = this.shard.splitData(this.writePaackageType(type, Buffer.alloc(0)));
    return this.packing(BufferUtil.concat(...bufferArray));
  }
  
  private directly() {
    if (this.stickCacheBufferArray.length) {
      this.send(BufferUtil.concat(...this.stickCacheBufferArray));
      this.stickCacheBufferArray = [];
    }
    this.sendSt = null;
  }
  // 240e:39a:354:8740:e095:6cbc:bb29:7901
  stick(data: Buffer) {
    if (!Buffer.isBuffer(data) || this.endable) {
      return ;
    }
    let sendDate = Buffer.alloc(0);
    const remainingArray: any[] | Buffer[] = [];
    this.stickCacheBufferArray = [].concat(
      this.stickCacheBufferArray, 
      this.shard.splitData(this.writePaackageType(DATE, data))
    );
    this.stickCacheBufferArray.forEach((buffer: Buffer) => {
      sendDate = BufferUtil.concat(sendDate, buffer);
      if (sendDate.length >= this.maxSize) {
        this.send(sendDate);
        sendDate = Buffer.alloc(0);
        remainingArray.splice(0, remainingArray.length);
      } else {
        remainingArray.push(buffer);
      }
    });
    this.stickCacheBufferArray = remainingArray;
    if (!this.sendSt) {
      this.sendSt = setTimeout(() => this.directly());
    }
  }

  split(buffer: Buffer, callback?: (data: Buffer) => void, uid?: string) {
    this.splitMerge(buffer);
    while(this.splitMap.has(this.splitSerial)) {
      this.splitCacheBufferArray = [].concat(
        this.splitCacheBufferArray, 
        this.shard.unSplitData(this.splitMap.get(this.splitSerial))
      );
      this.splitMap.delete(this.splitSerial);
      this.splitSerial++;
    }

    if (this.splitMap.size !== 0 && !this.clearTimeout) {
      this.factoryTimout();
    } else if (this.splitMap.size === 0 && this.clearTimeout) {
      this.clearTimeout();
    }

    let cacheArray: any = [];
    let splitArray: any = [];
    this.splitCacheBufferArray.forEach((item: any) => {
      const { data, currentCount, splitCount } = item;
      splitArray.push(item);
      cacheArray.push(data);
      if (splitCount === currentCount) {
        const { type, data: concatBufffer } = this.readPackageType(BufferUtil.concat(...cacheArray));
        if (type === DATE) {
          callback ? callback(concatBufffer) : null;
          this.emitAsync('data', concatBufffer);
        } else {
          this.eventSwitch(type);
        }
        cacheArray = [];
        splitArray = [];
      }
    });
    this.splitCacheBufferArray = splitArray;

  }

  end() {
    this.endable  = true;
    if (this.isNotEnd) {
      this.directly();
      this.emitAsync('sendEnd', this.getEventBuffer(END));
    }
  }

  close() {
    if (this.isNotEnd) {
      this.emitAsync('sendClose', this.getEventBuffer(CLOSE));
    }
    this.emitAsync('_close');
  }
  // message close 7cd83a9d-adb1-44c3-b52e-f4cc5e8fb4c4
  error(error: Error) {
    this.endable  = true;
    if (this.isNotEnd) {
      this.directly();
      this.emitAsync('sendError', this.getEventBuffer(ERROR));
    }
  }
}