import cluster from 'cluster';
import { cpus } from 'os';
import { IS_CLUSER } from './server/constant';
import { getIPv4Address, getIPv6Address, setLocalhostDNS } from './server/util/os-util';


if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  require('./server/master');
} else {
  require('./server/cn');
}

if (!IS_CLUSER || cluster.isMaster) {
  require('./server/dns');
  let clearDNS = () => {};
  setLocalhostDNS(getIPv4Address(), getIPv6Address()).then(clear => clearDNS = clear);
  ['SIGHUP', 'SIGINT', 'SIGBREAK'].forEach((event: any) => process.on(event, () => ps.exit(1)));
  process.on('exit', () => clearDNS());
}
