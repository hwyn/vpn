/**
 * Created by NX on 2019/8/24.
 */
import { proxyProcess } from '../net-util/proxy-process';
import { PackageSeparation, PackageUtil } from './package-separation';
import { ProxySocket} from "../net-util/proxy-socket";
import { COMMUNICATION_EVENT } from '../constant';

const { LINK, DATA, CLOSE, ERROR, END } = COMMUNICATION_EVENT;

export class PackageManage {
  protected cursor: number = 0;
  protected  isEnd: boolean = false;
  constructor(
    protected uid: string,
    protected packageSeparation: PackageSeparation,
    protected notice: (buffer: Buffer[]) => void,
    protected type?: string
  ) { }

  distributeCall = (proxySocket: ProxySocket) => ({ data }: any) => {
    proxySocket.write(data);
  };
}

export class BrowserManage extends PackageManage{
  constructor(uid: string, packageSeparation: PackageSeparation, notice: (buffer: Buffer[]) => void) {
    super(uid, packageSeparation, notice, 'browser');
  }

  browserLinkCall = () => (buffer: any) => {
    const event = this.cursor === 0 ? LINK : DATA;
    this.packageSeparation.mergePackage(event, this.uid, buffer);
    this.packageSeparation.immediatelySend(this.uid);
    this.cursor++;
  };

  /**
   * 连接代理服务器
   * @param packageSeparation
   */
  browserDataCall = () => (buffer: any) => {
    const { cursor, data, uid } = PackageUtil.packageSigout(buffer);
    // console.log(`--cn length: ${data.length}  cursor: ${cursor} uid: ${uid}--`);
    this.packageSeparation.splitPackage(buffer);
  };

  sendCall = (sendUdp: (buffer: Buffer[], uid?: string) => void) => ( buffer: Buffer[]) => {
    this.cursor === 0 ? this.notice(buffer) : sendUdp(buffer, this.uid);
  };
}

export class ServerManage extends PackageManage{
  constructor(uid: string,packageSeparation: PackageSeparation, notice: (buffer: Buffer[]) => void) {
    super(uid, packageSeparation, notice, 'server ');
  }

  serverLinkCall = () => (buffer: any) => {
    this.packageSeparation.mergePackage(DATA, this.uid, buffer);
    this.packageSeparation.immediatelySend(this.uid);
  };

  /**
   * 连接目标服务器事件
   * @param packageSeparation
   */
  serverDataCall = () => (buffer: any) => {
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    this.packageSeparation.splitPackage(buffer);
    this.packageSeparation.immediatelySend(this.uid);
  };

  sendCall = (sendUdp: (buffer: Buffer[], uid?: string) => void) => ( buffer: Buffer[]) => {
    sendUdp(buffer, this.uid);
  };
}
