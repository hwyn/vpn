import cluster from 'cluster';
import { cpus } from 'os';

if (cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  if (!Object.prototype.hasOwnProperty.call(process, 'getMasterWorkers')) {
    Object.defineProperty(process, 'getMasterWorkers', {
      value: () => cluster.workers
    });
  }
  require('./server/master')
} else {
  require('./server/cn');
  require('./server/en');
}