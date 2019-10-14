/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxyTcpSocket } from './net-util';
import { EventCommunication, PackageUtil } from './util';
import { EventEmitter } from './net-util/event-emitter';

export abstract class ProxyBasic extends EventEmitter {
  protected eventCommunication: EventCommunication;
  protected socketMap: Map<string, ProxyTcpSocket> =  new Map();
  protected udpClientList: ProxyUdpSocket[] = [];
  protected addressList: { port: number, host: string }[] = [];
  private _cursor: number = 0;
  constructor(protected socketID: string, private serverName: string) {
    super();
  }

  /**
   * 初始化tcp 事件通信
   * @param eventCommunication 
   */
  protected initEventCommunication(eventCommunication: EventCommunication) {
    this.eventCommunication = eventCommunication;
    this.eventCommunication.on('error', (error: Error) => console.log(error));
    this.eventCommunication.on('close', () => {
      this.eventCommunication = null;
      this.socketMap.forEach((clientSocket: ProxyTcpSocket) => clientSocket.emitAsync('agentError'));
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
  private write(buffer: Buffer, clientCursor: number) {
    const sendBuffer = PackageUtil.writeSocketID(this.socketID, buffer);
    this.udpClientList[clientCursor].write(sendBuffer);
  }

  /**
   * udp 发送数据
   */
  protected send(data: Buffer) {
    if (!this.eventCommunication) {
      this.socketMap.forEach((clientSocket: ProxyTcpSocket) => clientSocket.destroy());
      return ;
    }
    this.write(data, this.cursor);
  };

  /**
   * 关闭某个连接
   * @param uid string
   */
  protected clientClose(uid: string) {
    return () => {
      this.socketMap.delete(uid);
      console.log(`${(this as any).serverName} ${uid}  -->  socketMap.size`, this.socketMap.size);
    }
  }

  get cursor() {
    this._cursor++;
    if (this._cursor >= this.udpClientList.length) {
      this._cursor = 0;
    }
    return this._cursor;
  }
}
