import { BufferUtil } from './buffer-util';

export const getHttp = (buffer: Buffer) => {
  const match = buffer.toString().match(/([^\r\n]+)/g).filter((item: string) => /^Host: [\S]+$/.test(item))[0];
  const host = (match || '').replace('Host: ', '');
  return { host };
}

export const getHttpsClientHello = (() => {
  function formatHeader(buffer: Buffer) {
    const header: any = {};
    const [ headerBuffer, bodyBuffer] = BufferUtil.unConcat(buffer, [5]);
    const [ contentType, versionBig, versionSmall, length ] = BufferUtil.readGroupUInt(headerBuffer, [8, 8, 8, 16]);
    header.contentType = contentType;
    header.version = `${versionBig}.${versionSmall}`;
    header.length = length;
    return { header, body: bodyBuffer }
  }

  function formatBody(buffer: Buffer) {
    const body: any = {};
    let cursor = 0;
    body.handshakeType = buffer.readUInt8(0);
    body.length = buffer.readUInt16BE(1) << 8 | buffer.readUInt8(3);
    body.version = buffer.readUInt8(4) + '.' + buffer.readUInt8(5);
    body.random = {
      GMTUnixTimstamp: buffer.readUInt32BE(6),
      randomBytes: buffer.slice(10, 37)
    };
    body.session = {};
    body.session.length =  buffer.readUInt8(38);
    cursor = 39 + body.session.length;
    body.session.id = buffer.slice(39, cursor);

    body.cipherSuites = {};
    body.cipherSuites.length = buffer.readUInt16BE(cursor);
    cursor += 2;
    body.cipherSuites.buffer = buffer.slice(cursor, cursor + body.cipherSuites.length);
    cursor += body.cipherSuites.length;

    body.compressionMeghods = {};
    body.compressionMeghods.length = buffer.readUInt8(cursor);
    cursor += 1;
    body.compressionMeghods.buffer = buffer.slice(cursor, cursor + body.compressionMeghods.length);
    cursor += body.compressionMeghods.length;
    body.extensions = { };
    body.extensions.length = buffer.readUInt16BE(cursor);
    cursor += 2;
    body.extensions.buffer = buffer.slice(cursor, cursor + body.extensions.length);
    return body;
  }

  function formatExtension(buffer: Buffer) {
    const length = buffer.length;
    let cursor = 0;
    const extensions = [];
    while(cursor < length) {
      const info: any = {};
      info.type = buffer.readUInt16BE(cursor);
      cursor += 2;
      info.length = buffer.readUInt16BE(cursor);
      cursor += 2;
      info.data = buffer.slice(cursor, cursor + info.length);
      cursor += info.length;
      extensions.push(info);
    }
    return extensions;
  }

  function formatServerExtension(extension: any) {
    const buffer = extension.data;
    const serverExtension: any = {};
    serverExtension.listLength = buffer.readUInt16BE(0);
    serverExtension.type = buffer.readUInt8(2);
    serverExtension.serverLength = buffer.readUInt16BE(3);
    serverExtension.host = buffer.slice(5, 5 + serverExtension.serverLength).toString();
    return serverExtension;
  }

  return (buffer: Buffer) => {
    const { header, body } = formatHeader(buffer);
    const format = formatBody(body);
    format.extensions.list = formatExtension(format.extensions.buffer);
    const serverExtension = format.extensions.list.filter(({ type }: any) => type === 0)[0];
    const server = serverExtension ? formatServerExtension(serverExtension) : { host: '127.0.0.1' };

    return {
      header,
      host: server.host
    };
  }
})();