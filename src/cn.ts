import { IS_CLUSER } from './server/constant';
import cluster from 'cluster';
import { cpus } from 'os';

if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  require('./server/dns');
  require('./server/master');
} else {
  require('./server/cn');
  if (!IS_CLUSER) {
    require('./server/dns');
  }
}
