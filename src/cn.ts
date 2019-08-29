import { isCluster } from './server/constant';
import cluster from 'cluster';
import { cpus } from 'os';

if (isCluster && cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  require('./server/master')
} else {
  require('./server/cn');
}