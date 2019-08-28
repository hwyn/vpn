/**
 * Created by NX on 2019/8/24.
 */
import { EventEmitter} from './event-emitter';
import { BufferUtil } from './buffer-util';
import { PACKAGE_MAX_SIZE } from '../constant';

export const globTitleSize: number = 80;

export class PackageUtil {
  static CURSOR_SIZE: number = 16;
  static UID_BYTE_SIZE: number = 8;
  static TYPE_BYTE_SIZE: number = 8;
  static PACKAGE_SIZE: number = 32;

  static bindUid(uid: string, buffer: Buffer) {
    const title = BufferUtil.writeGrounUInt([uid.length], [8]);
    return BufferUtil.concat(title, uid, buffer);
  }

  static getUid(buffer: Buffer): { uid: string, buffer: Buffer} {
    const size = PackageUtil.UID_BYTE_SIZE;
    const titleSize = size + buffer.readUInt8(0);
    const uid = buffer.slice(size, titleSize).toString('utf-8');
    const packageBuf = buffer.slice(titleSize);
    return { uid, buffer: packageBuf };
  }

  static packing(type: number, uid: string, buffer: Buffer): Buffer {
    const title = BufferUtil.writeGrounUInt([0, type, uid.length], [32, 8, 8]);
    const _package = BufferUtil.concat(title, uid, buffer);
    _package.writeUInt32BE(_package.length, 0);
    return _package;
  }

  static unpacking(buffer: Buffer): { type: number, uid: string, buffer: Buffer, packageSize: number } {
    const size = PackageUtil.TYPE_BYTE_SIZE + PackageUtil.UID_BYTE_SIZE + PackageUtil.PACKAGE_SIZE;
    const packageSize = buffer.readUInt32BE(0);
    const type = buffer.readUInt8(4);
    const title_size = size + buffer.readUInt8(5);
    const uid = buffer.slice(size, title_size).toString('utf-8');
    const _buffer = buffer.slice(title_size);
    return { type, uid, buffer: _buffer, packageSize: packageSize };
  }


  static packageSign(uid: string, cursor: number, buffer: Buffer) {
    const size = PackageUtil.UID_BYTE_SIZE + PackageUtil.CURSOR_SIZE;
    const title = Buffer.alloc(size);
    const _uid = Buffer.from(uid, 'utf-8');
    title.writeUInt8(_uid.length, 0);
    title.writeUInt16BE(cursor, 1);
    return BufferUtil.concat(title, _uid, buffer);
  }

  static packageSigout(buffer: Buffer): { uid: string, cursor: number, data: Buffer} {
    const size = PackageUtil.UID_BYTE_SIZE + PackageUtil.CURSOR_SIZE;
    const title_size = size + buffer.readUInt8(0);
    const uid = buffer.slice(size, title_size).toString('utf-8');
    const cursor = buffer.readUInt16BE(1);
    const _buffer = buffer.slice(title_size);
    return { uid, cursor, data: _buffer };
  }

  static eventPackage(type: number) {
    const title = Buffer.alloc(PackageUtil.TYPE_BYTE_SIZE);
    title.writeUInt8(type, 0);
    return title;
  }

  static unEventPackage(buffer: Buffer) {
    return buffer.readUInt8(0);
  }

  static isEventPackage(buffer: Buffer): boolean {
    return PackageUtil.TYPE_BYTE_SIZE === buffer.length;
  }
}

export class PackageSeparation extends EventEmitter {
  private mergeCursor: number = 0;
  private mergeCache: Buffer = Buffer.alloc(0);
  private splitCursor: number = 0;
  private splitCache: Buffer = Buffer.alloc(0);
  private splitList: Map<number, Buffer> = new Map();
  private splitPageSize: number;
  private lossPacketCount: number;
  private maxPackageCount: number;
  // private buffer

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
    const size = PackageUtil.TYPE_BYTE_SIZE + PackageUtil.UID_BYTE_SIZE + PackageUtil.PACKAGE_SIZE;
    const type = isEvent ? PackageUtil.unEventPackage(data) : void(0);
    splitList.set(cursor, !isEvent ? data : this.packing(type, uid, Buffer.alloc(0)));
    while (splitList.has(this.splitCursor)) {
      const splitCache = this.splitCache;
      const packageBuffer = splitList.get(this.splitCursor);
      this.splitCache = Buffer.concat([splitCache, packageBuffer], splitCache.length + packageBuffer.length);

      if (!this.splitPageSize && this.splitCache.length >= size) {
        this.splitPageSize = this.unpacking(this.splitCache).packageSize;
      }
      while (this.splitPageSize && this.splitPageSize <= this.splitCache.length) {
        const packageData = this.splitCache.slice(0, this.splitPageSize);
        const { uid, type: packageType, buffer } = this.unpacking(packageData);
        this.splitCache = this.splitCache.slice(this.splitPageSize);
        this.emitSync('separation', {  uid, type: packageType, data: buffer });
        this.splitPageSize = void(0);
        if (this.splitCache.length >= size) {
          this.splitPageSize = this.unpacking(this.splitCache).packageSize;
        }
      }
      this.splitList.delete(this.splitCursor);
      this.splitCursor++;
    }
    this.printLoseInfo(uid, cursor, type);
  }

  send(uid: string, buffer: Buffer | Buffer[], isEvent?: boolean) {
    const bufferList = (Array.isArray(buffer) ? buffer : [buffer]).filter(_buffer => _buffer.length !== 0).map((_buffer) => {
      const sendPackage = PackageUtil.packageSign(uid, this.mergeCursor, _buffer);
      this.mergeCursor++;
      return sendPackage;
    });
    if (bufferList.length) {
      isEvent ? this.emitAsync('event', bufferList) : this.emitSync('send', bufferList);
    }
  }

  sendEventPackage(uid: string, type: number) {
    this.immediatelySend(uid);
    this.send(uid, PackageUtil.eventPackage(type), true);
    this.mergeCache = Buffer.alloc(0);
  }

  printLoseInfo(uid: string, cursor: number, type?: number) {
    if (type === 4 || this.maxPackageCount) {
      if (type === 4) {
        this.maxPackageCount = cursor;
        this.lossPacketCount =  this.maxPackageCount - this.splitCursor - this.splitList.size + 1;
      } else {
        this.lossPacketCount--;
      }
    }

    if (this.maxPackageCount && this.splitCursor  !== this.maxPackageCount) {
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
