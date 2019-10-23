/**
 * Created by NX on 2019/8/25.
 */
import { ProxyUdpSocket, createSocketClient } from './net-util/proxy-udp-socket';
import { ProxyTcpSocket, proxyProcess } from './net-util';
import { EventCommunication, PackageUtil } from './util';
import { EventEmitter } from './net-util/event-emitter';
import { ArrayLink, LinkNode } from './util/array-link';

export abstract class ProxyBasic extends EventEmitter {
  protected eventCommunication: EventCommunication;
  protected socketMap: Map<string, ProxyTcpSocket> =  new Map();
  protected udpClientLink: ArrayLink<ProxyUdpSocket> = new ArrayLink();
  protected udpClientSend: LinkNode<ProxyUdpSocket>;
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
    this.udpClientLink = new ArrayLink(new Array(maxClientNumber).fill(initialPort).map((item: number, index: number) => {
      return createSocketClient(host, item + index);
    }));
    this.udpClientSend = this.udpClientLink.get(0);
    return this.udpClientLink;
  }

  /**
   * 发送消息到代理方
   * @param buffer 
   * @param clientCursor
   * @param uid 
   */
  private write(buffer: Buffer) {
    this.udpClientSend.value.write(buffer);
    this.udpClientSend = this.udpClientSend.nextNode;
  }

  /**
   * udp 发送数据
   */
  protected send(data: Buffer) {
    if (!this.eventCommunication) {
      this.socketMap.forEach((clientSocket: ProxyTcpSocket) => clientSocket.destroy());
      return ;
    }
    this.write(data);
  };

  protected clientAdd(uid: string, clientSocket: ProxyTcpSocket) {
    this.socketMap.set(uid, clientSocket);
    proxyProcess.bindSocketId(uid);
  }

  /**
   * 关闭某个连接
   * @param uid string
   */
  protected clientClose(uid: string) {
    this.socketMap.delete(uid);
    proxyProcess.deleteSocketId(uid);
    console.log(`${(this as any).serverName} ${uid}  -->  socketMap.size`, this.socketMap.size);
  }

  /**
   * 接收到代理数据后处理
   */
  public agentData(uid: string, data: Buffer) {
    const clientSocket = this.socketMap.get(uid);
    if (clientSocket) {
      clientSocket.emitSync('agent', data);
    } else if(data.length !== 0) {
      this.send(PackageUtil.bindUid(uid, Buffer.alloc(0)));
    }
  }

  public hasClient(uid: string) {
    return this.socketMap.has(uid);
  }
}
