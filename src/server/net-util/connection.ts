import { EventEmitter } from './event-emitter';
import { BufferUtil } from './buffer-util';
import { PACKAGE_MAX_SIZE } from '../constant';

const SERIAL_SIZE = 8;

const DATA = 0;
const END = 1;
const ERROR = 2;
const CLOSE = 3;
const HEARTBEAT = 4;
const TIMEOUT = 5;
const CONFIM = 6;
const MAX_SERIAL = Math.pow(2, 16);


const getLengthSize = (maxSize: number): 8 | 16 | 32 | 64 =>  {
  let size = 1;
  while(Math.pow(2, size) < maxSize) size++;
  return Math.ceil(size / 8) * 8 as any;
}

/**
 * ----------------------------------------
 *  count | countCurrent | data
 * ----------------------------------------
 */
class PackageShard {
  private LENGTH_SIZE: 8 | 16 | 32 | 64;
  constructor(private maxSize: number) { 
    this.LENGTH_SIZE = getLengthSize(this.maxSize);
  }

  private factorySplit(splitCount: number) {
    let currentCount = 1;
    return (data: Buffer): Buffer => {
      const title = BufferUtil.writeGrounUInt([currentCount++, splitCount, data.length], [8, 8, this.LENGTH_SIZE]);
      return BufferUtil.concat(title, data);
    };
  }

