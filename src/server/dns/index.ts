import { RemoteInfo, createSocket } from 'dgram';
import { ProxyUdpServer, ProxyUdpSocket } from '../net-util';
import { Notice, DomainNameObject } from './notice';

class DnsServerConnection {
  connectionListener(data: Buffer, rinfo: RemoteInfo) {
    const notice = new Notice(data);
    console.log('transactionID', notice.transactionID);
    console.log('flags', notice.flags);
    console.log('questionDomainObject', notice.questionDomainObject);
    console.log('answerDomainObject', notice.answerDomainObject);
    console.log('authoritativeDomainObject', notice.authoritativeDomainObject);
    console.log('additionalDomainObject', notice.additionalDomainObject);
    const buf = Buffer.alloc(4);
    buf[0] = 127;
    buf[1] = 0;
    buf[2] = 0;
    buf[3] = 1;

    const answer: DomainNameObject[] = [{
      name: 'github-cloud.s3.amazonaws.com',
      ttl: 0,
      type: 12,
      class: 1,
      rdata: buf.toString('base64', 0, 4)
    }];
    const _answer: DomainNameObject[] = notice.questionDomainObject.domains.map((domain) => {
      return {
        name: domain.name,
        ttl: 0,
        type: domain.type,
        class: 1,
        rdata: buf.toString('base64', 0, 4)
      }
    });
    const response = notice.getResponseNotice(
      notice.questionDomainObject.domains,
      _answer,
      notice.authoritativeDomainObject.domains,
      notice.additionalDomainObject.domains,
    );
    console.log('port:', rinfo.port);
    console.log('port:', rinfo.address);
    console.log(new Notice(response).questionDomainObject);
    console.log(new Notice(response).answerDomainObject);
    dnsServer.write(response, rinfo.port, rinfo.address);
  }

  call = () => (data: Buffer, rinfo: RemoteInfo) => this.connectionListener(data, rinfo);
}

const dnsServer = new ProxyUdpServer(53);
dnsServer.on('listening', () => console.log(`dns server listening 53 port`));
dnsServer.on('data', new DnsServerConnection().call());
dnsServer.on('error', (error: Error) => console.log(error));
