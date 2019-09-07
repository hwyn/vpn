import cluster from 'cluster';
import { cpus } from 'os';
import { IS_CLUSER } from './server/constant';

if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  require('./server/master')
} else {
  if (!IS_CLUSER) {
    require('./server/dns');
  }
  require('./server/cn');
  require('./server/en');
}