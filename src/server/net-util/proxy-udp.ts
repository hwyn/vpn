/**
 * Created by NX on 2019/8/25.
 */
import { proxyProcess } from './proxy-process';
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
      this.emitAsync('data', msg);
    });
    
    this.on('error', (error: Error) => {
      this.udpServer.close();
    });
  }

  listen(port: number) {
    this.udpServer.bind(port);
    this.udpServer.on('listening', () => { 
      // console.info(`udp listening port ${port}`);
    });
  }
}
