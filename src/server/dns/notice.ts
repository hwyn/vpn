import { EventEmitter, hasOwnProperty } from '../util/index';

export type DomainNameObject = { 
  name: string, 
  type: number, 
  class: number,
  ttl?: number;
  rdLength?: number;
  rdata?: string;
};

class ReadDomainInfo extends EventEmitter {
  private startOffset: number;
  private endOffset: number;
  private info: DomainNameObject[];
  private readInfo: DomainNameObject[];
  constructor(private buffer: Buffer, private count: number) {
    super();
  }

  private readDomainName(defaultOffset: number) {
    const buffer: Buffer = this.buffer;
    const domainNameArr = [];
    let endOffset;
    let offset = defaultOffset;
    let length: number = 0;
    while ((length = buffer.readUInt8(offset++)) > 0) {
      if ((length & 0xC0) == 0xC0) {
        endOffset = offset + 1;
        offset = ((length & (~0xC0)) << 8) | buffer.readUInt8(offset);
        continue;
      }
      domainNameArr.push(buffer.toString('ascii', offset, offset + length));
      endOffset ? offset = endOffset : offset += length;
      endOffset = void(0);
    }
    this.endOffset =  offset;
    return domainNameArr.join('.');
  }

  private readCallback(offset: number, callback?: any): { domains: DomainNameObject[], start: number, end: number } {
    if (this.startOffset !== offset || !this.readInfo) {
      const buffer = this.buffer;
      const domainObjectList = [];
      let count = this.count;
      this.startOffset = this.endOffset = offset;
      while (count--) {
        const domainObject: DomainNameObject = { name: '', type: 0, class: 0 };
        domainObject.name = this.readDomainName(this.endOffset);
        domainObject.type = buffer.readUInt16BE(this.endOffset);
        this.endOffset += 2;
        domainObject.class = buffer.readUInt16BE(this.endOffset);
        this.endOffset += 2;
        callback ? callback(domainObject) : null;
        domainObjectList.push(domainObject);
      }
      this.readInfo = domainObjectList;
    }
    return { start: this.startOffset, end: this.endOffset, domains: this.readInfo };
  }

  public read(offset: number): { domains: DomainNameObject[], start: number, end: number } {
    return this.readCallback(offset);
  }

  public readRR(offset: number): { domains: DomainNameObject[], start: number, end: number } {
    const buffer = this.buffer;
    return this.readCallback(offset, (domainObject: DomainNameObject) => {
      domainObject.ttl = buffer.readUInt32BE(this.endOffset);
      this.endOffset += 4;
      const length = buffer.readUInt16BE(this.endOffset);
      domainObject.rdLength = length;
      this.endOffset += 2;
      domainObject.rdata = buffer.toString('base64', this.endOffset, this.endOffset + length);
      this.endOffset += length;
    });
  }
}

class WriteDomainInfo extends EventEmitter {
  private defaultObject: DomainNameObject = {
    name: '',
    type: 1,
    class: 1,
    ttl: 0,
    rdata: Buffer.alloc(0).toString('base64')
  };
  protected domainPoint: { [key: string]: number } = {};
  protected startOffset: number;
  protected endOffset: number;
  constructor(protected buffer: Buffer) {
    super();
  }

  private resetPointInfo(domainName: string) {
    const buffer = this.buffer;
    const pointOffset = this.domainPoint[domainName];
    buffer.writeUInt8(0xC0 | (pointOffset >> 8) & (~0xC0), this.endOffset);
    this.endOffset += 1;
    buffer.writeUInt8(pointOffset & 0xFF, this.endOffset);
    this.endOffset += 1;
  }

  protected writeDomainName(domainName: string, type: number, kclass: number) {
    const buffer = this.buffer;
    domainName.split('.').forEach((name: string) => {
      if (hasOwnProperty(this.domainPoint, name)) {
        this.resetPointInfo(name);
      } else {
        this.domainPoint[name] = this.endOffset;
        const length = buffer.write(name, this.endOffset + 1, 'ascii');
        buffer.writeUInt8(length, this.endOffset);
        this.endOffset += length + 1;
      }
    });
    buffer.writeUInt8(0, this.endOffset);
    this.endOffset += 1;
    buffer.writeUInt16BE(type, this.endOffset);
    this.endOffset += 2;
    buffer.writeUInt16BE(kclass, this.endOffset);
    this.endOffset += 2;
  }

  public write(domans: DomainNameObject[], start: number): { buffer: Buffer, start: number, end: number} {
    this.startOffset = this.endOffset = start;
    this.domainPoint = {};
    domans.forEach(({ type, class: kclass, name }) => this.writeDomainName(name, type, kclass));
    return { start: this.startOffset, end: this.endOffset, buffer: this.buffer };
  }

