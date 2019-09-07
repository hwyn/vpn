import { EventEmitter } from './event-emitter';
import { PackageUtil } from './package-separation';
import { BufferUtil } from './buffer-util';
import { getHttpsClientHello, getHttp } from '.';
import { ProxySocket, ProxyEventEmitter } from '../net-util';

const LINK = 0;
const LINKSUCCES = 1;
const END = 2;
const CLOSE = 3;
const ERROR = 4;
const LINKERROR = 5;

export class EventCommunication extends ProxyEventEmitter {
  [x: string]: any;
  constructor(private eventSocket: ProxySocket) {
    super(eventSocket);
    this.mappingFnNames = ['end'];
    this.associatedListener(['error'], false);
    this.mappingMethod();
  }

  onInit() {
    this.eventSocket.on('data', (data: Buffer) => this.parseEvent(data));
  }

  createHeader(uid: string, type: number): Buffer {
    const { UID_BYTE_SIZE } = PackageUtil;
    return  BufferUtil.concat(
      BufferUtil.writeGrounUInt([type, uid.length], [8, UID_BYTE_SIZE]),
      uid
    );
  }

  parseHeader(header: Buffer): { type: number | bigint, uid: string, body: Buffer } {
    const { UID_BYTE_SIZE } = PackageUtil;
    const [ type , uidLength ] = BufferUtil.readGroupUInt(header, [8, UID_BYTE_SIZE]);
    const [ title, uid, body ] = BufferUtil.unConcat(header, [ 8 + UID_BYTE_SIZE, uidLength ]);
    return { type, uid: uid.toString(), body };
  }

  createLink(uid: string, port: number, data: Buffer): Buffer {
    const { host } = port === 443 ? getHttpsClientHello(data) : getHttp(data);
    const body = BufferUtil.writeGrounUInt([port, host.length], [16, 8]);
    return BufferUtil.concat(this.createHeader(uid, LINK), body);
  };

  parseLink(uid: string, link: Buffer): { uid: string, port: number | bigint, host: string} {
    const [ port, hostLength ] = BufferUtil.readGroupUInt(link, [ 16, 8 ]);
    const [ title, host ] = BufferUtil.unConcat(link, [ 16 + 8, hostLength ]);
    this.emitAsync('link', { uid, port, host: host.toString() });
    return { uid, port, host: host.toString() };
  }

  parseEvent(data: Buffer) {
    const { type, uid, body } = this.parseHeader(data);
    switch(type) {
      case LINK: this.parseLink(uid, body); break;
      case LINKSUCCES: this.emitAsync('link-success', { uid }); break;
      case LINKERROR: this.emitAsync('link-error', { uid }); break;
      case END: this.emitAsync('event-end', { uid }); break;
      case CLOSE: this.emitAsync('event-close', { uid }); break;
      case ERROR: this.emitAsync('event-error', { uid }); break;
    }
  }
}