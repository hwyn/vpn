import { ProxyEventEmitter } from "./proxy-event-emitter";
import { PROCESS_EVENT_TYPE, IS_CLUSER } from '../constant';
import { PackageUtil, uuid } from '../util';

const { UDP_RESPONSE_MESSAGE, UDP_REQUEST_MESSAGE, NOT_SOCKETID_PROCESS, DELETE_SOCKETID, BIND_SOCKETID } = PROCESS_EVENT_TYPE;


class ProxyProcess extends ProxyEventEmitter {
  constructor() {
    super(process);
    this.onInit();
  }

  bindSocketId(uid: string) {
    this.send({ event: BIND_SOCKETID, data: uid });
  }

  deleteSocketId(uid: string) {
    this.send({ event: DELETE_SOCKETID, data: uid });
  }

  /**
   * 接收到客户端到消息
   * @param buffer
   */
  requestMessage(data: Buffer) {
    this.send({ event: UDP_REQUEST_MESSAGE, data });
    if (!IS_CLUSER) {
      this.udpRequestMessage({ data });
    }
  }

  /**
   * 接收到服务端到消息
   * @param buffer 
   */
  responseMessage(buffer: Buffer) {
    this.send({ event: UDP_RESPONSE_MESSAGE, data: buffer });
    if (!IS_CLUSER) {
      this.udpResponseMessage({ data: buffer }); 
    }
  }

  private udpResponseMessage({ data }: any) {
    this.emitAsync(UDP_RESPONSE_MESSAGE, Buffer.from(data));
  }

  private udpRequestMessage({ data }: any) {
    this.emitAsync(UDP_REQUEST_MESSAGE, Buffer.from(data));
  }

  private notSocketProcess({ data }: any) {
    const buffer = Buffer.from(data);
  }

  private send(message: any) {
    IS_CLUSER ? this.source.send(message) : null;
  }
  
  private onInit() {
    this.source.on('message', this.eventBus.bind(this));
  }

  private eventBus({ event, data }: any) {
    switch(event) {
      case UDP_RESPONSE_MESSAGE: this.udpResponseMessage(data); break;
      case UDP_REQUEST_MESSAGE: this.udpRequestMessage(data); break;
      case NOT_SOCKETID_PROCESS: this.notSocketProcess(data); break;
    }
  }
}

export const proxyProcess = new ProxyProcess();