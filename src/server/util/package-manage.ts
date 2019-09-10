/**
 * Created by NX on 2019/8/24.
 */
import { PackageSeparation, PackageUtil } from './package-separation';
import { ProxySocket} from "../net-util/proxy-socket";
import { COMMUNICATION_EVENT } from '../constant';

const { DATA } = COMMUNICATION_EVENT;

export class PackageManage {
  protected cursor: number = 0;
  protected  isEnd: boolean = false;
  constructor(
    protected uid: string,
    protected packageSeparation: PackageSeparation,
    protected type?: string
  ) { }

  distributeCall = (proxySocket: ProxySocket) => ({ data }: any) => {
    proxySocket.write(data);
  };
}

export class BrowserManage extends PackageManage{
  constructor(uid: string, packageSeparation: PackageSeparation) {
    super(uid, packageSeparation,  'client');
  }
  
  agentResponseCall = () => (buffer: Buffer) => {
    const { cursor, data, uid } = PackageUtil.packageSigout(buffer);
    this.packageSeparation.splitPackage(buffer);
  }

  clientDataCall = () => (buffer: Buffer) => {
    this.packageSeparation.mergePackage(DATA, this.uid, buffer);
    this.packageSeparation.immediatelySend(this.uid);
  };
}

export class ServerManage extends PackageManage{
  constructor(uid: string,packageSeparation: PackageSeparation) {
    super(uid, packageSeparation, 'server ');
  }

  serverLinkCall = () => (buffer: any) => {
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
