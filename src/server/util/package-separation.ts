/**
 * Created by NX on 2019/8/24.
 */
import { EventEmitter, Handler} from './event-emitter';
import { BufferUtil } from './buffer-util';
import { PACKAGE_MAX_SIZE , COMMUNICATION_EVENT  } from '../constant';

const { END, CLOSE, ERROR } = COMMUNICATION_EVENT;

export const globTitleSize: number = 80;

export class PackageUtil {
  static PORT_BYTE_SIZE: 16 = 16;
  static UID_BYTE_SIZE: 8 = 8;
  static TYPE_BYTE_SIZE: 8 = 8;
  static CURSOR_SIZE: 32 = 32;
  static PACKAGE_SIZE: 32 = 32;

  static bindUid(uid: string, buffer: Buffer) {
    const { UID_BYTE_SIZE } = PackageUtil;
    const title = BufferUtil.writeGrounUInt([uid.length], [UID_BYTE_SIZE]);
    return BufferUtil.concat(title, uid, buffer);
  }

  static getUid(buffer: Buffer): { uid: string, buffer: Buffer} {
    const { UID_BYTE_SIZE } = PackageUtil;
    const [uidLength] = BufferUtil.readGroupUInt(buffer, [UID_BYTE_SIZE]);
    const [ uid, packageBuf ] = BufferUtil.unConcat(buffer, [uidLength], UID_BYTE_SIZE);
    return { uid: uid.toString(), buffer: packageBuf };
  }

  static bindPort(port: number, buffer: Buffer): Buffer {
    const { PORT_BYTE_SIZE } = PackageUtil;
    return BufferUtil.concat(BufferUtil.writeGrounUInt([port], [PORT_BYTE_SIZE]), buffer);
  }

  static getPort(buffer: Buffer): { port: number, buffer: Buffer} {
    const { PORT_BYTE_SIZE } = PackageUtil;
    const [ portBuffer, data ] = BufferUtil.unConcat(buffer, [PORT_BYTE_SIZE]);
    return {
      port: portBuffer.readUInt16BE(0),
      buffer: data
    };
  }

  static packing(type: number, uid: string, buffer: Buffer): Buffer {
    const { UID_BYTE_SIZE, TYPE_BYTE_SIZE, PACKAGE_SIZE } = PackageUtil;
    const title = BufferUtil.writeGrounUInt([0, type, uid.length], [PACKAGE_SIZE, TYPE_BYTE_SIZE, UID_BYTE_SIZE]);
    const _package = BufferUtil.concat(title, uid, buffer);
    _package.writeUInt32BE(_package.length, 0);
    return _package;
  }

  static unpacking(buffer: Buffer): { type: number | bigint, uid: string, buffer: Buffer, packageSize: number | bigint } {
    const { TYPE_BYTE_SIZE, UID_BYTE_SIZE, PACKAGE_SIZE } = PackageUtil;
    const size = TYPE_BYTE_SIZE + UID_BYTE_SIZE + PACKAGE_SIZE;
    const [ packageSize, type, uidSize ] = BufferUtil.readGroupUInt(buffer, [PACKAGE_SIZE, TYPE_BYTE_SIZE, UID_BYTE_SIZE]);
    const [ uid, _buffer ] = BufferUtil.unConcat(buffer, [ uidSize ], size);
    return { type, uid: uid.toString(), buffer: _buffer, packageSize };
  }


  static packageSign(uid: string, cursor: number, buffer: Buffer) {
    const { UID_BYTE_SIZE, CURSOR_SIZE } = PackageUtil;
    const title = BufferUtil.writeGrounUInt([uid.length, cursor], [UID_BYTE_SIZE, CURSOR_SIZE]);
    return BufferUtil.concat(title, uid, buffer);
  }

  static packageSigout(buffer: Buffer): { uid: string, cursor: number | bigint, data: Buffer} {
    const { UID_BYTE_SIZE, CURSOR_SIZE } = PackageUtil;
    const size = UID_BYTE_SIZE + CURSOR_SIZE;
    const [ uidLength, cursor ] = BufferUtil.readGroupUInt(buffer, [UID_BYTE_SIZE, CURSOR_SIZE]);
    const [ uid, _buffer ] = BufferUtil.unConcat(buffer, [uidLength], size);

    return { uid: uid.toString(), cursor, data: _buffer };
  }

  static eventPackage(type: number) {
    return BufferUtil.writeGrounUInt([type], [PackageUtil.TYPE_BYTE_SIZE]);
  }

  static unEventPackage(buffer: Buffer) {
    return buffer.readUInt8(0);
  }

  static isEventPackage(buffer: Buffer): boolean {
    return PackageUtil.TYPE_BYTE_SIZE === buffer.length;
  }
}

export class PackageSeparation extends EventEmitter {
  private timeout: number = 1000;
  private clearTimeout: () => void | null;
  private mergeCursor: number = 0;
  private mergeCache: Buffer = Buffer.alloc(0);
  private splitCursor: number = 0;
  private splitCache: Buffer = Buffer.alloc(0);
  private splitList: Map<number | bigint, Buffer> = new Map();
  private splitPageSize: number;
  private lossPacketCount: number;
  private maxPackageCount: number;
  // private buffer

