import { EventEmitter } from './event-emitter';
import { PackageSeparation } from './package-separation';
import { COMMUNICATION_EVENT } from '../constant';
import { ProxySocket } from '../net-util';

const { ERROR, END, CLOSE } = COMMUNICATION_EVENT;

export class AbnormalManage extends EventEmitter {
  private isNotEnd: boolean = true;
  constructor(private uid: string, private packageSeparation: PackageSeparation) {
    super();
  }

  endCall = () => () => {
    console.log(`-- end listening ${this.uid} --`);
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, END);
    }
  }

  closeCall = () => () => {
    console.log(`-- close listening ${this.uid} --`);
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, CLOSE);
    }
  };

  errorCall = () => (error: Error) => {
    console.log(`-- error listening ${this.uid} --`);
    console.log(error);
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, ERROR);
    }
  };

  message = (proxySocket: ProxySocket) => ({ uid, data, type }: any) => {
    console.log(`--message ${['link', 'data', 'close', 'error', 'end'][type]} ${uid}--`);
    if (this.isNotEnd) {
      this.isNotEnd = false;
      proxySocket.end();
    }
    if ([CLOSE, ERROR].includes(type)) {
      this.emitAsync('end');
    }
  }
}