  public writeRR(domans: DomainNameObject[], start: number): { buffer: Buffer, start: number, end: number} {
    const buffer = this.buffer;
    this.startOffset = this.endOffset = start;
    this.domainPoint = {};
    domans.forEach((domainInfo: DomainNameObject) => {
      const { name, type, class: kclass, ttl, rdata } = { ...this.defaultObject, ...domainInfo };
      this.writeDomainName(name, type, kclass);
      buffer.writeUInt32BE(ttl, this.endOffset);
      this.endOffset += 4;
      const length = buffer.write(rdata, this.endOffset + 2, 'base64');
      buffer.writeUInt16BE(length, this.endOffset);
      this.endOffset += 2 + length;
    });
    return { start: this.startOffset, end: this.endOffset, buffer: this.buffer };
  }
}

export class Notice extends EventEmitter {
  private questionReadDomain: ReadDomainInfo;
  private answerReadDomain: ReadDomainInfo;
  private authoritativeReadDomain: ReadDomainInfo;
  private additionalReadDomain: ReadDomainInfo;
  constructor(private notice: Buffer) {
    super();
    this.questionReadDomain = new ReadDomainInfo(this.notice, this.questionLength);
    this.answerReadDomain = new ReadDomainInfo(this.notice, this.answerLength);
    this.authoritativeReadDomain = new ReadDomainInfo(this.notice, this.authoritativeLength);
    this.additionalReadDomain = new ReadDomainInfo(this.notice, this.additionalLength);
  }

  getResponseNotice(question: DomainNameObject[], answer: DomainNameObject[], authoritative: DomainNameObject[], additional: DomainNameObject[]) {
    const responseNotice = Buffer.alloc(1024);
    const questionWrite = new WriteDomainInfo(responseNotice);
    responseNotice.writeUInt16BE(this.transactionID, 0);
    responseNotice.writeUInt16BE(
      1 << 15 | 0 << 11 | 0 << 10 | 0 << 9 | 1 << 8 | 0 << 7 | 0 << 4 | 0
    , 2);
    responseNotice.writeUInt16BE(question.length, 4);
    responseNotice.writeUInt16BE(answer.length, 6);
    responseNotice.writeUInt16BE(authoritative.length, 8);
    responseNotice.writeUInt16BE(additional.length, 10);
    let offset = questionWrite.write(question, 12).end;
    offset = questionWrite.writeRR(answer, offset).end;
    offset = questionWrite.writeRR(authoritative, offset).end;
    questionWrite.writeRR(additional, offset);
    return responseNotice;
  }

  // 会话标识 2个字节
  get transactionID(): number {
    return this.notice.readUInt16BE(0);
  }
  // 标识位 2个字节
  get flags(): number {
    return this.notice.readUInt16BE(2);
  }
  // qr 查询/响应标志 0 查询 1 响应 1bit
  get qr(): number {
    return ((0x08 << 12) & this.flags) >> 12;
  }
  // 	0表示标准查询，1表示反向查询，2表示服务器状态请求 4bit
  get opcode(): number {
    return ((0x0f << 11) & this.flags) >> 11;
  }
  // 表示授权回答 1bit
  get aa(): number {
    return ((0x08 << 10) & this.flags) >> 10;
  }
  // 表示可截断的 1bit
  get tc(): number {
    return ((0x08 << 9) & this.flags) >> 9;
  }
  // 表示期望递归 1bit
  get rd(): number {
    return ((0x08 << 8) & this.flags) >> 8;
  }
  // 表示可用递归 1bit
  get ra(): number {
    return ((0x08 << 7) & this.flags) >> 7;
  }
  // 表示返回码，0表示没有差错，3表示名字差错，2表示服务器错误（Server Failure） 4bit
  get rcode(): number {
    return 0x0f & this.flags;
  }
  // 表示查询问题区域节的数量 2byte
  get questionLength() {
    return this.notice.readUInt16BE(4);
  }
  // 表示回答区域的数量 2byte
  get answerLength() {
    return this.notice.readUInt16BE(6);
  }
  // 表示授权区域的数量 2byte
  get authoritativeLength() {
    return this.notice.readUInt16BE(8);
  }
  // 表示附加区域的数量 2byte
  get additionalLength() {
    return this.notice.readUInt16BE(10);
  }

  get questionDomainObject() {
    return this.questionReadDomain.read(12);
  }

  get answerDomainObject() {
    return this.answerReadDomain.readRR(this.questionDomainObject.end);
  }

  get authoritativeDomainObject() {
    return this.authoritativeReadDomain.readRR(this.answerDomainObject.end);
  }

  get additionalDomainObject() {
    return this.additionalReadDomain.readRR(this.authoritativeDomainObject.end);
  }
}
