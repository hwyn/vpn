import { IS_CLUSER } from './server/constant';
import { getLocalhostIP, setLocalhostDNS } from './server/util/os-util';
import cluster from 'cluster';
import { cpus } from 'os';

let clearDNS = () => {};
const processExit = (ps: any) => {
  ['SIGHUP', 'SIGINT', 'SIGBREAK'].forEach((event: any) => ps.on(event, () => ps.exit(1)));
  ps.on('exit', () => clearDNS());
}

if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  setLocalhostDNS(getLocalhostIP()).then(clear => clearDNS = clear);
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  processExit(process);
  require('./server/dns');
  require('./server/master');
} else {
  require('./server/cn');
  if (!IS_CLUSER) {
    require('./server/dns');
    setLocalhostDNS(getLocalhostIP()).then(clear => clearDNS = clear);
    processExit(process);
  }
}
