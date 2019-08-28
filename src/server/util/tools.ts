export const hasOwnProperty = (object: any, name: string) => Object.prototype.hasOwnProperty.call(object, name);

export const type = (object: any) => Object.prototype.toString.call(object).replace(/^\[object ([\S]+)\]$/, '$1');

export const isType = (typeName: string) => (object: any): boolean => type(object) === typeName;

export const isObject = isType('Object');

export const isFunction = isType('Function');

export const isArray = isType('Array');

export const isString = isType('String');

export const isNumber = isType('Number');

export const isBuffer = (buffer: any): boolean => Buffer.isBuffer(buffer);

export const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random()*16|0;
    const v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};