  private factoryUnSplit(buffer: Buffer) {
    let remainingBuffer = buffer;
    const titleLength = 8 + 8 + this.LENGTH_SIZE;
    const split = (_buffer: Buffer) => {
      const [ title ] = BufferUtil.unConcat(_buffer, [titleLength]);
      const [ currentCount, splitCount, length ] = BufferUtil.readGroupUInt(title, [8, 8, this.LENGTH_SIZE]) as number[];
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

  private LENGTH_SIZE: 8 | 16 | 32 | 64;
  private _stickSerial: number = 0;
  private _splitSerial: number = 0;
  private stickCacheBufferArray: Buffer[] = [];

  private splitCacheBuffer: Buffer = Buffer.alloc(0);
  private splitMap: Map<number, Buffer> = new Map();
  private splitCacheBufferArray: Buffer[] = [];
  private shard: PackageShard; // 包组合工具
  private titleSize: any; // 包头部长度
  private maxSize: number; // 包最大长度

  private errorMessage: string;
  private localhostStatus: number = DATA; // 本地连接状态
  private targetStatus: number = DATA; // 远程连接状态

  private sendSetTimeout: () => void = this.factorySetTimeout(this.directly.bind(this));

  private timeouted: boolean = false; // 丢包状态
  private maxResendNumber: number = 3;
  private lossTimer: number = 500; // 丢包延迟同步信息时间

  // 重发数据
  private openResend: boolean = false;

  private writeBuffer: { serial: number, data: Buffer }[] = [];
  private sendBufferHandle: Map<number, { status: boolean, timer: number, resend: number, clearResend: any }> = new Map();
  constructor(openResend?: boolean, maxSize?: number) {
    super();
    this.maxSize = maxSize || PACKAGE_MAX_SIZE;
    this.LENGTH_SIZE = getLengthSize(this.maxSize);
    this.titleSize = SERIAL_SIZE + this.LENGTH_SIZE;
    this.openResend = openResend;
    this.shard = new PackageShard(this.maxSize - this.titleSize - 100);
    this.on('_close', () => this.emitAsync('close'));
  }

  /**
   * 延迟执行
   * @param timer 
   * @param callback 
   */
  private factorySetTimeout(callback: () => void, timer?: number | Function) {
    let st: any;
    const timerFn = typeof timer === 'function' ? timer : () => timer;
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
      }, timerFn());
      return _clearTimeout;
    }
  }

  private writeConfim(serial: number) {
    if (this.openResend) {
      this.writeEvent(CONFIM, Buffer.from(serial.toString()));
    }
  }

  private clearSendHandle(confimSerial: number): boolean {
    const resendItem = this.sendBufferHandle.get(confimSerial);
    if (resendItem) {
      resendItem.status = true;
      resendItem.clearResend();
      this.resetResendTimer(new Date().getTime() - resendItem.timer);
    }
    this.sendBufferHandle.delete(confimSerial);

    return this.localhostStatus === CLOSE && this.writeBuffer.length === 0 && this.sendBufferHandle.size === 0;
  }

  private messageConfim(buffer: Buffer) {
    let confimSerial = parseInt(buffer.toString());
    let endStatus = false;
    const length = this.sendBufferHandle.size;
    for (let i = 0; i < length; i++) {
      if (this.sendBufferHandle.has(--confimSerial) && this.clearSendHandle(confimSerial)) {
        console.log(`-------------confim-----close`);
        this._destory();
        endStatus = true;
        break;
      }
    }

    if (!endStatus) {
      this.write();
    }
  }

  /**
   * 发送出去的数据添加标志信息
   * @param stickSerial 序号
   * @param data buffer
   */
  private packing(stickSerial: number, data: Buffer) {
    const serialBuffer = BufferUtil.concat(stickSerial.toString());
    const length = this.titleSize + serialBuffer.length + data.length;
    const titleBuffer = BufferUtil.writeGrounUInt([serialBuffer.length, length], [SERIAL_SIZE, this.LENGTH_SIZE]);
    return BufferUtil.concat(titleBuffer, serialBuffer, data);
  }

  /**
   * 接收到到信息解析标志信息
   * @param buffer Buffer
   */
  private unpacking(buffer: Buffer): { serial: number, packageSize: number, packageBuffer: Buffer, data: Buffer } {
    const title = buffer.slice(0, this.titleSize);
    const [ serialSize, packageSize ] = BufferUtil.readGroupUInt(title, [SERIAL_SIZE, this.LENGTH_SIZE]) as number[];
    const unConcat = BufferUtil.unConcat(buffer, [ this.titleSize, serialSize ]);
    const serial = parseInt(unConcat[1].toString());
    const packageBuffer = buffer.slice(0, packageSize);
    const data = packageBuffer.slice(this.titleSize + serialSize);
    return { serial, packageSize: packageSize, packageBuffer, data };
  }

  private resetResendTimer(betTime: number) {
    // const oldTimer = this.lossTimer;
    if (betTime > this.lossTimer) {
      this.lossTimer = betTime;
    }
    // this.lossTimer = oldTimer > this.lossTimer ? Math.ceil((oldTimer + betTime * 2) / 2);
    // console.log(betTime, this.lossTimer);
  }

  /**
   * 发送事件信息
   * @param eventType 事件类型
   * @param data 数据
   */
  private writeEvent(eventType: number, data: Buffer) {
    this.emitAsync('send', this.packing(-1, ConnectionManage.writePaackageType(eventType, data)));
  }


  private _eventSwitch(buffer: Buffer) {
    const { type, data } = ConnectionManage.readPackageType(buffer);
    switch(type) {
      case CONFIM: this.messageConfim(data); break;
    }
  }

  /**
   * 远程事件类型处理
   * @param type event
   * @param buffer Buffer
   */
  private eventSwitch(type: number, buffer: Buffer) {
    this.targetStatus = [TIMEOUT, HEARTBEAT].includes(type) ? this.targetStatus : type;
    
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
    let sendDate = this.packing(this.stickSerial, data);
    this.writeBuffer.push({serial: this.stickSerial, data: sendDate });
    this.stickSerial++;
    if (this.sendBufferHandle.size < 4) this.write();
  }

  private write() {
    if (this.targetStatus !== CLOSE) {
      if (this.writeBuffer.length === 0) return ;
      const { serial, data } = this.writeBuffer.shift();
      this.emitAsync('send', data);
      this.resend(serial, data);
    } else if (this.localhostStatus === CLOSE) {
      this._destory();
    } else {
      console.log(`------------target:${this.targetStatus}------localhost: ${this.localhostStatus}`);
    }
  }

  private resend(serial: number, data: Buffer) {
    if (!this.openResend) {
      return ;
    }
    let timer = this.lossTimer;
    const sendHandle = this.sendBufferHandle.get(serial);

    if (sendHandle) {
      if (sendHandle.resend >= this.maxResendNumber) {
        this.timeouted = true;
        return this.destroy(new Error('socket timeout'));
      }

      if (sendHandle.status === false) {
        timer = (sendHandle.resend + 1) * timer;
      }
    }
    

    if (!sendHandle || sendHandle.status === false) {
      const resend = this.factorySetTimeout(this.factoryResend.bind(this), timer);
      const clearResend = resend(serial, data);
      this.sendBufferHandle.set(serial, {
        status: sendHandle ? sendHandle.status : false,
        resend: sendHandle ? sendHandle.resend + 1 : 1,
        timer: new Date().getTime(),
        clearResend
      });
    }
  }

  private factoryResend(serial: number, data: Buffer) {
    const item = this.sendBufferHandle.get(serial);
    if (item && item.status === false) {
      console.log(`--------Resend------resend:${item.resend}------serial:${serial}`);
      this.writeBuffer.unshift({ serial, data});
      this.write();
    } else {
      this.sendBufferHandle.delete(serial);
    }
  }

  private splitMerge(buffer: Buffer) {
    let splitBuffer = BufferUtil.concat(this.splitCacheBuffer, buffer);
    const size = SERIAL_SIZE + this.LENGTH_SIZE;
    while (splitBuffer.length > size) {
      const { serial, packageSize, packageBuffer, data } = this.unpacking(splitBuffer);
      if (packageSize > packageBuffer.length) {
        break;
      }
      if (serial === -1) {
        this._eventSwitch(data);
      } else {
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
    if (!isTargetChange) {
      let buffer = localhostStatus === ERROR ? Buffer.from(this.errorMessage) : Buffer.alloc(0);
      this.stick(buffer, localhostStatus);
    }
    // if (isTargetChange) {
    //   console.log(`-------targetChange----target:${this.targetStatus}------localhost:${this.localhostStatus}`);
    // } else {
    //   console.log(`-------localhostChange----target:${this.targetStatus}------localhost:${this.localhostStatus}`);
    // }
    // 状态不一致
    if (isTargetChange && localhostStatus === DATA) {
      if (targetStatus === ERROR) {
        this.emitAsync('error', new Error(this.errorMessage));
      } else if (targetStatus === END) {
        this.emitAsync('end');
      }
    }
  }

  // 240e:39a:354:8740:e095:6cbc:bb29:7901
  stick(data: Buffer, type?: number) {
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
      return this.destroy(new Error('This socket has been ended by the other party'));
    }

    let startSerial = this.splitSerial;
    this.splitMerge(buffer);
    while(this.splitMap.has(this.splitSerial)) {
      this.splitCacheBufferArray = [].concat(
        this.splitCacheBufferArray, 
        this.shard.unSplitData(this.splitMap.get(this.splitSerial))
      );
      this.splitMap.delete(this.splitSerial);
      this.splitSerial++;
    }

    if (this.splitSerial !== startSerial) this.writeConfim(this.splitSerial);

    let cacheArray: any = [];
    let splitArray: any = [];
    this.splitCacheBufferArray.forEach((item: any) => {
      const { data, currentCount, splitCount } = item;
      splitArray.push(item);
      cacheArray.push(data);
      if (splitCount === currentCount) {
        const { type, data: concatBufffer } = ConnectionManage.readPackageType(BufferUtil.concat(...cacheArray));
        if (type === DATA && this.localhostStatus !== CLOSE) {
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
    if (this.localhostStatus !== CLOSE) {
      this.localhostStatus = END;
      this.statusSync();
    }
  }

  close() {
    this.localhostStatus = CLOSE;
    this.statusSync();
  }

  error(error: Error) {
    if (this.localhostStatus !== CLOSE) {
      this.localhostStatus = ERROR;
      this.errorMessage = error.message;
      this.statusSync();
    }
  }

  destroy(error?: Error) {
    if (error) {
      this.emitAsync('error', error);
    } else {
      this.stick(Buffer.alloc(0), END);
      this.stick(Buffer.alloc(0), CLOSE);
      this.emitAsync('end');
    }
    if (this.timeouted) {
      this.targetStatus = CLOSE;
      if (this.localhostStatus !== CLOSE) {
        this.close();
      }
      this.localhostStatus = CLOSE;
      this._destory();
    }
  }

  private _destory() {
    this.writeBuffer.forEach((item) => item.data = Buffer.alloc(0));
    this.writeBuffer.splice(0, this.writeBuffer.length);
    this.sendBufferHandle.forEach((item) => item.clearResend());
    this.sendBufferHandle.clear();
    this.splitMap.clear();
    this.emitAsync('_close');
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