/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpServer, createUdpServer  } from './net-util/proxy-udp';
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxySocket } from './net-util';
import { PackageUtil } from './util/package-separation';

export class ProxyBasic {
  protected socketMap: Map<string, ProxySocket> =  new Map();
  protected udpServerList: ProxyUdpServer[] = [];
  protected udpClientList: ProxyUdpSocket[] = [];
  protected addressList: { port: number, host: string }[] = [];
  private _cursor: number = 0;
  private count: number = 0;
  constructor(private serverName: string) { }

  protected createUdpSocket(listeningPort: number, connectPort: number, count: number) {
    new Array(count).fill(listeningPort).map((item: number, index: number) => {
      this.udpServerList.push(createUdpServer(item + index));
      this.udpClientList.push(createSocketClient('127.0.0.1', connectPort + index));
      this.addressList.push({ port: connectPort + index, host: '127.0.0.1' });
    });
  }

  private write(buffer: Buffer, clientCursor: number, uid?: string) {
    const { cursor, data } = PackageUtil.packageSigout(buffer);
    if (this.serverName === 'en') {
      console.log(`---server length: ${data.length}  cursor: ${cursor} uid: ${uid}---`);
    }
    this.udpClientList[clientCursor].write(buffer, uid);
  }

  protected send = (uid: string) => (data: Buffer | Buffer[]) => {
    data.forEach((buffer: any) => {
      this.write(buffer, this.getCursor(), uid);
    });
  };

  getCursor() {
    this._cursor++;
    if (this._cursor >= this.udpClientList.length) {
      this._cursor = 0;
    }
    return this._cursor;
  }
}
