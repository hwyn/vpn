/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpServer  } from './net-util/proxy-udp';
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxySocket, proxyProcess } from './net-util';
import { PackageUtil, EventCommunication } from './util';
import { UdpServerBasic } from './udp-server-basic';

export abstract class ProxyBasic extends UdpServerBasic {
  protected eventCommunication: EventCommunication;
  protected socketMap: Map<string, ProxySocket> =  new Map();
  protected udpServerList: ProxyUdpServer[] = [];
  protected udpClientList: ProxyUdpSocket[] = [];
  protected addressList: { port: number, host: string }[] = [];
  private _cursor: number = 0;
  constructor(protected socketID: string, private serverName: string) {
    super();
  }


  /**
   * 没有检测到存在当前uid的连接
   * @param uid 
   */
  public notExistUid(uid: string, buffer: Buffer) {
    const data = PackageUtil.packageSigout(buffer).data;
    if (!PackageUtil.isEventPackage(data) && this.eventCommunication) {
      this.eventCommunication.createStopResponse(this.socketID, uid);
    }
  }

  /**
   * 停止当前连接
   */
  public stopClient(uid: string) {
    const clientTcp = this.socketMap.get(uid);
    console.log(`-------stop-------${uid}------`);
    if (clientTcp) {
      clientTcp.end();
    }
  }

  /**
   * 初始化tcp 事件通信
   * @param eventCommunication 
   */
  protected initEventCommunication(eventCommunication: EventCommunication) {
    this.eventCommunication = eventCommunication;
    this.eventCommunication.on('link-stop', (uid: string, buffer: Buffer) => proxyProcess.stopUidLinkMessage(uid, buffer));
    this.eventCommunication.on('error', (error: Error) => console.log(error));
    this.eventCommunication.on('close', () => {
      this.eventCommunication = null;
      this.socketMap.forEach((clientSocket: ProxySocket) => clientSocket.destroy());
      this.emitAsync('close', this.socketID);
    });
  }

  /**
   * 创建udp消息发送客户端
   * @param host 
   * @param initialPort 
   * @param maxClientNumber 
   */
  protected createUdpClient(host: string, initialPort: number, maxClientNumber: number) {
    this.udpClientList = new Array(maxClientNumber).fill(initialPort).map((item: number, index: number) => {
      return createSocketClient(host, item + index);
    });
    return this.udpClientList;
  }

  /**
   * 发送消息到代理方
   * @param buffer 
   * @param clientCursor
   * @param uid 
   */
  private write(buffer: Buffer, clientCursor: number, uid?: string) {
    const { cursor, data } = PackageUtil.packageSigout(buffer);
    this.udpClientList[clientCursor].write(this.writeSocketID(this.socketID, buffer), uid);
  }

  /**
   * udp 发送数据
   */
  protected send = (uid: string, clientSocket: ProxySocket) => (data: Buffer | Buffer[]) => {
    if (!this.eventCommunication) {
      clientSocket.end();
      return ;
    }

    data.forEach((buffer: any) => {
      this.write(buffer, this.getCursor(), uid);
    });
  };

  /**
   * 关闭某个连接
   * @param uid string
   */
  protected clientClose(uid: string) {
    return () => {
      this.socketMap.delete(uid);
      proxyProcess.deleteUid(uid);
      console.log(`${(this as any).serverName} ${uid}  -->  socketMap.size`, this.socketMap.size);
    }
  }

  protected udpMessage(data: Buffer): void {
    throw new Error("Method not implemented.");
  }

  getCursor() {
    this._cursor++;
    if (this._cursor >= this.udpClientList.length) {
      this._cursor = 0;
    }
    return this._cursor;
  }
}
