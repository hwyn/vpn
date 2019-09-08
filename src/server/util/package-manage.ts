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
    protected type?: string
  ) { }

  distributeCall = (proxySocket: ProxySocket) => ({ data }: any) => {
    // console.log(`${this.type} ${this.uid}--------->${data.length}`);
    proxySocket.write(data);
  };
}

export class BrowserManage extends PackageManage{
  constructor(uid: string, packageSeparation: PackageSeparation) {
    super(uid, packageSeparation,  'client');
  }
  
  agentResponseCall = () => (buffer: Buffer) => {
    const { cursor, data, uid } = PackageUtil.packageSigout(buffer);
    // console.log(`--cn length: ${data.length}  cursor: ${cursor} uid: ${uid}--`);
    this.packageSeparation.splitPackage(buffer);
  }

  clientLinkCall = (port: number, buffer: Buffer) => () => {
    // console.log(`client request ${this.uid}------>${buffer.length}`);
    const data = PackageUtil.bindPort(port, buffer);
    this.packageSeparation.mergePackage(LINK, this.uid, data);
    this.packageSeparation.immediatelySend(this.uid);
  }

  clientDataCall = () => (buffer: Buffer) => {
    console.log(`client request ${this.uid}------>${buffer.length}`);
    this.packageSeparation.mergePackage(DATA, this.uid, buffer);
    this.packageSeparation.immediatelySend(this.uid);
  };
}

export class ServerManage extends PackageManage{
  constructor(uid: string,packageSeparation: PackageSeparation) {
    super(uid, packageSeparation, 'server ');
  }

  serverLinkCall = () => (buffer: any) => {
    // console.log(`server response ${this.uid}------>${buffer.length}`);
    this.packageSeparation.mergePackage(DATA, this.uid, buffer);
    this.packageSeparation.immediatelySend(this.uid);
  };

  /**
   * 连接目标服务器事件
   * @param packageSeparation
   */
  agentRequestCall = () => (buffer: any) => {
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    this.packageSeparation.splitPackage(buffer);
  };
}
