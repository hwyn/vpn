/**
 * Created by NX on 2019/8/25.
 */
import { Socket, createSocket, RemoteInfo } from 'dgram';
import {ProxyEventEmitter} from "./proxy-event-emitter";

export const createUdpServer = (port: number): ProxyUdpServer => new ProxyUdpServer(port);

export class ProxyUdpServer extends ProxyEventEmitter {
  private udpServer: Socket = this.source;
  
  constructor(public port: number) {
    super(createSocket('udp4'), ['close']);
    this.onInit();
    this.listen(this.port);
    this.associatedListener(['error'], true);
  }
  private onInit() {
    this.udpServer.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
      this.emitAsync('data', msg, rinfo);
    });
    
    this.on('error', () => {
      this.udpServer.close();
    });
  }

  write(message: Buffer, port: number, address: string) {
    this.udpServer.send(message, port, address);
  }

  listen(port: number) {
    this.udpServer.bind(port);
    this.udpServer.on('listening', () => this.emitAsync('listening'));
  }
}
