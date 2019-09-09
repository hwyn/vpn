/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpServer, createUdpServer  } from './net-util/proxy-udp';
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxySocket, proxyProcess } from './net-util';
import { PackageUtil, Handler, EventCommunication } from './util';
import { PROCESS_EVENT_TYPE } from './constant';

const { UDP_RESPONSE_MESSAGE, NOT_UID_PROCESS, STOU_UID_LINK } = PROCESS_EVENT_TYPE;

export abstract class ProxyBasic {
  protected eventCommunication: EventCommunication;
  protected socketMap: Map<string, ProxySocket> =  new Map();
  protected udpServerList: ProxyUdpServer[] = [];
  protected udpClientList: ProxyUdpSocket[] = [];
  protected addressList: { port: number, host: string }[] = [];
  private _cursor: number = 0;
  constructor(private serverName: string) {
    this.initProxyProcess();
  }

  /**
   * 初始化进程监听
   */
  protected initProxyProcess() {
    proxyProcess.on(NOT_UID_PROCESS, (uid: string) => this.notExistUid(uid, Buffer.alloc(0)));
    proxyProcess.on(STOU_UID_LINK, (uid: string) => this.stopClient(uid));
  }

  /**
   * 初始化tcp 事件通信
   * @param eventCommunication 
   */
  protected initEventCommunication(eventCommunication: EventCommunication) {
    this.eventCommunication = eventCommunication;
    this.eventCommunication.on('link-stop', (uid: string) => proxyProcess.stopUidLinkMessage(uid));
  }

  /**
   * 创建udp 服务器监听
   * @param initialPort 
   * @param maxListenNumber 
   */
  protected createUdpServer(initialPort: number, maxListenNumber: number) {
    this.udpServerList = new Array(maxListenNumber).fill(initialPort).map((item: number, index: number) => {
      const udpServer = createUdpServer(item + index);
      udpServer.on('data', this.udpMessage.bind(this));
      return udpServer;
    });
    return this.udpServerList;
  }

  /**
   * 没有检测到存在当前uid的连接
   * @param uid 
   */
  protected notExistUid(uid: string, buffer: Buffer) {
    const { data } =  PackageUtil.packageSigout(buffer);
    console.log(`${uid}`, data);
    if (!PackageUtil.isEventPackage(data)) {
      this.eventCommunication.createStorResponse(uid);
    }
  }

  /**
   * 停止当前连接
   */
  protected stopClient(uid: string) {
    const clientTcp = this.socketMap.get(uid);
    console.log(`${this.serverName} stop----> ${uid} link`);
    if (clientTcp) {
      clientTcp.end();
    }
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
