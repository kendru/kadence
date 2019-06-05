const crypto = require('crypto');
const { Entry } = require('./RoutingTable');
const NodeID = require('./NodeID');

class Message {
    constructor(originNodeID, genCookie = true) {
        this.originNodeID = originNodeID;
        if (genCookie) {
            this.cookie = crypto.randomBytes(4).readUInt32LE();
        }
    }

    type() {
        return this.constructor.name;
    }

    toJSON() {
        throw new Error(`${this.constructor.name} does not implement Message::toJSON()`);
    }

    hydrate(obj) {
        throw new Error(`${this.constructor.name} does not implement Message::hydrate(obj: Any)`);
    }
}

class Ping extends Message {
    constructor(originNodeID) {
        super(originNodeID);
    }

    toJSON() {
        return {};
    }

    hydrate(obj_) {
        return this;
    }
}

class PingReply extends Message {
    constructor(originNodeID) {
        super(originNodeID, false);
    }

    toJSON() {
        return {};
    }

    hydrate(obj_) {
        return this;
    }
}

class Store extends Message {
    constructor(originNodeID, key, value) {
        super(originNodeID);
        this.key = key;
        this.value = value;
    }

    toJSON() {
        return {
            key: this.key.toJSON(),
            value: this.value
        };
    }

    hydrate(obj) {
        this.key = (new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))).hydrate(obj.key);
        this.value = obj.value;
        return this;
    }
}

class StoreReply extends Message {
    constructor(originNodeID) {
        super(originNodeID, false);
    }

    toJSON() {
        return {};
    }

    hydrate(obj_) {
        return this;
    }
}

class FindNode extends Message {
    constructor(originNodeID, key /* NodeID */) {
        super(originNodeID);
        this.key = key;
    }

    toJSON() {
        return {
            key: this.key.toJSON()
        };
    }

    hydrate(obj) {
        this.key = (new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))).hydrate(obj.key);
        return this;
    }
}

class FindNodeReply extends Message {
    constructor(originNodeID, entries) {
        super(originNodeID, false);
        this.entries = entries;
    }

    toJSON() {
        return {
            entries: this.entries.map(entry => entry.toJSON())
        };
    }

    hydrate(obj) {
        this.entries = obj.entries.map(entry => (new Entry()).hydrate(entry))
        return this;
    }
}

class FindValue extends Message {
    constructor(originNodeID, key) {
        super(originNodeID);
        this.key = key;
    }

    toJSON() {
        return {
            key: this.key.toJSON()
        };
    }

    hydrate(obj) {
        this.key = (new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))).hydrate(obj.key);
        return this;
    }
}

class FindValueReply extends Message {
    constructor(originNodeID, value, entries) {
        super(originNodeID);
        this.value = value;
        this.entries = entries;
    }

    toJSON() {
        return {
            value: this.value,
            entries: this.entries && this.entries.map(entry => entry.toJSON())
        };
    }

    hydrate(obj) {
        this.value = obj.value;
        this.entries = obj.entries && obj.entries.map(entry => (new Entry()).hydrate(entry));
        return this;
    }
}

function decode(msgJson) {
    const msgStr = msgJson.toString('utf8');
    const obj = JSON.parse(msgStr);
    const type = obj._t;
    const originNodeID = (new NodeID([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])).hydrate(obj._o);
    const cookie = obj._c;

    let msg;
    switch (type) {
    case 'Ping':
        msg = new Ping(null);
        break;
    case 'PingReply':
        msg = new PingReply(null);
        break;
    case 'Store':
        msg = new Store(null);
        break;
    case 'StoreReply':
        msg = new StoreReply(null);
        break;
    case 'FindNode':
        msg = new FindNode(null);
        break;
    case 'FindNodeReply':
        msg = new FindNodeReply(null);
        break;
    case 'FindValue':
        msg = new FindValue(null);
        break;
    case 'FindValueReply':
        msg = new FindValueReply(null);
        break;
    default:
        throw new Error(`Unrecognied message type: ${type}.\nFrom data: ${msgStr}`);
    }
    msg.originNodeID = originNodeID;
    msg.cookie = cookie;
    msg.hydrate(obj);

    return msg;
}

function encode(msg) {
    const obj = msg.toJSON();
    obj._t = msg.type();
    obj._o = msg.originNodeID.toJSON();
    obj._c = msg.cookie;

    return Buffer.from(JSON.stringify(obj), 'utf8');
}

module.exports = {
    encode, decode,
    Ping, PingReply,
    Store, StoreReply,
    FindNode, FindNodeReply,
    FindValue, FindValueReply
};