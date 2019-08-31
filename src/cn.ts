import { IS_CLUSER } from './server/constant';
import cluster from 'cluster';
import { cpus } from 'os';

if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  require('./server/master');
  require('./server/dns/index');
} else {
  require('./server/cn');
  require('./server/dns/index');
}
