import { isFunction, hasOwnProperty } from './tools';

export type Handler = (...arg: any[]) => void;

export class EventEmitter {
  protected events:  {[key: string]: any[]} = {};
  constructor() { }

  on(key: string, handler: Handler) {
    if (!isFunction(handler)) {
      throw new Error('handler Must function');
    }
    if (!hasOwnProperty(this.events, key)) {
      this.events[key] = [];
    }
    this.events[key].push(handler);
  }

  /**
   * 执行一次
   * @param key key
   * @param handler Handler 
   */
  once(key: string, handler: Handler) {
    const cloneHandler = (...arg: any[]) => {
      handler(...arg);
      this.remove(key, cloneHandler);
    };
    this.on(key, cloneHandler);
  }

  remove(key: string, handler: Handler) {
    if (!hasOwnProperty(this.events, key)) {
      return ;
    }
    this.events[key] = this.events[key].filter((next: Handler) => next !== handler);
  }

  pipe(...arg: any[]) {
    const key = arg[0];
    const handlers = arg.slice(1);
    handlers.forEach((handler: Handler) => this.on(key, handler));
  }

  emitSync(...arg: any[]): any {
    const key = arg[0];
    let endResult: any = arg[1];
    if (!hasOwnProperty(this.events, key)) {
      return endResult;
    }

    const handler = [...this.events[key]].reverse().reduce((first: Handler, handler: Handler) =>
      (...arg: any[]) => handler(...arg, first) , (data: any) => { endResult = data || endResult });

    arg[1] = arg[1] || void(0);
    handler(...arg.slice(1));
    return endResult;
  }

  emitAsync(...arg: any[]): Promise<any> {
    const key = arg[0];
    if (!hasOwnProperty(this.events, key)) {
      return Promise.resolve(null);
    }
    arg[1] = arg[1] || void(0);
    this.events[key].forEach((handler: Handler) => handler(...arg.slice(1)));
  }
}
