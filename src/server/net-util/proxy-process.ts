import { ProxyEventEmitter } from "./proxy-event-emitter";

class ProxyProcess extends ProxyEventEmitter {
  constructor() {
    super(process);
    this.onInit();
  }

  bindUid(uid: string) {
    this.send({ event: 'bind-uid', data: uid });
  }

  deleteUid(uid: string) {
    this.send({ event: 'delete-uid', data: uid });
  }

  /**
   * 接收到客户端到消息
   * @param buffer
   */
  requestMessage(buffer: Buffer) {
    this.send({ event: 'udp-request-message', data: buffer });
  }

  private udpRequestMessage({ data }: any) {
    this.emitAsync('udp-request-message', Buffer.from(data));
  }

  /**
   * 接收到服务端到消息
   * @param buffer 
   */
  responseMessage(buffer: Buffer) {
    this.send({ event: 'udp-response-message', data: buffer });
  }

  private udpResponseMessage({ data }: any) {
    this.emitAsync('udp-response-message', Buffer.from(data));
  }

  
  private send(message: any) {
    this.source.send(message);
  }

  private onInit() {
    this.source.on('message', this.eventBus.bind(this));
  }

  private eventBus({ event, data }: any) {
    switch(event) {
      case 'udp-response-message': this.udpResponseMessage(data); break;
      case 'udp-request-message': this.udpRequestMessage(data); break;
    }
  }
}

export const proxyProcess = new ProxyProcess();