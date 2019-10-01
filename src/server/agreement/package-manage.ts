import { EventEmitter } from '../util/event-emitter';
import { BufferUtil } from '../util/buffer-util';
import { PACKAGE_MAX_SIZE } from '../constant';

const SERIAL_SIZE = 8;
const LENGTH_SIZE = 32;
const DATE = 0;
const END = 1;
const ERROR = 2;
const CLOSE = 3;
const HEARTBEAT = 4;
const TIMEOUT = 5;

const MAX_SERIAL = Math.pow(2, 16);
/**
 * ----------------------------------------
 *  count | countCurrent | data
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
 * ------------------------------------------------------------------------
 *                                            | count | countCurrent | data
 *                                            | count | countCurrent | data
 *  serialSize | lengthSize | serial | length | count | countCurrent | data
 *                                            | count | countCurrent | data
 *                                            | count | countCurrent | data
 * ------------------------------------------------------------------------
 */
export class PackageManage extends EventEmitter {
  /**
   * 写入发送数据类型
   * @param type 类型
   * @param data Buffer
   */
  static writePaackageType(type: number, data: Buffer) {
    const typeBuffer = Buffer.alloc(8);
    typeBuffer.writeUInt8(type << 5, 0);
    return Buffer.concat([typeBuffer.slice(0, 3), data], 3 + data.length);
  }

  /**
   * 解析收到数据类型
   * @param buffer Buffer
   */
  static readPackageType(buffer: Buffer): { type: number, data: Buffer } {
    const typeBuffer = Buffer.alloc(8);
    const data = buffer.slice(3);
    typeBuffer[0] = buffer[0];
    typeBuffer[1] = buffer[1];
    typeBuffer[2] = buffer[2];
    const type = typeBuffer.readUInt8(0) >> 5;
    return { type, data };
  }

  private _stickSerial: number = 0;
  private _splitSerial: number = 0;
  private stickCacheBufferArray: Buffer[] = [];

  private splitCacheBuffer: Buffer = Buffer.alloc(0);
  private splitMap: Map<number, Buffer> = new Map();
  private splitCacheBufferArray: Buffer[] = [];
  private shard: PackageShard;
  private titleSize = SERIAL_SIZE + LENGTH_SIZE;
  private maxSize: number;

  private sendSt: any;
  private timeout: number = 1000;
  private timeouted: boolean = false;
  private clearTimeout: any;

  private openHearbeat: boolean = false;
  private heartbeatTimer: number = 15000;
  private heartbeatSt: any;
  private localhostStatus: number = DATE;
  private targetStatus: number = DATE;
  constructor(openHearbeat?: boolean, maxSize?: number) {
    super();
    this.maxSize = maxSize || PACKAGE_MAX_SIZE;
    this.openHearbeat = openHearbeat || false;
    this.shard = new PackageShard(this.maxSize - this.titleSize - 100);
    this.on('_close', () => this.emitAsync('close'));
  }

  private factoryHeartbeat() {
    if (this.heartbeatSt !== null) {
      clearTimeout(this.heartbeatSt);
    }

    if (this.destroyed) {
      return ;
    }

    this.heartbeatSt = setTimeout(() => {
      this.heartbeatSt = null;
      if (!this.destroyed) {
        const buffer = PackageManage.writePaackageType(this.localhostStatus, Buffer.alloc(0));
        this.stick(buffer, HEARTBEAT);
      } else {
        this.emitAsync('_close');
      }
    }, this.heartbeatTimer);
  }

  private factoryTimout() {
    if (this.clearTimeout) {
      return ;
    }
    let si = setTimeout(() => {
      this.timeouted = true;
      this.splitCacheBufferArray = [];
      this.splitMap.clear();
      this.splitCacheBuffer = Buffer.alloc(0);
      this.stick(this.resetSerial(), TIMEOUT);
      this.clearTimeout = null;
    }, this.timeout);

    this.clearTimeout = () => {
      this.clearTimeout = null;
      clearTimeout(si);
    }
  }

