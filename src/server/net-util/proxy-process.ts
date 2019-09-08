import { ProxyEventEmitter } from "./proxy-event-emitter";
import { PROCESS_EVENT_TYPE, IS_CLUSER } from '../constant';
import { PackageUtil, uuid } from '../util';

const { UDP_RESPONSE_MESSAGE, UDP_REQUEST_MESSAGE, DELETE_UID, BIND_UID, NOT_UID_PROCESS, STOU_UID_LINK } = PROCESS_EVENT_TYPE;


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
    if (!IS_CLUSER) {
      const { buffer: data } = PackageUtil.getUid(buffer);
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
      const { buffer: data } = PackageUtil.getUid(buffer);
      this.udpResponseMessage({ data }); 
    }
  }

  stopUidLinkMessage(uid: string) {
    this.send({ event: STOU_UID_LINK, data: uid});
    if (!IS_CLUSER) {
      this.storUidLink(uid); 
    }
  }

  private udpResponseMessage({ data }: any) {
    this.emitAsync(UDP_RESPONSE_MESSAGE, Buffer.from(data));
  }

  private udpRequestMessage({ data }: any) {
    this.emitAsync(UDP_REQUEST_MESSAGE, Buffer.from(data));
  }
  
  private notUidProcess(uid: string) {
    this.emitAsync(NOT_UID_PROCESS, uid);
  }

  private storUidLink(uid: string) {
    this.emitAsync(STOU_UID_LINK, uid);
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
      case NOT_UID_PROCESS: this.notUidProcess(data); break;
      case STOU_UID_LINK: this.storUidLink(data); break;
    }
  }
}

export const proxyProcess = new ProxyProcess();