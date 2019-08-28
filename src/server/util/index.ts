import {unescape} from "querystring";
export const hasOwnProperty = (object: any, name: string) => Object.prototype.hasOwnProperty.call(object, name);
export const type = (object: any) => Object.prototype.toString.call(object).replace(/^\[object ([\S]+)\]$/, '$1');
export const isType = (typeName: string) => (object: any) => type(object) === typeName;
export const isObject = isType('Object');
export const isFunction = isType('Function');
export const isArray = isType('Array');
export const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random()*16|0;
    const v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

export type Handler = (...arg: any[]) => void;

export class EventEmitter {
  protected events:  {[key: string]: any[]} = {};
  constructor() { }

  on(key: string, handler: Handler) {
    if (!isFunction(handler)) {
      throw new Error('handler Must function');
    }
    if (!hasOwnProperty(this.events, key)) {
      this.events[key] = [];
    }
    this.events[key].push(handler);
  }

  pipe(...arg: any[]) {
    const key = arg[0];
    const handlers = arg.slice(1);
    handlers.forEach((handler: Handler) => this.on(key, handler));
  }

  emitSync(...arg: any[]): any {
    const key = arg[0];
    let endResult: any = arg[1];
    if (!hasOwnProperty(this.events, key)) {
      return endResult;
    }

    const handler = [...this.events[key]].reverse().reduce((first: Handler, handler: Handler) =>
      (...arg: any[]) => handler(...arg, first) , (data: any) => { endResult = data || endResult });

    arg[1] = arg[1] || void(0);
    handler(...arg.slice(1));
    return endResult;
  }

  emitAsync(...arg: any[]): Promise<any> {
    const key = arg[0];
    if (!hasOwnProperty(this.events, key)) {
      return Promise.resolve(null);
    }
    arg[1] = arg[1] || void(0);
    this.events[key].forEach((handler: Handler) => handler(...arg.slice(1)));
  }
}

export class BufferUtil {
  /**
   * 读取buffer
   * @param buffer
   * @returns {any}
   */
  static readByte(buffer: Buffer) {
    const bufferUtil = new BufferUtil(buffer);
    return bufferUtil.readByte.bind(bufferUtil);
  }

  /**
   * 写入buffer
   * @param buffer
   * @returns {any}
   */
  static writeByte = (buffer: Buffer) => {
    const bufferUtil = new BufferUtil(buffer);
    return bufferUtil.write.bind(bufferUtil);
  };

  private writeCursor: number = 0;
  private readCursor: number = 0;
  private encoding: BufferEncoding = 'utf-8';
  constructor(private buffer: Buffer, encoding?: BufferEncoding) {
    this.encoding = encoding || this.encoding;
  }

  private writeByte(buffer: string | Buffer | any[]) {
    const strBuffer = buffer instanceof Buffer ? buffer : Buffer.from(buffer as string, this.encoding);
    const minByteLength = strBuffer.length + this.writeCursor;
    if (this.buffer.length < minByteLength) {
      this.buffer = Buffer.concat([this.buffer.slice(0, this.writeCursor), strBuffer], minByteLength);
    } else {
      if (strBuffer.length !== 0) {
        this.buffer.write(strBuffer.toString(this.encoding), this.writeCursor, strBuffer.length);
      }
    }
    this.writeCursor = minByteLength;
  }

  private writeByteArray(list: (string | Buffer)[]) {
    list.forEach((itemBuffer) => this.writeByte(itemBuffer));
  }

  /**
   * 写入缓存
   * @param list
   * @param offset
   * @returns {Buffer}
   */
  write(list: (string | Buffer)[], offset?: number): Buffer {
    this.writeCursor = offset || this.writeCursor;
    if(isArray(list)) {
      this.writeByteArray(list);
    } else {
      this.writeByte(list);
    }
    return this.buffer;
  }

  /**
   * 读取缓存
   * @param byteLength
   * @param offset
   * @returns {Buffer}
   */
  readByte(byteLength: number, offset?: number): Buffer {
    const readCursor = offset || this.readCursor;
    this.readCursor = readCursor + byteLength;
    return this.buffer.slice(readCursor, this.readCursor);
  }
}
