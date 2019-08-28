import cluster from  'cluster';
import { EventEmitter } from '../util/index';
import { PackageUtil } from '../util/package-separation';



export class WorkerManage extends EventEmitter {
  private uidSet: Set<string> = new Set();
  constructor(private worker: any) {
    super();
    this.onInit();
  }

  send(mesage: any) {
    this.worker.send(mesage);
  }

  has(uid: string) {
    return this.uidSet.has(uid);
  }

  private distributionResponseWorker(event: any) {
    const { runWorker, buffer } = this.distributionWorker(event);
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    if (runWorker) {
      runWorker.send({ event: 'udp-response-message', data: buffer });
    } else {
      console.log('error--------->', runWorker);
    }
  }

  private distributionRequestWorker(event: any) {
    const { runWorker, buffer } = this.distributionWorker(event);
    if (runWorker) {
      runWorker.send({ event: 'udp-request-message', data: buffer });
    } else {
      console.log('error--------->', runWorker);
    }
  }

  private distributionWorker({ data }: any) {
    const { uid, buffer } = PackageUtil.getUid(Buffer.from(data));
    const runWorker = manageList.getWorker(uid);
    return { runWorker, buffer };
  }

  private onInit() {
    this.worker.on('message', this.eventBus.bind(this));
    this.worker.on('error', (error: Error) => console.log(error));
  }

  eventBus({ event, data }: any) {
    switch(event) {
      case 'bind-uid': this.bindUid(data); break;
      case 'delete-uid': this.deleteUid(data); break;
      case 'udp-request-message': this.distributionRequestWorker(data);break;
      case 'udp-response-message': this.distributionResponseWorker(data);break;
    }
  }

  private deleteUid(uid: string) {
    this.uidSet.delete(uid);
  }

  private bindUid(uid: string) {
    this.uidSet.add(uid);
    console.log(this.uidSet);
  }
}

class ManageList {
  private workers: WorkerManage[] = [];
  constructor() {
    this.onInit();
  }

  onInit() {
    cluster.on('online', (worker) => {
      const workerManage = new WorkerManage(worker);
      this.workers.push(workerManage);
    });
  }

  getWorker(uid: string): WorkerManage {
    return this.workers.filter((worker: WorkerManage) => worker.has(uid))[0];
  }
}

const manageList = new ManageList();
