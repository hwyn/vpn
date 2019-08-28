import { ProxyEventEmitter } from "./proxy-event-emitter";
import { PROCESS_EVENT_TYPE } from '../constant';

const { UDP_RESPONSE_MESSAGE, UDP_REQUEST_MESSAGE, DELETE_UID, BIND_UID } = PROCESS_EVENT_TYPE;


class ProxyProcess extends ProxyEventEmitter {
  constructor() {
    super(process);
    this.onInit();
  }

  bindUid(uid: string) {
    this.send({ event: BIND_UID, data: uid });
  }

  deleteUid(uid: string) {
    this.send({ event: DELETE_UID, data: uid });
  }

  /**
   * 接收到客户端到消息
   * @param buffer
   */
  requestMessage(buffer: Buffer) {
    this.send({ event: UDP_REQUEST_MESSAGE, data: buffer });
  }

  

  /**
   * 接收到服务端到消息
   * @param buffer 
   */
  responseMessage(buffer: Buffer) {
    this.send({ event: UDP_RESPONSE_MESSAGE, data: buffer });
  }

  private udpResponseMessage({ data }: any) {
    this.emitAsync(UDP_RESPONSE_MESSAGE, Buffer.from(data));
  }

  private udpRequestMessage({ data }: any) {
    this.emitAsync(UDP_REQUEST_MESSAGE, Buffer.from(data));
  }
  
  private send(message: any) {
    this.source.send(message);
  }

  private onInit() {
    this.source.on('message', this.eventBus.bind(this));
  }

  private eventBus({ event, data }: any) {
    switch(event) {
      case UDP_RESPONSE_MESSAGE: this.udpResponseMessage(data); break;
      case UDP_REQUEST_MESSAGE: this.udpRequestMessage(data); break;
    }
  }
}

export const proxyProcess = new ProxyProcess();