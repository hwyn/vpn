import { PackageUtil } from './package-separation';
import { BufferUtil } from './buffer-util';
import { getHttpsClientHello, getHttp } from '.';
import { ProxySocket, ProxyEventEmitter } from '../net-util';
import { uuid } from './tools';

const LINK = 0;
const LINKSUCCES = 1;
const LINKERROR = 5;
const ONELINK = 6;
const STOP = 7;

export class EventCommunication extends ProxyEventEmitter {
  [x: string]: any;
  private uid: string = uuid();
  constructor(private eventSocket: ProxySocket) {
    super(eventSocket);
    this.mappingFnNames = ['end', 'write'];
    this.associatedListener(['error', 'close'], true);
    this.mappingMethod();
    this.onInit();
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

  createLink(uid: string, port: number, data: Buffer, callback?: (error?: Error) => void) {
    const { host } = port === 443 ? getHttpsClientHello(data) : getHttp(data);
    const body = BufferUtil.writeGrounUInt([port, host.length], [16, 8]);
    this.clientLinkEventDefault(uid, callback);
    if (!host) {
      this.emitAsync('link-error', { uid });
    } else {
      this.write(BufferUtil.concat(this.createHeader(uid, LINK), body, host));
    }
  };

  parseLink(uid: string, link: Buffer): { uid: string, port: number | bigint, host: string} {
    const [ port, hostLength ] = BufferUtil.readGroupUInt(link, [ 16, 8 ]);
    const [ title, host ] = BufferUtil.unConcat(link, [ 16 + 8, hostLength ]);
    this.emitAsync('link', { uid, port, host: host.toString() });
    return { uid, port, host: host.toString() };
  }

  parseOneLink(uid: string, body: Buffer) {
    const [ bodyLength ] = BufferUtil.readGroupUInt(body, [ 16 ]);
    const [ title, eventInfo ] = BufferUtil.unConcat(body, [ 16, bodyLength ]);
    this.emitAsync('link-info', eventInfo);
  }

  sendEvent = (uid: string) => (data: Buffer[]) => {
    data.forEach((buffer: Buffer) => {
      const header = this.createHeader(uid, ONELINK);
      const body = BufferUtil.writeGrounUInt([buffer.length], [16]);
      const info = BufferUtil.concat(header, body, buffer);
      this.write(info);
    });
  }

  createEvent(uid: string, type: number): Buffer {
    return this.createHeader(uid, type);
  }
  
  createStopResponse(uid: string) {
    this.write(this.createEvent(uid, STOP));
  }

  
  createLinkEror =  (uid: string) => () => {
    this.write(this.createEvent(uid, LINKERROR));
  }

  createLinkSuccess = (uid: string) => () => {
    this.write(this.createEvent(uid, LINKSUCCES));
  }

  parseEvent(data: Buffer) {
    const { type, uid, body } = this.parseHeader(data);
    switch(type) {
      case LINK: this.parseLink(uid, body); break;
      case LINKSUCCES: this.emitAsync('link-success', { uid }); break;
      case ONELINK: this.parseOneLink(uid, body); break;
      case LINKERROR: this.emitAsync('link-error', { uid }); break;
      case STOP: this.emitAsync('link-stop', uid);
    }
  }

  clientLinkEventDefault(defaultUid: string, callback?: (error?: Error) => void) {
    const success = this.on('link-success', ({ uid }: any) => {
      if (uid === defaultUid) {
        callback();
        success();
        error();
      }
    });

    const error = this.on('link-error', ({ uid }: any) => {
      if (uid === defaultUid) {
        callback(new Error(`${uid} connection create a failure`));
        success();
        error();
      }
    });
  }
}