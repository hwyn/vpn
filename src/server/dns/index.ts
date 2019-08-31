import { RemoteInfo, createSocket } from 'dgram';
import { ProxyUdpServer, ProxyUdpSocket } from '../net-util';
import { Notice, DomainNameObject } from './notice';

class DnsServerConnection {
  connectionListener(data: Buffer, rinfo: RemoteInfo) {
    const notice = new Notice(data);
    console.log('transactionID', notice.transactionID);
    console.log('flags', notice.flags);
    console.log('qr', notice.qr);
    console.log('opcode', notice.opcode);
    console.log('aa', notice.aa);
    console.log('tc', notice.rd);
    console.log('rd', notice.rd);
    console.log('ra', notice.ra);
    console.log('rcode', notice.rcode);
    console.log('rd', notice.rd);
    console.log('questionDomainObject', notice.questionDomainObject);
    console.log('answerDomainObject', notice.answerDomainObject);
    console.log('authoritativeDomainObject', notice.authoritativeDomainObject);
    console.log('additionalDomainObject', notice.additionalDomainObject);

    const buf = Buffer.alloc(4);
    buf[0] = 127;
    buf[1] = 0;
    buf[2] = 0;
    buf[3] = 1;

    const answer = notice.questionDomainObject.domains.map((item: DomainNameObject) => {
      return {
        name: item.name,
        ttl: 0,
        type: 1,
        class: 1,
        rdata: buf.toString('base64', 0, 4)
      }
    });
    const response = notice.getResponseNotice(
      notice.questionDomainObject.domains,
      answer,
      notice.authoritativeDomainObject.domains,
      notice.additionalDomainObject.domains,
    );
    const responseNotice = new Notice(response);
    console.log(responseNotice.transactionID);
    console.log(responseNotice.flags);
    console.log(responseNotice.qr);
    console.log(responseNotice.answerDomainObject);
    console.log(rinfo);
    dnsServer.write(response, rinfo.port, rinfo.address);
  }

  call = () => (data: Buffer, rinfo: RemoteInfo) => this.connectionListener(data, rinfo);
}

const dnsServer = new ProxyUdpServer(53);

dnsServer.on('listening', () => console.log(`dns server listening 53 port`));
dnsServer.on('data', new DnsServerConnection().call());
