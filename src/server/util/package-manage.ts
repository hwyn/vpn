/**
 * Created by NX on 2019/8/24.
 */
import { PackageSeparation, PackageUtil } from './package-separation';
import { ProxySocket} from "../net-util/proxy-socket";
import { COMMUNICATION_EVENT } from '../constant';
import { PackageManage as AManage } from '../agreement/package-manage';
import { EventEmitter } from './event-emitter';

const { DATA } = COMMUNICATION_EVENT;

export class PackageManage extends EventEmitter {
  private manage: AManage = new AManage();
  protected cursor: number = 0;
  protected  isEnd: boolean = false;
  constructor(
    protected uid: string,
    protected packageSeparation: PackageSeparation,
    protected type?: string
  ) {
    super();
    this.manage.on('send', (data: Buffer) => this.emitAsync('send', data));
    this.manage.on('sendEnd', (data: Buffer) => this.emitAsync('sendEnd', data));
    this.manage.on('sendError', (data: Buffer) => this.emitAsync('sendEnd', data));
    this.manage.on('sendClose', (data: Buffer) => this.emitAsync('sendEnd', data));
    this.manage.on('data', (data: Buffer) => this.emitAsync('data', data));
    this.manage.on('end', () => this.emitAsync('end'));
    this.manage.on('error', () => this.emitAsync('error'));
    this.manage.on('close', () => this.emitAsync('close'));
    this.manage.on('timeout', () => this.emitAsync('timeout'));
  }

  distributeCall = (proxySocket: ProxySocket) => ({ data }: any) => {
    proxySocket.write(data);
  };

  distribute(data: Buffer) {
    this.manage.split(data);
  }

  write(data: Buffer) {
    this.manage.stick(data);
  }

  end() {
    this.manage.end();
  }

  close() {
    this.manage.close();
  }

  error() {
    this.manage.error();
  }
}

export class BrowserManage extends PackageManage {
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
