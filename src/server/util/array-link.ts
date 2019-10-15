export class LinkNode<T> {
  public value: T;
  private _preNode: LinkNode<T>;
  private _nextNode: LinkNode<T>;
  constructor(value: T | LinkNode<T>, preNode?: LinkNode<T>, nextNode?: LinkNode<T>) {
    if (value instanceof LinkNode) {
      value.nextNode = nextNode;
      value.preNode = preNode;
      return value;
    }
    this.value = value;
    this.preNode = preNode;
    this.nextNode = nextNode;
  }

  set preNode(node: LinkNode<T>) {
    this._preNode = node;
  }

  get preNode() {
    return this._preNode;
  }

  set nextNode(node: LinkNode<T>) {
    this._nextNode = node;
  }

  get nextNode() {
    return this._nextNode;
  }
}

export class ArrayLink <T> {
  private firstNode: LinkNode<T>;
  private lastNode: LinkNode<T>;
  public length: number = 0;
  constructor(array?: T[]) {
    (array || []).forEach((item: T) => this.push(item));
  }

  private each(callback: (node: LinkNode<T>) => void, start?: number, end?: number) {
    if (!end || end > this.length) {
      end = this.length;
    }
    for(let i = start || 0, currentNode; i < end; i++) {
      if (!currentNode) {
        currentNode = this.firstNode;
      } else {
        currentNode = currentNode.nextNode;
      }
      callback(currentNode);
    }
  }

  public push(item: T) {
    let node;
    if (this.length === 0) {
      node = new LinkNode<T>(item);
      this.firstNode = this.lastNode = new LinkNode(node, node, node);
      this.length++;
    } else {
      node = this.insertBeforeNode(this.lastNode, item);
    }
    return node;
  }

  public pop() {
    if (this.length !== 1) {
      this.lastNode = this.lastNode.preNode;
    } else {
      this.lastNode = undefined;
    }
    return this.delete(this.lastNode);
  }
  
  public shift() {
    if (this.length !== 1) {
      this.firstNode = this.firstNode.nextNode;
    } else {
      this.lastNode = undefined;
    }
    return this.delete(this.firstNode);
  }

  public unshift(item: T) {
    let node;
    if (this.length === 0) {
      node = new LinkNode<T>(item);
      this.firstNode = this.lastNode = new LinkNode(node, node, node);
      this.length++;
    } else {
      node = this.insertBeforeNode(this.firstNode, item);
    }
    return node;
  }

  public get(index: number) {
    if (index > this.length - 1) {
      return ;
    }
    let currentNode = this.firstNode;
    for(let i = 1; i <= index; i++) {
      currentNode = currentNode.nextNode;
    }
    return currentNode;
  }

  public toArray(): T[] {
    const array: T[] = [];
    this.each((node: LinkNode<T>) => {
      array.push(node.value);
    });
    return array;
  }

  public insertBeforeNode(node: LinkNode<T>, item: T) {
    const insertNode = new LinkNode(item, node.preNode, node);

    node.preNode.nextNode = insertNode;
    node.preNode = insertNode;
    
    this.length++;
    return insertNode;
  }

  public delete(node: LinkNode<T>) {
    if (!node) {
      return ;
    }
    node.nextNode.preNode = node.preNode;
    node.preNode.nextNode = node.nextNode;
    this.length--;
    return node;
  }
}