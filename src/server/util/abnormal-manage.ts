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
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, END);
    }
  }

  closeCall = () => () => {
    console.log(`-- close listening ${this.uid} -- ${new Date().getTime()}`);
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, CLOSE);
    }
    this.emitAsync('close');
  };

  errorCall = () => (error: Error) => {
    console.log(`-- error listening ${this.uid} -- ${new Date().getTime()}`);
    if (this.isNotEnd) {
      this.packageSeparation.sendEventPackage(this.uid, ERROR);
    }
    console.log(error);
  };

  message = (proxySocket: ProxySocket) => ({ uid, data, type }: any) => {
    console.log(`--message ${['link', 'data', 'close', 'error', 'end'][type]} ${uid}--`);
    this.isNotEnd = false;
    switch(type) {
      case END: proxySocket.end(); break;
      case CLOSE:;
      case ERROR: proxySocket.destroy();
    }
  }
}