/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpServer, createUdpServer  } from './net-util/proxy-udp';
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxySocket } from './net-util';
import { PackageUtil, Handler } from './util';

export abstract class ProxyBasic {
  protected socketMap: Map<string, ProxySocket> =  new Map();
  protected udpServerList: ProxyUdpServer[] = [];
  protected udpClientList: ProxyUdpSocket[] = [];
  protected addressList: { port: number, host: string }[] = [];
  private _cursor: number = 0;
  constructor(private serverName: string) { }

  protected createUdpServer(initialPort: number, maxListenNumber: number) {
    this.udpServerList = new Array(maxListenNumber).fill(initialPort).map((item: number, index: number) => {
      const udpServer = createUdpServer(item + index);
      udpServer.on('data', this.udpMessage.bind(this));
      return udpServer;
    });
    return this.udpServerList;
  }

  protected createUdpClient(host: string, initialPort: number, maxClientNumber: number) {
    this.udpClientList = new Array(maxClientNumber).fill(initialPort).map((item: number, index: number) => {
      return createSocketClient(host, item + index);
    });
    return this.udpClientList;
  }

  private write(buffer: Buffer, clientCursor: number, uid?: string) {
    const { cursor, data } = PackageUtil.packageSigout(buffer);
    if (this.serverName === 'en') {
      console.log(`-server length: ${data.length}  cursor: ${cursor} uid: ${uid}--`);
    }
    this.udpClientList[clientCursor].write(buffer, uid);
  }

  protected send = (uid: string) => (data: Buffer | Buffer[]) => {
    data.forEach((buffer: any) => {
      this.write(buffer, this.getCursor(), uid);
    });
  };

  protected abstract udpMessage(data: Buffer, next?: Handler): void;

  getCursor() {
    this._cursor++;
    if (this._cursor >= this.udpClientList.length) {
      this._cursor = 0;
    }
    return this._cursor;
  }
}
