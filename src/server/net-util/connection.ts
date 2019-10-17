import { EventEmitter } from './event-emitter';
import { BufferUtil } from './buffer-util';
import { PACKAGE_MAX_SIZE } from '../constant';

const SERIAL_SIZE = 8;
const LENGTH_SIZE = 32;

const DATA = 0;
const END = 1;
const ERROR = 2;
const CLOSE = 3;
const HEARTBEAT = 4;
const TIMEOUT = 5;
const CONFIM = 6;
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
export class ConnectionManage extends EventEmitter {
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
  private shard: PackageShard; // 包组合工具
  private titleSize = SERIAL_SIZE + LENGTH_SIZE; // 包头部长度
  private maxSize: number; // 包最大长度

  private errorMessage: string;
  private localhostStatus: number = DATA; // 本地连接状态
  private targetStatus: number = DATA; // 远程连接状态

  private sendSetTimeout: () => void = this.factorySetTimeout(this.directly.bind(this));

  private timeouted: boolean = false; // 丢包状态
  private lossTimer: number = 1500; // 丢包延迟同步信息时间

  private openHearbeat: boolean = false; // 开启心跳检测
  private heartbeatTimer: number = 15000; // 心跳检测时间
  private clearHeartbeatTimeout: () => any;
  private heartbeatSetTimeout: () => any = this.factorySetTimeout(this.sendHeartbeatPackage.bind(this), this.heartbeatTimer);

  // 重发数据
  private openResend: boolean = false;
  private resend: (serial: number, data: Buffer) => any = this.factorySetTimeout(this.factoryResend.bind(this), this.lossTimer);

  private writeBuffer: { serial: number, data: Buffer }[] = [];
  private sendBufferHandle: Map<number, { status: boolean, clearResend: any }> = new Map();
  constructor(openHearbeat?: boolean, openResend?: boolean, maxSize?: number) {
    super();
    this.maxSize = maxSize || PACKAGE_MAX_SIZE;
    this.openHearbeat = openHearbeat || false;
    this.openResend = openResend;
    this.shard = new PackageShard(this.maxSize - this.titleSize - 100);
    this.on('_close', () => this.emitAsync('close'));
  }

  /**
   * 延迟执行
   * @param timer 
   * @param callback 
   */
  private factorySetTimeout(callback: () => void, timer?: number) {
    let st: any;
    const _clearTimeout = () => {
      if (st) {
        clearTimeout(st);
        st = null;
      }
    }
    return (...arg: any[]) => {
      if (st) _clearTimeout();
      st = setTimeout(() => {
        callback.call(this, ...arg);
        st = null;
      }, timer);
      return _clearTimeout;
    }
  }

  /**
   * 发送心跳检测包
   */
  private sendHeartbeatPackage() {
    if (!this.destroyed) {
      const buffer = ConnectionManage.writePaackageType(this.localhostStatus, Buffer.alloc(0));
      this.writeEvent(HEARTBEAT, buffer);
    } else {
      this.emitAsync('_close');
    }
  }

  /**
   * 心跳检测信息
   */
  private messageHeartbeat(buffer: Buffer) {
    const { type: targetStatus } = ConnectionManage.readPackageType(buffer);
    this.targetStatus = targetStatus;
    console.log(`---------heartbeat---------targetStatus:${targetStatus}------localhostStatus:${this.localhostStatus}`);
    if (targetStatus === CLOSE && this.localhostStatus !== CLOSE) {
      if (![DATA, CLOSE].includes(this.localhostStatus)) {
        this.close();
      } else if (this.errorMessage) {
        this.error(new Error(this.errorMessage));
      } else {
        this.end();
      }
      return false;
    }
    return true;
  }

  private factoryHeartbeat() {
    if (this.destroyed) {
      this.clearHeartbeatTimeout && this.clearHeartbeatTimeout();
      return this.emitAsync('_close');
    }
    this.clearHeartbeatTimeout = this.heartbeatSetTimeout();
  }

  private writeConfim(serial: number) {
    if (this.openResend) {
      this.writeEvent(CONFIM, Buffer.from(serial.toString()));
    }
  }

  private messageConfim(buffer: Buffer) {
    const confimSerial = parseInt(buffer.toString());
    const resendItem = this.sendBufferHandle.get(confimSerial);
    if (resendItem) {
      resendItem.status = true;
      resendItem.clearResend();
    }
    this.sendBufferHandle.delete(confimSerial);
    this.write();
  }

  // 重置包序列号
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

  /**
   * 发送事件信息
   * @param eventType 事件类型
   * @param data 数据
   */
  private writeEvent(eventType: number, data: Buffer) {
    const stickSerial = this.stickSerial;
    this.stickSerial = -1;
    const eventPackage = this.packing(ConnectionManage.writePaackageType(eventType, data));
    this.stickSerial = stickSerial;
    this.emitAsync('send', eventPackage);
  }


  private _eventSwitch(buffer: Buffer) {
    const { type, data } = ConnectionManage.readPackageType(buffer);
    switch(type) {
      case CONFIM: this.messageConfim(data); break;
      case HEARTBEAT: this.messageHeartbeat(data);
    }
  }

