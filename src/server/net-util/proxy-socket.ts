import { createConnection, Socket } from 'net';
import { PackageUtil } from '../util/package-separation';
import { ProxyEventEmitter } from './proxy-event-emitter';
import { Handler } from '../util/event-emitter';
import { COMMUNICATION_EVENT } from '../constant';
import { uuid } from '../util/tools';
import { BufferUtil } from '../util/buffer-util';

const { DATA } = COMMUNICATION_EVENT;

export class ProxySocket extends ProxyEventEmitter {
  static pipeFns: string[] = ['destroy', 'address', 'close'];
  static interceptEvents: string[] = ['data', 'end', 'error', 'close', 'connect'];
  static createSocketClient = (host: string, port: number, openPackage?: boolean): ProxySocket => {
    return new ProxySocket(createConnection({ host, port }), openPackage);
  };
  public ended: boolean = false;
  private socketEmit: (event: string, data: Buffer) => void;
  private waitingWriteList: Buffer[] = [];
  private uid: string = uuid();
  private connecting: boolean = true;
  private cacheBuffer: Buffer = Buffer.alloc(0);
  [x: string]: any;

  constructor(public socket: Socket, private openPackage?: boolean) {
    super(socket, ProxySocket.pipeFns);
    this.onInit();
    this.associatedListener(['data']);
    this.associatedListener(['end', 'close', 'connect'], true);
    this.socketEmit = this.socket.emit;
    Object.defineProperty(this.socket, 'emit', {
      get: () => (...arg: any[]) => this.proxyEmit.apply(this, arg)
    });
  }

  private onInit() {
    this.on('connect', () => {
      this.connecting = false;
      this.waitingWriteList.forEach((buffer: Buffer) => this.write(buffer));
      this.waitingWriteList = [];
    });
    this.socket.on('error', (error: Error) => {
      this.ended = true;
      if (this.connecting) {
        this.emitAsync('connect-error', error);
      }
      this.emitAsync('error', error);
    });
    if (this.openPackage) {
      this.on('data', (data: Buffer, next: Handler) => this.dilutePackage(data, next));
    }
    this.on('close', () => this.ended = true);
  }

  private proxyEmit(event: string, data: Buffer) {
    if (ProxySocket.interceptEvents.includes(event)) {
      this.socketEmit.call(this.socket, event, data);
    } else {
      this.socketEmit.call(this.socket, event, data);
    }
  }

  private dilutePackage(data: Buffer, next: Handler) {
    let cacheBuffer = BufferUtil.concat(this.cacheBuffer, data);
    const size = PackageUtil.TYPE_BYTE_SIZE + PackageUtil.UID_BYTE_SIZE + PackageUtil.PACKAGE_SIZE;
    while (size < cacheBuffer.length) {
      const { packageSize } = PackageUtil.unpacking(cacheBuffer);
      if (packageSize > cacheBuffer.length) {
        break;
      }
      next(PackageUtil.unpacking(cacheBuffer.slice(0, packageSize as number)).buffer);
      cacheBuffer = cacheBuffer.slice(packageSize as number);
    }
    this.cacheBuffer = cacheBuffer;
  }

  pipe(proxySocket: ProxySocket | Socket) {
    if (proxySocket instanceof ProxySocket) {
      this.socket.pipe(proxySocket.socket);
    } else {
      this.socket.pipe(proxySocket);
    }
  }

  write(buffer: Buffer) {
    if (this.ended) {
      return ;
    }
    if (!this.socket.connecting) {
      this.socket.write(this.openPackage ? PackageUtil.packing(DATA, this.uid, buffer) : buffer);
    } else {
      this.waitingWriteList.push(buffer);
    }
  }

  end() {
    if (!this.ended) {
      this.socket.end();
    }
    this.ended = true;
  }
}
