/**
 * Created by NX on 2019/8/24.
 */
import { ProxySocket} from "../net-util/proxy-socket";
import { PackageManage as AManage } from '../agreement/package-manage';
import { EventEmitter } from './event-emitter';

export class PackageManage extends EventEmitter {
  private manage: AManage = new AManage();
  protected cursor: number = 0;
  protected  isEnd: boolean = false;
  constructor(protected type?: string) {
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

  end(uid: string) {
    console.log(`-----------------end--${uid}---------------`);
    this.manage.end();
  }

  close(uid: string) {
    console.log(`-----------------close--${uid}---------------`);
    this.manage.close();
  }

  error(uid: string, error: Error) {
    console.log(`uid------->${uid}`, error);
    this.manage.error(error);
  }
}