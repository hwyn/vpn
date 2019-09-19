import { IS_CLUSER } from './server/constant';
import { getLocalhostIP, setLocalhostDNS } from './server/util/os-util';
import cluster from 'cluster';
import { cpus } from 'os';

let clientDNS = Promise.resolve(() => {});
const processExit = () => {
  [
    'exit',
    'SIGHUP',
    'SIGINT'
  ].forEach(
    (event: any) => process.on(event, () => clientDNS.then((client) => client()))
  );
}

if (IS_CLUSER && cluster.isMaster) {
  let workerLength = cpus().length;
  clientDNS = setLocalhostDNS(getLocalhostIP());
  while (workerLength > 0) {
    cluster.fork();
    workerLength--;
  }
  processExit();
  require('./server/dns');
  require('./server/master');
} else {
  require('./server/cn');
  if (!IS_CLUSER) {
    require('./server/dns');
    clientDNS = setLocalhostDNS(getLocalhostIP());
    processExit();
  }
}
