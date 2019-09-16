import { ProxyUdpServer, createUdpServer } from './net-util/proxy-udp';
import { proxyProcess  } from './net-util/proxy-process';
import { Handler, BufferUtil, EventEmitter } from "./util";
import { PROCESS_EVENT_TYPE } from './constant';

const { NOT_UID_PROCESS, STOU_UID_LINK } = PROCESS_EVENT_TYPE;

export abstract class UdpServerBasic extends EventEmitter {
  protected udpServerList: ProxyUdpServer[] = [];

  /**
   * 初始化进程监听
   */
  protected initProxyProcess() {
    proxyProcess.on(NOT_UID_PROCESS, (uid: string, buffer: Buffer) => this.notExistUid(uid, buffer));
    proxyProcess.on(STOU_UID_LINK, (uid: string, buffer: Buffer) => this.stopClient(uid, buffer));
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

  protected writeSocketID(socketID: string, buffer: Buffer) {
    const header = BufferUtil.writeGrounUInt([socketID.length], [8]);
    return BufferUtil.concat(header, socketID, buffer);
  }

  protected unWriteSocketId(buffer: Buffer) {
    const [ header, _body] = BufferUtil.unConcat(buffer, [8]);
    const [ socketLength ] = BufferUtil.readGroupUInt(header, [8]);
    const [ socketID, body ] = BufferUtil.unConcat(_body, [ socketLength ]);
    return { socketID: socketID.toString(), buffer: body };
  }

  protected abstract udpMessage(data: Buffer, next?: Handler): void;

  protected abstract notExistUid(uid: string, buffer: Buffer): void;

  protected abstract stopClient(uid: string,  buffer: Buffer): void;
}