  private factoryTimout(uid?: string) {
    let si = setTimeout(() => {
      console.log(`-------------------------timeout ${uid}--------------------------`);
      this.emitAsync('timeout');
    }, this.timeout);
    this.clearTimeout = () => {
      clearTimeout(si);
      this.clearTimeout = null;
    }
  }

  on(key: string, handler: Handler) {
    return super.on(key, handler);
  }

  packing(type: number, uid: string, buffer: Buffer) {
    return PackageUtil.packing(type, uid, buffer);
  }

  unpacking(buffer: Buffer) {
    return PackageUtil.unpacking(buffer);
  }

  mergePackage(type: number, uid: string, buffer: Buffer) {
    const mergeCache = this.mergeCache;
    const packageBuffer = this.packing(type, uid, buffer);
    this.mergeCache = Buffer.concat([mergeCache, packageBuffer], mergeCache.length + packageBuffer.length);
    const mergeList: Buffer[] = [];
    while (this.mergeCache.length > PACKAGE_MAX_SIZE) {
      const sendBuffer = this.mergeCache.slice(0, PACKAGE_MAX_SIZE);
      this.mergeCache = this.mergeCache.slice(PACKAGE_MAX_SIZE);
      mergeList.push(sendBuffer);
    }
    
    mergeList.length !== 0 ?this.send(uid, mergeList) : null;
    return packageBuffer;
  }

  splitPackage(buffer: Buffer) {
    const { cursor, data, uid } =  PackageUtil.packageSigout(buffer);
    const isEvent = PackageUtil.isEventPackage(data);
    const splitList = this.splitList;
    if (splitList.get(cursor)) return;

    const size = PackageUtil.TYPE_BYTE_SIZE + PackageUtil.UID_BYTE_SIZE + PackageUtil.PACKAGE_SIZE;
    const type = isEvent ? PackageUtil.unEventPackage(data) : void(0);
    splitList.set(cursor, !isEvent ? data : this.packing(type, uid, Buffer.alloc(0)));

    while (splitList.has(this.splitCursor)) {
      const splitCache = this.splitCache;
      const packageBuffer = splitList.get(this.splitCursor);
      this.splitCache = Buffer.concat([splitCache, packageBuffer], splitCache.length + packageBuffer.length);

      if (!this.splitPageSize && this.splitCache.length >= size) {
        this.splitPageSize = this.unpacking(this.splitCache).packageSize as number;
      }
      while (this.splitPageSize && this.splitPageSize <= this.splitCache.length) {
        const packageData = this.splitCache.slice(0, this.splitPageSize);
        const { uid, type: eventType, buffer } = this.unpacking(packageData);
        this.splitCache = this.splitCache.slice(this.splitPageSize);
        this.splitPageSize = void(0);
        if (this.splitCache.length >= size) {
          this.splitPageSize = this.unpacking(this.splitCache).packageSize as number;
        }
        this.separation({ uid, type: eventType, data: buffer });
      }
      this.splitList.delete(this.splitCursor);
      this.splitCursor++;
    }
    
    if (cursor > this.splitCursor) {
      !this.clearTimeout && this.factoryTimout(uid);
    } else {
      this.clearTimeout && this.clearTimeout();
    }

    this.printLoseInfo(uid, cursor as number, type);
  }

  send(uid: string, buffer: Buffer | Buffer[], isEvent?: boolean) {
    const bufferList = (Array.isArray(buffer) ? buffer : [buffer]).filter(_buffer => _buffer.length !== 0).map((_buffer) => {
      const sendPackage = PackageUtil.packageSign(uid, this.mergeCursor, _buffer);
      this.mergeCursor++;
      return sendPackage;
    });
    if (bufferList.length) {
      isEvent ? this.emitAsync('sendEvent', bufferList) : this.emitSync('sendData', bufferList);
    }
  }

  separation({ uid, type, data}: any) {
    const isEvent = Object.keys(COMMUNICATION_EVENT)
      .filter((key: string) => !['DATA', 'LINK'].includes(key))
      .some((key: string) => COMMUNICATION_EVENT[key] === type);
    if (isEvent) {
      this.emitAsync('receiveEvent', { uid, type, data });
    } else {
      this.emitSync('receiveData', { uid, type, data });
    }
  }

  sendEventPackage(uid: string, type: number) {
    this.immediatelySend(uid);
    this.send(uid, PackageUtil.eventPackage(type), true);
    this.mergeCache = Buffer.alloc(0);
  }

  printLoseInfo(uid: string, cursor: number, type?: number) {
    if ([END, CLOSE, ERROR].includes(type) || this.maxPackageCount) {
      if ([END, CLOSE, ERROR].includes(type)) {
        this.maxPackageCount = cursor;
        this.lossPacketCount =  this.maxPackageCount - this.splitCursor - this.splitList.size + 1;
      } else {
        this.lossPacketCount--;
      }
    }

    if (this.maxPackageCount && this.splitCursor  !== this.maxPackageCount && [CLOSE, ERROR].includes(type)) {
      console.log(`----------------${uid}-----------------`);
      console.log('maxPackageCount:', cursor);
      console.log('receivePackage:', this.maxPackageCount - this.lossPacketCount);
      console.log('losePackage:', this.lossPacketCount);
      console.log('waitingPackage:', this.maxPackageCount >= this.splitCursor);
    }
  }

  immediatelySend(uid: string) {
    this.send(uid, this.mergeCache);
    this.mergeCache = Buffer.alloc(0);
  }
}
