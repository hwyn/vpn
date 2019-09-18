import { EventEmitter } from '../util/event-emitter';
import { ProxySocket } from '../net-util/proxy-socket';
import { ProxyTcp } from '../net-util/proxy-tcp';
import { uuid } from '../util/tools';
import { BufferUtil } from '../util/buffer-util';
import {
  SERVER_UDP_INITIAL_PORT,
  SERVER_MAX_UDP_SERVER,
  CLIENT_UDP_INITIAL_PORT,
  CLIENT_IP,
  CLIENT_MAX_UDP_SERVER,
} from '../constant';

const CLIENT_HELLO = 1;
const SERVER_HELLO = 2;

export class AgreementUtil extends EventEmitter {
  constructor() {
    super();
  }

  protected header(socketID: string, type: number) {
    const title = BufferUtil.writeGrounUInt([type, socketID.length], [ 8, 16 ]);
    return BufferUtil.concat(title, socketID);
  }

  protected unHeader(buffer: Buffer) {
    const [ type, socketIdLength ] = BufferUtil.readGroupUInt(buffer, [8, 16]);
    const [ title, _body ] = BufferUtil.unConcat(buffer, [24]);
    const [ socketID, body ] = BufferUtil.unConcat(_body, [socketIdLength]);
    return { type, socketID: socketID.toString(), body };
  }

  protected clientHello(socketID: string) {
    const header = this.header(socketID, CLIENT_HELLO);
    const body = BufferUtil.writeGrounUInt([
      CLIENT_UDP_INITIAL_PORT,
      CLIENT_MAX_UDP_SERVER,
      CLIENT_IP.length
    ], [16, 8, 8]);
    return BufferUtil.concat(header, body, CLIENT_IP);
  }

  protected unClientHello(socketID: string, buffer: Buffer) {
    const [ bodyTitle, body ] = BufferUtil.unConcat(buffer, [ 32 ]);
    const [ clientUdpInitialPort, clientMaxUdpServer, ipLength ] = BufferUtil.readGroupUInt(bodyTitle, [16, 8, 8]);
    const clientIp = body.slice(0, ipLength as number).toString();
    this.emitAsync('client-hello', { socketID, clientUdpInitialPort, clientMaxUdpServer, ipLength });
    return { socketID, clientUdpInitialPort, clientMaxUdpServer, clientIp };
  }

  protected serverHello(socketID: string) {
    const header = this.header(socketID, SERVER_HELLO);
    const body = BufferUtil.writeGrounUInt([
      SERVER_UDP_INITIAL_PORT,
      SERVER_MAX_UDP_SERVER,
    ], [16, 8]);
    return BufferUtil.concat(header, body);
  }

  protected unServerHello(socketID: string, buffer: Buffer) {
    const [ serverUdpInitialPort, serverMaxUdpServer ] = BufferUtil.readGroupUInt(buffer, [16, 8]);
    this.emitAsync('server-hello', { socketID, serverUdpInitialPort, serverMaxUdpServer });
    return { socketID, serverUdpInitialPort, serverMaxUdpServer };
  }

  protected unData(buffer: Buffer) {
    const { type, socketID, body } = this.unHeader(buffer);
    switch (type) {
      case CLIENT_HELLO: this.unClientHello(socketID, body); break;
      case SERVER_HELLO: this.unServerHello(socketID, body); break;
    }
  }
}

export class AgreementClientUtil extends AgreementUtil {
  private socketID: string;
  private socket: ProxySocket
  constructor(private ip: string, private port: number, private connectListener: (socket: ProxySocket, clientInfo?: any) => void) {
    super();
    this.createSocketClient();
  }

  private createSocketClient() {
    this.socketID = uuid();
    this.socket = ProxySocket.createSocketClient(this.ip, this.port, true);
    this.socket.on('close', () => {
      this.emitAsync('close');
      setTimeout(() => this.createSocketClient(), 5000);
    });
    this.initEvent();
  }

  private initEvent() {
    const dataEvent = this.unData.bind(this);
    this.socket.on('data', dataEvent);
    this.socket.once('connect', this.connect.bind(this));
    this.once('server-hello', (serverInfo: any) => {
      this.socket.remove('data', dataEvent);
      this.connectListener(this.socket, serverInfo);
    });
  }

  private connect() {
    const clientHelloBuffer = this.clientHello(this.socketID);
    this.emitAsync('connect');
    this.socket.write(clientHelloBuffer);
  }
}

export class AgreementServerUtil extends AgreementUtil {
  private server: ProxyTcp;
  constructor(private port: number, private connectListener: (socket: ProxySocket, clientInfo?: any) => void) {
    super();
    this.server = ProxyTcp.createTcpServer(port, this._connectListener.bind(this), true);
  }

  private initEvent(socket: ProxySocket) {
    const dataEvent = this.unData.bind(this);
    socket.on('data', dataEvent);
    this.once('client-hello', (info: any) => {
      const serverHello = this.serverHello(info.socketID);
      socket.remove('data', dataEvent);
      this.connectListener(socket, info);
      socket.write(serverHello);
    });
  }

  private _connectListener(socket: ProxySocket) {
    this.initEvent(socket);
  }
}