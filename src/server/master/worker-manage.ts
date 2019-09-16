import cluster from 'cluster';
import { EventEmitter, PackageUtil } from '../util';
import { PROCESS_EVENT_TYPE } from '../constant';

const { UDP_RESPONSE_MESSAGE, UDP_REQUEST_MESSAGE, DELETE_UID, BIND_UID, NOT_UID_PROCESS, STOU_UID_LINK } = PROCESS_EVENT_TYPE;

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
      runWorker.send({ event: UDP_RESPONSE_MESSAGE, data: buffer });
    }
  }

  private distributionRequestWorker(event: any) {
    const { runWorker, buffer } = this.distributionWorker(event);
    const { uid, cursor } = PackageUtil.packageSigout(buffer);
    if (runWorker) {
      runWorker.send({ event: UDP_REQUEST_MESSAGE, data: buffer });
    }
  }

  private distributionStopUidLinkWorker({ uid, buffer }: any) {
    const runWorker = manageList.getWorker(uid);
    if (runWorker) {
      runWorker.send({ event: STOU_UID_LINK, data: { uid, buffer } });
    }
  }

  private distributionWorker({ data }: any) {
    const { uid, buffer } = PackageUtil.getUid(Buffer.from(data));
    const { cursor } = PackageUtil.packageSigout(buffer);
    const runWorker = manageList.getWorker(uid);
    if (!runWorker) {
      this.send({ event: NOT_UID_PROCESS, data: {
         uid,
         buffer: buffer
      }});
    }
    return { runWorker, buffer };
  }

  private onInit() {
    this.worker.on('message', this.eventBus.bind(this));
    this.worker.on('error', (error: Error) => console.log(error));
  }

  eventBus({ event, data }: any) {
    switch(event) {
      case BIND_UID: this.bindUid(data); break;
      case DELETE_UID: this.deleteUid(data); break;
      case UDP_REQUEST_MESSAGE: this.distributionRequestWorker(data);break;
      case UDP_RESPONSE_MESSAGE: this.distributionResponseWorker(data);break;
      case STOU_UID_LINK: this.distributionStopUidLinkWorker(data); break;
    }
  }

  private deleteUid(uid: string) {
    this.uidSet.delete(uid);
  }

  private bindUid(uid: string) {
    this.uidSet.add(uid);
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