  /**
   * 远程事件类型处理
   * @param type event
   * @param buffer Buffer
   */
  private eventSwitch(type: number, buffer: Buffer) {
    this.targetStatus = [TIMEOUT, HEARTBEAT].includes(type) ? this.targetStatus : type;
    if (type === HEARTBEAT && !this.messageHeartbeat(buffer)) {
      return ;
    }
    
    if (this.targetStatus !== DATA) {
      if (this.targetStatus === ERROR) {
        this.errorMessage = buffer.toString();
      }
      this.statusSync(true);
    }
  }

  /**
   * 发送区
   * @param data buffer
   */
  private send(data: Buffer) {
    let sendDate = this.packing(data);
    this.writeBuffer.push({serial: this.stickSerial - 1, data: sendDate });
    if (this.sendBufferHandle.size < 4) this.write();
  }

  private write() {
    if (this.writeBuffer.length === 0) return ;
    const { serial, data } = this.writeBuffer.shift();
    this.emitAsync('send', data);
    this.openHearbeat && this.factoryHeartbeat();
    if (this.openResend) {
      this.sendBufferHandle.set(serial, { status: false, clearResend: this.resend(serial, data) });
    }
  }

  private factoryResend(serial: number, data: Buffer) {
    const item = this.sendBufferHandle.get(serial);
    if (this.destroy) {
      return ;
    }
    console.log(`--------Resend----------${serial}`, data.length);
    console.log(this.sendBufferHandle.get(serial));
    if (item && item.status === false) {
      item.clearResend();
      this.sendBufferHandle.delete(serial);
      this.writeBuffer.unshift({ serial, data});
      this.write();
    } else {
      this.sendBufferHandle.delete(serial);
    }
  }

  private splitMerge(buffer: Buffer) {
    let splitBuffer = BufferUtil.concat(this.splitCacheBuffer, buffer);
    const size = SERIAL_SIZE + LENGTH_SIZE;
    while (splitBuffer.length > size) {
      const { serial, packageSize, packageBuffer, data } = this.unpacking(splitBuffer);
      if (packageSize > packageBuffer.length) {
        break;
      }
      if (serial === -1) {
        this._eventSwitch(data);
      } else {
        this.writeConfim(serial);
        this.splitMap.set(serial, data);
      }
      splitBuffer = splitBuffer.slice(packageSize);
    }
    this.splitCacheBuffer = splitBuffer;
  }
  
  /**
   * 立即发送包
   */
  private directly() {
    if (this.stickCacheBufferArray.length) {
      this.send(BufferUtil.concat(...this.stickCacheBufferArray));
      this.stickCacheBufferArray = [];
    }
  }

  /**
   * 状态同步
   * @param isTargetChange 是否是远程同步状态
   */
  private statusSync(isTargetChange?: boolean) {
    const { localhostStatus, targetStatus } = this;
    // 本地状态改变 并且 本地状态不是 data 发送状态同步信息
    if (!isTargetChange && localhostStatus !== DATA) {
      let buffer = localhostStatus === ERROR ? Buffer.from(this.errorMessage) : Buffer.alloc(0);
      this.stick(buffer, localhostStatus);
    }

    // 远程状态是CLOSE 并且 本地是丢包状态 发送状态同步
    if (targetStatus === CLOSE && this.timeouted) {
      this.stick(Buffer.alloc(0), localhostStatus);
    }

    // 状态不一致
    if (localhostStatus !== targetStatus) {
      // 本地状态为date 远程状态为end 或者 error
      if (isTargetChange && localhostStatus === DATA && [END, ERROR].includes(targetStatus)) {
        targetStatus === ERROR ? this.emitAsync('error', new Error(this.errorMessage)) : this.emitAsync('end');
      }
    } else if (localhostStatus === targetStatus && localhostStatus === CLOSE) {
      this.emitAsync('_close');
    }
  }

  // 240e:39a:354:8740:e095:6cbc:bb29:7901
  stick(data: Buffer, type?: number) {
    if (this.timeouted && (!type || type === DATA)) {
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
      this.shard.splitData(ConnectionManage.writePaackageType(type || DATA, data))
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
    this.sendSetTimeout();
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

    let cacheArray: any = [];
    let splitArray: any = [];
    this.splitCacheBufferArray.forEach((item: any) => {
      const { data, currentCount, splitCount } = item;
      splitArray.push(item);
      cacheArray.push(data);
      if (splitCount === currentCount) {
        const { type, data: concatBufffer } = ConnectionManage.readPackageType(BufferUtil.concat(...cacheArray));
        if (type === DATA && this.localhostStatus !== CLOSE && !this.timeouted) {
          callback ? callback(concatBufffer) : null;
          this.emitAsync('data', concatBufffer);
        } else if (type !== DATA) {
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
    this.errorMessage = error.message;
    this.statusSync();
  }

  destroy(error?: Error) {
    if (error) {
      this.emitAsync('error', error);
      setTimeout(() => this.localhostStatus !== CLOSE ? this.close() : null);
    } else {
      this.targetStatus = CLOSE;
      this.resetSerial();
      this.statusSync();
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