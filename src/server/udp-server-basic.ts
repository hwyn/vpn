import { ProxyUdpServer, createUdpServer } from './net-util/proxy-udp';
import { proxyProcess  } from './net-util/proxy-process';
import { Handler, BufferUtil, EventEmitter } from "./util";
import { PROCESS_EVENT_TYPE } from './constant';

const { } = PROCESS_EVENT_TYPE;

export abstract class UdpServerBasic extends EventEmitter {
  static writeSocketID = (socketID: string, buffer: Buffer) => {
    const header = BufferUtil.writeGrounUInt([socketID.length], [8]);
    return BufferUtil.concat(header, socketID, buffer);
  }

  static unWriteSocketId = (buffer: Buffer) => {
    const [ header, _body] = BufferUtil.unConcat(buffer, [8]);
    const [ socketLength ] = BufferUtil.readGroupUInt(header, [8]);
    const [ socketID, body ] = BufferUtil.unConcat(_body, [ socketLength ]);
    return { socketID: socketID.toString(), buffer: body };
  }

  protected udpServerList: ProxyUdpServer[] = [];

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

  protected abstract udpMessage(data: Buffer, next?: Handler): void;

  protected abstract notExistUid(uid: string, buffer: Buffer): void;

  protected abstract stopClient(uid: string,  buffer: Buffer): void;
}