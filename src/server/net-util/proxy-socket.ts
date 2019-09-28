import { createConnection, Socket } from 'net';
import { ProxyEventEmitter } from './proxy-event-emitter';
import { Handler } from '../util/event-emitter';
import { PackageManage } from '../agreement/package-manage';

export class ProxySocket extends ProxyEventEmitter {
  static pipeFns: string[] = ['destroy', 'address', 'close'];
  static interceptEvents: string[] = ['data', 'end', 'error', 'close', 'connect'];
  static createSocketClient = (host: string, port: number, openPackage?: boolean): ProxySocket => {
    return new ProxySocket(createConnection({ host, port }), openPackage);
  };
  public ended: boolean = false;
  private waitingWriteList: Buffer[] = [];
  private connecting: boolean = true;
  private manage: PackageManage;
  [x: string]: any;

  constructor(public socket: Socket, private openPackage?: boolean) {
    super(socket, ProxySocket.pipeFns);
    this.onInit();
    this.associatedListener(['data']);
    this.associatedListener(['end', 'close', 'connect'], true);
    this.mappingAttr(['localAddress', 'localPort']);
    if (openPackage) {
      this.manage = new PackageManage();
      this.manage.on('send', this._write.bind(this));
      this.manage.on('timeout', () => this.end());
    }
  }

  private onInit() {
    this.on('close', () => this.ended = true);
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
      this.on('data', (data: Buffer, next: Handler) => this.manage.split(data, (_data: Buffer) => next(_data)));
    }
  }

  private _write(buffer: Buffer) {
    if (this.ended) {
      return ;
    }
    if (!this.socket.connecting) {
      this.socket.write(buffer);
    } else {
      this.waitingWriteList.push(buffer);
    }
  }

  pipe(proxySocket: ProxySocket | Socket) {
    if (proxySocket instanceof ProxySocket) {
      this.socket.pipe(proxySocket.socket);
    } else {
      this.socket.pipe(proxySocket);
    }
  }

  write(buffer: Buffer) {
    this.openPackage ? this.manage.stick(buffer) : this._write(buffer);
  }

  end() {
    if (!this.ended) {
      this.socket.end();
    }
    this.ended = true;
  }
}