  private resetSerial() {
    this.splitCacheBufferArray = [];
    this.splitMap.clear();
    this.splitCacheBuffer = Buffer.alloc(0);
    return Buffer.from(this.splitSerial.toString());
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

  private eventSwitch(type: number, buffer: Buffer) {
    this.targetStatus = [TIMEOUT, HEARTBEAT].includes(type) ? this.targetStatus : type;
    if (type === HEARTBEAT) {
      const { type: targetStatus } = PackageManage.readPackageType(buffer);
      this.targetStatus = targetStatus;
    }

    if (this.targetStatus !== DATE && type !== TIMEOUT) {
      this.statusSync(true);
    }

    if (type === TIMEOUT) {
      this.stickCacheBufferArray = [];
      this.stickSerial = parseInt(buffer.toString());
      this.timeouted = true;
      if (this.localhostStatus === DATE) {
        this.destroy(new Error('socket timeout'));
      } else {
        const buffer = PackageManage.writePaackageType(this.localhostStatus, Buffer.alloc(0));
        this.stick(buffer, HEARTBEAT);
      }
    }
  }

  private send(data: Buffer) {
    const sendDate = this.packing(data);
    this.emitAsync('send', sendDate);
    this.openHearbeat && this.factoryHeartbeat();
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
  
  private directly() {
    if (this.stickCacheBufferArray.length) {
      this.send(BufferUtil.concat(...this.stickCacheBufferArray));
      this.stickCacheBufferArray = [];
    }
    this.sendSt = null;
  }

  private statusSync(isTargetChange?: boolean) {
    const { localhostStatus, targetStatus } = this;
    if (!isTargetChange && localhostStatus !== DATE) {
      this.stick(Buffer.alloc(0), localhostStatus);
    }

    if (targetStatus === CLOSE && this.timeouted) {
      this.stick(Buffer.alloc(0), localhostStatus);
    }

    if (localhostStatus !== targetStatus) {
      if (localhostStatus === DATE && [END, ERROR].includes(targetStatus)) {
        targetStatus === ERROR ? this.emitAsync('error') : this.emitAsync('end');
      }
    } else if (localhostStatus === targetStatus && localhostStatus === CLOSE) {
      this.clearTimeout && this.clearTimeout();
      this.emitAsync('_close');
    }
  }

  // 240e:39a:354:8740:e095:6cbc:bb29:7901
  stick(data: Buffer, type?: number) {
    if (this.timeouted && (!type || type === DATE)) {
      this.stickCacheBufferArray = [];
      return ;
    }

    if (!Buffer.isBuffer(data)) {
      return ;
    }

    let sendDate = Buffer.alloc(0);
    const remainingArray: any[] | Buffer[] = [];

    this.stickCacheBufferArray = [].concat(
      this.stickCacheBufferArray, 
      this.shard.splitData(PackageManage.writePaackageType(type || DATE, data))
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
    this.sendSt && clearTimeout(this.sendSt);
    this.sendSt = setTimeout(() => this.directly());
  }

  split(buffer: Buffer, callback?: (data: Buffer) => void, uid?: string) {
    if (buffer.length === 0) {
      return this.destroy();
    }
    this.splitMerge(buffer);
    while(this.splitMap.has(this.splitSerial)) {
      this.splitCacheBufferArray = [].concat(
        this.splitCacheBufferArray, 
        this.shard.unSplitData(this.splitMap.get(this.splitSerial))
      );
      this.splitMap.delete(this.splitSerial);
      this.splitSerial++;
    }

    if (this.splitMap.size !== 0) {
      this.factoryTimout();
    } else if (this.clearTimeout) {
      this.clearTimeout();
    }

    let cacheArray: any = [];
    let splitArray: any = [];
    this.splitCacheBufferArray.forEach((item: any) => {
      const { data, currentCount, splitCount } = item;
      splitArray.push(item);
      cacheArray.push(data);
      if (splitCount === currentCount) {
        const { type, data: concatBufffer } = PackageManage.readPackageType(BufferUtil.concat(...cacheArray));
        if (type === DATE) {
          if (this.localhostStatus !== CLOSE && !this.timeouted) {
            callback ? callback(concatBufffer) : null;
            this.emitAsync('data', concatBufffer);
          }
        } else {
          this.eventSwitch(type, concatBufffer);
        }
        cacheArray = [];
        splitArray = [];
      }
    });
    this.splitCacheBufferArray = splitArray;
  }

  end() {
    this.localhostStatus = END;
    // debugger;
    this.statusSync();
  }

  close() {
    this.localhostStatus = CLOSE;
    if (this.splitMap.size === 0) {
      this.statusSync();
    }
  }

  error(error: Error) {
    this.localhostStatus = ERROR;
    this.statusSync();
  }

  destroy(error?: Error) {
    if (error) {
      this.emitAsync('error', error);
    } else {
      this.targetStatus = CLOSE;
      this.resetSerial();
      this.emitAsync('end');
    }
  }

  get stickSerial() {
    return this._stickSerial;
  }

  set stickSerial(val: number) {
    this._stickSerial = val;
    if (val > MAX_SERIAL - 1) {
      this._stickSerial = 0;
    }
  }

  get splitSerial() {
    return this._splitSerial;
  }

  set splitSerial(val: number) {
    this._splitSerial = val;
    if (val > MAX_SERIAL - 1) {
      this._splitSerial = 0;
    }
  }

  get destroyed() {
    return this.targetStatus === this.localhostStatus && this.localhostStatus === CLOSE;
  }
}