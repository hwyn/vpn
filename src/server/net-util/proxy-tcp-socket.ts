import { createConnection, Socket } from 'net';
import { ProxyEventEmitter } from './proxy-event-emitter';
import { Handler } from './event-emitter';
import { ConnectionManage } from './connection';

export class ProxyTcpSocket extends ProxyEventEmitter {
  static pipeFns: string[] = ['destroy', 'address', 'close'];
  static interceptEvents: string[] = ['data', 'end', 'error', 'close', 'timeout', 'connect'];
  static createSocketClient = (host: string, port: number, openPackage?: boolean): ProxyTcpSocket => {
    return new ProxyTcpSocket(createConnection({ host, port }), openPackage);
  };
  public ended: boolean = false;
  private waitingWriteList: Buffer[] = [];
  private connecting: boolean = true;
  private manage: ConnectionManage;
  [x: string]: any;

  constructor(public socket: Socket, private openPackage?: boolean) {
    super(socket, ProxyTcpSocket.pipeFns);
    this.onInit();
    this.associatedListener(['data']);
    this.associatedListener(['end', 'close', 'connect'], true);
    this.mappingAttr(['localAddress', 'localPort', 'destroyed']);
    if (openPackage) {
      this.manage = new ConnectionManage();
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
      if (this.openPackage) this.manage.destroy(error);
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

  pipe(proxySocket: ProxyTcpSocket | Socket) {
    if (proxySocket instanceof ProxyTcpSocket) {
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
